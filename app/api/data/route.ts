import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { adPerformance, capitalLedger, customers, orders, products, purchases, settings, stockMovements, users } from "../../../db/schema";
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

async function seedIfNeeded() {
  const db = await getDb();
  await db.insert(settings).values([
    { key: "safety_reserve", value: "12000" },
    { key: "stock_allocation", value: "60" },
    { key: "ads_allocation", value: "25" },
    { key: "reserve_allocation", value: "15" },
    { key: "meta_status", value: "À connecter" },
    { key: "carrier_name", value: "À configurer" },
    { key: "theme", value: "mauve-froid" },
    { key: "account_name", value: "Maison Jiya" },
  ]).onConflictDoNothing();

  await db.update(orders).set({ status: "En attente" }).where(eq(orders.status, "Nouvelle"));
  await db.update(orders).set({ status: "Retour" }).where(eq(orders.status, "Retournée"));
  await db.update(orders).set({ status: "Annulée" }).where(eq(orders.status, "Refusée"));

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
  const db = await getDb();
  const [orderRows, customerRows, purchaseRows, adRows, capitalRows, productRows, movementRows, settingRows, memberRows] = await Promise.all([
    db.select({ id: orders.id, orderRef: orders.orderRef, customerId: orders.customerId, customerName: customers.name, phone: customers.phone, city: orders.city, products: orders.products, quantity: orders.quantity, saleAmount: orders.saleAmount, productCost: orders.productCost, shippingCost: orders.shippingCost, adCost: orders.adCost, fees: orders.fees, returnCost: orders.returnCost, source: orders.source, status: orders.status, paymentStatus: orders.paymentStatus, carrier: orders.carrier, trackingNumber: orders.trackingNumber, paidAt: orders.paidAt, createdAt: orders.createdAt, updatedAt: orders.updatedAt }).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).orderBy(desc(orders.createdAt)),
    db.select().from(customers).orderBy(desc(customers.createdAt)),
    db.select().from(purchases).orderBy(desc(purchases.createdAt)),
    db.select().from(adPerformance).orderBy(desc(adPerformance.performanceDate)),
    db.select().from(capitalLedger).orderBy(desc(capitalLedger.entryDate)),
    db.select().from(products).orderBy(desc(products.createdAt)),
    db.select({ id: stockMovements.id, productId: stockMovements.productId, productCode: products.productCode, productName: products.name, movementType: stockMovements.movementType, quantity: stockMovements.quantity, note: stockMovements.note, createdAt: stockMovements.createdAt }).from(stockMovements).leftJoin(products, eq(stockMovements.productId, products.id)).orderBy(desc(stockMovements.createdAt)),
    db.select().from(settings),
    access.isOwner
      ? db.select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, isActive: users.isActive, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt))
      : Promise.resolve([]),
  ]);
  const publicSettings = settingRows.filter((row) => !row.key.startsWith("security_"));
  return { orders: orderRows, customers: customerRows, purchases: purchaseRows, ads: adRows, capital: capitalRows, products: productRows, stockMovements: movementRows, members: memberRows, settings: Object.fromEntries(publicSettings.map((row) => [row.key, row.value])), access };
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
      if (!name || !phone || !city || !textValue(payload.products)) return Response.json({ error: "Cliente, téléphone, ville et produit sont obligatoires." }, { status: 400 });
      let [customer] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
      if (!customer) [customer] = await db.insert(customers).values({ name, phone, city }).returning();
      else await db.update(customers).set({ name, city }).where(eq(customers.id, customer.id));
      await db.insert(orders).values({
        orderRef: `MJ-${Date.now().toString(36).slice(-5).toUpperCase()}${crypto.randomUUID().slice(0, 2).toUpperCase()}`, customerId: customer.id, city, products: textValue(payload.products), quantity: numberValue(payload.quantity, 1), saleAmount: numberValue(payload.saleAmount), productCost: numberValue(payload.productCost), shippingCost: numberValue(payload.shippingCost), adCost: numberValue(payload.adCost), fees: numberValue(payload.fees), source: orderSource(payload.source), status: orderStatus(payload.status), paymentStatus: "À encaisser", carrier: textValue(payload.carrier, "Non affecté"), trackingNumber: textValue(payload.trackingNumber), updatedAt: new Date().toISOString(),
      });
    } else if (payload.action === "updateOrder") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Commande invalide." }, { status: 400 });
      const [existingOrder] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (!existingOrder) return Response.json({ error: "Commande introuvable." }, { status: 404 });
      const nextPaymentStatus = paymentStatus(payload.paymentStatus, existingOrder.paymentStatus);
      const now = new Date().toISOString();
      const paidAt = nextPaymentStatus === "Encaissé"
        ? existingOrder.paymentStatus === "Encaissé" && existingOrder.paidAt ? existingOrder.paidAt : now
        : null;
      await db.update(orders).set({ status: orderStatus(payload.status, existingOrder.status), paymentStatus: nextPaymentStatus, source: orderSource(payload.source, existingOrder.source), shippingCost: numberValue(payload.shippingCost), carrier: textValue(payload.carrier, "Non affecté"), trackingNumber: textValue(payload.trackingNumber), returnCost: numberValue(payload.returnCost), paidAt, updatedAt: now }).where(eq(orders.id, id));
    } else if (payload.action === "deleteOrder") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Commande invalide." }, { status: 400 });
      const [existingOrder] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, id)).limit(1);
      if (!existingOrder) return Response.json({ error: "Commande introuvable." }, { status: 404 });
      await db.delete(orders).where(eq(orders.id, id));
    } else if (payload.action === "addPurchase") {
      const quantity = numberValue(payload.quantity, 1);
      const unitCost = numberValue(payload.unitCost);
      await db.insert(purchases).values({ supplier: textValue(payload.supplier, "Fournisseur"), item: textValue(payload.item, "Achat"), quantity, unitCost, totalCost: quantity * unitCost, paymentStatus: textValue(payload.paymentStatus, "Payé") });
    } else if (payload.action === "addAd") {
      await db.insert(adPerformance).values({ platform: "Meta Ads", campaign: textValue(payload.campaign, "Campagne Meta"), spend: numberValue(payload.spend), revenue: numberValue(payload.revenue), orderCount: numberValue(payload.orderCount), source: "Saisie manuelle", performanceDate: textValue(payload.performanceDate, new Date().toISOString().slice(0, 10)) });
    } else if (payload.action === "addCapital") {
      await db.insert(capitalLedger).values({ direction: textValue(payload.direction, "Entrée"), category: textValue(payload.category, "Ajustement"), label: textValue(payload.label, "Mouvement de capital"), amount: numberValue(payload.amount), entryDate: textValue(payload.entryDate, new Date().toISOString().slice(0, 10)) });
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
    } else if (payload.action === "updateSetting") {
      const key = textValue(payload.key);
      if (key !== "theme") return Response.json({ error: "Réglage invalide." }, { status: 400 });
      const value = textValue(payload.value);
      if (key === "theme" && !themeOptions.includes(value)) return Response.json({ error: "Thème invalide." }, { status: 400 });
      await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date().toISOString() } });
    } else {
      return Response.json({ error: "Action inconnue." }, { status: 400 });
    }

    const refreshedUser = await getAuthenticatedUser(request);
    if (!refreshedUser) return Response.json({ error: "Votre session a expiré." }, { status: 401 });
    return Response.json(await snapshot(await securityAccess(request, refreshedUser)));
  } catch (error) {
    console.error("Maison Jiya data POST failed", errorDetails(error));
    const errorMessage = error instanceof Error ? error.message : "";
    if (errorMessage.startsWith("Le nom d’utilisateur") || errorMessage.startsWith("Le mot de passe") || errorMessage === "Rôle invalide.") {
      return Response.json({ error: errorMessage }, { status: 400 });
    }
    return Response.json({ error: "L’enregistrement n’a pas abouti. Vérifiez les champs puis réessayez." }, { status: 500 });
  }
}
