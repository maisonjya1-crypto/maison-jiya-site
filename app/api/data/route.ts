import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, getRawDb } from "../../../db";
import { createDailyBackup, purgeExpiredTrash, resetBusinessValuesPreservingStock, restoreDailyBackup, verifyLatestBackup } from "../../../db/backups";
import { restorePortableDataImport } from "../../../db/data-import";
import { dispatchAuthorizedOrder, getCarrierRuntimeStatus, syncCarrierOperations } from "../../../db/carriers";
import { moroccanPhoneHelp, normalizeMoroccanPhone } from "../../../db/phone";
import { getMetaRuntimeStatus, syncMetaAds } from "../../../db/meta";
import { reconcileOrderAllocations } from "../../../db/allocations";
import { getGoogleSheetsSyncSnapshot, markGoogleSheetsSyncPending, processGoogleSheetsSyncQueue } from "../../../db/google-sheets-sync";
import { ensureStorefrontCms } from "../../../db/storefront-cms";
import { receivePurchaseLine, receivePurchaseOrderImmediately } from "../../../db/inventory-cost";
import { buildDailyClosingPreview, saveDailyClosing } from "../../../db/daily-closing";
import { buildSmartStockRecommendations } from "../../../db/smart-stock";
import { supplierInvoiceIsOverdue, supplierInvoicePaymentStatus, syncPurchaseOrderPaymentState } from "../../../db/supplier-invoices";
import { buildPurchaseReference, normalizedProcurementStatus, normalizeSupplierName, resolveSupplierProfile } from "../../../db/suppliers";
import { normalizeOrderPaymentState, type OrderPaymentStatus } from "../../../lib/order-payment-lifecycle";
import { moveOrderToTrash, releaseTrashedOrderStock, restoreOrderFromTrash } from "../../../db/order-trash";
import { adPerformance, auditLogs, capitalLedger, carrierEvents, customers, dailyBackups, dailyClosings, expenses, inventoryCounts, inventorySessions, orders, orderStatusHistory, products, purchases, settings, stockMovements, supplierInvoices, supplierPayments, suppliers, users } from "../../../db/schema";
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

function moneyValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "string" ? Number(value.trim().replace(/\s/g, "").replace(",", ".")) : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : fallback;
}

type PurchaseOrderLineInput = {
  item: string;
  productId: number | null;
  quantity: number;
  unitCost: number;
};

function purchaseOrderLines(value: unknown): PurchaseOrderLineInput[] {
  if (typeof value !== "string" || !value.trim()) throw new Error("Ajoutez au moins un produit au bon de commande.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Les lignes du bon de commande sont illisibles.");
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 50) {
    throw new Error("Un bon de commande doit contenir entre 1 et 50 lignes.");
  }
  return parsed.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Ligne ${index + 1} invalide.`);
    const row = raw as Record<string, unknown>;
    const item = textValue(row.item).slice(0, 160);
    const productId = numberValue(row.productId) || null;
    const quantity = numberValue(row.quantity);
    const unitCost = moneyValue(row.unitCost);
    if (!item || quantity < 1) throw new Error(`Complétez l’article et la quantité de la ligne ${index + 1}.`);
    if (unitCost < 0) throw new Error(`Coût invalide sur la ligne ${index + 1}.`);
    return { item, productId, quantity, unitCost };
  });
}

const treasuryAccounts = ["Banque", "Caisse", "Espèces", "Carte", "Autre"];

function treasuryAccount(value: unknown, fallback = "Banque") {
  const account = textValue(value, fallback);
  return treasuryAccounts.includes(account) ? account : fallback;
}

const purchaseModes = ["Retrait fournisseur", "Livraison fournisseur"];

function purchaseMode(value: unknown, fallback = "Retrait fournisseur") {
  const mode = textValue(value, fallback);
  return purchaseModes.includes(mode) ? mode : fallback;
}

function paidAtFromInput(value: unknown, fallbackIso = new Date().toISOString()) {
  const raw = textValue(value);
  if (!raw) return fallbackIso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallbackIso;
  return `${raw}T12:00:00.000Z`;
}

const orderStatuses = ["En attente", "Confirmée", "Expédiée", "En livraison", "Livrée", "Retour", "Annulée"];
const orderSources = ["WhatsApp", "Instagram", "Facebook", "TikTok", "Site web", "Magasin physique", "Autre", "Non renseignée"];
const fulfillmentTypes = ["Livraison", "Magasin physique"];
const paymentStatuses = ["À encaisser", "Encaissé", "Non encaissé", "Remboursé"];
const stockCommittedStatuses = new Set(["Confirmée", "Expédiée", "En livraison", "Livrée", "Retour"]);
const returnReasons = ["Cliente injoignable", "Refus de la cliente", "Adresse incorrecte", "Cliente absente", "Produit endommagé", "Mauvais produit", "Autre"];
const inventoryDifferenceReasons = ["Casse", "Perte", "Vol", "Erreur de saisie", "Autre"];

function inventoryDifferenceReason(value: unknown, difference: number) {
  if (difference === 0) return "Aucun écart";
  const reason = textValue(value);
  if (!inventoryDifferenceReasons.includes(reason)) throw new Error("Choisissez un motif pour expliquer l’écart d’inventaire.");
  return reason;
}

async function openInventorySession() {
  return (await getRawDb()).prepare(
    "SELECT id, session_ref AS sessionRef FROM inventory_sessions WHERE status = 'En cours' ORDER BY id DESC LIMIT 1",
  ).first<{ id: number; sessionRef: string }>();
}

function inventoryCatalogLockMessage(sessionRef: string) {
  return `Terminez d’abord l’inventaire ${sessionRef} avant d’ajouter, modifier, archiver ou restaurer des produits.`;
}

const productCategories = ["Montres", "Bijoux", "Wallets", "Électronique", "Boîtes", "Autre"];
const themeOptions = ["mauve-froid", "rose-poudre", "sombre-prune", "bleu-brume", "sable-chic"];

function orderStatus(value: unknown, fallback = "En attente") {
  const status = textValue(value, fallback);
  return orderStatuses.includes(status) ? status : fallback;
}

function orderSource(value: unknown, fallback = "Non renseignée") {
  const source = textValue(value, fallback);
  return orderSources.includes(source) ? source : fallback;
}

function fulfillmentType(value: unknown, fallback = "Livraison") {
  const type = textValue(value, fallback);
  return fulfillmentTypes.includes(type) ? type : fallback;
}

function paymentStatus(value: unknown, fallback = "À encaisser") {
  const status = textValue(value, fallback);
  return paymentStatuses.includes(status) ? status : fallback;
}

function returnReason(value: unknown, fallback = "") {
  const reason = textValue(value, fallback);
  return returnReasons.includes(reason) ? reason : fallback;
}

function productCategory(value: unknown, fallback = "Autre") {
  const category = textValue(value, fallback);
  if (productCategories.includes(category)) return category;
  const normalized = category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, "").toLocaleLowerCase("fr");
  if (["electronique", "electroniques"].includes(normalized)) return "Électronique";
  if (["montre", "montres"].includes(normalized)) return "Montres";
  if (["bijou", "bijoux"].includes(normalized)) return "Bijoux";
  if (["wallet", "wallets", "portefeuille", "portefeuilles"].includes(normalized)) return "Wallets";
  if (["boite", "boites"].includes(normalized)) return "Boîtes";
  return fallback;
}

function stockAlertThreshold(value: unknown, fallback = 5) {
  if (value === undefined || value === null || textValue(value) === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100_000) throw new Error("Le seuil d’alerte stock doit être un entier entre 0 et 100000.");
  return parsed;
}

function reorderCoverDays(value: unknown, fallback = 30) {
  if (value === undefined || value === null || textValue(value) === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 180) throw new Error("La couverture de réapprovisionnement doit être comprise entre 1 et 180 jours.");
  return parsed;
}

function commitsStock(status: string) {
  return stockCommittedStatuses.has(status);
}

type MutationReceiptState =
  | { kind: "unprotected" }
  | { kind: "invalid" }
  | { kind: "reserved"; requestKey: string }
  | { kind: "processing"; requestKey: string }
  | { kind: "completed"; requestKey: string; message: string }
  | { kind: "conflict"; requestKey: string };

async function reserveMutationReceipt(userId: number, action: string, rawRequestKey: unknown): Promise<MutationReceiptState> {
  const requestKey = textValue(rawRequestKey);
  if (!requestKey) return { kind: "unprotected" };
  if (!/^[A-Za-z0-9_-]{16,120}$/.test(requestKey)) return { kind: "invalid" };

  const database = await getRawDb();
  await database.prepare("DELETE FROM mutation_receipts WHERE status = 'completed' AND completed_at < datetime('now', '-30 days')").run();
  const inserted = await database.prepare(
    "INSERT OR IGNORE INTO mutation_receipts (request_key, user_id, action, status) VALUES (?, ?, ?, 'processing')",
  ).bind(requestKey, userId, action).run();

  if (Number(inserted.meta?.changes || 0) === 1) return { kind: "reserved", requestKey };

  const existing = await database.prepare(
    "SELECT user_id, action, status, message FROM mutation_receipts WHERE request_key = ? LIMIT 1",
  ).bind(requestKey).first<{ user_id: number; action: string; status: string; message: string }>();

  if (!existing || existing.user_id !== userId || existing.action !== action) return { kind: "conflict", requestKey };
  if (existing.status === "completed") return { kind: "completed", requestKey, message: existing.message || "" };
  return { kind: "processing", requestKey };
}

async function completeMutationReceipt(requestKey: string, userId: number, action: string, message: string) {
  const database = await getRawDb();
  await database.prepare(
    "UPDATE mutation_receipts SET status = 'completed', message = ?, completed_at = CURRENT_TIMESTAMP WHERE request_key = ? AND user_id = ? AND action = ?",
  ).bind(message.slice(0, 240), requestKey, userId, action).run();
}

async function releaseMutationReceipt(requestKey: string, userId: number, action: string) {
  const database = await getRawDb();
  await database.prepare(
    "DELETE FROM mutation_receipts WHERE request_key = ? AND user_id = ? AND action = ? AND status = 'processing'",
  ).bind(requestKey, userId, action).run();
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

const auditLabels: Record<string, { action: string; entityType: string }> = {
  createMember: { action: "Ajout", entityType: "Partenaire" },
  resetMemberPassword: { action: "Mot de passe remplacé", entityType: "Partenaire" },
  updateMember: { action: "Modification", entityType: "Partenaire" },
  addOrder: { action: "Ajout", entityType: "Commande" },
  importOrders: { action: "Importation", entityType: "Commandes" },
  importProducts: { action: "Importation", entityType: "Produits" },
  updateOrder: { action: "Modification", entityType: "Commande" },
  deleteOrder: { action: "Mise à la corbeille", entityType: "Commande" },
  restoreOrder: { action: "Restauration", entityType: "Commande" },
  deleteOrderPermanently: { action: "Suppression définitive", entityType: "Commande" },
  updateCustomer: { action: "Modification", entityType: "Client" },
  deleteCustomer: { action: "Suppression", entityType: "Client" },
  addSupplier: { action: "Ajout", entityType: "Fournisseur" },
  updateSupplier: { action: "Modification", entityType: "Fournisseur" },
  toggleSupplier: { action: "Statut modifié", entityType: "Fournisseur" },
  addPurchase: { action: "Ajout", entityType: "Achat" },
  updatePurchase: { action: "Modification", entityType: "Achat" },
  deletePurchase: { action: "Suppression", entityType: "Achat" },
  receivePurchase: { action: "Réception", entityType: "Achat fournisseur" },
  addSupplierInvoice: { action: "Ajout", entityType: "Facture fournisseur" },
  updateSupplierInvoice: { action: "Modification", entityType: "Facture fournisseur" },
  deleteSupplierInvoice: { action: "Suppression", entityType: "Facture fournisseur" },
  addSupplierPayment: { action: "Paiement", entityType: "Facture fournisseur" },
  deleteSupplierPayment: { action: "Annulation paiement", entityType: "Facture fournisseur" },
  addExpense: { action: "Ajout", entityType: "Dépense" },
  updateExpense: { action: "Modification", entityType: "Dépense" },
  deleteExpense: { action: "Suppression", entityType: "Dépense" },
  addAd: { action: "Ajout", entityType: "Publicité" },
  updateAd: { action: "Modification", entityType: "Publicité" },
  deleteAd: { action: "Suppression", entityType: "Publicité" },
  addCapital: { action: "Ajout", entityType: "Capital" },
  updateCapital: { action: "Modification", entityType: "Capital" },
  deleteCapital: { action: "Suppression", entityType: "Capital" },
  addProduct: { action: "Ajout", entityType: "Produit" },
  updateProduct: { action: "Modification", entityType: "Produit" },
  archiveProduct: { action: "Archivage", entityType: "Produit" },
  restoreProduct: { action: "Restauration", entityType: "Produit" },
  deleteProduct: { action: "Archivage", entityType: "Produit" },
  addStockMovement: { action: "Ajout", entityType: "Stock" },
  countInventory: { action: "Inventaire", entityType: "Stock" },
  updateStockMovement: { action: "Modification", entityType: "Stock" },
  deleteStockMovement: { action: "Suppression", entityType: "Stock" },
  updateAccountSettings: { action: "Modification", entityType: "Compte" },
  updateBackupToken: { action: "Clé créée", entityType: "Sauvegarde" },
  revokeBackupToken: { action: "Désactivation", entityType: "Sauvegarde" },
  updateBackupWebhook: { action: "Connexion", entityType: "Google Sheets" },
  createBackupNow: { action: "Création", entityType: "Sauvegarde" },
  verifyBackupNow: { action: "Vérification", entityType: "Sauvegarde" },
  restoreBackup: { action: "Restauration", entityType: "Sauvegarde" },
  importPortableExport: { action: "Restauration", entityType: "Export complet" },
  resetBusinessValues: { action: "Remise à zéro", entityType: "Données commerciales" },
  retryGoogleSheetsSync: { action: "Nouvelle tentative", entityType: "Google Sheets" },
  updateCarriers: { action: "Modification", entityType: "Transporteurs" },
  syncMetaNow: { action: "Synchronisation", entityType: "Meta Ads" },
  updateSetting: { action: "Modification", entityType: "Paramètre" },
  updateAllocationPolicy: { action: "Modification", entityType: "Répartition du capital" },
  saveDailyClosing: { action: "Clôture", entityType: "Journée" },
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
    { key: "reinvestment_allocation", value: "50" },
    { key: "salary_allocation", value: "30" },
    { key: "emergency_allocation", value: "20" },
    { key: "meta_status", value: "À connecter" },
    { key: "carrier_name", value: "À configurer" },
    { key: "carrier_names", value: "[]" },
    { key: "theme", value: "mauve-froid" },
    { key: "account_name", value: "Maison Jiya" },
    { key: "backup_sheet_url", value: "" },
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
    isOwner: user.isOwner,
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
  await reconcileOrderAllocations();
  const rawDatabase = await getRawDb();
  await createDailyBackup(rawDatabase);
  const db = await getDb();
  const orderSelection = { id: orders.id, orderRef: orders.orderRef, customerId: orders.customerId, productId: orders.productId, customerName: customers.name, phone: customers.phone, city: orders.city, address: orders.address, products: orders.products, quantity: orders.quantity, saleAmount: orders.saleAmount, productCost: orders.productCost, shippingCost: orders.shippingCost, adCost: orders.adCost, fees: orders.fees, returnCost: orders.returnCost, returnReason: orders.returnReason, returnNote: orders.returnNote, source: orders.source, campaign: orders.campaign, fulfillmentType: orders.fulfillmentType, status: orders.status, paymentStatus: orders.paymentStatus, carrier: orders.carrier, trackingNumber: orders.trackingNumber, carrierDispatchState: orders.carrierDispatchState, carrierAuthorizedAt: orders.carrierAuthorizedAt, carrierInvoiceCode: orders.carrierInvoiceCode, stockDeducted: orders.stockDeducted, paidAt: orders.paidAt, refundedAt: orders.refundedAt, deletedAt: orders.deletedAt, deletedByUserId: orders.deletedByUserId, createdAt: orders.createdAt, updatedAt: orders.updatedAt };
  const [orderRows, trashRows, customerRows, supplierRows, purchaseRows, invoiceRows, supplierPaymentRows, expenseRows, adRows, capitalRows, productRows, movementRows, inventoryRows, inventorySessionRows, settingRows, memberRows, historyRows, auditRows, backupRows, closingRows] = await Promise.all([
    db.select(orderSelection).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).where(isNull(orders.deletedAt)).orderBy(desc(orders.createdAt)),
    access.isOwner
      ? db.select(orderSelection).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).where(isNotNull(orders.deletedAt)).orderBy(desc(orders.deletedAt))
      : Promise.resolve([]),
    db.select().from(customers).orderBy(desc(customers.createdAt)),
    db.select().from(suppliers).orderBy(desc(suppliers.isActive), desc(suppliers.createdAt)),
    db.select({
      id: purchases.id,
      supplier: purchases.supplier,
      supplierId: purchases.supplierId,
      purchaseRef: purchases.purchaseRef,
      purchaseLineNo: purchases.purchaseLineNo,
      purchaseMode: purchases.purchaseMode,
      procurementStatus: purchases.procurementStatus,
      orderedAt: purchases.orderedAt,
      expectedAt: purchases.expectedAt,
      item: purchases.item,
      productId: purchases.productId,
      productCode: products.productCode,
      productName: products.name,
      quantity: purchases.quantity,
      unitCost: purchases.unitCost,
      totalCost: purchases.totalCost,
      account: purchases.account,
      paymentStatus: purchases.paymentStatus,
      paidAt: purchases.paidAt,
      receivedQuantity: purchases.receivedQuantity,
      receivedAt: purchases.receivedAt,
      createdAt: purchases.createdAt,
    }).from(purchases).leftJoin(products, eq(purchases.productId, products.id)).orderBy(desc(purchases.createdAt)),
    db.select({
      id: supplierInvoices.id,
      supplierId: supplierInvoices.supplierId,
      supplierName: suppliers.name,
      purchaseRef: supplierInvoices.purchaseRef,
      invoiceNumber: supplierInvoices.invoiceNumber,
      invoiceDate: supplierInvoices.invoiceDate,
      dueDate: supplierInvoices.dueDate,
      totalAmount: supplierInvoices.totalAmount,
      note: supplierInvoices.note,
      createdAt: supplierInvoices.createdAt,
      updatedAt: supplierInvoices.updatedAt,
    }).from(supplierInvoices).leftJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id)).orderBy(desc(supplierInvoices.invoiceDate), desc(supplierInvoices.createdAt)),
    db.select().from(supplierPayments).orderBy(desc(supplierPayments.paidAt), desc(supplierPayments.createdAt)),
    db.select().from(expenses).orderBy(desc(expenses.expenseDate), desc(expenses.createdAt)),
    db.select().from(adPerformance).orderBy(desc(adPerformance.performanceDate)),
    db.select().from(capitalLedger).orderBy(desc(capitalLedger.entryDate)),
    db.select().from(products).orderBy(desc(products.createdAt)),
    db.select({ id: stockMovements.id, productId: stockMovements.productId, orderId: stockMovements.orderId, purchaseId: stockMovements.purchaseId, orderRef: orders.orderRef, productCode: products.productCode, productName: products.name, movementType: stockMovements.movementType, quantity: stockMovements.quantity, note: stockMovements.note, createdAt: stockMovements.createdAt }).from(stockMovements).leftJoin(products, eq(stockMovements.productId, products.id)).leftJoin(orders, eq(stockMovements.orderId, orders.id)).orderBy(desc(stockMovements.createdAt)),
    db.select({
      id: inventoryCounts.id,
      countRef: inventoryCounts.countRef,
      sessionId: inventoryCounts.sessionId,
      productId: inventoryCounts.productId,
      productCode: products.productCode,
      productName: products.name,
      systemQuantity: inventoryCounts.systemQuantity,
      physicalQuantity: inventoryCounts.physicalQuantity,
      difference: inventoryCounts.difference,
      reason: inventoryCounts.reason,
      unitCost: inventoryCounts.unitCost,
      valueBefore: inventoryCounts.valueBefore,
      valueAfter: inventoryCounts.valueAfter,
      lossValue: inventoryCounts.lossValue,
      note: inventoryCounts.note,
      countedByUserId: inventoryCounts.countedByUserId,
      countedByName: inventoryCounts.countedByName,
      createdAt: inventoryCounts.createdAt,
    }).from(inventoryCounts).leftJoin(products, eq(inventoryCounts.productId, products.id)).orderBy(desc(inventoryCounts.createdAt)).limit(1000),
    db.select().from(inventorySessions).orderBy(desc(inventorySessions.startedAt)).limit(100),
    db.select().from(settings),
    access.isOwner
      ? db.select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, isOwner: users.isOwner, isActive: users.isActive, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt))
      : Promise.resolve([]),
    db.select().from(orderStatusHistory).orderBy(desc(orderStatusHistory.changedAt)).limit(1000),
    access.isOwner ? db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200) : Promise.resolve([]),
    access.isOwner
      ? db.select({ id: dailyBackups.id, backupDate: dailyBackups.backupDate, reason: dailyBackups.reason, recordCount: dailyBackups.recordCount, createdAt: dailyBackups.createdAt }).from(dailyBackups).orderBy(desc(dailyBackups.createdAt)).limit(90)
      : Promise.resolve([]),
    db.select().from(dailyClosings).orderBy(desc(dailyClosings.closeDate)).limit(365),
  ]);
  const paidByInvoice = new Map<number, number>();
  for (const payment of supplierPaymentRows) {
    paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) || 0) + Number(payment.amount || 0));
  }
  const enrichedInvoiceRows = invoiceRows.map((invoice) => {
    const paidAmount = Math.round(((paidByInvoice.get(invoice.id) || 0) + Number.EPSILON) * 100) / 100;
    const totalAmount = Number(invoice.totalAmount || 0);
    const remainingAmount = Math.round((Math.max(0, totalAmount - paidAmount) + Number.EPSILON) * 100) / 100;
    const paymentStatus = supplierInvoicePaymentStatus(totalAmount, paidAmount);
    return {
      ...invoice,
      paidAmount,
      remainingAmount,
      paymentStatus,
      isOverdue: supplierInvoiceIsOverdue(invoice.dueDate, remainingAmount),
    };
  });
  const invoiceByPurchaseRef = new Map(enrichedInvoiceRows.map((invoice) => [invoice.purchaseRef, invoice]));
  const enrichedPurchaseRows = purchaseRows.map((purchase) => ({
    ...purchase,
    invoiceId: purchase.purchaseRef ? invoiceByPurchaseRef.get(purchase.purchaseRef)?.id || null : null,
  }));

  const publicSettings = settingRows.filter((row) => !row.key.startsWith("security_"));
  const backupConfigured = settingRows.some((row) => row.key === "security_backup_token_hash" && row.value.length === 64);
  const secureWebhook = settingRows.find((row) => row.key === "security_backup_webhook_url")?.value || "";
  const [carrierRuntime, lastCarrierEvent, metaRuntimeConfigured, googleSheetsSync, dailyClosingPreview, stockRecommendations] = await Promise.all([
    getCarrierRuntimeStatus(),
    db.select({ receivedAt: carrierEvents.receivedAt }).from(carrierEvents).where(sql`${carrierEvents.provider} IN ('sendit', 'forcelog')`).orderBy(desc(carrierEvents.receivedAt)).limit(1),
    getMetaRuntimeStatus(),
    getGoogleSheetsSyncSnapshot(rawDatabase),
    buildDailyClosingPreview(rawDatabase),
    buildSmartStockRecommendations(rawDatabase),
  ]);
  return {
    orders: orderRows,
    trash: trashRows,
    customers: customerRows,
    suppliers: supplierRows,
    purchases: enrichedPurchaseRows,
    supplierInvoices: enrichedInvoiceRows,
    supplierPayments: supplierPaymentRows,
    expenses: expenseRows,
    ads: adRows,
    capital: capitalRows,
    products: productRows,
    stockMovements: movementRows,
    inventoryCounts: inventoryRows,
    inventorySessions: inventorySessionRows,
    members: memberRows,
    orderStatusHistory: historyRows,
    auditLogs: auditRows,
    backups: backupRows,
    dailyClosings: closingRows,
    dailyClosingPreview,
    stockRecommendations,
    googleSheetsSync,
    settings: {
      ...Object.fromEntries(publicSettings.map((row) => [row.key, row.value])),
      backup_configured: backupConfigured ? "true" : "false",
      backup_webhook_configured: secureWebhook ? "true" : "false",
      sendit_api_configured: carrierRuntime.senditApiConfigured ? "true" : "false",
      sendit_api_verified: carrierRuntime.senditApiVerified ? "true" : "false",
      sendit_api_checked_at: carrierRuntime.senditApiCheckedAt,
      sendit_api_last_error: carrierRuntime.senditApiLastError,
      sendit_webhook_configured: carrierRuntime.senditWebhookConfigured ? "true" : "false",
      sendit_webhook_verified_at: carrierRuntime.senditWebhookVerifiedAt,
      forcelog_api_configured: carrierRuntime.forceLogApiConfigured ? "true" : "false",
      forcelog_api_verified: carrierRuntime.forceLogApiVerified ? "true" : "false",
      forcelog_api_checked_at: carrierRuntime.forceLogApiCheckedAt,
      forcelog_api_last_error: carrierRuntime.forceLogApiLastError,
      meta_api_configured: metaRuntimeConfigured ? "true" : "false",
      carrier_last_sync_at: lastCarrierEvent[0]?.receivedAt || "",
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
  let mutationReceiptKey = "";
  let mutationReceiptAction = "";
  let mutationReceiptUserId = 0;
  let mutationReceiptReserved = false;
  let businessMutationCommitted = false;

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

    const protectMutation = async (actionName: string) => {
      const state = await reserveMutationReceipt(user.id, actionName, payload.requestKey);
      if (state.kind === "unprotected") return null;
      if (state.kind === "invalid") {
        return Response.json({ error: "Identifiant de requête invalide." }, { status: 400 });
      }
      if (state.kind === "conflict") {
        return Response.json({ error: "Cette requête ne correspond pas à l’opération attendue." }, { status: 409 });
      }
      if (state.kind === "processing") {
        return Response.json({ error: "Cette opération est déjà en cours. Maison Jiya vérifie avant de la rejouer.", code: "MUTATION_IN_PROGRESS" }, { status: 409 });
      }
      if (state.kind === "completed") {
        const responseData = await snapshot(access);
        return Response.json({ ...responseData, message: state.message || "Cette opération avait déjà été enregistrée. Aucun doublon n’a été créé." });
      }
      mutationReceiptKey = state.requestKey;
      mutationReceiptAction = actionName;
      mutationReceiptUserId = user.id;
      mutationReceiptReserved = true;
      return null;
    };

    let auditEntityId = textValue(payload.id) || textValue(payload.memberId) || null;
    let auditEntityLabel = "";
    let integrationMessage = "";

    if (payload.action === "saveDailyClosing") {
      if ([payload.actualBank, payload.actualCash, payload.actualOther].some((value) => value === undefined || value === null || textValue(value) === "")) {
        return Response.json({ error: "Renseignez les trois soldes réels avant de clôturer." }, { status: 400 });
      }
      const duplicateClosing = await protectMutation("saveDailyClosing");
      if (duplicateClosing) return duplicateClosing;
      const actualBank = moneyValue(payload.actualBank);
      const actualCash = moneyValue(payload.actualCash);
      const actualOther = moneyValue(payload.actualOther);
      const note = textValue(payload.note).slice(0, 500);
      const result = await saveDailyClosing(await getRawDb(), {
        bank: actualBank,
        cash: actualCash,
        other: actualOther,
        note,
        userId: user.id,
        userName: user.displayName,
      });
      auditEntityId = result.closeDate;
      auditEntityLabel = `${result.closeDate} · écart ${result.totalVariance.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD`;
      integrationMessage = Math.abs(result.totalVariance) <= 0.01
        ? `Clôture du ${result.closeDate} enregistrée : trésorerie conforme.`
        : `Clôture du ${result.closeDate} enregistrée avec un écart de ${result.totalVariance.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD.`;
    } else if (payload.action === "createMember") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut créer un partenaire." }, { status: 403 });
      const username = normalizeUsername(textValue(payload.username));
      const [existingMember] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
      if (existingMember) return Response.json({ error: "Ce nom d’utilisateur existe déjà." }, { status: 409 });
      const role = textValue(payload.role, "viewer") as AppUser["role"];
      await createUser({
        username,
        displayName: textValue(payload.displayName),
        password: textValue(payload.password),
        role,
        isOwner: false,
      });
    } else if (payload.action === "resetMemberPassword") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut remplacer ce mot de passe." }, { status: 403 });
      const memberId = numberValue(payload.memberId);
      const password = textValue(payload.password);
      const confirmation = textValue(payload.confirmation);
      if (!memberId) return Response.json({ error: "Compte partenaire invalide." }, { status: 400 });
      if (password !== confirmation) return Response.json({ error: "Les deux mots de passe ne correspondent pas." }, { status: 400 });
      await updateUserPassword(memberId, password);
    } else if (payload.action === "updateMember") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut modifier un partenaire." }, { status: 403 });
      const memberId = numberValue(payload.memberId);
      const role = textValue(payload.role, "viewer");
      const isActive = textValue(payload.isActive, "true") === "true";
      if (!memberId || !["admin", "editor", "viewer"].includes(role)) return Response.json({ error: "Compte partenaire invalide." }, { status: 400 });
      const [targetMember] = await db.select({ id: users.id, isOwner: users.isOwner }).from(users).where(eq(users.id, memberId)).limit(1);
      if (!targetMember) return Response.json({ error: "Compte partenaire introuvable." }, { status: 404 });
      if (targetMember.isOwner) return Response.json({ error: "Le propriétaire principal ne peut pas être rétrogradé, suspendu ou remplacé par un rôle partenaire." }, { status: 409 });
      await db.update(users).set({ role, isActive, updatedAt: new Date().toISOString() }).where(eq(users.id, memberId));
    } else if (payload.action === "importOrders") {
      let parsedRows: unknown;
      try {
        parsedRows = JSON.parse(textValue(payload.rows, "[]"));
      } catch {
        return Response.json({ error: "Le fichier importé est invalide." }, { status: 400 });
      }
      if (!Array.isArray(parsedRows) || !parsedRows.length || parsedRows.length > 200) {
        return Response.json({ error: "Importez entre 1 et 200 commandes à la fois." }, { status: 400 });
      }
      const catalog = await db.select().from(products).where(isNull(products.archivedAt));
      const byCode = new Map(catalog.map((product) => [product.productCode.toLocaleUpperCase("fr"), product]));
      const normalizedRows = parsedRows.map((raw, index) => {
        const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        const productCode = textValue(row.productCode).toLocaleUpperCase("fr");
        const product = byCode.get(productCode);
        const selectedFulfillment = fulfillmentType(row.fulfillmentType);
        const isStoreSale = selectedFulfillment === "Magasin physique";
        const phone = normalizeMoroccanPhone(textValue(row.phone));
        const quantity = numberValue(row.quantity, 1);
        const status = isStoreSale ? "Livrée" : orderStatus(row.status, "En attente");
        const city = textValue(row.city, isStoreSale ? "Casablanca" : "");
        const address = isStoreSale ? "Magasin Maison Jiya" : textValue(row.address).slice(0, 300);
        if (!product) throw new Error(`Ligne ${index + 2} : produit ${productCode || "non renseigné"} introuvable.`);
        if (!phone) throw new Error(`Ligne ${index + 2} : téléphone marocain invalide.`);
        if (!textValue(row.customerName) || !city || quantity < 1 || (!isStoreSale && !address)) throw new Error(`Ligne ${index + 2} : informations obligatoires manquantes.`);
        return { row, product, phone, quantity, status, city, address, selectedFulfillment, isStoreSale };
      });
      const committedByProduct = new Map<number, number>();
      normalizedRows.filter((row) => commitsStock(row.status)).forEach((row) => committedByProduct.set(row.product.id, (committedByProduct.get(row.product.id) || 0) + row.quantity));
      for (const [productId, required] of committedByProduct) {
        const product = catalog.find((item) => item.id === productId)!;
        if (required > product.stockQuantity) return Response.json({ error: `Stock insuffisant pour ${product.productCode} : ${required} demandée(s), ${product.stockQuantity} disponible(s).` }, { status: 409 });
      }
      const duplicateImport = await protectMutation("importOrders");
      if (duplicateImport) return duplicateImport;

      const rawDatabase = await getRawDb();
      const now = new Date().toISOString();
      const statements = [] as ReturnType<typeof rawDatabase.prepare>[];

      for (const [productId, required] of committedByProduct) {
        statements.push(
          rawDatabase.prepare("UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?").bind(required, productId),
        );
      }

      for (const item of normalizedRows) {
        const { row, product, phone, quantity, status, city, address, selectedFulfillment, isStoreSale } = item;
        const customerName = textValue(row.customerName);
        const orderRef = `MJ-I${Date.now().toString(36).slice(-4).toUpperCase()}${crypto.randomUUID().slice(0, 3).toUpperCase()}`;
        const shouldDeduct = commitsStock(status);
        const saleAmount = moneyValue(row.saleAmount, product.salePrice * quantity);
        const shippingCost = isStoreSale ? 0 : moneyValue(row.shippingCost);
        const adCost = moneyValue(row.adCost);
        const fees = moneyValue(row.fees);
        const source = isStoreSale ? "Magasin physique" : orderSource(row.source);
        const campaign = isStoreSale ? "" : textValue(row.campaign).slice(0, 120);
        const nextPaymentStatus = isStoreSale ? "Encaissé" : paymentStatus(row.paymentStatus, "À encaisser");
        const carrier = isStoreSale ? "Magasin physique" : textValue(row.carrier, "Non affecté");
        const dispatchState = isStoreSale ? "Non requis" : "À autoriser";
        const paidAt = isStoreSale ? now : null;

        statements.push(
          rawDatabase.prepare(`
            INSERT INTO customers (name, phone, city)
            VALUES (?, ?, ?)
            ON CONFLICT(phone) DO UPDATE SET name = excluded.name, city = excluded.city
          `).bind(customerName, phone, city),
          rawDatabase.prepare(`
            INSERT INTO orders (
              order_ref, customer_id, product_id, city, address, products, quantity,
              sale_amount, product_cost, shipping_cost, ad_cost, fees, source, campaign,
              fulfillment_type, status, payment_status, carrier, carrier_dispatch_state,
              stock_deducted, paid_at, updated_at
            )
            VALUES (
              ?, (SELECT id FROM customers WHERE phone = ? LIMIT 1), ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
          `).bind(
            orderRef,
            phone,
            product.id,
            city,
            address,
            `${product.name} · ${product.productCode}`,
            quantity,
            saleAmount,
            product.purchasePrice * quantity,
            shippingCost,
            adCost,
            fees,
            source,
            campaign,
            selectedFulfillment,
            status,
            nextPaymentStatus,
            carrier,
            dispatchState,
            shouldDeduct ? 1 : 0,
            paidAt,
            now,
          ),
          rawDatabase.prepare(`
            INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id, changed_by_name, changed_at)
            SELECT id, NULL, ?, ?, ?, ? FROM orders WHERE order_ref = ?
          `).bind(status, user.id, `${user.displayName} · import`, now, orderRef),
        );

        if (shouldDeduct) {
          statements.push(
            rawDatabase.prepare(`
              INSERT INTO stock_movements (product_id, order_id, movement_type, quantity, note, created_at)
              SELECT ?, id, 'Commande', ?, ?, ? FROM orders WHERE order_ref = ?
            `).bind(product.id, quantity, `Déduction automatique · import ${orderRef}`, now, orderRef),
          );
        }
      }

      await rawDatabase.batch(statements);
      const imported = normalizedRows.length;
      integrationMessage = `${imported} commande(s) importée(s) en une seule opération. Stock, clients et historique ont été actualisés.`;
      auditEntityLabel = `${imported} commande(s)`;
    } else if (payload.action === "addOrder") {
      const selectedFulfillmentType = fulfillmentType(payload.fulfillmentType);
      const isStoreSale = selectedFulfillmentType === "Magasin physique";
      const name = textValue(payload.customerName);
      const phone = normalizeMoroccanPhone(textValue(payload.phone));
      const city = textValue(payload.city, isStoreSale ? "Casablanca" : "");
      const address = isStoreSale ? "Magasin Maison Jiya" : textValue(payload.address).slice(0, 300);
      const productId = numberValue(payload.productId);
      const quantity = numberValue(payload.quantity, 1);
      if (!phone) return Response.json({ error: moroccanPhoneHelp }, { status: 400 });
      if (!name || !city || !productId || quantity < 1 || (!isStoreSale && !address)) return Response.json({ error: isStoreSale ? "Cliente, téléphone, ville, produit et quantité sont obligatoires." : "Cliente, téléphone, ville, adresse, produit et quantité sont obligatoires." }, { status: 400 });
      const [selectedProduct] = await db.select().from(products).where(and(eq(products.id, productId), isNull(products.archivedAt))).limit(1);
      if (!selectedProduct) return Response.json({ error: "Le produit sélectionné n’existe plus dans le catalogue." }, { status: 404 });
      const selectedStatus = isStoreSale ? "Livrée" : orderStatus(payload.status);
      const selectedReturnReason = selectedStatus === "Retour" ? returnReason(payload.returnReason) : "";
      const selectedReturnNote = selectedStatus === "Retour" ? textValue(payload.returnNote).slice(0, 240) : "";
      if (selectedStatus === "Retour" && !selectedReturnReason) return Response.json({ error: "Choisissez le motif du retour." }, { status: 400 });
      if (selectedReturnReason === "Autre" && !selectedReturnNote) return Response.json({ error: "Précisez le motif du retour." }, { status: 400 });
      const shouldDeductStock = commitsStock(selectedStatus);
      if (shouldDeductStock && quantity > selectedProduct.stockQuantity) {
        return Response.json({ error: `Stock insuffisant pour confirmer : ${selectedProduct.stockQuantity} unité(s) disponible(s).` }, { status: 409 });
      }
      const carrierSettings = await db.select({ key: settings.key, value: settings.value }).from(settings);
      const carrierNames = parseCarrierNames(
        carrierSettings.find((setting) => setting.key === "carrier_names")?.value,
        carrierSettings.find((setting) => setting.key === "carrier_name")?.value,
      );
      const requestedCarrier = textValue(payload.carrier);
      const selectedCarrier = isStoreSale
        ? "Magasin physique"
        : requestedCarrier && (!carrierNames.length || carrierNames.includes(requestedCarrier))
          ? requestedCarrier
          : carrierNames[0] || "Non affecté";
      const orderRef = `MJ-${Date.now().toString(36).slice(-5).toUpperCase()}${crypto.randomUUID().slice(0, 2).toUpperCase()}`;
      const now = new Date().toISOString();
      const productLabel = `${selectedProduct.name} · ${selectedProduct.productCode}`;
      const saleAmount = moneyValue(payload.saleAmount, selectedProduct.salePrice * quantity);
      const selectedPaymentStatus = isStoreSale ? "Encaissé" : "À encaisser";
      const selectedSource = isStoreSale ? "Magasin physique" : orderSource(payload.source);
      const requestedCampaign = textValue(payload.campaign).slice(0, 120);
      const selectedCampaign = isStoreSale || requestedCampaign === "Aucune campagne" ? "" : requestedCampaign;
      const selectedShippingCost = isStoreSale ? 0 : moneyValue(payload.shippingCost);
      const selectedTrackingNumber = isStoreSale ? "" : textValue(payload.trackingNumber);
      const selectedDispatchState = isStoreSale ? "Non requis" : "À autoriser";
      const selectedPaidAt = isStoreSale ? now : null;
      const duplicateOrder = await protectMutation("addOrder");
      if (duplicateOrder) return duplicateOrder;

      const rawDb = await getRawDb();
      const statements = [
        rawDb.prepare(`
          INSERT INTO customers (name, phone, city)
          VALUES (?, ?, ?)
          ON CONFLICT(phone) DO UPDATE SET name = excluded.name, city = excluded.city
        `).bind(name, phone, city),
        rawDb.prepare(`INSERT INTO orders (order_ref, customer_id, product_id, city, address, products, quantity, sale_amount, product_cost, shipping_cost, ad_cost, fees, return_cost, return_reason, return_note, source, campaign, fulfillment_type, status, payment_status, carrier, tracking_number, carrier_dispatch_state, stock_deducted, paid_at, updated_at)
          VALUES (?, (SELECT id FROM customers WHERE phone = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(orderRef, phone, productId, city, address, productLabel, quantity, saleAmount, selectedProduct.purchasePrice * quantity, selectedShippingCost, moneyValue(payload.adCost), moneyValue(payload.fees), selectedReturnReason, selectedReturnNote, selectedSource, selectedCampaign, selectedFulfillmentType, selectedStatus, selectedPaymentStatus, selectedCarrier, selectedTrackingNumber, selectedDispatchState, shouldDeductStock ? 1 : 0, selectedPaidAt, now),
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
      if (isStoreSale) integrationMessage = "Vente en magasin enregistrée : paiement encaissé, stock déduit et capital actualisé. Aucun colis n’est nécessaire.";
      else if (selectedStatus === "Confirmée" && !createdOrder.trackingNumber) integrationMessage = "Commande confirmée. Aucun colis n’a été envoyé : ouvrez la commande puis autorisez l’agence choisie.";
    } else if (payload.action === "updateOrder") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Commande invalide." }, { status: 400 });
      const [existingOrder] = await db.select().from(orders).where(and(eq(orders.id, id), isNull(orders.deletedAt))).limit(1);
      if (!existingOrder) return Response.json({ error: "Commande introuvable." }, { status: 404 });
      const nextFulfillmentType = fulfillmentType(payload.fulfillmentType, existingOrder.fulfillmentType || "Livraison");
      const isStoreSale = nextFulfillmentType === "Magasin physique";
      const switchingToStore = isStoreSale && existingOrder.fulfillmentType !== "Magasin physique";
      if (switchingToStore && existingOrder.trackingNumber) return Response.json({ error: "Ce colis possède déjà un numéro de suivi. Il ne peut plus être transformé en vente magasin." }, { status: 409 });
      const requestedPaymentStatus = (switchingToStore ? "Encaissé" : paymentStatus(payload.paymentStatus, existingOrder.paymentStatus)) as OrderPaymentStatus;
      const nextStatus = switchingToStore ? "Livrée" : orderStatus(payload.status, existingOrder.status);
      if (isStoreSale && !["Livrée", "Retour", "Annulée"].includes(nextStatus)) return Response.json({ error: "Une vente magasin peut être livrée, retournée ou annulée." }, { status: 400 });
      const nextAddress = isStoreSale ? "Magasin Maison Jiya" : textValue(payload.address, existingOrder.address).slice(0, 300);
      const nextPhone = normalizeMoroccanPhone(textValue(payload.phone));
      if (!isStoreSale && !nextAddress) return Response.json({ error: "L’adresse de livraison est obligatoire." }, { status: 400 });
      if (!nextPhone) return Response.json({ error: moroccanPhoneHelp }, { status: 400 });
      const [duplicatePhone] = await db.select({ id: customers.id }).from(customers).where(eq(customers.phone, nextPhone)).limit(1);
      if (duplicatePhone && duplicatePhone.id !== existingOrder.customerId) return Response.json({ error: "Ce numéro appartient déjà à un autre client." }, { status: 409 });
      const nextReturnReason = nextStatus === "Retour" ? returnReason(payload.returnReason, existingOrder.returnReason) : existingOrder.returnReason;
      const nextReturnNote = nextStatus === "Retour" ? textValue(payload.returnNote, existingOrder.returnNote).slice(0, 240) : existingOrder.returnNote;
      if (nextStatus === "Retour" && !nextReturnReason) return Response.json({ error: "Choisissez le motif du retour." }, { status: 400 });
      if (nextReturnReason === "Autre" && !nextReturnNote) return Response.json({ error: "Précisez le motif du retour." }, { status: 400 });
      const now = new Date().toISOString();
      const paymentState = normalizeOrderPaymentState({
        status: nextStatus,
        requestedPaymentStatus,
        previousPaymentStatus: existingOrder.paymentStatus,
        paidAt: existingOrder.paidAt,
        refundedAt: existingOrder.refundedAt,
        now,
      });
      const nextPaymentStatus = paymentState.paymentStatus;
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
      const nextSource = isStoreSale ? "Magasin physique" : orderSource(payload.source, existingOrder.source);
      const requestedNextCampaign = textValue(payload.campaign, existingOrder.campaign).slice(0, 120);
      const nextCampaign = isStoreSale || requestedNextCampaign === "Aucune campagne" ? "" : requestedNextCampaign;
      const nextCarrier = isStoreSale ? "Magasin physique" : textValue(payload.carrier, existingOrder.fulfillmentType === "Magasin physique" ? "Non affecté" : existingOrder.carrier || "Non affecté");
      const nextTrackingNumber = isStoreSale ? "" : textValue(payload.trackingNumber, existingOrder.trackingNumber);
      const nextDispatchState = isStoreSale ? "Non requis" : existingOrder.fulfillmentType === "Magasin physique" ? "À autoriser" : existingOrder.carrierDispatchState;
      const nextCarrierAuthorizedAt = isStoreSale ? null : existingOrder.carrierAuthorizedAt;
      const nextCarrierInvoiceCode = isStoreSale ? "" : existingOrder.carrierInvoiceCode;
      const rawDb = await getRawDb();
      const statements = [
        rawDb.prepare("UPDATE customers SET phone = ? WHERE id = ?").bind(nextPhone, existingOrder.customerId),
        rawDb.prepare(`UPDATE orders SET fulfillment_type = ?, status = ?, payment_status = ?, source = ?, campaign = ?, address = ?, shipping_cost = ?, carrier = ?, tracking_number = ?, carrier_dispatch_state = ?, carrier_authorized_at = ?, carrier_invoice_code = ?, return_cost = ?, return_reason = ?, return_note = ?, paid_at = ?, refunded_at = ?, stock_deducted = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
          .bind(nextFulfillmentType, nextStatus, nextPaymentStatus, nextSource, nextCampaign, nextAddress, isStoreSale ? 0 : moneyValue(payload.shippingCost), nextCarrier, nextTrackingNumber, nextDispatchState, nextCarrierAuthorizedAt, nextCarrierInvoiceCode, moneyValue(payload.returnCost), nextReturnReason, nextReturnNote, paymentState.paidAt, paymentState.refundedAt, nextStockDeducted ? 1 : 0, now, id),
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
      if (isStoreSale) integrationMessage = "Vente en magasin mise à jour : aucun transporteur ni frais de livraison.";
      else if (nextStatus === "Confirmée" && !nextTrackingNumber) integrationMessage = "Commande confirmée. Aucun colis n’a été envoyé : vérifiez l’agence puis cliquez sur « Autoriser et créer le colis ».";
    } else if (payload.action === "authorizeCarrierDispatch") {
      const id = numberValue(payload.id);
      const carrier = textValue(payload.carrier);
      if (!id) return Response.json({ error: "Commande invalide." }, { status: 400 });
      const address = textValue(payload.address).slice(0, 300);
      const phone = normalizeMoroccanPhone(textValue(payload.phone));
      if (!address) return Response.json({ error: "L’adresse de livraison est obligatoire." }, { status: 400 });
      if (!phone) return Response.json({ error: moroccanPhoneHelp }, { status: 400 });
      const [orderToDispatch] = await db.select({ customerId: orders.customerId, fulfillmentType: orders.fulfillmentType }).from(orders).where(and(eq(orders.id, id), isNull(orders.deletedAt))).limit(1);
      if (!orderToDispatch) return Response.json({ error: "Commande introuvable." }, { status: 404 });
      if (orderToDispatch.fulfillmentType === "Magasin physique") return Response.json({ error: "Cette vente a été remise en magasin : aucun colis ne doit être créé." }, { status: 409 });
      const [duplicatePhone] = await db.select({ id: customers.id }).from(customers).where(eq(customers.phone, phone)).limit(1);
      if (duplicatePhone && duplicatePhone.id !== orderToDispatch.customerId) return Response.json({ error: "Ce numéro appartient déjà à un autre client." }, { status: 409 });
      await db.batch([
        db.update(customers).set({ phone }).where(eq(customers.id, orderToDispatch.customerId)),
        db.update(orders).set({ address, carrier, shippingCost: moneyValue(payload.shippingCost), updatedAt: new Date().toISOString() }).where(and(eq(orders.id, id), isNull(orders.deletedAt))),
      ]);
      const dispatch = await dispatchAuthorizedOrder(id, carrier);
      if (!dispatch.success) return Response.json({ error: dispatch.message }, { status: 409 });
      integrationMessage = dispatch.message;
      auditEntityId = String(id);
      auditEntityLabel = `${carrier} · autorisation manuelle`;
    } else if (payload.action === "syncCarriersNow") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut lancer une synchronisation complète." }, { status: 403 });
      const carrierSync = await syncCarrierOperations();
      const configuredProviders = [carrierSync.sendit.configured ? "Sendit" : "", carrierSync.forceLog.configured ? "ForceLog" : ""].filter(Boolean);
      if (!configuredProviders.length) return Response.json({ error: "Aucune API transporteur n’est configurée dans Cloudflare." }, { status: 409 });
      const verifiedProviders = [carrierSync.sendit.verified ? "Sendit" : "", carrierSync.forceLog.verified ? "ForceLog" : ""].filter(Boolean);
      const failedProviders = [
        carrierSync.sendit.configured && !carrierSync.sendit.verified ? `Sendit : ${carrierSync.sendit.error || "connexion impossible"}` : "",
        carrierSync.forceLog.configured && !carrierSync.forceLog.verified ? `ForceLog : ${carrierSync.forceLog.error || "connexion impossible"}` : "",
      ].filter(Boolean);
      if (!verifiedProviders.length) {
        return Response.json({ error: `Aucune connexion transporteur n’a pu être vérifiée. ${failedProviders.join(" · ")}` }, { status: 502 });
      }
      integrationMessage = `Connexion vérifiée : ${verifiedProviders.join(" + ")} · ${carrierSync.updated} commande(s) mise(s) à jour.${failedProviders.length ? ` À corriger : ${failedProviders.join(" · ")}` : ""}`;
      auditEntityLabel = verifiedProviders.join(" + ");
    } else if (payload.action === "syncMetaNow") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut synchroniser Meta Ads." }, { status: 403 });
      const result = await syncMetaAds();
      if (!result.configured) return Response.json({ error: result.message }, { status: 409 });
      if (result.failed) return Response.json({ error: result.message }, { status: 502 });
      integrationMessage = result.message;
      auditEntityLabel = "Meta Ads";
    } else if (payload.action === "deleteOrder") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Commande invalide." }, { status: 400 });
      const [existingOrder] = await db.select({ id: orders.id, orderRef: orders.orderRef }).from(orders).where(and(eq(orders.id, id), isNull(orders.deletedAt))).limit(1);
      if (!existingOrder) return Response.json({ error: "Commande introuvable." }, { status: 404 });
      const trashResult = await moveOrderToTrash(await getRawDb(), id, user.id);
      auditEntityLabel = existingOrder.orderRef;
      integrationMessage = trashResult.stockRestored
        ? "Commande placée dans la corbeille et stock réintégré automatiquement."
        : "Commande placée dans la corbeille.";
    } else if (payload.action === "restoreOrder") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Commande invalide." }, { status: 400 });
      const [existingOrder] = await db.select({ id: orders.id, orderRef: orders.orderRef }).from(orders).where(and(eq(orders.id, id), isNotNull(orders.deletedAt))).limit(1);
      if (!existingOrder) return Response.json({ error: "Commande absente de la corbeille." }, { status: 404 });
      const restoreResult = await restoreOrderFromTrash(await getRawDb(), id);
      auditEntityLabel = existingOrder.orderRef;
      integrationMessage = restoreResult.stockDeducted
        ? "Commande restaurée et stock réservé à nouveau automatiquement."
        : "Commande restaurée sans mouvement de stock.";
    } else if (payload.action === "deleteOrderPermanently") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut supprimer définitivement une commande." }, { status: 403 });
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Commande invalide." }, { status: 400 });
      const [existingOrder] = await db.select({ id: orders.id, orderRef: orders.orderRef, customerId: orders.customerId }).from(orders).where(and(eq(orders.id, id), isNotNull(orders.deletedAt))).limit(1);
      if (!existingOrder) return Response.json({ error: "Cette commande n’est pas dans la corbeille." }, { status: 404 });
      const database = await getRawDb();
      await releaseTrashedOrderStock(database, id);
      await createDailyBackup(database, `Avant suppression ${existingOrder.orderRef}`, true);
      await database.batch([
        database.prepare("UPDATE stock_movements SET order_id = NULL WHERE order_id = ?").bind(id),
        database.prepare("DELETE FROM order_status_history WHERE order_id = ?").bind(id),
        database.prepare("UPDATE carrier_events SET order_id = NULL WHERE order_id = ?").bind(id),
        database.prepare("DELETE FROM capital_ledger WHERE order_id = ? AND is_automatic = 1").bind(id),
        database.prepare("DELETE FROM orders WHERE id = ? AND deleted_at IS NOT NULL").bind(id),
      ]);
      await database.prepare("DELETE FROM customers WHERE id = ? AND NOT EXISTS (SELECT 1 FROM orders WHERE orders.customer_id = customers.id)").bind(existingOrder.customerId).run();
      auditEntityLabel = existingOrder.orderRef;
    } else if (payload.action === "updateCustomer") {
      const id = numberValue(payload.id);
      const name = textValue(payload.name);
      const phone = normalizeMoroccanPhone(textValue(payload.phone));
      const city = textValue(payload.city);
      if (!phone) return Response.json({ error: moroccanPhoneHelp }, { status: 400 });
      if (!id || !name || !city) return Response.json({ error: "Client invalide." }, { status: 400 });
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
    } else if (payload.action === "addSupplier") {
      const name = normalizeSupplierName(payload.name);
      const contactName = textValue(payload.contactName).slice(0, 120);
      const phone = textValue(payload.phone).slice(0, 40);
      const whatsapp = textValue(payload.whatsapp).slice(0, 40);
      const city = textValue(payload.city).slice(0, 100);
      const leadTimeDays = numberValue(payload.leadTimeDays, 7);
      const minimumOrderAmount = moneyValue(payload.minimumOrderAmount);
      const paymentTerms = textValue(payload.paymentTerms).slice(0, 160);
      const notes = textValue(payload.notes).slice(0, 500);
      if (!name || leadTimeDays > 365) return Response.json({ error: "Fournisseur invalide." }, { status: 400 });
      const duplicateSupplier = await protectMutation("addSupplier");
      if (duplicateSupplier) return duplicateSupplier;
      const database = await getRawDb();
      const duplicate = await database.prepare("SELECT id FROM suppliers WHERE lower(name) = lower(?) LIMIT 1").bind(name).first();
      if (duplicate) return Response.json({ error: "Ce fournisseur existe déjà." }, { status: 409 });
      const inserted = await database.prepare(`
        INSERT INTO suppliers (name, contact_name, phone, whatsapp, city, lead_time_days, minimum_order_amount, payment_terms, notes, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        RETURNING id
      `).bind(name, contactName, phone, whatsapp, city, leadTimeDays, minimumOrderAmount, paymentTerms, notes).first<{ id: number }>();
      auditEntityId = inserted ? String(inserted.id) : null;
      auditEntityLabel = name;
    } else if (payload.action === "updateSupplier") {
      const id = numberValue(payload.id);
      const name = normalizeSupplierName(payload.name);
      const contactName = textValue(payload.contactName).slice(0, 120);
      const phone = textValue(payload.phone).slice(0, 40);
      const whatsapp = textValue(payload.whatsapp).slice(0, 40);
      const city = textValue(payload.city).slice(0, 100);
      const leadTimeDays = numberValue(payload.leadTimeDays, 7);
      const minimumOrderAmount = moneyValue(payload.minimumOrderAmount);
      const paymentTerms = textValue(payload.paymentTerms).slice(0, 160);
      const notes = textValue(payload.notes).slice(0, 500);
      if (!id || !name || leadTimeDays > 365) return Response.json({ error: "Fournisseur invalide." }, { status: 400 });
      const database = await getRawDb();
      const current = await database.prepare("SELECT id, name FROM suppliers WHERE id = ? LIMIT 1").bind(id).first<{ id: number; name: string }>();
      if (!current) return Response.json({ error: "Fournisseur introuvable." }, { status: 404 });
      const duplicate = await database.prepare("SELECT id FROM suppliers WHERE lower(name) = lower(?) AND id <> ? LIMIT 1").bind(name, id).first();
      if (duplicate) return Response.json({ error: "Un autre fournisseur porte déjà ce nom." }, { status: 409 });
      await database.batch([
        database.prepare(`
          UPDATE suppliers
          SET name = ?, contact_name = ?, phone = ?, whatsapp = ?, city = ?, lead_time_days = ?, minimum_order_amount = ?, payment_terms = ?, notes = ?, updated_at = ?
          WHERE id = ?
        `).bind(name, contactName, phone, whatsapp, city, leadTimeDays, minimumOrderAmount, paymentTerms, notes, new Date().toISOString(), id),
        database.prepare("UPDATE purchases SET supplier = ? WHERE supplier_id = ?").bind(name, id),
      ]);
      auditEntityLabel = name;
    } else if (payload.action === "toggleSupplier") {
      const id = numberValue(payload.id);
      const active = textValue(payload.active) === "true";
      if (!id) return Response.json({ error: "Fournisseur invalide." }, { status: 400 });
      const database = await getRawDb();
      const supplier = await database.prepare("SELECT name FROM suppliers WHERE id = ? LIMIT 1").bind(id).first<{ name: string }>();
      if (!supplier) return Response.json({ error: "Fournisseur introuvable." }, { status: 404 });
      await database.prepare("UPDATE suppliers SET is_active = ?, updated_at = ? WHERE id = ?").bind(active ? 1 : 0, new Date().toISOString(), id).run();
      auditEntityLabel = supplier.name;
    } else if (payload.action === "addPurchaseOrder") {
      let lines: PurchaseOrderLineInput[];
      try {
        lines = purchaseOrderLines(payload.linesJson);
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Bon de commande invalide." }, { status: 400 });
      }

      const account = treasuryAccount(payload.account);
      const nextPaymentStatus = textValue(payload.paymentStatus, "À payer");
      const mode = purchaseMode(payload.purchaseMode);
      const receiveImmediately = textValue(payload.receiveImmediately) === "true" || textValue(payload.receiveImmediately) === "on";
      const travelCost = moneyValue(payload.travelCost);
      const travelExpenseAccount = treasuryAccount(payload.travelExpenseAccount, "Espèces");
      const procurementStatus = normalizedProcurementStatus(payload.procurementStatus, "Commandé");
      const paidAt = nextPaymentStatus === "Payé" ? paidAtFromInput(payload.paidDate) : null;
      let expectedAt = textValue(payload.expectedDate);

      if (!["Payé", "À payer"].includes(nextPaymentStatus) || ["Partiellement reçu", "Reçu", "Annulé"].includes(procurementStatus)) {
        return Response.json({ error: "Bon de commande invalide." }, { status: 400 });
      }
      if (receiveImmediately && procurementStatus !== "Commandé") {
        return Response.json({ error: "Un achat reçu immédiatement doit être enregistré comme commandé, pas comme brouillon." }, { status: 400 });
      }
      if (mode !== "Retrait fournisseur" && travelCost > 0) {
        return Response.json({ error: "Les frais de déplacement sont réservés au mode Retrait fournisseur." }, { status: 400 });
      }
      if (expectedAt && !/^\d{4}-\d{2}-\d{2}$/.test(expectedAt)) {
        return Response.json({ error: mode === "Retrait fournisseur" ? "Date de retrait prévue invalide." : "Date de livraison prévue invalide." }, { status: 400 });
      }

      const duplicatePurchaseOrder = await protectMutation("addPurchaseOrder");
      if (duplicatePurchaseOrder) return duplicatePurchaseOrder;

      const database = await getRawDb();
      for (const [index, line] of lines.entries()) {
        if (!line.productId) continue;
        const linkedProduct = await database.prepare(
          "SELECT id FROM products WHERE id = ? AND archived_at IS NULL LIMIT 1",
        ).bind(line.productId).first<{ id: number }>();
        if (!linkedProduct) return Response.json({ error: `Le produit de la ligne ${index + 1} est introuvable ou archivé.` }, { status: 404 });
      }

      const supplierProfile = await resolveSupplierProfile(database, numberValue(payload.supplierId) || null, textValue(payload.supplier));
      const orderedAt = procurementStatus === "Brouillon" ? null : new Date().toISOString();
      const todayKey = new Date().toISOString().slice(0, 10);
      if (!expectedAt && procurementStatus !== "Brouillon") {
        if (mode === "Retrait fournisseur") {
          expectedAt = todayKey;
        } else {
          const profile = await database.prepare("SELECT lead_time_days AS leadTimeDays FROM suppliers WHERE id = ?").bind(supplierProfile.id).first<{ leadTimeDays: number }>();
          const date = new Date();
          date.setUTCDate(date.getUTCDate() + Math.max(0, Number(profile?.leadTimeDays || 0)));
          expectedAt = date.toISOString().slice(0, 10);
        }
      }

      let purchaseRef = buildPurchaseReference();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const existing = await database.prepare("SELECT id FROM purchases WHERE purchase_ref = ? LIMIT 1").bind(purchaseRef).first();
        if (!existing) break;
        purchaseRef = buildPurchaseReference();
      }
      const stillExisting = await database.prepare("SELECT id FROM purchases WHERE purchase_ref = ? LIMIT 1").bind(purchaseRef).first();
      if (stillExisting) return Response.json({ error: "Impossible de générer une référence de bon unique. Réessayez." }, { status: 409 });

      await database.batch(lines.map((line, index) => database.prepare(`
        INSERT INTO purchases (
          supplier, supplier_id, purchase_ref, purchase_line_no, purchase_mode, procurement_status, ordered_at, expected_at,
          item, product_id, quantity, unit_cost, total_cost, account, payment_status, paid_at, received_quantity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).bind(
        supplierProfile.name,
        supplierProfile.id,
        purchaseRef,
        index + 1,
        mode,
        procurementStatus,
        orderedAt,
        expectedAt || null,
        line.item,
        line.productId,
        line.quantity,
        line.unitCost,
        line.quantity * line.unitCost,
        account,
        nextPaymentStatus,
        paidAt,
      )));

      if (receiveImmediately) {
        await receivePurchaseOrderImmediately(database, purchaseRef, new Date().toISOString());
      }

      if (mode === "Retrait fournisseur" && travelCost > 0) {
        const now = new Date();
        await database.prepare(`
          INSERT INTO expenses (category, label, amount, account, payment_status, paid_at, expense_date, note)
          VALUES ('Transport', ?, ?, ?, 'Payé', ?, ?, ?)
        `).bind(
          `Déplacement fournisseur · ${supplierProfile.name}`,
          travelCost,
          travelExpenseAccount,
          now.toISOString(),
          now.toISOString().slice(0, 10),
          `Frais séparés du coût du stock · ${purchaseRef} · Retrait chez fournisseur`,
        ).run();
      }

      auditEntityLabel = `${purchaseRef} · ${supplierProfile.name} · ${lines.length} ligne(s)`;
      integrationMessage = receiveImmediately
        ? `${purchaseRef} créé en retrait fournisseur et réceptionné immédiatement. Stock mis à jour ligne par ligne.${travelCost > 0 ? ` Frais de déplacement : ${travelCost.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD.` : ""}`
        : `${purchaseRef} créé avec ${lines.length} ligne(s) pour ${supplierProfile.name} · ${mode}.`;
    } else if (payload.action === "addPurchase") {
      const quantity = numberValue(payload.quantity, 1);
      const unitCost = moneyValue(payload.unitCost);
      const productId = numberValue(payload.productId) || null;
      const account = treasuryAccount(payload.account);
      const nextPaymentStatus = textValue(payload.paymentStatus, "À payer");
      const procurementStatus = normalizedProcurementStatus(payload.procurementStatus, "Commandé");
      const paidAt = nextPaymentStatus === "Payé" ? paidAtFromInput(payload.paidDate) : null;
      const item = textValue(payload.item);
      let expectedAt = textValue(payload.expectedDate);
      if (quantity < 1 || !item || !["Payé", "À payer"].includes(nextPaymentStatus) || ["Partiellement reçu", "Reçu", "Annulé"].includes(procurementStatus)) {
        return Response.json({ error: "Bon de commande invalide." }, { status: 400 });
      }
      if (expectedAt && !/^\d{4}-\d{2}-\d{2}$/.test(expectedAt)) return Response.json({ error: "Date de livraison prévue invalide." }, { status: 400 });
      if (productId) {
        const [linkedProduct] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), isNull(products.archivedAt))).limit(1);
        if (!linkedProduct) return Response.json({ error: "Le produit lié à cet achat est introuvable." }, { status: 404 });
      }
      const duplicatePurchase = await protectMutation("addPurchase");
      if (duplicatePurchase) return duplicatePurchase;

      const database = await getRawDb();
      const supplierProfile = await resolveSupplierProfile(database, numberValue(payload.supplierId) || null, textValue(payload.supplier));
      const orderedAt = procurementStatus === "Brouillon" ? null : new Date().toISOString();
      if (!expectedAt && procurementStatus !== "Brouillon") {
        const profile = await database.prepare("SELECT lead_time_days AS leadTimeDays FROM suppliers WHERE id = ?").bind(supplierProfile.id).first<{ leadTimeDays: number }>();
        const date = new Date();
        date.setUTCDate(date.getUTCDate() + Math.max(0, Number(profile?.leadTimeDays || 0)));
        expectedAt = date.toISOString().slice(0, 10);
      }
      const purchaseRef = buildPurchaseReference();
      await db.insert(purchases).values({
        supplier: supplierProfile.name,
        supplierId: supplierProfile.id,
        purchaseRef,
        purchaseMode: "Retrait fournisseur",
        procurementStatus,
        orderedAt,
        expectedAt: expectedAt || null,
        item,
        productId,
        quantity,
        unitCost,
        totalCost: quantity * unitCost,
        account,
        paymentStatus: nextPaymentStatus,
        paidAt,
        receivedQuantity: 0,
      });
      auditEntityLabel = `${purchaseRef} · ${supplierProfile.name}`;
    } else if (payload.action === "updatePurchase") {
      const id = numberValue(payload.id);
      const item = textValue(payload.item);
      const productId = numberValue(payload.productId) || null;
      const quantity = numberValue(payload.quantity);
      const unitCost = moneyValue(payload.unitCost);
      const account = treasuryAccount(payload.account);
      const nextPaymentStatus = textValue(payload.paymentStatus, "À payer");
      const requestedProcurementStatus = normalizedProcurementStatus(payload.procurementStatus, "Commandé");
      if (!id || !item || quantity < 1 || !["Payé", "À payer"].includes(nextPaymentStatus)) return Response.json({ error: "Bon de commande invalide." }, { status: 400 });
      const [purchase] = await db.select({
        id: purchases.id,
        supplierId: purchases.supplierId,
        purchaseRef: purchases.purchaseRef,
        productId: purchases.productId,
        quantity: purchases.quantity,
        receivedQuantity: purchases.receivedQuantity,
        paymentStatus: purchases.paymentStatus,
        paidAt: purchases.paidAt,
        orderedAt: purchases.orderedAt,
      }).from(purchases).where(eq(purchases.id, id)).limit(1);
      if (!purchase) return Response.json({ error: "Achat introuvable." }, { status: 404 });
      if (purchase.purchaseRef) {
        const invoice = await (await getRawDb()).prepare("SELECT id FROM supplier_invoices WHERE purchase_ref = ? LIMIT 1").bind(purchase.purchaseRef).first<{ id: number }>();
        if (invoice) return Response.json({ error: "Ce bon possède déjà une facture fournisseur. Modifiez la facture ou ses paiements au lieu de réécrire le bon." }, { status: 409 });
      }
      if (productId) {
        const [linkedProduct] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), isNull(products.archivedAt))).limit(1);
        if (!linkedProduct) return Response.json({ error: "Le produit lié à cet achat est introuvable." }, { status: 404 });
      }
      if (purchase.receivedQuantity > 0 && (purchase.productId !== productId || purchase.quantity !== quantity)) {
        return Response.json({ error: "Cet achat a déjà été réceptionné. Le produit et la quantité doivent rester inchangés pour préserver l’historique du stock." }, { status: 409 });
      }
      const database = await getRawDb();
      const selectedSupplierId = numberValue(payload.supplierId) || purchase.supplierId || null;
      const supplierProfile = await resolveSupplierProfile(
        database,
        selectedSupplierId,
        textValue(payload.supplier),
        Boolean(selectedSupplierId && selectedSupplierId === purchase.supplierId),
      );
      const procurementStatus = purchase.receivedQuantity >= quantity
        ? "Reçu"
        : purchase.receivedQuantity > 0
          ? "Partiellement reçu"
          : requestedProcurementStatus;
      const databaseGroup = await getRawDb();
      const orderReception = purchase.purchaseRef
        ? await databaseGroup.prepare("SELECT COALESCE(SUM(received_quantity), 0) AS totalReceived FROM purchases WHERE purchase_ref = ?").bind(purchase.purchaseRef).first<{ totalReceived: number }>()
        : { totalReceived: purchase.receivedQuantity };
      if (Number(orderReception?.totalReceived || 0) > 0 && procurementStatus === "Annulé") return Response.json({ error: "Un bon déjà partiellement réceptionné ne peut pas être annulé." }, { status: 409 });
      const paidAt = nextPaymentStatus === "Payé"
        ? paidAtFromInput(payload.paidDate, purchase.paymentStatus === "Payé" && purchase.paidAt ? purchase.paidAt : new Date().toISOString())
        : null;
      const expectedAt = textValue(payload.expectedDate);
      if (expectedAt && !/^\d{4}-\d{2}-\d{2}$/.test(expectedAt)) return Response.json({ error: "Date de livraison prévue invalide." }, { status: 400 });
      const orderedAt = procurementStatus === "Brouillon" ? null : purchase.orderedAt || new Date().toISOString();
      await db.update(purchases).set({
        supplier: supplierProfile.name,
        supplierId: supplierProfile.id,
        item,
        productId,
        quantity,
        unitCost,
        totalCost: quantity * unitCost,
        account,
        paymentStatus: nextPaymentStatus,
        paidAt,
        procurementStatus,
        orderedAt,
        expectedAt: expectedAt || null,
      }).where(eq(purchases.id, id));
      if (purchase.purchaseRef) {
        await database.prepare(`
          UPDATE purchases
          SET supplier = ?, supplier_id = ?, account = ?, payment_status = ?, paid_at = ?,
              ordered_at = ?, expected_at = ?,
              procurement_status = CASE
                WHEN received_quantity >= quantity AND quantity > 0 THEN 'Reçu'
                WHEN received_quantity > 0 THEN 'Partiellement reçu'
                ELSE ?
              END
          WHERE purchase_ref = ? AND id <> ?
        `).bind(
          supplierProfile.name,
          supplierProfile.id,
          account,
          nextPaymentStatus,
          paidAt,
          orderedAt,
          expectedAt || null,
          requestedProcurementStatus,
          purchase.purchaseRef,
          id,
        ).run();
      }
      auditEntityLabel = `${purchase.purchaseRef || supplierProfile.name} · ${item}`;
    } else if (payload.action === "receivePurchase") {
      const id = numberValue(payload.id);
      const receiveQuantity = numberValue(payload.receiveQuantity);
      if (!id) return Response.json({ error: "Achat invalide." }, { status: 400 });
      const duplicateReception = await protectMutation("receivePurchase");
      if (duplicateReception) return duplicateReception;

      const result = await receivePurchaseLine(await getRawDb(), id, receiveQuantity || undefined);
      auditEntityId = String(id);
      auditEntityLabel = `${result.supplier} · ${result.item}`;
      integrationMessage = result.stockUpdated
        ? `${result.receivedQuantity} unité(s) de ${result.productName} ajoutée(s) au stock. Réception totale : ${result.totalReceivedQuantity}. Reste : ${result.remainingQuantity}. Coût moyen : ${result.previousAverageCost.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} → ${result.newAverageCost.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD.`
        : `${result.receivedQuantity} unité(s) de ${result.item} marquée(s) reçue(s), sans mouvement de stock. Réception totale : ${result.totalReceivedQuantity}. Reste : ${result.remainingQuantity}.`;
    } else if (payload.action === "deletePurchase") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Achat invalide." }, { status: 400 });
      const [purchase] = await db.select({ id: purchases.id, purchaseRef: purchases.purchaseRef, receivedQuantity: purchases.receivedQuantity }).from(purchases).where(eq(purchases.id, id)).limit(1);
      if (!purchase) return Response.json({ error: "Achat introuvable." }, { status: 404 });
      if (purchase.purchaseRef) {
        const invoice = await (await getRawDb()).prepare("SELECT id FROM supplier_invoices WHERE purchase_ref = ? LIMIT 1").bind(purchase.purchaseRef).first<{ id: number }>();
        if (invoice) return Response.json({ error: "Ce bon possède une facture fournisseur et doit rester dans l’historique." }, { status: 409 });
      }
      if (purchase.receivedQuantity > 0) return Response.json({ error: "Cet achat a déjà alimenté le stock et doit rester dans l’historique." }, { status: 409 });
      await db.delete(purchases).where(eq(purchases.id, id));
    } else if (payload.action === "addSupplierInvoice") {
      const purchaseRef = textValue(payload.purchaseRef).slice(0, 100);
      const invoiceNumber = textValue(payload.invoiceNumber).slice(0, 120);
      const invoiceDate = textValue(payload.invoiceDate);
      const dueDate = textValue(payload.dueDate);
      const note = textValue(payload.note).slice(0, 500);
      if (!purchaseRef || !invoiceNumber || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < invoiceDate) {
        return Response.json({ error: "Facture fournisseur invalide. Vérifiez le bon, le numéro et les dates." }, { status: 400 });
      }
      const database = await getRawDb();
      const purchaseOrder = await database.prepare(`
        SELECT
          MIN(supplier_id) AS supplierId,
          MAX(supplier_id) AS maxSupplierId,
          COUNT(*) AS lineCount,
          SUM(total_cost) AS totalAmount,
          SUM(CASE WHEN procurement_status IN ('Brouillon', 'Annulé') THEN 1 ELSE 0 END) AS blockedLines,
          SUM(CASE WHEN payment_status = 'Payé' THEN 1 ELSE 0 END) AS paidLines,
          MIN(account) AS paymentAccount,
          MAX(account) AS maxPaymentAccount,
          MAX(paid_at) AS paidAt
        FROM purchases
        WHERE purchase_ref = ?
      `).bind(purchaseRef).first<{ supplierId: number | null; maxSupplierId: number | null; lineCount: number; totalAmount: number; blockedLines: number; paidLines: number; paymentAccount: string | null; maxPaymentAccount: string | null; paidAt: string | null }>();
      if (!purchaseOrder?.lineCount || !purchaseOrder.supplierId || purchaseOrder.supplierId !== purchaseOrder.maxSupplierId) {
        return Response.json({ error: "Bon de commande introuvable ou fournisseur incohérent." }, { status: 404 });
      }
      if (Number(purchaseOrder.blockedLines || 0) > 0) {
        return Response.json({ error: "Un bon en brouillon ou annulé ne peut pas être facturé." }, { status: 409 });
      }
      const existingInvoice = await database.prepare("SELECT id FROM supplier_invoices WHERE purchase_ref = ? LIMIT 1").bind(purchaseRef).first<{ id: number }>();
      if (existingInvoice) return Response.json({ error: "Ce bon possède déjà une facture fournisseur." }, { status: 409 });
      const duplicateNumber = await database.prepare("SELECT id FROM supplier_invoices WHERE supplier_id = ? AND lower(invoice_number) = lower(?) LIMIT 1").bind(purchaseOrder.supplierId, invoiceNumber).first<{ id: number }>();
      if (duplicateNumber) return Response.json({ error: "Ce numéro de facture existe déjà pour ce fournisseur." }, { status: 409 });

      const duplicateInvoice = await protectMutation("addSupplierInvoice");
      if (duplicateInvoice) return duplicateInvoice;
      const inserted = await database.prepare(`
        INSERT INTO supplier_invoices (supplier_id, purchase_ref, invoice_number, invoice_date, due_date, total_amount, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(purchaseOrder.supplierId, purchaseRef, invoiceNumber, invoiceDate, dueDate, Number(purchaseOrder.totalAmount || 0), note).run();
      const invoiceId = Number(inserted.meta?.last_row_id || 0);
      const lineCount = Number(purchaseOrder.lineCount || 0);
      const paidLines = Number(purchaseOrder.paidLines || 0);
      if (paidLines > 0 && paidLines < lineCount) {
        await database.prepare("DELETE FROM supplier_invoices WHERE id = ?").bind(invoiceId).run();
        return Response.json({ error: "Les lignes de ce bon ont des statuts de paiement incohérents. Uniformisez le paiement avant de créer la facture." }, { status: 409 });
      }
      if (paidLines === lineCount && lineCount > 0) {
        const paymentAccount = purchaseOrder.paymentAccount && purchaseOrder.paymentAccount === purchaseOrder.maxPaymentAccount
          ? treasuryAccount(purchaseOrder.paymentAccount)
          : "Banque";
        await database.prepare(`
          INSERT INTO supplier_payments (invoice_id, amount, account, paid_at, reference, note)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          invoiceId,
          Number(purchaseOrder.totalAmount || 0),
          paymentAccount,
          purchaseOrder.paidAt || new Date().toISOString(),
          "Paiement déjà enregistré au bon",
          "Repris automatiquement depuis l’achat fournisseur payé avant création de la facture.",
        ).run();
        await syncPurchaseOrderPaymentState(database, invoiceId);
      } else {
        await database.prepare("UPDATE purchases SET payment_status = 'À payer', paid_at = NULL WHERE purchase_ref = ?").bind(purchaseRef).run();
      }
      auditEntityId = invoiceId ? String(invoiceId) : null;
      auditEntityLabel = `${invoiceNumber} · ${purchaseRef}`;
      integrationMessage = paidLines === lineCount && lineCount > 0
        ? `Facture ${invoiceNumber} créée pour ${purchaseRef} et marquée payée à partir du règlement déjà enregistré au bon.`
        : `Facture ${invoiceNumber} créée pour ${purchaseRef}. Échéance : ${dueDate}. Montant : ${Number(purchaseOrder.totalAmount || 0).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD.`;
    } else if (payload.action === "updateSupplierInvoice") {
      const id = numberValue(payload.id);
      const invoiceNumber = textValue(payload.invoiceNumber).slice(0, 120);
      const invoiceDate = textValue(payload.invoiceDate);
      const dueDate = textValue(payload.dueDate);
      const note = textValue(payload.note).slice(0, 500);
      if (!id || !invoiceNumber || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < invoiceDate) {
        return Response.json({ error: "Facture fournisseur invalide." }, { status: 400 });
      }
      const database = await getRawDb();
      const invoice = await database.prepare("SELECT supplier_id AS supplierId, purchase_ref AS purchaseRef FROM supplier_invoices WHERE id = ? LIMIT 1").bind(id).first<{ supplierId: number; purchaseRef: string }>();
      if (!invoice) return Response.json({ error: "Facture fournisseur introuvable." }, { status: 404 });
      const duplicateNumber = await database.prepare("SELECT id FROM supplier_invoices WHERE supplier_id = ? AND lower(invoice_number) = lower(?) AND id <> ? LIMIT 1").bind(invoice.supplierId, invoiceNumber, id).first<{ id: number }>();
      if (duplicateNumber) return Response.json({ error: "Ce numéro de facture existe déjà pour ce fournisseur." }, { status: 409 });
      await database.prepare(`
        UPDATE supplier_invoices
        SET invoice_number = ?, invoice_date = ?, due_date = ?, note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(invoiceNumber, invoiceDate, dueDate, note, id).run();
      auditEntityLabel = `${invoiceNumber} · ${invoice.purchaseRef}`;
    } else if (payload.action === "addSupplierPayment") {
      const invoiceId = numberValue(payload.invoiceId);
      const amount = moneyValue(payload.amount);
      const account = treasuryAccount(payload.account);
      const paidDate = textValue(payload.paidDate);
      const reference = textValue(payload.reference).slice(0, 160);
      const note = textValue(payload.note).slice(0, 500);
      if (!invoiceId || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
        return Response.json({ error: "Paiement fournisseur invalide." }, { status: 400 });
      }
      const database = await getRawDb();
      const invoice = await database.prepare(`
        SELECT
          id,
          invoice_number AS invoiceNumber,
          total_amount AS totalAmount,
          COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE invoice_id = supplier_invoices.id), 0) AS paidAmount
        FROM supplier_invoices
        WHERE id = ?
        LIMIT 1
      `).bind(invoiceId).first<{ id: number; invoiceNumber: string; totalAmount: number; paidAmount: number }>();
      if (!invoice) return Response.json({ error: "Facture fournisseur introuvable." }, { status: 404 });
      const remaining = Math.round((Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0)) + Number.EPSILON) * 100) / 100;
      if (amount > remaining + 0.005) return Response.json({ error: `Le reste à payer est de ${remaining.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD.` }, { status: 409 });
      const duplicatePayment = await protectMutation("addSupplierPayment");
      if (duplicatePayment) return duplicatePayment;
      const paidAt = paidAtFromInput(paidDate);
      const inserted = await database.prepare(`
        INSERT INTO supplier_payments (invoice_id, amount, account, paid_at, reference, note)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(invoiceId, amount, account, paidAt, reference, note).run();
      const state = await syncPurchaseOrderPaymentState(database, invoiceId);
      auditEntityId = String(inserted.meta?.last_row_id || invoiceId);
      auditEntityLabel = `${invoice.invoiceNumber} · ${amount} MAD`;
      integrationMessage = `Paiement de ${amount.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD enregistré sur ${invoice.invoiceNumber}. Reste : ${state.remainingAmount.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD.`;
    } else if (payload.action === "deleteSupplierPayment") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Paiement fournisseur invalide." }, { status: 400 });
      const database = await getRawDb();
      const payment = await database.prepare("SELECT invoice_id AS invoiceId, amount, reference FROM supplier_payments WHERE id = ? LIMIT 1").bind(id).first<{ invoiceId: number; amount: number; reference: string }>();
      if (!payment) return Response.json({ error: "Paiement fournisseur introuvable." }, { status: 404 });
      await database.prepare("DELETE FROM supplier_payments WHERE id = ?").bind(id).run();
      const state = await syncPurchaseOrderPaymentState(database, payment.invoiceId);
      auditEntityLabel = `${payment.amount} MAD · ${payment.reference || "sans référence"}`;
      integrationMessage = `Paiement fournisseur supprimé. Nouveau reste à payer : ${state.remainingAmount.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD.`;
    } else if (payload.action === "deleteSupplierInvoice") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Facture fournisseur invalide." }, { status: 400 });
      const database = await getRawDb();
      const invoice = await database.prepare(`
        SELECT id, invoice_number AS invoiceNumber, purchase_ref AS purchaseRef,
          (SELECT COUNT(*) FROM supplier_payments WHERE invoice_id = supplier_invoices.id) AS paymentCount
        FROM supplier_invoices
        WHERE id = ?
        LIMIT 1
      `).bind(id).first<{ id: number; invoiceNumber: string; purchaseRef: string; paymentCount: number }>();
      if (!invoice) return Response.json({ error: "Facture fournisseur introuvable." }, { status: 404 });
      if (Number(invoice.paymentCount || 0) > 0) return Response.json({ error: "Supprimez d’abord les paiements enregistrés sur cette facture." }, { status: 409 });
      await database.prepare("DELETE FROM supplier_invoices WHERE id = ?").bind(id).run();
      await database.prepare("UPDATE purchases SET payment_status = 'À payer', paid_at = NULL WHERE purchase_ref = ?").bind(invoice.purchaseRef).run();
      auditEntityLabel = `${invoice.invoiceNumber} · ${invoice.purchaseRef}`;
    } else if (payload.action === "addExpense") {
      const category = textValue(payload.category).slice(0, 80);
      const label = textValue(payload.label).slice(0, 160);
      const amount = moneyValue(payload.amount);
      const account = treasuryAccount(payload.account);
      const nextPaymentStatus = textValue(payload.paymentStatus, "Payé");
      const paidAt = nextPaymentStatus === "Payé" ? paidAtFromInput(payload.paidDate) : null;
      const expenseDate = textValue(payload.expenseDate, new Date().toISOString().slice(0, 10));
      const note = textValue(payload.note).slice(0, 300);
      if (!category || !label || amount <= 0 || !["Payé", "À payer"].includes(nextPaymentStatus) || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
        return Response.json({ error: "Dépense invalide." }, { status: 400 });
      }
      const duplicateExpense = await protectMutation("addExpense");
      if (duplicateExpense) return duplicateExpense;
      await db.insert(expenses).values({ category, label, amount, account, paymentStatus: nextPaymentStatus, paidAt, expenseDate, note });
      auditEntityLabel = `${category} · ${label}`;
    } else if (payload.action === "updateExpense") {
      const id = numberValue(payload.id);
      const category = textValue(payload.category).slice(0, 80);
      const label = textValue(payload.label).slice(0, 160);
      const amount = moneyValue(payload.amount);
      const account = treasuryAccount(payload.account);
      const nextPaymentStatus = textValue(payload.paymentStatus, "Payé");
      const expenseDate = textValue(payload.expenseDate);
      const note = textValue(payload.note).slice(0, 300);
      if (!id || !category || !label || amount <= 0 || !["Payé", "À payer"].includes(nextPaymentStatus) || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
        return Response.json({ error: "Dépense invalide." }, { status: 400 });
      }
      const [expense] = await db.select({ id: expenses.id, paymentStatus: expenses.paymentStatus, paidAt: expenses.paidAt }).from(expenses).where(eq(expenses.id, id)).limit(1);
      if (!expense) return Response.json({ error: "Dépense introuvable." }, { status: 404 });
      const paidAt = nextPaymentStatus === "Payé"
        ? paidAtFromInput(payload.paidDate, expense.paymentStatus === "Payé" && expense.paidAt ? expense.paidAt : new Date().toISOString())
        : null;
      await db.update(expenses).set({ category, label, amount, account, paymentStatus: nextPaymentStatus, paidAt, expenseDate, note }).where(eq(expenses.id, id));
      auditEntityLabel = `${category} · ${label}`;
    } else if (payload.action === "deleteExpense") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Dépense invalide." }, { status: 400 });
      const [expense] = await db.select({ id: expenses.id, category: expenses.category, label: expenses.label }).from(expenses).where(eq(expenses.id, id)).limit(1);
      if (!expense) return Response.json({ error: "Dépense introuvable." }, { status: 404 });
      await db.delete(expenses).where(eq(expenses.id, id));
      auditEntityLabel = `${expense.category} · ${expense.label}`;
    } else if (payload.action === "addAd") {
      const duplicateAd = await protectMutation("addAd");
      if (duplicateAd) return duplicateAd;
      await db.insert(adPerformance).values({ platform: "Meta Ads", campaign: textValue(payload.campaign, "Campagne Meta"), spend: moneyValue(payload.spend), revenue: moneyValue(payload.revenue), orderCount: numberValue(payload.orderCount), source: "Saisie manuelle", performanceDate: textValue(payload.performanceDate, new Date().toISOString().slice(0, 10)) });
    } else if (payload.action === "updateAd") {
      const id = numberValue(payload.id);
      const campaign = textValue(payload.campaign);
      const performanceDate = textValue(payload.performanceDate);
      if (!id || !campaign || !/^\d{4}-\d{2}-\d{2}$/.test(performanceDate)) return Response.json({ error: "Publicité invalide." }, { status: 400 });
      const [ad] = await db.select({ id: adPerformance.id }).from(adPerformance).where(eq(adPerformance.id, id)).limit(1);
      if (!ad) return Response.json({ error: "Publicité introuvable." }, { status: 404 });
      await db.update(adPerformance).set({ campaign, spend: moneyValue(payload.spend), revenue: moneyValue(payload.revenue), orderCount: numberValue(payload.orderCount), performanceDate }).where(eq(adPerformance.id, id));
    } else if (payload.action === "deleteAd") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Publicité invalide." }, { status: 400 });
      const [ad] = await db.select({ id: adPerformance.id }).from(adPerformance).where(eq(adPerformance.id, id)).limit(1);
      if (!ad) return Response.json({ error: "Publicité introuvable." }, { status: 404 });
      await db.delete(adPerformance).where(eq(adPerformance.id, id));
    } else if (payload.action === "addCapital") {
      const direction = textValue(payload.direction, "Entrée");
      const category = textValue(payload.category, "Ajustement").slice(0, 80);
      const label = textValue(payload.label, "Mouvement de capital").slice(0, 160);
      const account = treasuryAccount(payload.account);
      const amount = moneyValue(payload.amount);
      const entryDate = textValue(payload.entryDate, new Date().toISOString().slice(0, 10));
      if (!["Entrée", "Sortie"].includes(direction) || !category || !label || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
        return Response.json({ error: "Mouvement de capital invalide." }, { status: 400 });
      }
      const duplicateCapital = await protectMutation("addCapital");
      if (duplicateCapital) return duplicateCapital;
      await db.insert(capitalLedger).values({ direction, category, label, amount, account, entryDate });
    } else if (payload.action === "updateCapital") {
      const id = numberValue(payload.id);
      const direction = textValue(payload.direction);
      const category = textValue(payload.category);
      const label = textValue(payload.label);
      const account = treasuryAccount(payload.account);
      const amount = moneyValue(payload.amount);
      const entryDate = textValue(payload.entryDate);
      if (!id || !["Entrée", "Sortie"].includes(direction) || !category || !label || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return Response.json({ error: "Mouvement de capital invalide." }, { status: 400 });
      const [entry] = await db.select({ id: capitalLedger.id, isAutomatic: capitalLedger.isAutomatic }).from(capitalLedger).where(eq(capitalLedger.id, id)).limit(1);
      if (!entry) return Response.json({ error: "Mouvement de capital introuvable." }, { status: 404 });
      if (entry.isAutomatic) return Response.json({ error: "Une affectation automatique liée à une commande ne peut pas être modifiée manuellement." }, { status: 409 });
      await db.update(capitalLedger).set({ direction, category, label, amount, account, entryDate }).where(eq(capitalLedger.id, id));
    } else if (payload.action === "deleteCapital") {
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Mouvement de capital invalide." }, { status: 400 });
      const [entry] = await db.select({ id: capitalLedger.id, isAutomatic: capitalLedger.isAutomatic }).from(capitalLedger).where(eq(capitalLedger.id, id)).limit(1);
      if (!entry) return Response.json({ error: "Mouvement de capital introuvable." }, { status: 404 });
      if (entry.isAutomatic) return Response.json({ error: "Une affectation automatique liée à une commande ne peut pas être supprimée manuellement." }, { status: 409 });
      await db.delete(capitalLedger).where(eq(capitalLedger.id, id));
    } else if (payload.action === "importProducts") {
      const openInventory = await openInventorySession();
      if (openInventory) return Response.json({ error: inventoryCatalogLockMessage(openInventory.sessionRef) }, { status: 409 });
      let parsedRows: unknown;
      try {
        parsedRows = JSON.parse(textValue(payload.rows, "[]"));
      } catch {
        return Response.json({ error: "Le fichier de produits est invalide." }, { status: 400 });
      }
      if (!Array.isArray(parsedRows) || !parsedRows.length || parsedRows.length > 300) {
        return Response.json({ error: "Importez entre 1 et 300 produits à la fois." }, { status: 400 });
      }
      const normalizedRows = parsedRows.map((raw, index) => {
        const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        const productCode = textValue(row.productCode).toUpperCase().slice(0, 80);
        const name = textValue(row.name).slice(0, 160);
        const purchasePrice = moneyValue(row.purchasePrice);
        const salePrice = moneyValue(row.salePrice);
        const minimumSalePrice = moneyValue(row.minimumSalePrice, salePrice);
        const stockQuantity = numberValue(row.stockRemaining ?? row.initialQuantity);
        const importedAlertThreshold = row.stockAlertThreshold === undefined || row.stockAlertThreshold === null || textValue(row.stockAlertThreshold) === ""
          ? null
          : stockAlertThreshold(row.stockAlertThreshold);
        const importedCoverDays = row.reorderCoverDays === undefined || row.reorderCoverDays === null || textValue(row.reorderCoverDays) === ""
          ? null
          : reorderCoverDays(row.reorderCoverDays);
        if (!productCode || !name) throw new Error(`Ligne ${index + 2} : ID produit et nom obligatoires.`);
        if (!purchasePrice && !salePrice) throw new Error(`Ligne ${index + 2} : prix d’achat ou prix de vente manquant.`);
        return { productCode, name, category: productCategory(row.category), purchasePrice, salePrice, minimumSalePrice, stockQuantity, stockAlertThreshold: importedAlertThreshold, reorderCoverDays: importedCoverDays };
      });
      const uploadCodes = new Set<string>();
      for (let index = 0; index < normalizedRows.length; index += 1) {
        const code = normalizedRows[index].productCode;
        if (uploadCodes.has(code)) throw new Error(`Ligne ${index + 2} : l’ID produit ${code} apparaît plusieurs fois dans le fichier.`);
        uploadCodes.add(code);
      }
      const catalog = await db.select().from(products);
      const existingByCode = new Map(catalog.map((product) => [product.productCode.toLocaleUpperCase("fr"), product]));
      const updateExisting = textValue(payload.conflictMode) === "update";
      const archivedConflict = normalizedRows.find((row) => existingByCode.get(row.productCode)?.archivedAt);
      if (archivedConflict && updateExisting) {
        return Response.json({ error: `Le produit ${archivedConflict.productCode} est archivé. Restaurez-le avant de le mettre à jour par import.` }, { status: 409 });
      }
      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const row of normalizedRows) {
        const existing = existingByCode.get(row.productCode);
        if (existing && !updateExisting) skippedCount += 1;
        else if (existing) updatedCount += 1;
        else createdCount += 1;
      }

      const duplicateImport = await protectMutation("importProducts");
      if (duplicateImport) return duplicateImport;

      const rawDatabase = await getRawDb();
      const statements = [] as ReturnType<typeof rawDatabase.prepare>[];

      for (const row of normalizedRows) {
        const existing = existingByCode.get(row.productCode);
        if (existing && !updateExisting) continue;

        if (existing) {
          const stockDifference = row.stockQuantity - existing.stockQuantity;
          statements.push(
            rawDatabase.prepare(`
              UPDATE products
              SET name = ?, category = ?, purchase_price = ?, sale_price = ?, minimum_sale_price = ?, stock_quantity = ?, stock_alert_threshold = ?, reorder_cover_days = ?
              WHERE id = ?
            `).bind(
              row.name,
              row.category,
              row.purchasePrice,
              row.salePrice,
              row.minimumSalePrice,
              row.stockQuantity,
              row.stockAlertThreshold ?? existing.stockAlertThreshold,
              row.reorderCoverDays ?? existing.reorderCoverDays,
              existing.id,
            ),
          );
          if (stockDifference) {
            statements.push(
              rawDatabase.prepare(`
                INSERT INTO stock_movements (product_id, movement_type, quantity, note)
                VALUES (?, ?, ?, ?)
              `).bind(
                existing.id,
                stockDifference > 0 ? "Entrée" : "Vente",
                Math.abs(stockDifference),
                "Ajustement depuis import Google Sheets",
              ),
            );
          }
          continue;
        }

        statements.push(
          rawDatabase.prepare(`
            INSERT INTO products (product_code, name, category, purchase_price, sale_price, minimum_sale_price, stock_quantity, stock_alert_threshold, reorder_cover_days)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            row.productCode,
            row.name,
            row.category,
            row.purchasePrice,
            row.salePrice,
            row.minimumSalePrice,
            row.stockQuantity,
            row.stockAlertThreshold ?? 5,
            row.reorderCoverDays ?? 30,
          ),
        );
        if (row.stockQuantity > 0) {
          statements.push(
            rawDatabase.prepare(`
              INSERT INTO stock_movements (product_id, movement_type, quantity, note)
              SELECT id, 'Entrée', ?, 'Stock importé depuis Google Sheets'
              FROM products
              WHERE product_code = ?
            `).bind(row.stockQuantity, row.productCode),
          );
        }
      }

      if (statements.length) await rawDatabase.batch(statements);
      integrationMessage = `${createdCount} produit(s) créé(s)${updatedCount ? ` · ${updatedCount} mis à jour` : ""}${skippedCount ? ` · ${skippedCount} déjà présent(s), ignoré(s)` : ""}. Import appliqué en une seule opération.`;
      auditEntityLabel = `${createdCount} créé(s), ${updatedCount} mis à jour, ${skippedCount} ignoré(s)`;
    } else if (payload.action === "addProduct") {
      const openInventory = await openInventorySession();
      if (openInventory) return Response.json({ error: inventoryCatalogLockMessage(openInventory.sessionRef) }, { status: 409 });
      const productCode = textValue(payload.productCode).toUpperCase();
      const name = textValue(payload.name);
      if (!productCode || !name) return Response.json({ error: "L’ID produit et le nom sont obligatoires." }, { status: 400 });
      const [duplicate] = await db.select({ id: products.id }).from(products).where(eq(products.productCode, productCode)).limit(1);
      if (duplicate) return Response.json({ error: "Cet ID produit existe déjà." }, { status: 409 });
      const initialQuantity = numberValue(payload.initialQuantity);
      const salePrice = moneyValue(payload.salePrice);
      const purchasePrice = moneyValue(payload.purchasePrice);
      const minimumSalePrice = moneyValue(payload.minimumSalePrice, salePrice);
      const category = productCategory(payload.category);
      const alertThreshold = stockAlertThreshold(payload.stockAlertThreshold, 5);
      const coverDays = reorderCoverDays(payload.reorderCoverDays, 30);
      const duplicateProductCreation = await protectMutation("addProduct");
      if (duplicateProductCreation) return duplicateProductCreation;
      const rawDatabase = await getRawDb();
      const productStatements = [
        rawDatabase.prepare(`
          INSERT INTO products (product_code, name, category, purchase_price, sale_price, minimum_sale_price, stock_quantity, stock_alert_threshold, reorder_cover_days)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(productCode, name, category, purchasePrice, salePrice, minimumSalePrice, initialQuantity, alertThreshold, coverDays),
      ];
      if (initialQuantity > 0) {
        productStatements.push(
          rawDatabase.prepare(`
            INSERT INTO stock_movements (product_id, movement_type, quantity, note)
            SELECT id, 'Entrée', ?, 'Stock initial' FROM products WHERE product_code = ?
          `).bind(initialQuantity, productCode),
        );
      }
      await rawDatabase.batch(productStatements);
    } else if (payload.action === "updateProduct") {
      const openInventory = await openInventorySession();
      if (openInventory) return Response.json({ error: inventoryCatalogLockMessage(openInventory.sessionRef) }, { status: 409 });
      const id = numberValue(payload.id);
      const productCode = textValue(payload.productCode).toUpperCase();
      const name = textValue(payload.name);
      if (!id || !productCode || !name) return Response.json({ error: "Produit invalide." }, { status: 400 });
      const [product] = await db.select({ id: products.id, stockAlertThreshold: products.stockAlertThreshold, reorderCoverDays: products.reorderCoverDays }).from(products).where(eq(products.id, id)).limit(1);
      if (!product) return Response.json({ error: "Produit introuvable." }, { status: 404 });
      const [duplicate] = await db.select({ id: products.id }).from(products).where(eq(products.productCode, productCode)).limit(1);
      if (duplicate && duplicate.id !== id) return Response.json({ error: "Cet ID produit existe déjà." }, { status: 409 });
      const salePrice = moneyValue(payload.salePrice);
      const alertThreshold = stockAlertThreshold(payload.stockAlertThreshold, product.stockAlertThreshold);
      const coverDays = reorderCoverDays(payload.reorderCoverDays, product.reorderCoverDays);
      await db.update(products).set({
        productCode,
        name,
        category: productCategory(payload.category),
        purchasePrice: moneyValue(payload.purchasePrice),
        salePrice,
        minimumSalePrice: moneyValue(payload.minimumSalePrice, salePrice),
        stockAlertThreshold: alertThreshold,
        reorderCoverDays: coverDays,
      }).where(eq(products.id, id));
    } else if (payload.action === "archiveProduct" || payload.action === "deleteProduct") {
      const openInventory = await openInventorySession();
      if (openInventory) return Response.json({ error: inventoryCatalogLockMessage(openInventory.sessionRef) }, { status: 409 });
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Produit invalide." }, { status: 400 });
      const [product] = await db.select({
        id: products.id,
        productCode: products.productCode,
        name: products.name,
        stockQuantity: products.stockQuantity,
        archivedAt: products.archivedAt,
      }).from(products).where(eq(products.id, id)).limit(1);
      if (!product) return Response.json({ error: "Produit introuvable." }, { status: 404 });
      if (product.archivedAt) {
        integrationMessage = `${product.name} est déjà archivé. Aucun historique n’a été supprimé.`;
        auditEntityLabel = `${product.productCode} · ${product.name}`;
      } else {
        if (product.stockQuantity !== 0) return Response.json({ error: `Ramenez d’abord le stock de ${product.name} à 0 avant de l’archiver (${product.stockQuantity} unité(s) restante(s)).` }, { status: 409 });
        const rawDatabase = await getRawDb();
        const pendingPurchase = await rawDatabase.prepare("SELECT id FROM purchases WHERE product_id = ? AND received_quantity < quantity LIMIT 1").bind(id).first<{ id: number }>();
        if (pendingPurchase) return Response.json({ error: "Ce produit a encore une réception fournisseur en attente. Réceptionnez ou modifiez d’abord cet achat." }, { status: 409 });
        const duplicateArchive = await protectMutation("archiveProduct");
        if (duplicateArchive) return duplicateArchive;
        await ensureStorefrontCms(rawDatabase);
        const now = new Date().toISOString();
        const results = await rawDatabase.batch([
          rawDatabase.prepare(`
            UPDATE products
            SET archived_at = ?, archived_by_user_id = ?
            WHERE id = ? AND archived_at IS NULL AND stock_quantity = 0
              AND NOT EXISTS (SELECT 1 FROM purchases WHERE product_id = ? AND received_quantity < quantity)
          `).bind(now, user.id, id, id),
          rawDatabase.prepare("UPDATE storefront_product_settings SET is_visible = 0, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?").bind(id),
          rawDatabase.prepare(`UPDATE storefront_offers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id IN (SELECT offer_id FROM storefront_offer_items WHERE product_id = ?)`).bind(id),
        ]);
        if (Number(results[0]?.meta?.changes || 0) !== 1) return Response.json({ error: "Le produit a changé pendant l’archivage. Rechargez les données puis réessayez." }, { status: 409 });
        integrationMessage = `${product.name} archivé. Stock, commandes, achats, inventaires et mouvements sont conservés. Sa publication et les packs concernés ont été désactivés.`;
        auditEntityLabel = `${product.productCode} · ${product.name}`;
      }
    } else if (payload.action === "restoreProduct") {
      const openInventory = await openInventorySession();
      if (openInventory) return Response.json({ error: inventoryCatalogLockMessage(openInventory.sessionRef) }, { status: 409 });
      const id = numberValue(payload.id);
      if (!id) return Response.json({ error: "Produit invalide." }, { status: 400 });
      const [product] = await db.select({ id: products.id, productCode: products.productCode, name: products.name, archivedAt: products.archivedAt }).from(products).where(eq(products.id, id)).limit(1);
      if (!product) return Response.json({ error: "Produit introuvable." }, { status: 404 });
      if (!product.archivedAt) {
        integrationMessage = `${product.name} est déjà actif.`;
        auditEntityLabel = `${product.productCode} · ${product.name}`;
      } else {
        const duplicateRestore = await protectMutation("restoreProduct");
        if (duplicateRestore) return duplicateRestore;
        await db.update(products).set({ archivedAt: null, archivedByUserId: null }).where(eq(products.id, id));
        integrationMessage = `${product.name} restauré dans le catalogue interne. La boutique et les packs restent désactivés jusqu’à une réactivation volontaire.`;
        auditEntityLabel = `${product.productCode} · ${product.name}`;
      }
    } else if (payload.action === "addStockMovement") {
      const productId = numberValue(payload.productId);
      const quantity = numberValue(payload.quantity);
      const movementType = textValue(payload.movementType);
      if (!productId || quantity < 1 || !["Entrée", "Vente"].includes(movementType)) return Response.json({ error: "Mouvement de stock invalide." }, { status: 400 });
      const [product] = await db.select().from(products).where(and(eq(products.id, productId), isNull(products.archivedAt))).limit(1);
      if (!product) return Response.json({ error: "Produit introuvable." }, { status: 404 });
      if (movementType === "Vente" && quantity > product.stockQuantity) return Response.json({ error: `Stock insuffisant : ${product.stockQuantity} unité(s) restante(s).` }, { status: 400 });
      const duplicateMovement = await protectMutation("addStockMovement");
      if (duplicateMovement) return duplicateMovement;
      const delta = movementType === "Entrée" ? quantity : -quantity;
      await db.batch([
        db.insert(stockMovements).values({ productId, movementType, quantity, note: textValue(payload.note) }),
        db.update(products).set({ stockQuantity: sql`${products.stockQuantity} + ${delta}` }).where(eq(products.id, productId)),
      ]);
    } else if (payload.action === "startInventorySession") {
      const duplicateSession = await protectMutation("startInventorySession");
      if (duplicateSession) return duplicateSession;
      const database = await getRawDb();
      const existing = await database.prepare("SELECT id, session_ref AS sessionRef FROM inventory_sessions WHERE status = 'En cours' ORDER BY id DESC LIMIT 1").first<{ id: number; sessionRef: string }>();
      if (existing) return Response.json({ error: `Une session d’inventaire est déjà en cours : ${existing.sessionRef}.` }, { status: 409 });
      const totals = await database.prepare(`
        SELECT
          COUNT(*) AS productCount,
          COALESCE(SUM(stock_quantity), 0) AS totalUnits,
          COALESCE(SUM(stock_quantity * purchase_price), 0) AS stockValue
        FROM products
        WHERE archived_at IS NULL
      `).first<{ productCount: number; totalUnits: number; stockValue: number }>();
      const sessionRef = `INV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
      const inserted = await database.prepare(`
        INSERT INTO inventory_sessions (
          session_ref, status, note, expected_product_count, counted_product_count,
          total_system_units, total_physical_units, total_adjustment_units,
          value_before, value_after, loss_value,
          started_by_user_id, started_by_name
        ) VALUES (?, 'En cours', ?, ?, 0, ?, 0, 0, ?, 0, 0, ?, ?)
      `).bind(
        sessionRef,
        textValue(payload.note).slice(0, 500),
        Number(totals?.productCount || 0),
        Number(totals?.totalUnits || 0),
        Number(totals?.stockValue || 0),
        user.id,
        user.displayName,
      ).run();
      auditEntityId = String(inserted.meta?.last_row_id || sessionRef);
      auditEntityLabel = sessionRef;
      integrationMessage = `Session ${sessionRef} démarrée · ${Number(totals?.productCount || 0)} produit(s) à compter · valeur théorique ${Number(totals?.stockValue || 0).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD.`;
    } else if (payload.action === "countInventorySessionProduct") {
      const sessionId = numberValue(payload.sessionId);
      const productId = numberValue(payload.productId);
      const physicalRaw = Number(payload.physicalQuantity);
      const expectedRaw = Number(payload.expectedSystemQuantity);
      const note = textValue(payload.note).slice(0, 240);
      if (!sessionId || !productId) return Response.json({ error: "Session ou produit d’inventaire invalide." }, { status: 400 });
      if (!Number.isInteger(physicalRaw) || physicalRaw < 0 || physicalRaw > 1_000_000) {
        return Response.json({ error: "La quantité physique doit être un nombre entier positif ou nul." }, { status: 400 });
      }
      if (!Number.isInteger(expectedRaw) || expectedRaw < 0 || expectedRaw > 1_000_000) {
        return Response.json({ error: "Le stock de référence est invalide. Rechargez la session." }, { status: 400 });
      }
      const duplicateCount = await protectMutation("countInventorySessionProduct");
      if (duplicateCount) return duplicateCount;
      const database = await getRawDb();
      const session = await database.prepare("SELECT session_ref AS sessionRef, status FROM inventory_sessions WHERE id = ? LIMIT 1").bind(sessionId).first<{ sessionRef: string; status: string }>();
      if (!session) return Response.json({ error: "Session d’inventaire introuvable." }, { status: 404 });
      if (session.status !== "En cours") return Response.json({ error: "Cette session d’inventaire est déjà clôturée." }, { status: 409 });
      const alreadyCounted = await database.prepare("SELECT id FROM inventory_counts WHERE session_id = ? AND product_id = ? LIMIT 1").bind(sessionId, productId).first<{ id: number }>();
      if (alreadyCounted) return Response.json({ error: "Ce produit a déjà été compté dans cette session." }, { status: 409 });
      const product = await database.prepare(`
        SELECT id, product_code AS productCode, name, stock_quantity AS stockQuantity, purchase_price AS purchasePrice
        FROM products
        WHERE id = ? AND archived_at IS NULL
        LIMIT 1
      `).bind(productId).first<{ id: number; productCode: string; name: string; stockQuantity: number; purchasePrice: number }>();
      if (!product) return Response.json({ error: "Produit introuvable." }, { status: 404 });
      if (Number(product.stockQuantity) !== expectedRaw) {
        return Response.json({ error: `Le stock a changé pendant le comptage (${expectedRaw} → ${product.stockQuantity}). Rechargez la session puis recomptez ce produit.` }, { status: 409 });
      }
      const difference = physicalRaw - expectedRaw;
      let reason: string;
      try {
        reason = inventoryDifferenceReason(payload.reason, difference);
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Motif d’écart invalide." }, { status: 400 });
      }
      const unitCost = Number(product.purchasePrice || 0);
      const valueBefore = expectedRaw * unitCost;
      const valueAfter = physicalRaw * unitCost;
      const lossValue = difference < 0 ? Math.abs(difference) * unitCost : 0;
      const countRef = `${session.sessionRef}-${product.productCode}-${crypto.randomUUID().slice(0, 3).toUpperCase()}`;
      const statements = [
        database.prepare(`
          INSERT INTO inventory_counts (
            count_ref, session_id, product_id, system_quantity, physical_quantity, difference,
            reason, unit_cost, value_before, value_after, loss_value,
            note, counted_by_user_id, counted_by_name
          )
          SELECT ?, ?, id, stock_quantity, ?, ?, ?, purchase_price, stock_quantity * purchase_price, ? * purchase_price, ?, ?, ?, ?
          FROM products
          WHERE id = ? AND stock_quantity = ?
        `).bind(
          countRef, sessionId, physicalRaw, difference, reason, physicalRaw, lossValue,
          note, user.id, user.displayName, productId, expectedRaw,
        ),
      ];
      if (difference !== 0) {
        statements.push(
          database.prepare(`
            UPDATE products
            SET stock_quantity = ?
            WHERE id = ? AND stock_quantity = ?
              AND EXISTS (SELECT 1 FROM inventory_counts WHERE count_ref = ?)
          `).bind(physicalRaw, productId, expectedRaw, countRef),
          database.prepare(`
            INSERT INTO stock_movements (product_id, movement_type, quantity, note)
            SELECT ?, ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM inventory_counts WHERE count_ref = ?)
          `).bind(
            productId,
            difference > 0 ? "Inventaire +" : "Inventaire -",
            Math.abs(difference),
            `Inventaire ${session.sessionRef} · ${reason}${note ? ` · ${note}` : ""}`,
            countRef,
          ),
        );
      }
      statements.push(
        database.prepare(`
          UPDATE inventory_sessions
          SET counted_product_count = counted_product_count + 1,
              total_physical_units = total_physical_units + ?,
              total_adjustment_units = total_adjustment_units + ?,
              value_after = value_after + ?,
              loss_value = loss_value + ?
          WHERE id = ? AND status = 'En cours'
            AND EXISTS (SELECT 1 FROM inventory_counts WHERE count_ref = ?)
        `).bind(physicalRaw, Math.abs(difference), valueAfter, lossValue, sessionId, countRef),
      );
      const results = await database.batch(statements);
      const insertedCount = Number((results[0]?.meta as { changes?: number } | undefined)?.changes || 0);
      if (insertedCount !== 1) {
        return Response.json({ error: "Le stock a changé pendant la validation. Aucun comptage n’a été enregistré." }, { status: 409 });
      }
      auditEntityId = countRef;
      auditEntityLabel = `${product.productCode} · ${session.sessionRef}`;
      integrationMessage = difference === 0
        ? `${product.name} compté : stock conforme (${physicalRaw}).`
        : `${product.name} ajusté de ${difference > 0 ? "+" : ""}${difference} unité(s) · ${reason} · impact ${lossValue.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD de perte.`;
    } else if (payload.action === "finalizeInventorySession") {
      const sessionId = numberValue(payload.sessionId);
      if (!sessionId) return Response.json({ error: "Session d’inventaire invalide." }, { status: 400 });
      const duplicateFinalize = await protectMutation("finalizeInventorySession");
      if (duplicateFinalize) return duplicateFinalize;
      const database = await getRawDb();
      const session = await database.prepare(`
        SELECT id, session_ref AS sessionRef, status, expected_product_count AS expectedProductCount,
          counted_product_count AS countedProductCount
        FROM inventory_sessions WHERE id = ? LIMIT 1
      `).bind(sessionId).first<{ id: number; sessionRef: string; status: string; expectedProductCount: number; countedProductCount: number }>();
      if (!session) return Response.json({ error: "Session d’inventaire introuvable." }, { status: 404 });
      if (session.status !== "En cours") return Response.json({ error: "Cette session est déjà clôturée." }, { status: 409 });
      if (Number(session.countedProductCount) < Number(session.expectedProductCount)) {
        return Response.json({ error: `Inventaire incomplet : ${session.countedProductCount}/${session.expectedProductCount} produit(s) compté(s).` }, { status: 409 });
      }
      const totals = await database.prepare(`
        SELECT
          COUNT(*) AS countedProductCount,
          COALESCE(SUM(system_quantity), 0) AS totalSystemUnits,
          COALESCE(SUM(physical_quantity), 0) AS totalPhysicalUnits,
          COALESCE(SUM(ABS(difference)), 0) AS totalAdjustmentUnits,
          COALESCE(SUM(value_before), 0) AS valueBefore,
          COALESCE(SUM(value_after), 0) AS valueAfter,
          COALESCE(SUM(loss_value), 0) AS lossValue
        FROM inventory_counts
        WHERE session_id = ?
      `).bind(sessionId).first<{ countedProductCount: number; totalSystemUnits: number; totalPhysicalUnits: number; totalAdjustmentUnits: number; valueBefore: number; valueAfter: number; lossValue: number }>();
      await database.prepare(`
        UPDATE inventory_sessions
        SET status = 'Clôturé',
            counted_product_count = ?,
            total_system_units = ?,
            total_physical_units = ?,
            total_adjustment_units = ?,
            value_before = ?,
            value_after = ?,
            loss_value = ?,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'En cours'
      `).bind(
        Number(totals?.countedProductCount || 0),
        Number(totals?.totalSystemUnits || 0),
        Number(totals?.totalPhysicalUnits || 0),
        Number(totals?.totalAdjustmentUnits || 0),
        Number(totals?.valueBefore || 0),
        Number(totals?.valueAfter || 0),
        Number(totals?.lossValue || 0),
        sessionId,
      ).run();
      auditEntityId = String(sessionId);
      auditEntityLabel = session.sessionRef;
      integrationMessage = `Inventaire ${session.sessionRef} clôturé · valeur réelle ${Number(totals?.valueAfter || 0).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD · pertes détectées ${Number(totals?.lossValue || 0).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD.`;
    } else if (payload.action === "countInventory") {
      const productId = numberValue(payload.productId);
      const physicalRaw = Number(payload.physicalQuantity);
      const expectedRaw = Number(payload.expectedSystemQuantity);
      const note = textValue(payload.note).slice(0, 240);
      if (!productId) return Response.json({ error: "Produit d’inventaire invalide." }, { status: 400 });
      if (!Number.isInteger(physicalRaw) || physicalRaw < 0 || physicalRaw > 1_000_000) {
        return Response.json({ error: "La quantité physique doit être un nombre entier positif ou nul." }, { status: 400 });
      }
      if (!Number.isInteger(expectedRaw) || expectedRaw < 0 || expectedRaw > 1_000_000) {
        return Response.json({ error: "Le stock de référence de cet inventaire est invalide. Rechargez la page." }, { status: 400 });
      }
      const physicalQuantity = physicalRaw;
      const expectedSystemQuantity = expectedRaw;
      const [product] = await db.select().from(products).where(and(eq(products.id, productId), isNull(products.archivedAt))).limit(1);
      if (!product) return Response.json({ error: "Produit introuvable." }, { status: 404 });
      if (product.stockQuantity !== expectedSystemQuantity) {
        return Response.json({ error: `Le stock a changé pendant le comptage (${expectedSystemQuantity} → ${product.stockQuantity}). Rechargez puis recommencez l’inventaire.` }, { status: 409 });
      }

      const duplicateInventory = await protectMutation("countInventory");
      if (duplicateInventory) return duplicateInventory;

      const difference = physicalQuantity - expectedSystemQuantity;
      let reason: string;
      try {
        reason = inventoryDifferenceReason(payload.reason, difference);
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Motif d’écart invalide." }, { status: 400 });
      }
      const countRef = `INV-${Date.now().toString(36).slice(-6).toUpperCase()}${crypto.randomUUID().slice(0, 2).toUpperCase()}`;
      const rawDatabase = await getRawDb();
      const unitCost = Number(product.purchasePrice || 0);
      const valueBefore = expectedSystemQuantity * unitCost;
      const valueAfter = physicalQuantity * unitCost;
      const lossValue = difference < 0 ? Math.abs(difference) * unitCost : 0;
      const inventoryInsert = rawDatabase.prepare(`
        INSERT INTO inventory_counts (
          count_ref, product_id, system_quantity, physical_quantity, difference,
          reason, unit_cost, value_before, value_after, loss_value,
          note, counted_by_user_id, counted_by_name
        )
        SELECT ?, id, stock_quantity, ?, ?, ?, purchase_price, stock_quantity * purchase_price, ? * purchase_price, ?, ?, ?, ?
        FROM products
        WHERE id = ? AND stock_quantity = ?
      `).bind(
        countRef,
        physicalQuantity,
        difference,
        reason,
        physicalQuantity,
        lossValue,
        note,
        user.id,
        user.displayName,
        productId,
        expectedSystemQuantity,
      );

      const statements = [inventoryInsert];
      if (difference !== 0) {
        statements.push(
          rawDatabase.prepare(`
            UPDATE products
            SET stock_quantity = ?
            WHERE id = ?
              AND stock_quantity = ?
              AND EXISTS (SELECT 1 FROM inventory_counts WHERE count_ref = ?)
          `).bind(physicalQuantity, productId, expectedSystemQuantity, countRef),
          rawDatabase.prepare(`
            INSERT INTO stock_movements (product_id, movement_type, quantity, note)
            SELECT ?, ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM inventory_counts WHERE count_ref = ?)
          `).bind(
            productId,
            difference > 0 ? "Inventaire +" : "Inventaire -",
            Math.abs(difference),
            `Inventaire ${countRef} · ${reason}${note ? ` · ${note}` : ""}`,
            countRef,
          ),
        );
      }

      const inventoryResults = await rawDatabase.batch(statements);
      const insertedCount = Number((inventoryResults[0]?.meta as { changes?: number } | undefined)?.changes || 0);
      if (insertedCount !== 1) {
        return Response.json({ error: "Le stock a changé pendant la validation. Aucun inventaire n’a été enregistré. Rechargez puis recommencez." }, { status: 409 });
      }
      auditEntityId = countRef;
      auditEntityLabel = `${product.productCode} · ${countRef}`;
    } else if (payload.action === "updateStockMovement") {
      const id = numberValue(payload.id);
      const quantity = numberValue(payload.quantity);
      const movementType = textValue(payload.movementType);
      if (!id || quantity < 1 || !["Entrée", "Vente"].includes(movementType)) return Response.json({ error: "Mouvement de stock invalide." }, { status: 400 });
      const [movement] = await db.select().from(stockMovements).where(eq(stockMovements.id, id)).limit(1);
      if (!movement) return Response.json({ error: "Mouvement de stock introuvable." }, { status: 404 });
      if (movement.orderId) return Response.json({ error: "Un mouvement créé automatiquement par une commande ne peut pas être modifié." }, { status: 409 });
      if (!["Entrée", "Vente"].includes(movement.movementType)) return Response.json({ error: "Un ajustement d’inventaire ne peut pas être modifié." }, { status: 409 });
      const [product] = await db.select().from(products).where(eq(products.id, movement.productId)).limit(1);
      if (!product) return Response.json({ error: "Produit associé introuvable." }, { status: 404 });
      if (product.archivedAt) return Response.json({ error: "Restaurez ce produit avant de modifier son historique de stock." }, { status: 409 });
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
      if (!["Entrée", "Vente"].includes(movement.movementType)) return Response.json({ error: "Un ajustement d’inventaire ne peut pas être supprimé." }, { status: 409 });
      const [product] = await db.select().from(products).where(eq(products.id, movement.productId)).limit(1);
      if (!product) return Response.json({ error: "Produit associé introuvable." }, { status: 404 });
      if (product.archivedAt) return Response.json({ error: "Restaurez ce produit avant de modifier son historique de stock." }, { status: 409 });
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
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut configurer la sauvegarde." }, { status: 403 });
      const token = textValue(payload.token);
      if (token.length < 32 || token.length > 200 || !/^[A-Za-z0-9_-]+$/.test(token)) {
        return Response.json({ error: "La clé privée de sauvegarde est invalide." }, { status: 400 });
      }
      const updatedAt = new Date().toISOString();
      const tokenHash = await sha256Hex(token);
      await db.insert(settings).values({ key: "security_backup_token_hash", value: tokenHash }).onConflictDoUpdate({
        target: settings.key,
        set: { value: tokenHash, updatedAt },
      });
      await markGoogleSheetsSyncPending(await getRawDb());
    } else if (payload.action === "revokeBackupToken") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut désactiver la sauvegarde." }, { status: 403 });
      const updatedAt = new Date().toISOString();
      await db.insert(settings).values({ key: "security_backup_token_hash", value: "" }).onConflictDoUpdate({
        target: settings.key,
        set: { value: "", updatedAt },
      });
      const rawDatabase = await getRawDb();
      await markGoogleSheetsSyncPending(rawDatabase);
      await processGoogleSheetsSyncQueue(rawDatabase, { force: true });
    } else if (payload.action === "updateBackupWebhook") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut connecter la synchronisation instantanée." }, { status: 403 });
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
      const rawDatabase = await getRawDb();
      await markGoogleSheetsSyncPending(rawDatabase);
      const syncResult = await processGoogleSheetsSyncQueue(rawDatabase, { force: true });
      integrationMessage = syncResult.status === "synced"
        ? "Connexion Google Sheets vérifiée et synchronisation terminée."
        : syncResult.status === "unconfigured"
          ? "Adresse Apps Script enregistrée. Générez aussi la clé privée pour activer la synchronisation."
          : "Connexion enregistrée. La synchronisation restera en attente et sera retentée automatiquement.";
      auditEntityLabel = "Synchronisation instantanée";
    } else if (payload.action === "resetBusinessValues") {
      if (!access.isOwner) return Response.json({ error: "Seul le compte principal peut remettre les valeurs commerciales à zéro." }, { status: 403 });
      if (textValue(payload.confirmation) !== "REINITIALISER") {
        return Response.json({ error: "Confirmation de remise à zéro invalide." }, { status: 400 });
      }
      const rawDatabase = await getRawDb();
      const summary = await resetBusinessValuesPreservingStock(rawDatabase);
      await markGoogleSheetsSyncPending(rawDatabase);
      auditEntityLabel = "Valeurs commerciales";
      integrationMessage = [
        `${summary.orders} commande(s)`,
        `${summary.customers} client(s)`,
        `${summary.purchases} achat(s)`,
        `${summary.expenses} dépense(s)`,
        `${summary.ads} ligne(s) publicité`,
        `${summary.capital} mouvement(s) de capital`,
      ].join(" · ") + " supprimés. Produits, quantités et historique de stock conservés.";
    } else if (payload.action === "createBackupNow") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut créer une sauvegarde complète." }, { status: 403 });
      const rawDatabase = await getRawDb();
      await createDailyBackup(rawDatabase, "Manuelle", true);
      const verification = await verifyLatestBackup(rawDatabase);
      if (!verification.ok) return Response.json({ error: `La sauvegarde a été créée mais son contrôle a échoué : ${verification.error}` }, { status: 500 });
      integrationMessage = `Sauvegarde créée et contrôlée · ${verification.recordCount} enregistrement(s) lisibles.`;
      auditEntityLabel = "Sauvegarde manuelle";
    } else if (payload.action === "verifyBackupNow") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut vérifier les sauvegardes." }, { status: 403 });
      const verification = await verifyLatestBackup(await getRawDb());
      if (!verification.ok) return Response.json({ error: verification.error }, { status: 409 });
      integrationMessage = `Dernière sauvegarde contrôlée sans modifier la production · ${verification.recordCount} enregistrement(s) · ${verification.backupCreatedAt.slice(0, 10)}.`;
      auditEntityId = verification.backupId ? String(verification.backupId) : null;
      auditEntityLabel = "Contrôle de restaurabilité";
    } else if (payload.action === "importPortableExport") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut réimporter un export complet." }, { status: 403 });
      const portableExport = textValue(payload.portableExport);
      if (!portableExport) return Response.json({ error: "Sélectionnez un export JSON Maison Jiya." }, { status: 400 });
      const duplicateImport = await protectMutation("importPortableExport");
      if (duplicateImport) return duplicateImport;
      const summary = await restorePortableDataImport(await getRawDb(), portableExport);
      integrationMessage = `Export du ${summary.exportedAt.slice(0, 10)} restauré · ${summary.restoredRows.toLocaleString("fr-MA")} ligne(s) réimportée(s). Comptes, e-mail et secrets actuels conservés.`;
      auditEntityLabel = `Export portable ${summary.exportedAt.slice(0, 10)} · ${summary.restoredRows} ligne(s)`;
    } else if (payload.action === "restoreBackup") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut restaurer une sauvegarde." }, { status: 403 });
      const backupId = numberValue(payload.backupId);
      if (!backupId) return Response.json({ error: "Sauvegarde invalide." }, { status: 400 });
      const [backup] = await db.select({ id: dailyBackups.id, backupDate: dailyBackups.backupDate }).from(dailyBackups).where(eq(dailyBackups.id, backupId)).limit(1);
      if (!backup) return Response.json({ error: "Sauvegarde introuvable." }, { status: 404 });
      await createDailyBackup(await getRawDb(), "Avant restauration", true);
      await restoreDailyBackup(await getRawDb(), backupId);
      auditEntityId = String(backupId);
      auditEntityLabel = backup.backupDate;
    } else if (payload.action === "retryGoogleSheetsSync") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut relancer cette synchronisation." }, { status: 403 });
      const rawDatabase = await getRawDb();
      await markGoogleSheetsSyncPending(rawDatabase);
      const syncResult = await processGoogleSheetsSyncQueue(rawDatabase, { force: true });
      integrationMessage = syncResult.status === "synced"
        ? "Google Sheets est à jour."
        : "Google reste indisponible. La donnée est conservée dans Maison Jiya et une nouvelle tentative est programmée.";
      auditEntityLabel = "Synchronisation Google Sheets";
    } else if (payload.action === "updateCarriers") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut gérer les agences." }, { status: 403 });
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
    } else if (payload.action === "updateAllocationPolicy") {
      if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut modifier la répartition du capital." }, { status: 403 });
      const reinvestment = numberValue(payload.reinvestment);
      const salary = numberValue(payload.salary);
      const emergency = numberValue(payload.emergency);
      if ([reinvestment, salary, emergency].some((value) => value > 100)) {
        return Response.json({ error: "Chaque pourcentage doit être compris entre 0 et 100." }, { status: 400 });
      }
      if (reinvestment + salary + emergency !== 100) {
        return Response.json({ error: "La répartition doit totaliser exactement 100 %." }, { status: 400 });
      }
      const updatedAt = new Date().toISOString();
      await db.batch([
        db.insert(settings).values({ key: "reinvestment_allocation", value: String(reinvestment) }).onConflictDoUpdate({ target: settings.key, set: { value: String(reinvestment), updatedAt } }),
        db.insert(settings).values({ key: "salary_allocation", value: String(salary) }).onConflictDoUpdate({ target: settings.key, set: { value: String(salary), updatedAt } }),
        db.insert(settings).values({ key: "emergency_allocation", value: String(emergency) }).onConflictDoUpdate({ target: settings.key, set: { value: String(emergency), updatedAt } }),
      ]);
      await reconcileOrderAllocations();
      auditEntityLabel = `${reinvestment}% réinvestissement · ${salary}% salaire · ${emergency}% urgence`;
    } else if (payload.action === "updateSetting") {
      const key = textValue(payload.key);
      if (!["theme", "carrier_name"].includes(key)) return Response.json({ error: "Réglage invalide." }, { status: 400 });
      const value = textValue(payload.value);
      if (key === "theme" && !themeOptions.includes(value)) return Response.json({ error: "Thème invalide." }, { status: 400 });
      const updatedAt = new Date().toISOString();
      if (key === "carrier_name") {
        if (!access.isOwner) return Response.json({ error: "Seul le propriétaire principal peut modifier le transporteur." }, { status: 403 });
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
        || textValue(payload.category)
        || textValue(payload.campaign)
        || textValue(payload.label)
        || textValue(payload.productCode)
        || textValue(payload.displayName)
        || textValue(payload.carrierName)
        || textValue(payload.key);
    }
    if (mutationReceiptReserved) {
      businessMutationCommitted = true;
      try {
        await completeMutationReceipt(
          mutationReceiptKey,
          mutationReceiptUserId,
          mutationReceiptAction,
          integrationMessage || "Enregistré avec succès",
        );
      } catch (receiptError) {
        console.error("Maison Jiya mutation receipt completion failed", errorDetails(receiptError));
      }
    }

    try {
      await writeAudit(user, textValue(payload.action), auditEntityId, auditEntityLabel);
    } catch (auditError) {
      console.error("Maison Jiya audit write failed after committed mutation", errorDetails(auditError));
    }

    const responseData = await snapshot(access);
    return Response.json(integrationMessage ? { ...responseData, message: integrationMessage } : responseData);
  } catch (error) {
    if (mutationReceiptReserved && !businessMutationCommitted) {
      try {
        await releaseMutationReceipt(mutationReceiptKey, mutationReceiptUserId, mutationReceiptAction);
      } catch (receiptError) {
        console.error("Maison Jiya mutation receipt cleanup failed", errorDetails(receiptError));
      }
    }
    console.error("Maison Jiya data POST failed", errorDetails(error));
    const errorMessage = error instanceof Error ? error.message : "";
    if (errorMessage.includes("Stock insuffisant")) {
      return Response.json({ error: "Stock insuffisant pour confirmer cette commande." }, { status: 409 });
    }
    if (errorMessage.startsWith("Le nom d’utilisateur") || errorMessage.startsWith("Le mot de passe") || errorMessage === "Rôle invalide.") {
      return Response.json({ error: errorMessage }, { status: 400 });
    }
    if (errorMessage.startsWith("Ligne ")) return Response.json({ error: errorMessage }, { status: 400 });
    if (errorMessage.startsWith("Le seuil d’alerte stock") || errorMessage.startsWith("La couverture de réapprovisionnement")) {
      return Response.json({ error: errorMessage }, { status: 400 });
    }
    if (/^(Le fichier|Version d.export|La date de l.export|Les tables de l.export|La table |L.export contient|Référence |Cet export)/.test(errorMessage)) return Response.json({ error: errorMessage }, { status: 400 });
    return Response.json({ error: "L’enregistrement n’a pas abouti. Vérifiez les champs puis réessayez." }, { status: 500 });
  }
}
