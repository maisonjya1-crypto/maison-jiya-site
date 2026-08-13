import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, getRawDb } from "../../../db";
import { createDailyBackup, purgeExpiredTrash, restoreDailyBackup } from "../../../db/backups";
import { adPerformance, auditLogs, capitalLedger, customers, dailyBackups, orders, orderStatusHistory, products, purchases, settings, stockMovements, users } from "../../../db/schema";
import { createUser, getAuthenticatedUser, normalizeUsername, updateUserPassword, type AppUser } from "../../auth";

type ActionPayload = Record<string, unknown> & { action?: string };
type AccessInfo = {
  canEdit: boolean;
  isOwner: boolean;
  canClaimOwnership: boolean;
  passwordConfigured: boolean;
  sessionExpiresAt: string | null;
  role: AppUser["role"];
  username: string;
  displayName: string;
};

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

const orderStatuses = ["En attente", "Confirmée", "Expédiée", "En livraison", "Livrée", "Retour", "Annulée"];
const orderSources = ["WhatsApp", "Instagram", "Facebook", "TikTok", "Site web", "Autre", "Non renseignée"];
const paymentStatuses = ["À encaisser", "Encaissé", "Non encaissé", "Remboursé"];
const stockCommittedStatuses = new Set(["Confirmée", "Expédiée", "En livraison", "Livrée", "Retour"]);
const productCategories = ["Montres", "Bijoux", "Wallets", "Électronique", "Autre"];
const themeOptions = ["mauve-froid", "rose-poudre", "sombre-prune", "bleu-brume", "sable-chic"];

function orderStatus(value: unknown, fallback = "En attente") {
  const status = textValue(value, fallback);
  return orderStatuses.includes(status) ? status : fallback;
}

function orderSource(value: unknown, fallback = "Non renseignée") {
  const source = textValue(value, fallback);
  return orderSources.includes(source) ? source : fallback;
}

function paymentStatus(value: unknown, fallback = "À encaisser") {
  const status = textValue(value, fallback);
  return paymentStatuses.includes(status) ? status : fallback;
}

function productCategory(value: unknown, fallback = "Autre") {
  const category = textValue(value, fallback);
  return productCategories.includes(category) ? category : fallback;
}

function commitsStock(status: string) {
  return stockCommittedStatuses.has(status);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseCarrierNames(rawValue: string | undefined, legacyValue = "") {
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(rawValue || "[]");
  } catch {
    parsed = [];
  }
  const source = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  if (legacyValue && legacyValue !== "À configurer") source.push(legacyValue);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of source) {
    const name = value.trim().replace(/\s+/g, " ");
    const key = name.toLocaleLowerCase("fr");
    if (name.length >= 2 && name.length <= 80 && !seen.has(key)) {
      seen.add(key);
      result.push(name);
    }
  }
  return result;
}

async function triggerGoogleSheetsSync() {
  try {
    const db = await getDb();
    const [setting] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "security_backup_webhook_url")).limit(1);
    if (!setting?.value) return;
    const parsedUrl = new URL(setting.value);
    if (
      parsedUrl.protocol !== "https:"
      || parsedUrl.hostname !== "script.google.com"
      || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(parsedUrl.pathname)
    ) return;
    await fetch(parsedUrl.toString(), {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(3500),
      headers: { "user-agent": "Maison-Jiya-Backup/1.0" },
    });
  } catch (error) {
    console.error("Maison Jiya immediate Google Sheets sync failed", error instanceof Error ? error.message : String(error));
  }
}

const auditLabels: Record<string, { action: string; entityType: string }> = {
  createMember: { action: "Ajout", entityType: "Partenaire" },
  resetMemberPassword: { action: "Mot de passe remplacé", entityType: "Partenaire" },
  updateMember: { action: "Modification", entityType: "Partenaire" },
  addOrder: { action: "Ajout", entityType: "Commande" },
  updateOrder: { action: "Modification", entityType: "Commande" },
  deleteOrder: { action: "Mise à la corbeille", entityType: "Commande" },
  restoreOrder: { action: "Restauration", entityType: "Commande" },
  updateCustomer: { action: "Modification", entityType: "Client" },
  deleteCustomer: { action: "Suppression", entityType: "Client" },
  addPurchase: { action: "Ajout", entityType: "Achat" },
  updatePurchase: { action: "Modification", entityType: "Achat" },
  deletePurchase: { action: "Suppression", entityType: "Achat" },
  addAd: { action: "Ajout", entityType: "Publicité" },
  updateAd: { action: "Modification", entityType: "Publicité" },
  deleteAd: { action: "Suppression", entityType: "Publicité" },
  addCapital: { action: "Ajout", entityType: "Capital" },
  updateCapital: { action: "Modification", entityType: "Capital" },
  deleteCapital: { action: "Suppression", entityType: "Capital" },
  addProduct: { action: "Ajout", entityType: "Produit" },
  updateProduct: { action: "Modification", entityType: "Produit" },
  deleteProduct: { action: "Suppression", entityType: "Produit" },
  addStockMovement: { action: "Ajout", entityType: "Stock" },
  updateStockMovement: { action: "Modification", entityType: "Stock" },
  deleteStockMovement: { action: "Suppression", entityType: "Stock" },
  updateAccountSettings: { action: "Modification", entityType: "Compte" },
  updateBackupToken: { action: "Clé créée", entityType: "Sauvegarde" },
  revokeBackupToken: { action: "Désactivation", entityType: "Sauvegarde" },
  updateBackupWebhook: { action: "Connexion", entityType: "Google Sheets" },
  createBackupNow: { action: "Création", entityType: "Sauvegarde" },
  restoreBackup: { action: "Restauration", entityType: "Sauvegarde" },
  updateCarriers: { action: "Modification", entityType: "Transporteurs" },
  updateSetting: { action: "Modification", entityType: "Paramètre" },
};

async function writeAudit(user: AppUser, actionName: string, entityId: string | null, entityLabel: string) {
  const descriptor = auditLabels[actionName];
  if (!descriptor) return;
  const db = await getDb();
  await db.insert(auditLogs).values({
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    action: descriptor.action,
    entityType: descriptor.entityType,
    entityId,
    entityLabel,
  });
}

async function seedIfNeeded() {
  const db = await getDb();
  await db.insert(settings).values([
    { key: "safety_reserve", value: "12000" },
    { key: "stock_allocation", value: "60" },
    { key: "ads_allocation", value: "25" },
    { key: "reserve_allocation", value: "15" },
    { key: "meta_status", value: "À connecter" },
    { key: "carrier_name", value: "À configurer" },
    { key: "carrier_names", value: "[]" },
    { key: "theme", value: "mauve-froid" },
    { key: "account_name", value: "Maison Jiya" },
    { key: "backup_sheet_url", value: "https://docs.google.com/spreadsheets/d/1hQIwOKBBhhZIQN6AsmVwUCH_7T-WE8GlsCfrmb2H7Us/edit" },
    { key: "security_backup_webhook_url", value: "" },
  ]).onConflictDoNothing();

  const [legacyWebhook, secureWebhook] = await Promise.all([
    db.select({ value: settings.value }).from(settings).where(eq(settings.key, "backup_webhook_url")).limit(1),
    db.select({ value: settings.value }).from(settings).where(eq(settings.key, "security_backup_webhook_url")).limit(1),
  ]);
  if (legacyWebhook[0]?.value && !secureWebhook[0]?.value) {
    await db.insert(settings).values({ key: "security_backup_webhook_url", value: legacyWebhook[0].value }).onConflictDoUpdate({
      target: settings.key,
      set: { value: legacyWebhook[0].value, updatedAt: new Date().toISOString() },
    });
  }
  if (legacyWebhook[0]) await db.delete(settings).where(eq(settings.key, "backup_webhook_url"));

  const carrierSettings = await db.select({ key: settings.key, value: settings.value }).from(settings);
  const configuredCarriers = parseCarrierNames(
    carrierSettings.find((setting) => setting.key === "carrier_names")?.value,
    carrierSettings.find((setting) => setting.key === "carrier_name")?.value,
  );
  const carrierNames = [...configuredCarriers];
  for (const requestedCarrier of ["ForceLog", "Sendit"]) {
    if (!carrierNames.some((carrier) => carrier.toLocaleLowerCase("fr") === requestedCarrier.toLocaleLowerCase("fr"))) carrierNames.push(requestedCarrier);
  }
  if (carrierNames.length !== configuredCarriers.length) {
    const updatedAt = new Date().toISOString();
    await db.batch([
      db.insert(settings).values({ key: "carrier_names", value: JSON.stringify(carrierNames) }).onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(carrierNames), updatedAt } }),
      db.insert(settings).values({ key: "carrier_name", value: carrierNames[0] }).onConflictDoUpdate({ target: settings.key, set: { value: carrierNames[0], updatedAt } }),
    ]);
  }

  await db.update(orders).set({ status: "En attente" }).where(eq(orders.status, "Nouvelle"));
  await db.update(orders).set({ status: "Retour" }).where(eq(orders.status, "Retournée"));
  await db.update(orders).set({ status: "Annulée" }).where(eq(orders.status, "Refusée"));

  await purgeExpiredTrash(await getRawDb());

}

async function securityAccess(_request: Request, user: AppUser): Promise<AccessInfo> {
  return {
    canEdit: user.role === "admin" || user.role === "editor",
    isOwner: user.role === "admin",
    canClaimOwnership: false,
    passwordConfigured: true,
    sessionExpiresAt: null,
    role: user.role,
    username: user.username,
    displayName: user.displayName,
  };
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message : error.cause;
  return JSON.stringify({ name: error.name, message: error.message, cause });
}

function hasValidOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function snapshot(access: AccessInfo) {
  await seedIfNeeded();
  await createDailyBackup(await getRawDb());
  const db = await getDb();
  const orderSelection = { id: orders.id, orderRef: orders.orderRef, customerId: orders.customerId, productId: orders.productId, customerName: customers.name, phone: customers.phone, city: orders.city, products: orders.products, quantity: orders.quantity, saleAmount: orders.saleAmount, productCost: orders.productCost, shippingCost: orders.shippingCost, adCost: orders.adCost, fees: orders.fees, returnCost: orders.returnCost, source: orders.source, status: orders.status, paymentStatus: orders.paymentStatus, carrier: orders.carrier, trackingNumber: orders.trackingNumber, stockDeducted: orders.stockDeducted, paidAt: orders.paidAt, deletedAt: orders.deletedAt, deletedByUserId: orders.deletedByUserId, createdAt: orders.createdAt, updatedAt: orders.updatedAt };
  const [orderRows, trashRows, customerRows, purchaseRows, adRows, capitalRows, productRows, movementRows, settingRows, memberRows, historyRows, auditRows, backupRows] = await Promise.all([
    db.select(orderSelection).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).where(isNull(orders.deletedAt)).orderBy(desc(orders.createdAt)),
    access.isOwner
      ? db.select(orderSelection).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).where(isNotNull(orders.deletedAt)).orderBy(desc(orders.deletedAt))
      : Promise.resolve([]),
    db.select().from(customers).orderBy(desc(customers.createdAt)),
    db.select().from(purchases).orderBy(desc(purchases.createdAt)),
    db.select().from(adPerformance).orderBy(desc(adPerformance.performanceDate)),
    db.select().from(capitalLedger).orderBy(desc(capitalLedger.entryDate)),
    db.select().from(products).orderBy(desc(products.createdAt)),
    db.select({ id: stockMovements.id, productId: stockMovements.productId, orderId: stockMovements.orderId, orderRef: orders.orderRef, productCode: products.productCode, productName: products.name, movementType: stockMovements.movementType, quantity: stockMovements.quantity, note: stockMovements.note, createdAt: stockMovements.createdAt }).from(stockMovements).leftJoin(products, eq(stockMovements.productId, products.id)).leftJoin(orders, eq(stockMovements.orderId, orders.id)).orderBy(desc(stockMovements.createdAt)),
    db.select().from(settings),
    access.isOwner
      ? db.select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, isActive: users.isActive, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt))
      : Promise.resolve([]),
    db.select().from(orderStatusHistory).orderBy(desc(orderStatusHistory.changedAt)).limit(1000),
    access.isOwner ? db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200) : Promise.resolve([]),
    access.isOwner
      ? db.select({ id: dailyBackups.id, backupDate: dailyBackups.backupDate, reason: dailyBackups.reason, recordCount: dailyBackups.recordCount, createdAt: dailyBackups.createdAt }).from(dailyBackups).orderBy(desc(dailyBackups.createdAt)).limit(90)
      : Promise.resolve([]),
  ]);
  const publicSettings = settingRows.filter((row) => !row.key.startsWith("security_"));
  const backupConfigured = settingRows.some((row) => row.key === "security_backup_token_hash" && row.value.length === 64);
  const secureWebhook = settingRows.find((row) => row.key === "security_backup_webhook_url")?.value || "";
  return {
    orders: orderRows,
    trash: trashRows,
    customers: customerRows,
    purchases: purchaseRows,
    ads: adRows,
    capital: capitalRows,
    products: productRows,
    stockMovements: movementRows,
    members: memberRows,
    orderStatusHistory: historyRows,
    auditLogs: auditRows,
    backups: backupRows,
    settings: {
      ...Object.fromEntries(publicSettings.map((row) => [row.key, row.value])),
      backup_configured: backupConfigured ? "true" : "false",
      backup_webhook_configured: secureWebhook ? "true" : "false",
      ...(access.isOwner ? { backup_webhook_url: secureWebhook } : {}),
    },
    access,
  };
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return Response.json({ error: "Connexion requise." }, { status: 401 });
    }
    await seedIfNeeded();
    return Response.json(await snapshot(await securityAccess(request, user)));
  } catch (error) {
    console.error("Maison Jiya data GET failed", errorDetails(error));
    return Response.json({ error: "Les données sont momentanément indisponibles. Réessayez dans quelques secondes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!hasValidOrigin(request)) return Response.json({ error: "Origine de la requête refusée." }, { status: 403 });
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return Response.json({ error: "Connexion requise." }, { status: 401 });
    }
    const payload = (await request.json()) as ActionPayload;
    const db = await getDb();
    await seedIfNeeded();
    const access = await securityAccess(request, user);

    if (!access.canEdit) {
      return Response.json({ error: "Votre compte est en lecture seule." }, { status: 403 });
    }

    let auditEntityId = textValue(payload.id) || textValue(payload.memberId) || null;
    let auditEntityLabel = "";

    if (payload.action === "createMember") {
      if (!access.isOwner) return Response.json({ error: "Seul l’administrateur peut créer un partenaire." }, { status: 403 });
      const username = normalizeUsername(textValue(payload.username));
      const [existingMember] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
      if (existingMember) return Response.json({ error: "Ce nom d’utilisateur existe déjà." }, { status: 409 });
      const role = textValue(payload.role, "viewer") as AppUser["role"];
      await createUser({
        username,
        displayName: textValue(payload.displayName),
        password: textValue(payload.password),
        role,
      });
    } else if (payload.action === "resetMemberPassword") {
      if (!access.isOwner) return Response.json({ error: "Seul l’administrateur peut remplacer ce mot de passe." }, { status: 403 });
      const memberId = numberValue(payload.memberId);
      const password = textValue(payload.password);
      const confirmation = textValue(payload.confirmation);
      if (!memberId) return Response.json({ error: "Compte partenaire invalide." }, { status: 400 });
      if (password !== confirmation) return Response.json({ error: "Les deux mots de passe ne correspondent pas." }, { status: 400 });
      await updateUserPassword(memberId, password);
    } else if (payload.action === "updateMember") {
      if (!access.isOwner) return Response.json({ error: "Seul l’administrateur peut modifier un partenaire." }, { status: 403 });
      const memberId = numberValue(payload.memberId);
      const role = textValue(payload.role, "viewer");
      const isActive = textValue(payload.isActive, "true") === "true";
      if (!memberId || !["admin", "editor", "viewer"].includes(role)) return Response.json({ error: "Compte partenaire invalide." }, { status: 400 });
      if (memberId === user.id && (!isActive || role !== "admin")) return Response.json({ error: "Le compte principal ne peut pas retirer ses propres droits administrateur." }, { status: 400 });
      await db.update(users).set({ role, isActive, updatedAt: new Date().toISOString() }).where(eq(users.id, memberId));
    } else if (payload.action === "addOrder") {
      const name = textValue(payload.customerName);
      const phone = textValue(payload.phone).replace(/\s/g, "");
      const city = textValue(payload.city);
      const productId = numberValue(payload.productId);
      const quantity = numberValue(payload.quantity, 1);
      if (!name || !phone || !city || !productId || quantity < 1) return Response.json({ error: "Cliente, téléphone, ville, produit et quantité sont obligatoires." }, { status: 400 });
      const [selectedProduct] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      if (!selectedProduct) return Response.json({ error: "Le produit sélectionné n’existe plus dans le catalogue." }, { status: 404 });
      const selectedStatus = orderStatus(payload.status);
      const shouldDeductStock = commitsStock(selectedStatus);
      if (shouldDeductStock && quantity > selectedProduct.stockQuantity) {
        return Response.json({ error: `Stock insuffisant pour confirmer : ${selectedProduct.stockQuantity} unité(s) disponible(s).` }, { status: 409 });
      }
      let [customer] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
      if (!customer) [customer] = await db.insert(customers).values({ name, phone, city }).returning();
      else await db.update(customers).set({ name, city }).where(eq(customers.id, customer.id));
      const carrierSettings = await db.select({ key: settings.key, value: settings.value }).from(settings);
      const carrierNames = parseCarrierNames(
        carrierSettings.find((setting) => setting.key === "carrier_names")?.value,
        carrierSettings.find((setting) => setting.key === "carrier_name")?.value,
      );
      const requestedCarrier = textValue(payload.carrier);
      const selectedCarrier = requestedCarrier && (!carrierNames.length || carrierNames.includes(requestedCarrier))
        ? requestedCarrier
        : carrierNames[0] || "Non affecté";
      const orderRef = `MJ-${Date.now().toString(36).slice(-5).toUpperCase()}${crypto.randomUUID().slice(0, 2).toUpperCase()}`;
      const now = new Date().toISOString();
      const productLabel = `${selectedProduct.name} · ${selectedProduct.productCode}`;
      const saleAmount = numberValue(payload.saleAmount, selectedProduct.salePrice * quantity);
      const rawDb = await getRawDb();
      const statements = [
        rawDb.prepare(`INSERT INTO orders (order_ref, customer_id, product_id, city, products, quantity, sale_amount, product_cost, shipping_cost, ad_cost, fees, return_cost, source, status, payment_status, carrier, tracking_number, stock_deducted, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'À encaisser', ?, ?, ?, ?)`).bind(orderRef, customer.id, productId, city, productLabel, quantity, saleAmount, selectedProduct.purchasePrice * quantity, numberValue(payload.shippingCost), numberValue(payload.adCost), numberValue(payload.fees), orderSource(payload.source), selectedStatus, selectedCarrier, textValue(payload.trackingNumber), shouldDeductStock ? 1 : 0, now),
        rawDb.prepare(`INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id, changed_by_name, changed_at)
          SELECT id, NULL, ?, ?, ?, ? FROM orders WHERE order_ref = ?`).bind(selectedStatus, user.id, user.displayName, now, orderRef),
      ];
      if (shouldDeductStock) {
        statements.push(
          rawDb.prepare("UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?").bind(quantity, productId),
          rawDb.prepare(`INSERT INTO stock_movements (product_id, order_id, movement_type, quantity, note, created_at)
            SELECT ?, id, 'Commande', ?, ?, ? FROM orders WHERE order_ref = ?`).bind(productId, quantity, `Déduction automatique · ${orderRef}`, now, orderRef),
        );
      }
      await rawDb.batch(statements);
      const [createdOrder] = await db.select().from(orders).where(eq(orders.orderRef, orderRef)).limit(1);
      if (!createdOrder) throw new Error("La commande n’a pas été créée.");
      auditEntityId = String(createdOrder.id);
      auditEntityLabel = createdOrder.orderRef;
    } else if (payload.action === "updateOrder") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Commande invalide." }, { status: 400 });
      const [existingOrder] = await db.select().from(orders).where(and(eq(orders.id, id), isNull(orders.deletedAt))).limit(1);
      if (!existingOrder) return Response.json({ error: "Commande introuvable." }, { status: 404 });
      const nextPaymentStatus = paymentStatus(payload.paymentStatus, existingOrder.paymentStatus);
      const nextStatus = orderStatus(payload.status, existingOrder.status);
      const now = new Date().toISOString();
      const paidAt = nextPaymentStatus === "Encaissé"
        ? existingOrder.paymentStatus === "Encaissé" && existingOrder.paidAt ? existingOrder.paidAt : now
        : null;
      const shouldDeductStock = Boolean(existingOrder.productId && !existingOrder.stockDeducted && commitsStock(nextStatus));
      const shouldRestoreStock = Boolean(existingOrder.productId && existingOrder.stockDeducted && !commitsStock(nextStatus));
      if (shouldDeductStock) {
        const [linkedProduct] = await db.select().from(products).where(eq(products.id, existingOrder.productId!)).limit(1);
        if (!linkedProduct) return Response.json({ error: "Le produit associé à cette commande est introuvable." }, { status: 409 });
        if (existingOrder.quantity > linkedProduct.stockQuantity) {
          return Response.json({ error: `Stock insuffisant pour confirmer : ${linkedProduct.stockQuantity} unité(s) disponible(s).` }, { status: 409 });
        }
      }
      const nextStockDeducted = existingOrder.productId ? commitsStock(nextStatus) : existingOrder.stockDeducted;
      const rawDb = await getRawDb();
      const statements = [
        rawDb.prepare(`UPDATE orders SET status = ?, payment_status = ?, source = ?, shipping_cost = ?, carrier = ?, tracking_number = ?, return_cost = ?, paid_at = ?, stock_deducted = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
          .bind(nextStatus, nextPaymentStatus, orderSource(payload.source, existingOrder.source), numberValue(payload.shippingCost), textValue(payload.carrier, "Non affecté"), textValue(payload.trackingNumber), numberValue(payload.returnCost), paidAt, nextStockDeducted ? 1 : 0, now, id),
      ];
      if (nextStatus !== existingOrder.status) {
        statements.push(rawDb.prepare("INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id, changed_by_name, changed_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, existingOrder.status, nextStatus, user.id, user.displayName, now));
      }
      if (shouldDeductStock) {
        statements.push(
          rawDb.prepare("UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?").bind(existingOrder.quantity, existingOrder.productId!),
          rawDb.prepare("INSERT INTO stock_movements (product_id, order_id, movement_type, quantity, note, created_at) VALUES (?, ?, 'Commande', ?, ?, ?)").bind(existingOrder.productId!, id, existingOrder.quantity, `Déduction automatique · ${existingOrder.orderRef}`, now),
        );
      } else if (shouldRestoreStock) {
        statements.push(
          rawDb.prepare("UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?").bind(existingOrder.quantity, existingOrder.productId!),
          rawDb.prepare("INSERT INTO stock_movements (product_id, order_id, movement_type, quantity, note, created_at) VALUES (?, ?, 'Réintégration', ?, ?, ?)").bind(existingOrder.productId!, id, existingOrder.quantity, `Réintégration automatique · ${existingOrder.orderRef}`, now),
        );
      }
      await rawDb.batch(statements);
      auditEntityLabel = existingOrder.orderRef;
    } else if (payload.action === "deleteOrder") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Commande invalide." }, { status: 400 });
      const [existingOrder] = await db.select({ id: orders.id, orderRef: orders.orderRef }).from(orders).where(and(eq(orders.id, id), isNull(orders.deletedAt))).limit(1);
      if (!existingOrder) return Response.json({ error: "Commande introuvable." }, { status: 404 });
      await db.update(orders).set({ deletedAt: new Date().toISOString(), deletedByUserId: user.id, updatedAt: new Date().toISOString() }).where(eq(orders.id, id));
      auditEntityLabel = existingOrder.orderRef;
    } else if (payload.action === "restoreOrder") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Commande invalide." }, { status: 400 });
      const [existingOrder] = await db.select({ id: orders.id, orderRef: orders.orderRef }).from(orders).where(and(eq(orders.id, id), isNotNull(orders.deletedAt))).limit(1);
      if (!existingOrder) return Response.json({ error: "Commande absente de la corbeille." }, { status: 404 });
      await db.update(orders).set({ deletedAt: null, deletedByUserId: null, updatedAt: new Date().toISOString() }).where(eq(orders.id, id));
      auditEntityLabel = existingOrder.orderRef;
    } else if (payload.action === "updateCustomer") {
      const id = numberValue(payload.id);
      const name = textValue(payload.name);
      const phone = textValue(payload.phone).replace(/\s/g, "");
      const city = textValue(payload.city);
      if (!id || !name || !phone || !city) return Response.json({ error: "Client invalide." }, { status: 400 });
      const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1);
      if (!customer) return Response.json({ error: "Client introuvable." }, { status: 404 });
      const [duplicatePhone] = await db.select({ id: customers.id }).from(customers).where(eq(customers.phone, phone)).limit(1);
      if (duplicatePhone && duplicatePhone.id !== id) return Response.json({ error: "Ce numéro de téléphone appartient déjà à un autre client." }, { status: 409 });
      await db.batch([
        db.update(customers).set({ name, phone, city }).where(eq(customers.id, id)),
        db.update(orders).set({ city, updatedAt: new Date().toISOString() }).where(eq(orders.customerId, id)),
      ]);
    } else if (payload.action === "deleteCustomer") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Client invalide." }, { status: 400 });
      const [linkedOrder] = await db.select({ id: orders.id }).from(orders).where(eq(orders.customerId, id)).limit(1);
      if (linkedOrder) return Response.json({ error: "Ce client possède encore des commandes. Supprimez d’abord ses commandes." }, { status: 409 });
      const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1);
      if (!customer) return Response.json({ error: "Client introuvable." }, { status: 404 });
      await db.delete(customers).where(eq(customers.id, id));
    } else if (payload.action === "addPurchase") {
      const quantity = numberValue(payload.quantity, 1);
      const unitCost = numberValue(payload.unitCost);
      await db.insert(purchases).values({ supplier: textValue(payload.supplier, "Fournisseur"), item: textValue(payload.item, "Achat"), quantity, unitCost, totalCost: quantity * unitCost, paymentStatus: textValue(payload.paymentStatus, "Payé") });
    } else if (payload.action === "updatePurchase") {
      const id = numberValue(payload.id);
      const supplier = textValue(payload.supplier);
      const item = textValue(payload.item);
      const quantity = numberValue(payload.quantity);
      const unitCost = numberValue(payload.unitCost);
      const nextPaymentStatus = textValue(payload.paymentStatus, "Payé");
      if (!id || !supplier || !item || quantity < 1 || !["Payé", "À payer"].includes(nextPaymentStatus)) return Response.json({ error: "Achat invalide." }, { status: 400 });
      const [purchase] = await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.id, id)).limit(1);
      if (!purchase) return Response.json({ error: "Achat introuvable." }, { status: 404 });
      await db.update(purchases).set({ supplier, item, quantity, unitCost, totalCost: quantity * unitCost, paymentStatus: nextPaymentStatus }).where(eq(purchases.id, id));
    } else if (payload.action === "deletePurchase") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Achat invalide." }, { status: 400 });
      const [purchase] = await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.id, id)).limit(1);
      if (!purchase) return Response.json({ error: "Achat introuvable." }, { status: 404 });
      await db.delete(purchases).where(eq(purchases.id, id));
    } else if (payload.action === "addAd") {
      await db.insert(adPerformance).values({ platform: "Meta Ads", campaign: textValue(payload.campaign, "Campagne Meta"), spend: numberValue(payload.spend), revenue: numberValue(payload.revenue), orderCount: numberValue(payload.orderCount), source: "Saisie manuelle", performanceDate: textValue(payload.performanceDate, new Date().toISOString().slice(0, 10)) });
    } else if (payload.action === "updateAd") {
      const id = numberValue(payload.id);
      const campaign = textValue(payload.campaign);
      const performanceDate = textValue(payload.performanceDate);
      if (!id || !campaign || !/^\d{4}-\d{2}-\d{2}$/.test(performanceDate)) return Response.json({ error: "Publicité invalide." }, { status: 400 });
      const [ad] = await db.select({ id: adPerformance.id }).from(adPerformance).where(eq(adPerformance.id, id)).limit(1);
      if (!ad) return Response.json({ error: "Publicité introuvable." }, { status: 404 });
      await db.update(adPerformance).set({ campaign, spend: numberValue(payload.spend), revenue: numberValue(payload.revenue), orderCount: numberValue(payload.orderCount), performanceDate }).where(eq(adPerformance.id, id));
    } else if (payload.action === "deleteAd") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Publicité invalide." }, { status: 400 });
      const [ad] = await db.select({ id: adPerformance.id }).from(adPerformance).where(eq(adPerformance.id, id)).limit(1);
      if (!ad) return Response.json({ error: "Publicité introuvable." }, { status: 404 });
      await db.delete(adPerformance).where(eq(adPerformance.id, id));
    } else if (payload.action === "addCapital") {
      await db.insert(capitalLedger).values({ direction: textValue(payload.direction, "Entrée"), category: textValue(payload.category, "Ajustement"), label: textValue(payload.label, "Mouvement de capital"), amount: numberValue(payload.amount), entryDate: textValue(payload.entryDate, new Date().toISOString().slice(0, 10)) });
    } else if (payload.action === "updateCapital") {
      const id = numberValue(payload.id);
      const direction = textValue(payload.direction);
      const category = textValue(payload.category);
      const label = textValue(payload.label);
      const entryDate = textValue(payload.entryDate);
      if (!id || !["Entrée", "Sortie"].includes(direction) || !category || !label || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return Response.json({ error: "Mouvement de capital invalide." }, { status: 400 });
      const [entry] = await db.select({ id: capitalLedger.id }).from(capitalLedger).where(eq(capitalLedger.id, id)).limit(1);
      if (!entry) return Response.json({ error: "Mouvement de capital introuvable." }, { status: 404 });
      await db.update(capitalLedger).set({ direction, category, label, amount: numberValue(payload.amount), entryDate }).where(eq(capitalLedger.id, id));
    } else if (payload.action === "deleteCapital") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Mouvement de capital invalide." }, { status: 400 });
      const [entry] = await db.select({ id: capitalLedger.id }).from(capitalLedger).where(eq(capitalLedger.id, id)).limit(1);
      if (!entry) return Response.json({ error: "Mouvement de capital introuvable." }, { status: 404 });
      await db.delete(capitalLedger).where(eq(capitalLedger.id, id));
    } else if (payload.action === "addProduct") {
      const productCode = textValue(payload.productCode).toUpperCase();
      const name = textValue(payload.name);
      if (!productCode || !name) return Response.json({ error: "L’ID produit et le nom sont obligatoires." }, { status: 400 });
      const [duplicate] = await db.select({ id: products.id }).from(products).where(eq(products.productCode, productCode)).limit(1);
      if (duplicate) return Response.json({ error: "Cet ID produit existe déjà." }, { status: 409 });
      const initialQuantity = numberValue(payload.initialQuantity);
      const [product] = await db.insert(products).values({ productCode, name, category: productCategory(payload.category), purchasePrice: numberValue(payload.purchasePrice), salePrice: numberValue(payload.salePrice), stockQuantity: initialQuantity }).returning();
      if (!product) throw new Error("Le produit n’a pas été créé.");
      if (initialQuantity > 0) await db.insert(stockMovements).values({ productId: product.id, movementType: "Entrée", quantity: initialQuantity, note: "Stock initial" });
    } else if (payload.action === "updateProduct") {
      const id = numberValue(payload.id);
      const productCode = textValue(payload.productCode).toUpperCase();
      const name = textValue(payload.name);
      if (!id || !productCode || !name) return Response.json({ error: "Produit invalide." }, { status: 400 });
      const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
      if (!product) return Response.json({ error: "Produit introuvable." }, { status: 404 });
      const [duplicate] = await db.select({ id: products.id }).from(products).where(eq(products.productCode, productCode)).limit(1);
      if (duplicate && duplicate.id !== id) return Response.json({ error: "Cet ID produit existe déjà." }, { status: 409 });
      await db.update(products).set({ productCode, name, category: productCategory(payload.category), purchasePrice: numberValue(payload.purchasePrice), salePrice: numberValue(payload.salePrice) }).where(eq(products.id, id));
    } else if (payload.action === "deleteProduct") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Produit invalide." }, { status: 400 });
      const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
      if (!product) return Response.json({ error: "Produit introuvable." }, { status: 404 });
      const [linkedOrder] = await db.select({ id: orders.id }).from(orders).where(eq(orders.productId, id)).limit(1);
      if (linkedOrder) return Response.json({ error: "Ce produit est lié à une commande et doit être conservé dans l’historique." }, { status: 409 });
      await db.batch([
        db.delete(stockMovements).where(eq(stockMovements.productId, id)),
        db.delete(products).where(eq(products.id, id)),
      ]);
    } else if (payload.action === "addStockMovement") {
      const productId = numberValue(payload.productId);
      const quantity = numberValue(payload.quantity);
      const movementType = textValue(payload.movementType);
      if (!productId || quantity < 1 || !["Entrée", "Vente"].includes(movementType)) return Response.json({ error: "Mouvement de stock invalide." }, { status: 400 });
      const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      if (!product) return Response.json({ error: "Produit introuvable." }, { status: 404 });
      if (movementType === "Vente" && quantity > product.stockQuantity) return Response.json({ error: `Stock insuffisant : ${product.stockQuantity} unité(s) restante(s).` }, { status: 400 });
      const delta = movementType === "Entrée" ? quantity : -quantity;
      await db.batch([
        db.insert(stockMovements).values({ productId, movementType, quantity, note: textValue(payload.note) }),
        db.update(products).set({ stockQuantity: sql`${products.stockQuantity} + ${delta}` }).where(eq(products.id, productId)),
      ]);
    } else if (payload.action === "updateStockMovement") {
      const id = numberValue(payload.id);
      const quantity = numberValue(payload.quantity);
      const movementType = textValue(payload.movementType);
      if (!id || quantity < 1 || !["Entrée", "Vente"].includes(movementType)) return Response.json({ error: "Mouvement de stock invalide." }, { status: 400 });
      const [movement] = await db.select().from(stockMovements).where(eq(stockMovements.id, id)).limit(1);
      if (!movement) return Response.json({ error: "Mouvement de stock introuvable." }, { status: 404 });
      if (movement.orderId) return Response.json({ error: "Un mouvement créé automatiquement par une commande ne peut pas être modifié." }, { status: 409 });
      const [product] = await db.select().from(products).where(eq(products.id, movement.productId)).limit(1);
      if (!product) return Response.json({ error: "Produit associé introuvable." }, { status: 404 });
      const oldDelta = movement.movementType === "Entrée" ? movement.quantity : -movement.quantity;
      const nextDelta = movementType === "Entrée" ? quantity : -quantity;
      const nextStock = product.stockQuantity - oldDelta + nextDelta;
      if (nextStock < 0) return Response.json({ error: "Cette modification rendrait le stock négatif." }, { status: 409 });
      await db.batch([
        db.update(stockMovements).set({ movementType, quantity, note: textValue(payload.note) }).where(eq(stockMovements.id, id)),
        db.update(products).set({ stockQuantity: nextStock }).where(eq(products.id, product.id)),
      ]);
    } else if (payload.action === "deleteStockMovement") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Mouvement de stock invalide." }, { status: 400 });
      const [movement] = await db.select().from(stockMovements).where(eq(stockMovements.id, id)).limit(1);
      if (!movement) return Response.json({ error: "Mouvement de stock introuvable." }, { status: 404 });
      if (movement.orderId) return Response.json({ error: "Un mouvement créé automatiquement par une commande ne peut pas être supprimé." }, { status: 409 });
      const [product] = await db.select().from(products).where(eq(products.id, movement.productId)).limit(1);
      if (!product) return Response.json({ error: "Produit associé introuvable." }, { status: 404 });
      const oldDelta = movement.movementType === "Entrée" ? movement.quantity : -movement.quantity;
      const nextStock = product.stockQuantity - oldDelta;
      if (nextStock < 0) return Response.json({ error: "Ce mouvement ne peut pas être supprimé car le stock deviendrait négatif." }, { status: 409 });
      await db.batch([
        db.delete(stockMovements).where(eq(stockMovements.id, id)),
        db.update(products).set({ stockQuantity: nextStock }).where(eq(products.id, product.id)),
      ]);
    } else if (payload.action === "updateAccountSettings") {
      if (!access.isOwner) return Response.json({ error: "Seul le compte principal peut modifier ce profil." }, { status: 403 });
      const accountName = textValue(payload.accountName);
      const accountEmail = textValue(payload.accountEmail).toLowerCase();
      const displayName = textValue(payload.displayName);
      const username = normalizeUsername(textValue(payload.username));
      if (accountName.length < 2 || accountName.length > 80) return Response.json({ error: "Le nom de la marque doit contenir entre 2 et 80 caractères." }, { status: 400 });
      if (accountEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) return Response.json({ error: "Adresse e-mail invalide." }, { status: 400 });
      if (displayName.length < 2 || displayName.length > 80 || username.length < 2 || username.length > 50) return Response.json({ error: "Le nom affiché et le nom de connexion doivent contenir entre 2 et 50 caractères." }, { status: 400 });
      const [duplicateUser] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
      if (duplicateUser && duplicateUser.id !== user.id) return Response.json({ error: "Ce nom d’utilisateur de connexion existe déjà." }, { status: 409 });
      const updatedAt = new Date().toISOString();
      await db.batch([
        db.insert(settings).values({ key: "account_name", value: accountName }).onConflictDoUpdate({ target: settings.key, set: { value: accountName, updatedAt } }),
        db.insert(settings).values({ key: "account_email", value: accountEmail }).onConflictDoUpdate({ target: settings.key, set: { value: accountEmail, updatedAt } }),
        db.update(users).set({ username, displayName, updatedAt }).where(eq(users.id, user.id)),
      ]);
    } else if (payload.action === "updateBackupToken") {
      if (!access.isOwner) return Response.json({ error: "Seul l’administrateur peut configurer la sauvegarde." }, { status: 403 });
      const token = textValue(payload.token);
      if (token.length < 32 || token.length > 200 || !/^[A-Za-z0-9_-]+$/.test(token)) {
        return Response.json({ error: "La clé privée de sauvegarde est invalide." }, { status: 400 });
      }
      const updatedAt = new Date().toISOString();
      await db.insert(settings).values({ key: "security_backup_token_hash", value: await sha256Hex(token) }).onConflictDoUpdate({
        target: settings.key,
        set: { value: await sha256Hex(token), updatedAt },
      });
    } else if (payload.action === "revokeBackupToken") {
      if (!access.isOwner) return Response.json({ error: "Seul l’administrateur peut désactiver la sauvegarde." }, { status: 403 });
      const updatedAt = new Date().toISOString();
      await db.insert(settings).values({ key: "security_backup_token_hash", value: "" }).onConflictDoUpdate({
        target: settings.key,
        set: { value: "", updatedAt },
      });
    } else if (payload.action === "updateBackupWebhook") {
      if (!access.isOwner) return Response.json({ error: "Seul l’administrateur peut connecter la synchronisation instantanée." }, { status: 403 });
      const webhookUrl = textValue(payload.url);
      let parsedWebhookUrl: URL;
      try {
        parsedWebhookUrl = new URL(webhookUrl);
      } catch {
        return Response.json({ error: "L’adresse Apps Script est invalide." }, { status: 400 });
      }
      if (
        webhookUrl.length > 500
        || parsedWebhookUrl.protocol !== "https:"
        || parsedWebhookUrl.hostname !== "script.google.com"
        || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(parsedWebhookUrl.pathname)
        || parsedWebhookUrl.search
        || parsedWebhookUrl.hash
      ) {
        return Response.json({ error: "Collez l’adresse Apps Script complète qui se termine par /exec." }, { status: 400 });
      }
      const updatedAt = new Date().toISOString();
      await db.insert(settings).values({ key: "security_backup_webhook_url", value: webhookUrl }).onConflictDoUpdate({
        target: settings.key,
        set: { value: webhookUrl, updatedAt },
      });
      auditEntityLabel = "Synchronisation instantanée";
    } else if (payload.action === "createBackupNow") {
      if (!access.isOwner) return Response.json({ error: "Seul l’administrateur peut créer une sauvegarde complète." }, { status: 403 });
      await createDailyBackup(await getRawDb(), "Manuelle", true);
      auditEntityLabel = "Sauvegarde manuelle";
    } else if (payload.action === "restoreBackup") {
      if (!access.isOwner) return Response.json({ error: "Seul l’administrateur peut restaurer une sauvegarde." }, { status: 403 });
      const backupId = numberValue(payload.backupId);
      if (!backupId) return Response.json({ error: "Sauvegarde invalide." }, { status: 400 });
      const [backup] = await db.select({ id: dailyBackups.id, backupDate: dailyBackups.backupDate }).from(dailyBackups).where(eq(dailyBackups.id, backupId)).limit(1);
      if (!backup) return Response.json({ error: "Sauvegarde introuvable." }, { status: 404 });
      await createDailyBackup(await getRawDb(), "Avant restauration", true);
      await restoreDailyBackup(await getRawDb(), backupId);
      auditEntityId = String(backupId);
      auditEntityLabel = backup.backupDate;
    } else if (payload.action === "updateCarriers") {
      if (!access.isOwner) return Response.json({ error: "Seul l’administrateur peut gérer les agences." }, { status: 403 });
      let requestedCarriers: unknown;
      try {
        requestedCarriers = JSON.parse(textValue(payload.carriers, "[]"));
      } catch {
        return Response.json({ error: "La liste des agences est invalide." }, { status: 400 });
      }
      if (!Array.isArray(requestedCarriers) || requestedCarriers.length > 30 || requestedCarriers.some((value) => typeof value !== "string")) {
        return Response.json({ error: "Vous pouvez enregistrer jusqu’à 30 agences." }, { status: 400 });
      }
      const carrierNames = requestedCarriers.map((value) => value.trim().replace(/\s+/g, " "));
      if (carrierNames.some((name) => name.length < 2 || name.length > 80 || name === "À configurer")) {
        return Response.json({ error: "Chaque nom d’agence doit contenir entre 2 et 80 caractères." }, { status: 400 });
      }
      const normalizedCarrierNames = carrierNames.map((name) => name.toLocaleLowerCase("fr"));
      if (new Set(normalizedCarrierNames).size !== normalizedCarrierNames.length) {
        return Response.json({ error: "Cette agence existe déjà dans la liste." }, { status: 400 });
      }
      const updatedAt = new Date().toISOString();
      const primaryCarrier = carrierNames[0] || "À configurer";
      const carriersSettingQuery = db.insert(settings).values({ key: "carrier_names", value: JSON.stringify(carrierNames) }).onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(carrierNames), updatedAt } });
      const legacySettingQuery = db.insert(settings).values({ key: "carrier_name", value: primaryCarrier }).onConflictDoUpdate({ target: settings.key, set: { value: primaryCarrier, updatedAt } });
      const renameFrom = textValue(payload.renameFrom);
      const renameTo = textValue(payload.renameTo);
      const shouldRename = Boolean(renameFrom && renameTo && renameFrom !== renameTo && carrierNames.includes(renameTo));
      if (shouldRename && carrierNames.length) {
        await db.batch([
          carriersSettingQuery,
          legacySettingQuery,
          db.update(orders).set({ carrier: renameTo, updatedAt }).where(eq(orders.carrier, renameFrom)),
          db.update(orders).set({ carrier: carrierNames[0], updatedAt }).where(eq(orders.carrier, "Non affecté")),
          db.update(orders).set({ carrier: carrierNames[0], updatedAt }).where(eq(orders.carrier, "")),
        ]);
      } else if (carrierNames.length) {
        await db.batch([
          carriersSettingQuery,
          legacySettingQuery,
          db.update(orders).set({ carrier: carrierNames[0], updatedAt }).where(eq(orders.carrier, "Non affecté")),
          db.update(orders).set({ carrier: carrierNames[0], updatedAt }).where(eq(orders.carrier, "")),
        ]);
      } else {
        await db.batch([carriersSettingQuery, legacySettingQuery]);
      }
    } else if (payload.action === "updateSetting") {
      const key = textValue(payload.key);
      if (!["theme", "carrier_name"].includes(key)) return Response.json({ error: "Réglage invalide." }, { status: 400 });
      const value = textValue(payload.value);
      if (key === "theme" && !themeOptions.includes(value)) return Response.json({ error: "Thème invalide." }, { status: 400 });
      const updatedAt = new Date().toISOString();
      if (key === "carrier_name") {
        if (!access.isOwner) return Response.json({ error: "Seul l’administrateur peut modifier le transporteur." }, { status: 403 });
        if (value.length < 2 || value.length > 80 || value === "À configurer") return Response.json({ error: "Le nom de l’agence doit contenir entre 2 et 80 caractères." }, { status: 400 });
        await db.batch([
          db.insert(settings).values({ key: "carrier_name", value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } }),
          db.insert(settings).values({ key: "carrier_names", value: JSON.stringify([value]) }).onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify([value]), updatedAt } }),
          db.update(orders).set({ carrier: value, updatedAt }).where(eq(orders.carrier, "Non affecté")),
          db.update(orders).set({ carrier: value, updatedAt }).where(eq(orders.carrier, "")),
        ]);
      } else {
        await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } });
      }
    } else {
      return Response.json({ error: "Action inconnue." }, { status: 400 });
    }

    if (!auditEntityLabel) {
      auditEntityLabel = textValue(payload.orderRef)
        || textValue(payload.customerName)
        || textValue(payload.name)
        || textValue(payload.item)
        || textValue(payload.campaign)
        || textValue(payload.label)
        || textValue(payload.productCode)
        || textValue(payload.displayName)
        || textValue(payload.carrierName)
        || textValue(payload.key);
    }
    await writeAudit(user, textValue(payload.action), auditEntityId, auditEntityLabel);

    if (!["updateBackupWebhook", "updateBackupToken", "revokeBackupToken", "createBackupNow", "restoreBackup"].includes(textValue(payload.action))) {
      await triggerGoogleSheetsSync();
    }

    const refreshedUser = await getAuthenticatedUser(request);
    if (!refreshedUser) return Response.json({ error: "Votre session a expiré." }, { status: 401 });
    return Response.json(await snapshot(await securityAccess(request, refreshedUser)));
  } catch (error) {
    console.error("Maison Jiya data POST failed", errorDetails(error));
    const errorMessage = error instanceof Error ? error.message : "";
    if (errorMessage.includes("Stock insuffisant")) {
      return Response.json({ error: "Stock insuffisant pour confirmer cette commande." }, { status: 409 });
    }
    if (errorMessage.startsWith("Le nom d’utilisateur") || errorMessage.startsWith("Le mot de passe") || errorMessage === "Rôle invalide.") {
      return Response.json({ error: errorMessage }, { status: 400 });
    }
    return Response.json({ error: "L’enregistrement n’a pas abouti. Vérifiez les champs puis réessayez." }, { status: 500 });
  }
}
