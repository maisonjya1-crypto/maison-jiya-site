"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AiPage from "./ai-page";
import TrainingPage from "./training-page";
import { calculateBusinessFinance, calculateOperatingProfit, orderContributionBeforeGlobalAds } from "../lib/finance";
import { businessDateKey, deliveryRecognitionDate, returnRecognitionDate } from "../lib/accounting-dates";
import { allocationPolicyFromSettings } from "../lib/allocation-policy";
import { applyTreasuryReconciliation, calculateTreasuryAccounts } from "../lib/treasury";
import { buildSupplierStatement, type SupplierStatementEntry } from "../lib/supplier-statement";
import { buildPurchasePlan, type PurchasePlanSupplierGroup } from "../lib/purchase-plan";
import { buildCashflowForecast } from "../lib/cashflow-forecast";
import { buildMonthlyFinancialSnapshot, isCompletedBusinessMonth, monthBounds, previousMonthKey } from "../lib/monthly-closing";
import { calculateSmartCapital } from "../lib/smart-capital";

type Order = {
  id: number;
  orderRef: string;
  customerId: number;
  productId: number | null;
  customerName: string | null;
  phone: string | null;
  city: string;
  address: string;
  products: string;
  quantity: number;
  saleAmount: number;
  productCost: number;
  shippingCost: number;
  adCost: number;
  fees: number;
  returnCost: number;
  returnReason: string;
  returnNote: string;
  source: string;
  campaign: string;
  fulfillmentType: "Livraison" | "Magasin physique";
  status: string;
  paymentStatus: string;
  carrier: string;
  trackingNumber: string;
  carrierDispatchState: string;
  carrierAuthorizedAt: string | null;
  carrierInvoiceCode: string;
  stockDeducted: boolean;
  paidAt: string | null;
  refundedAt: string | null;
  deletedAt: string | null;
  deletedByUserId: number | null;
  createdAt: string;
  updatedAt: string | null;
};
type Customer = {
  id: number;
  name: string;
  phone: string;
  city: string;
  createdAt: string;
};
type Supplier = {
  id: number;
  name: string;
  contactName: string;
  phone: string;
  whatsapp: string;
  city: string;
  leadTimeDays: number;
  minimumOrderAmount: number;
  paymentTerms: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
};
type Purchase = {
  id: number;
  supplier: string;
  supplierId: number | null;
  purchaseRef: string | null;
  purchaseLineNo: number;
  purchaseMode: "Retrait fournisseur" | "Livraison fournisseur";
  invoiceId: number | null;
  procurementStatus: string;
  orderedAt: string | null;
  expectedAt: string | null;
  item: string;
  productId: number | null;
  productCode: string | null;
  productName: string | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
  account: string;
  paymentStatus: string;
  paidAt: string | null;
  receivedQuantity: number;
  receivedAt: string | null;
  createdAt: string;
};
type SupplierInvoice = {
  id: number;
  supplierId: number;
  supplierName: string | null;
  purchaseRef: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: "À payer" | "Partiellement payé" | "Payé";
  isOverdue: boolean;
  note: string;
  createdAt: string;
  updatedAt: string | null;
};
type SupplierPayment = {
  id: number;
  invoiceId: number;
  amount: number;
  account: string;
  paidAt: string;
  reference: string;
  note: string;
  createdAt: string;
};
type CarrierSettlement = {
  id: number;
  carrier: string;
  reference: string;
  settlementDate: string;
  expectedAmount: number;
  actualAmount: number;
  differenceAmount: number;
  orderCount: number;
  status: "Rapproché" | "À vérifier";
  note: string;
  createdByUserId: number | null;
  createdByName: string;
  createdAt: string;
};
type CarrierSettlementOrder = {
  id: number;
  settlementId: number;
  orderId: number;
  expectedAmount: number;
  orderRef: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  customerName: string | null;
  createdAt: string;
};
type Expense = {
  id: number;
  category: string;
  label: string;
  amount: number;
  account: string;
  paymentStatus: string;
  paidAt: string | null;
  expenseDate: string;
  note: string;
  recurringExpenseId: number | null;
  recurringPeriod: string | null;
  createdAt: string;
};
type RecurringExpense = {
  id: number;
  category: string;
  label: string;
  amount: number;
  account: string;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  note: string;
  isActive: number;
  createdAt: string;
  updatedAt: string | null;
};
type Ad = {
  id: number;
  platform: string;
  campaign: string;
  externalId: string;
  spend: number;
  revenue: number;
  orderCount: number;
  nativeSpendCents: number;
  nativeRevenueCents: number;
  nativeCurrency: string;
  source: string;
  performanceDate: string;
};
type Capital = {
  id: number;
  direction: string;
  category: string;
  label: string;
  amount: number;
  account: string;
  orderId: number | null;
  isAutomatic: boolean;
  autoKey: string | null;
  entryDate: string;
};
type Product = {
  id: number;
  productCode: string;
  name: string;
  category: string;
  purchasePrice: number;
  salePrice: number;
  minimumSalePrice: number;
  stockQuantity: number;
  stockAlertThreshold: number;
  reorderCoverDays: number;
  archivedAt: string | null;
  archivedByUserId: number | null;
  createdAt: string;
};
type StockMovement = {
  id: number;
  productId: number;
  orderId: number | null;
  purchaseId: number | null;
  orderRef: string | null;
  productCode: string | null;
  productName: string | null;
  movementType: string;
  quantity: number;
  note: string;
  createdAt: string;
};
type InventorySession = {
  id: number;
  sessionRef: string;
  status: "En cours" | "Clôturé";
  note: string;
  expectedProductCount: number;
  countedProductCount: number;
  totalSystemUnits: number;
  totalPhysicalUnits: number;
  totalAdjustmentUnits: number;
  valueBefore: number;
  valueAfter: number;
  lossValue: number;
  startedByUserId: number | null;
  startedByName: string;
  startedAt: string;
  completedAt: string | null;
};
type InventoryCount = {
  id: number;
  countRef: string;
  sessionId: number | null;
  productId: number;
  productCode: string | null;
  productName: string | null;
  systemQuantity: number;
  physicalQuantity: number;
  difference: number;
  reason: string;
  unitCost: number;
  valueBefore: number;
  valueAfter: number;
  lossValue: number;
  note: string;
  countedByUserId: number | null;
  countedByName: string;
  createdAt: string;
};
type Member = {
  id: number;
  username: string;
  displayName: string;
  role: "admin" | "editor" | "viewer";
  isOwner: boolean;
  isActive: boolean;
  createdAt: string;
};
type OrderStatusHistory = {
  id: number;
  orderId: number;
  fromStatus: string | null;
  toStatus: string;
  changedByUserId: number | null;
  changedByName: string;
  changedAt: string;
};
type AuditLog = {
  id: number;
  userId: number | null;
  username: string;
  displayName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string;
  createdAt: string;
};
type DailyBackup = {
  id: number;
  backupDate: string;
  reason: string;
  recordCount: number;
  createdAt: string;
};
type DailyClosing = {
  id: number;
  closeDate: string;
  expectedBank: number;
  actualBank: number;
  bankVariance: number;
  expectedCash: number;
  actualCash: number;
  cashVariance: number;
  expectedOther: number;
  actualOther: number;
  otherVariance: number;
  expectedTotal: number;
  actualTotal: number;
  totalVariance: number;
  carrierMoney: number;
  receivables: number;
  unpaidPurchases: number;
  unpaidExpenses: number;
  collectedOrders: number;
  collectedAmount: number;
  refundedOrders: number;
  refundedAmount: number;
  paidPurchasesCount: number;
  paidPurchasesAmount: number;
  paidExpensesCount: number;
  paidExpensesAmount: number;
  adSpend: number;
  note: string;
  closedByUserId: number | null;
  closedByName: string;
  createdAt: string;
  updatedAt: string | null;
};
type DailyClosingPreview = {
  closeDate: string;
  expectedBank: number;
  expectedCash: number;
  expectedOther: number;
  expectedTotal: number;
  carrierMoney: number;
  receivables: number;
  unpaidPurchases: number;
  unpaidExpenses: number;
  collectedOrders: number;
  collectedAmount: number;
  refundedOrders: number;
  refundedAmount: number;
  paidPurchasesCount: number;
  paidPurchasesAmount: number;
  paidExpensesCount: number;
  paidExpensesAmount: number;
  adSpend: number;
};
type MonthlyClosing = {
  id: number;
  monthKey: string;
  periodStart: string;
  periodEnd: string;
  deliveredOrders: number;
  deliveredRevenue: number;
  collectedAmount: number;
  productCost: number;
  shippingCost: number;
  fees: number;
  returnCost: number;
  adSpend: number;
  operatingExpenses: number;
  inventoryLoss: number;
  carrierAdjustment: number;
  contributionMargin: number;
  netProfit: number;
  reinvestmentAllocated: number;
  manualCapitalIn: number;
  manualCapitalOut: number;
  stockValueStart: number | null;
  stockValueEnd: number | null;
  stockValueSource: string;
  cashEnd: number;
  cashEndSource: string;
  note: string;
  closedByUserId: number | null;
  closedByName: string;
  createdAt: string;
};
type SmartStockRecommendation = {
  productId: number;
  productCode: string;
  productName: string;
  category: string;
  stockQuantity: number;
  alertThreshold: number;
  coverDays: number;
  soldUnits30: number;
  averageDailyDemand: number;
  daysOfCover: number | null;
  pendingInbound: number;
  targetStock: number;
  recommendedQuantity: number;
  supplierId: number | null;
  supplier: string;
  supplierLeadTimeDays: number | null;
  supplierMinimumOrderAmount: number | null;
  unitCost: number;
  estimatedCost: number;
  lastPurchaseAt: string | null;
  status: "Rupture" | "Critique" | "À prévoir" | "OK";
};
type GoogleSheetsSyncLog = {
  id: number;
  eventId: string;
  version: number;
  status: "processing" | "retrying" | "synced" | "covered";
  attemptCount: number;
  httpStatus: number | null;
  firstAttemptAt: string;
  lastAttemptAt: string;
  syncedAt: string | null;
  nextAttemptAt: string | null;
  lastError: string;
};
type GoogleSheetsSync = {
  state: {
    status: "pending" | "processing" | "retrying" | "synced" | "unconfigured";
    currentVersion: number;
    syncedVersion: number;
    pendingChanges: number;
    attemptCount: number;
    lastEventAt: string | null;
    lastAttemptAt: string | null;
    lastSyncAt: string | null;
    nextAttemptAt: string | null;
    lastError: string;
  };
  logs: GoogleSheetsSyncLog[];
};
type Data = {
  orders: Order[];
  trash: Order[];
  customers: Customer[];
  suppliers: Supplier[];
  purchases: Purchase[];
  supplierInvoices: SupplierInvoice[];
  supplierPayments: SupplierPayment[];
  carrierSettlements: CarrierSettlement[];
  carrierSettlementOrders: CarrierSettlementOrder[];
  expenses: Expense[];
  recurringExpenses: RecurringExpense[];
  ads: Ad[];
  capital: Capital[];
  products: Product[];
  stockMovements: StockMovement[];
  inventoryCounts: InventoryCount[];
  inventorySessions: InventorySession[];
  members: Member[];
  orderStatusHistory: OrderStatusHistory[];
  auditLogs: AuditLog[];
  backups: DailyBackup[];
  dailyClosings: DailyClosing[];
  monthlyClosings: MonthlyClosing[];
  dailyClosingPreview: DailyClosingPreview;
  stockRecommendations: SmartStockRecommendation[];
  googleSheetsSync: GoogleSheetsSync;
  settings: Record<string, string>;
  access: {
    canEdit: boolean;
    isOwner: boolean;
    canClaimOwnership: boolean;
    passwordConfigured: boolean;
    sessionExpiresAt: string | null;
    role: "admin" | "editor" | "viewer";
    username: string;
    displayName: string;
  };
};
type ModalName = "order" | "purchase" | "supplier" | "supplierInvoice" | "expense" | "ad" | "capital" | "product" | null;
type StockSelection = { product: Product; type: "Entrée" | "Vente" } | null;
type InventorySelection = Product | null;
type ThemeKey = "mauve-froid" | "rose-poudre" | "sombre-prune" | "bleu-brume" | "sable-chic";
type CapitalFlow = {
  direction: "Entrée" | "Sortie";
  source: string;
  amount: number;
  date: string;
};
type CarrierQuote = { available: boolean; carrier: "Sendit" | "ForceLog"; error?: string; fee: number | null };
type CarrierQuoteResult = { pickupCity: "Casablanca"; quotes: CarrierQuote[]; recommendedCarrier: "Sendit" | "ForceLog" | null };
type EditableEntity =
  | { kind: "product"; record: Product }
  | { kind: "movement"; record: StockMovement }
  | { kind: "customer"; record: Customer }
  | { kind: "supplier"; record: Supplier }
  | { kind: "purchase"; record: Purchase }
  | { kind: "expense"; record: Expense }
  | { kind: "ad"; record: Ad }
  | { kind: "capital"; record: Capital };

const emptyData: Data = {
  orders: [],
  trash: [],
  customers: [],
  suppliers: [],
  purchases: [],
  supplierInvoices: [],
  supplierPayments: [],
  carrierSettlements: [],
  carrierSettlementOrders: [],
  expenses: [],
  recurringExpenses: [],
  ads: [],
  capital: [],
  products: [],
  stockMovements: [],
  inventoryCounts: [],
  inventorySessions: [],
  members: [],
  orderStatusHistory: [],
  auditLogs: [],
  backups: [],
  dailyClosings: [],
  monthlyClosings: [],
  dailyClosingPreview: {
    closeDate: "",
    expectedBank: 0,
    expectedCash: 0,
    expectedOther: 0,
    expectedTotal: 0,
    carrierMoney: 0,
    receivables: 0,
    unpaidPurchases: 0,
    unpaidExpenses: 0,
    collectedOrders: 0,
    collectedAmount: 0,
    refundedOrders: 0,
    refundedAmount: 0,
    paidPurchasesCount: 0,
    paidPurchasesAmount: 0,
    paidExpensesCount: 0,
    paidExpensesAmount: 0,
    adSpend: 0,
  },
  stockRecommendations: [],
  googleSheetsSync: {
    state: { status: "unconfigured", currentVersion: 0, syncedVersion: 0, pendingChanges: 0, attemptCount: 0, lastEventAt: null, lastAttemptAt: null, lastSyncAt: null, nextAttemptAt: null, lastError: "" },
    logs: [],
  },
  settings: {},
  access: { canEdit: false, isOwner: false, canClaimOwnership: false, passwordConfigured: true, sessionExpiresAt: null, role: "viewer", username: "", displayName: "" },
};
const money = (value: number) => `${Number(value).toLocaleString("fr-MA", { minimumFractionDigits: Number.isInteger(value) ? 0 : 1, maximumFractionDigits: 2 })} MAD`;
const moneyTone = (value: number) => (value > 0 ? "money-positive" : value < 0 ? "money-negative" : "");
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("fr-MA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
const dateTimeLabel = (value: string) =>
  new Intl.DateTimeFormat("fr-MA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const navigation = ["Vue d’ensemble", "Commandes", "Produits", "Inventaire", "Réapprovisionnement", "Colis", "Règlements transporteurs", "Clients", "Fournisseurs", "Achats", "Factures fournisseurs", "Dépenses", "Publicités", "Capital", "Trésorerie", "Clôture", "Rapports", "Assistant IA", "Mode entraînement", "Corbeille", "Paramètres"];
const navigationGroups = [
  { label: "Opérations", items: ["Vue d’ensemble", "Commandes", "Produits", "Inventaire", "Réapprovisionnement", "Colis", "Règlements transporteurs", "Clients", "Fournisseurs", "Achats", "Factures fournisseurs"] },
  { label: "Pilotage", items: ["Dépenses", "Publicités", "Capital", "Trésorerie", "Clôture", "Rapports", "Assistant IA"] },
  { label: "Système", items: ["Mode entraînement", "Corbeille", "Paramètres"] },
];
const sectionDescriptions: Record<string, string> = {
  "Vue d’ensemble": "Synthèse de l’activité, de la trésorerie et des opérations.",
  Commandes: "Suivez les ventes, statuts, paiements et expéditions.",
  Produits: "Pilotez le catalogue, les coûts, les marges et le stock.",
  Inventaire: "Comptez le stock réel, expliquez les écarts et valorisez les pertes.",
  Réapprovisionnement: "Anticipez les ruptures et préparez les quantités à commander par fournisseur.",
  Colis: "Contrôlez les expéditions et le suivi des transporteurs.",
  "Règlements transporteurs": "Rapprochez les virements réellement reçus avec les commandes livrées.",
  Clients: "Centralisez les coordonnées et l’historique de vos clientes.",
  Fournisseurs: "Centralisez contacts, délais, conditions et historique de vos fournisseurs.",
  Achats: "Gérez les fournisseurs, réceptions et coûts d’approvisionnement.",
  "Factures fournisseurs": "Suivez les factures, échéances, paiements partiels et restes à payer.",
  Dépenses: "Enregistrez les charges réelles qui réduisent le résultat et la trésorerie.",
  Publicités: "Suivez vos campagnes, dépenses et performances Meta.",
  Capital: "Suivez les mouvements, enveloppes et capacités de réinvestissement.",
  Trésorerie: "Anticipez les sorties connues, les échéances et le niveau de cash à 7, 30 et 60 jours.",
  Clôture: "Comparez la trésorerie théorique à l’argent réellement présent en fin de journée.",
  Rapports: "Analysez la performance commerciale et financière par période.",
  "Assistant IA": "Interrogez les données Maison Jiya et préparez vos actions.",
  "Mode entraînement": "Testez le logiciel sans toucher aux données réelles.",
  Corbeille: "Restaurez ou supprimez définitivement les commandes archivées.",
  Paramètres: "Gérez les accès, sauvegardes, intégrations et préférences.",
};
const addActionLabels: Record<string, string> = {
  "Vue d’ensemble": "Nouvelle commande",
  Commandes: "Nouvelle commande",
  Produits: "Nouveau produit",
  Fournisseurs: "Nouveau fournisseur",
  Achats: "Nouveau bon de commande",
  "Factures fournisseurs": "Nouvelle facture",
  Dépenses: "Nouvelle dépense",
  Publicités: "Nouvelle campagne",
  Capital: "Nouveau mouvement",
};
const addableSections = new Set(Object.keys(addActionLabels));
const retrySafeMutationActions = new Set([
  "addOrder",
  "importOrders",
  "addSupplier",
  "addPurchase",
  "addPurchaseOrder",
  "receivePurchase",
  "addSupplierInvoice",
  "addSupplierPayment",
  "addExpense",
  "addAd",
  "addCapital",
  "importProducts",
  "importPortableExport",
  "updateAllocationPolicy",
  "saveDailyClosing",
  "addProduct",
  "addStockMovement",
  "countInventory",
  "startInventorySession",
  "countInventorySessionProduct",
  "finalizeInventorySession",
  "addCarrierSettlement",
  "archiveProduct",
  "restoreProduct",
]);
const orderStatusOptions = ["En attente", "Confirmée", "Expédiée", "En livraison", "Livrée", "Retour", "Annulée"];
const returnReasonOptions = ["Cliente injoignable", "Refus de la cliente", "Adresse incorrecte", "Cliente absente", "Produit endommagé", "Mauvais produit", "Autre"];
const orderSourceOptions = ["WhatsApp", "Instagram", "Facebook", "TikTok", "Site web", "Magasin physique", "Autre"];
const fulfillmentTypeOptions = ["Livraison", "Magasin physique"];
const productCategoryOptions = ["Montres", "Bijoux", "Wallets", "Électronique", "Boîtes", "Autre"];
const capitalMonthLabels = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const capitalMonthShort = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const capitalChartColors = ["var(--forest)", "var(--terracotta)", "var(--gold)", "#557ea4", "#8b6f9f", "#c47c8d", "#b68658", "#77869b"];
const exactOrderProfit = (order: Order) => {
  if (order.status === "Retour" || order.paymentStatus === "Remboursé") {
    return -(order.productCost + order.shippingCost + order.fees + order.returnCost);
  }
  return orderContributionBeforeGlobalAds(order);
};
const whatsappUrl = (phone: string | null, orderRef: string) => {
  const digits = (phone || "").replace(/\D/g, "").replace(/^0/, "212");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(`Bonjour, nous vous contactons concernant votre commande Maison Jiya ${orderRef}.`)}` : "";
};
const themeOptions: { key: ThemeKey; name: string; mode: "Clair" | "Sombre"; description: string; colors: string[] }[] = [
  { key: "mauve-froid", name: "Mauve froid", mode: "Clair", description: "Mauve élégant, blanc doux et rose froid.", colors: ["#6f5680", "#a77ea7", "#f7f4f8", "#ffffff"] },
  { key: "rose-poudre", name: "Rose poudré", mode: "Clair", description: "Rose subtil, prune douce et blanc rosé.", colors: ["#a85e78", "#d190a5", "#fff7f8", "#ffffff"] },
  { key: "sombre-prune", name: "Sombre prune", mode: "Sombre", description: "Prune profonde, lilas lumineux et contraste doux.", colors: ["#1b1620", "#5e3c68", "#c69ad3", "#f7eef8"] },
  { key: "bleu-brume", name: "Bleu brume", mode: "Clair", description: "Bleu froid, gris perle et blanc net.", colors: ["#546f8c", "#829ab1", "#f3f6f8", "#ffffff"] },
  { key: "sable-chic", name: "Sable chic", mode: "Clair", description: "Beige raffiné, cacao doux et ivoire.", colors: ["#806452", "#b59377", "#f8f5ef", "#ffffff"] },
];

type PortableExportPreview = {
  exportedAt: string;
  totalRows: number;
  counts: Record<string, number>;
  warnings: string[];
};

function inspectPortableExportFile(content: string): PortableExportPreview {
  if (!content.trim()) throw new Error("Le fichier JSON est vide.");
  if (content.length > 12_000_000) throw new Error("Le fichier dépasse la limite de 12 Mo.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Le fichier JSON est illisible.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Ce fichier n’est pas un export Maison Jiya.");
  const root = parsed as Record<string, unknown>;
  if (Number(root.exportVersion) !== 1 || root.source !== "Maison Jiya") throw new Error("Version d’export Maison Jiya incompatible.");
  if (typeof root.exportedAt !== "string" || !Number.isFinite(Date.parse(root.exportedAt))) throw new Error("Date de l’export invalide.");
  if (!root.tables || typeof root.tables !== "object" || Array.isArray(root.tables)) throw new Error("Tables de l’export manquantes.");
  const rawTables = root.tables as Record<string, unknown>;
  const required = ["clients", "produits", "commandes", "mouvements_stock", "achats", "publicites", "tresorerie_capital", "parametres"];
  for (const key of required) {
    if (!Array.isArray(rawTables[key])) throw new Error(`Table obligatoire manquante : ${key}.`);
  }
  const counts: Record<string, number> = {};
  let totalRows = 0;
  for (const [key, rows] of Object.entries(rawTables)) {
    if (!Array.isArray(rows)) throw new Error(`Table invalide : ${key}.`);
    counts[key] = rows.length;
    totalRows += rows.length;
  }
  const warnings: string[] = [];
  if ((counts.membres || 0) > 0) warnings.push("Les comptes et mots de passe actuels seront conservés.");
  if ((counts.journal_sync_google_sheets || 0) > 0) warnings.push("L’ancien journal Google Sheets ne sera pas rejoué.");
  if (!Array.isArray(rawTables.depenses)) warnings.push("Cet ancien export ne contient pas de table Dépenses : elle sera restaurée vide.");
  return { exportedAt: root.exportedAt, totalRows, counts, warnings };
}

function safeTheme(value: string | undefined): ThemeKey {
  return themeOptions.some((theme) => theme.key === value) ? (value as ThemeKey) : "mauve-froid";
}

function createBackupToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseCarrierNames(settings: Record<string, string>) {
  const candidates: string[] = [];
  try {
    const parsed = JSON.parse(settings.carrier_names || "[]");
    if (Array.isArray(parsed)) candidates.push(...parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    // Le nom historique reste disponible ci-dessous.
  }
  if (settings.carrier_name && settings.carrier_name !== "À configurer") candidates.push(settings.carrier_name);
  return candidates
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter((name, index, names) => name.length >= 2 && names.findIndex((item) => item.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr")) === index);
}

export default function DashboardClient() {
  const [active, setActive] = useState("Vue d’ensemble");
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalName>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EditableEntity | null>(null);
  const [stockSelection, setStockSelection] = useState<StockSelection>(null);
  const [inventorySelection, setInventorySelection] = useState<InventorySelection>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [authChecking, setAuthChecking] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [authConfigured, setAuthConfigured] = useState(true);

  const loadData = useCallback(async () => {
    setAuthChecking(true);
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/data");
      const body = (await response.json()) as Data & { error?: string };
      if (response.status === 401) {
        const authResponse = await fetch("/api/auth", { cache: "no-store" });
        const authBody = (await authResponse.json()) as { configured?: boolean; error?: string };
        if (!authResponse.ok) throw new Error(authBody.error || "La connexion est momentanément indisponible.");
        setAuthConfigured(Boolean(authBody.configured));
        setAuthRequired(true);
        return;
      }
      if (!response.ok) throw new Error(body.error || "Données indisponibles");
      setData(body);
      setAuthRequired(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Données indisponibles");
    } finally {
      setLoading(false);
      setAuthChecking(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);
  useEffect(() => {
    const clearPrintOrder = () => setPrintOrder(null);
    window.addEventListener("afterprint", clearPrintOrder);
    return () => window.removeEventListener("afterprint", clearPrintOrder);
  }, []);

  async function logout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setData(emptyData);
    setAuthRequired(true);
    setAuthConfigured(true);
  }

  async function submit(action: string, values: Record<string, FormDataEntryValue>) {
    setError("");
    const requestKey = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `mj-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const retrySafe = retrySafeMutationActions.has(action);

    const send = async (attempt = 0): Promise<{ response: Response; body: Data & { error?: string; message?: string; code?: string } }> => {
      try {
        const response = await fetch("/api/data", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, ...values, requestKey }),
        });
        const body = (await response.json()) as Data & { error?: string; message?: string; code?: string };
        if (!response.ok && retrySafe && body.code === "MUTATION_IN_PROGRESS" && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
          return send(attempt + 1);
        }
        return { response, body };
      } catch (networkError) {
        if (retrySafe && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
          return send(attempt + 1);
        }
        throw networkError;
      }
    };

    const { response, body } = await send();
    if (!response.ok) {
      const message = body.error || "Enregistrement impossible";
      setError(message);
      throw new Error(message);
    }
    setData(body);
    setModal(null);
    setSelectedOrder(null);
    setSelectedEntity(null);
    setStockSelection(null);
    setInventorySelection(null);
    const messages: Record<string, string> = {
      createMember: "Compte partenaire créé",
      resetMemberPassword: "Mot de passe remplacé",
      updateMember: "Droits du partenaire mis à jour",
      updateAccountSettings: "Compte principal mis à jour",
      updateSetting: "Réglage appliqué",
      updateAllocationPolicy: "Répartition financière recalculée",
      updateCarriers: "Liste des agences mise à jour",
      updateBackupToken: "Clé privée de sauvegarde créée",
      revokeBackupToken: "Sauvegarde Google Sheets désactivée",
      updateBackupWebhook: "Synchronisation instantanée connectée",
      createBackupNow: "Sauvegarde complète créée et contrôlée",
      verifyBackupNow: "Contrôle de sauvegarde terminé",
      restoreBackup: "Sauvegarde restaurée avec succès",
      importPortableExport: "Export complet restauré avec succès",
      resetBusinessValues: "Valeurs commerciales remises à zéro",
      deleteOrder: "Commande placée dans la corbeille pendant 90 jours",
      restoreOrder: "Commande restaurée",
      deleteOrderPermanently: "Commande supprimée définitivement",
      updateProduct: "Produit mis à jour",
      archiveProduct: "Produit archivé sans supprimer son historique",
      restoreProduct: "Produit restauré dans le catalogue interne",
      updateStockMovement: "Mouvement de stock mis à jour",
      deleteStockMovement: "Mouvement de stock supprimé",
      countInventory: "Inventaire enregistré et stock corrigé",
      startInventorySession: "Session d’inventaire démarrée",
      countInventorySessionProduct: "Produit compté et stock contrôlé",
      finalizeInventorySession: "Session d’inventaire clôturée",
      updateCustomer: "Client mis à jour",
      deleteCustomer: "Client supprimé",
      addSupplier: "Fournisseur créé",
      updateSupplier: "Fournisseur mis à jour",
      toggleSupplier: "Statut fournisseur mis à jour",
      addPurchaseOrder: "Bon de commande multi-produits créé",
      updatePurchase: "Bon de commande mis à jour",
      deletePurchase: "Bon de commande supprimé",
      addSupplierInvoice: "Facture fournisseur créée",
      updateSupplierInvoice: "Facture fournisseur mise à jour",
      deleteSupplierInvoice: "Facture fournisseur supprimée",
      addSupplierPayment: "Paiement fournisseur enregistré",
      deleteSupplierPayment: "Paiement fournisseur supprimé",
      addExpense: "Dépense enregistrée",
      updateExpense: "Dépense mise à jour",
      deleteExpense: "Dépense supprimée",
      addRecurringExpense: "Charge récurrente programmée",
      updateRecurringExpense: "Charge récurrente mise à jour",
      toggleRecurringExpense: "Statut de la charge récurrente mis à jour",
      receivePurchase: "Réception fournisseur enregistrée",
      updateAd: "Publicité mise à jour",
      deleteAd: "Publicité supprimée",
      updateCapital: "Mouvement de capital mis à jour",
      deleteCapital: "Mouvement de capital supprimé",
      authorizeCarrierDispatch: "Colis créé chez l’agence sélectionnée",
      syncCarriersNow: "Suivi des agences actualisé",
    };
    setNotice(body.message || messages[action] || "Enregistré avec succès");
    setTimeout(() => setNotice(""), 2500);
  }

  function requireEditAccess() {
    if (data.access.canEdit) return true;
    setActive("Paramètres");
    setError("Votre compte est en lecture seule. Demandez un rôle Éditeur à l’administrateur.");
    return false;
  }

  function openEntry(kind: ModalName) {
    if (requireEditAccess()) setModal(kind);
  }

  function openOrder(order: Order) {
    if (requireEditAccess()) setSelectedOrder(order);
  }

  function printOrderSlip(order: Order) {
    setPrintOrder(order);
    window.setTimeout(() => window.print(), 80);
  }

  function openStock(selection: StockSelection) {
    if (requireEditAccess()) setStockSelection(selection);
  }

  function openInventory(product: Product) {
    if (requireEditAccess()) setInventorySelection(product);
  }

  function openEntity(selection: EditableEntity) {
    if (requireEditAccess()) setSelectedEntity(selection);
  }

  async function deleteEntity(selection: EditableEntity) {
    if (!requireEditAccess()) return;
    if (selection.kind === "product") {
      if (selection.record.archivedAt) return;
      const confirmed = window.confirm(
        `Archiver le produit ${selection.record.name} ?\n\nSon historique sera conservé. L’archivage est refusé tant que son stock n’est pas à 0 ou qu’une réception fournisseur reste en attente. La boutique et les packs concernés seront désactivés.`,
      );
      if (!confirmed) return;
      try {
        await submit("archiveProduct", { id: String(selection.record.id) });
      } catch {
        // Le message d’erreur global est affiché par le tableau de bord.
      }
      return;
    }
    let action = "";
    let label = "";
    let warning = "";
    switch (selection.kind) {
      case "movement":
        action = "deleteStockMovement";
        label = `ce mouvement de stock de ${selection.record.quantity} unité(s)`;
        warning = " La quantité restante sera recalculée.";
        break;
      case "customer":
        action = "deleteCustomer";
        label = `le client ${selection.record.name}`;
        warning = " La suppression sera refusée si ce client possède encore des commandes.";
        break;
      case "purchase":
        action = "deletePurchase";
        label = `l’achat ${selection.record.item}`;
        warning = selection.record.receivedQuantity > 0 ? " Cet achat a déjà alimenté le stock et ne peut pas être supprimé." : "";
        break;
      case "expense":
        action = "deleteExpense";
        label = `la dépense ${selection.record.label}`;
        break;
      case "ad":
        action = "deleteAd";
        label = `la campagne ${selection.record.campaign}`;
        break;
      case "capital":
        action = "deleteCapital";
        label = `le mouvement ${selection.record.label}`;
        break;
    }
    const confirmed = window.confirm(`Supprimer définitivement ${label} ?${warning}\n\nCette action est irréversible.`);
    if (!confirmed) return;
    try {
      await submit(action, { id: String(selection.record.id) });
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    }
  }

  async function restoreProduct(product: Product) {
    if (!requireEditAccess() || !product.archivedAt) return;
    const confirmed = window.confirm(
      `Restaurer ${product.name} dans le catalogue interne ?\n\nIl ne sera pas republié automatiquement sur la boutique et les packs resteront désactivés.`,
    );
    if (!confirmed) return;
    try {
      await submit("restoreProduct", { id: String(product.id) });
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    }
  }

  async function deleteOrder(order: Order) {
    if (!requireEditAccess()) return;
    const confirmed = window.confirm(
      `Placer la commande ${order.orderRef} de ${order.customerName} dans la corbeille ?\n\nVous pourrez la restaurer pendant 90 jours.`,
    );
    if (!confirmed) return;
    try {
      await submit("deleteOrder", { id: String(order.id) });
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    }
  }

  const metrics = useMemo(() => {
    const safetyReserve = Math.max(0, Number(data.settings.safety_reserve) || 0);
    const todayKey = businessDateKey(new Date());
    const recognizedExpenses = data.expenses.filter((expense) => businessDateKey(expense.expenseDate) <= todayKey);
    const finance = calculateBusinessFinance({
      orders: data.orders,
      purchases: data.purchases,
      supplierInvoices: data.supplierInvoices,
      carrierSettlements: data.carrierSettlements,
      expenses: recognizedExpenses,
      ads: data.ads,
      capital: data.capital,
      safetyReserve,
    });
    const adRevenue = data.ads.reduce((sum, ad) => sum + ad.revenue, 0);
    const theoreticalTreasury = calculateTreasuryAccounts({
      orders: data.orders,
      purchases: data.purchases,
      supplierPayments: data.supplierPayments,
      expenses: recognizedExpenses,
      ads: data.ads,
      capital: data.capital,
      carrierSettlementAdjustment: data.carrierSettlements.reduce((sum, settlement) => sum + settlement.differenceAmount, 0),
    });
    const latestReconciliation = data.dailyClosings[0] || null;
    const reconciledTreasury = applyTreasuryReconciliation(theoreticalTreasury, latestReconciliation);
    const automaticAllocations = data.capital.filter((entry) => entry.isAutomatic);
    const theoreticalSalary = automaticAllocations
      .filter((entry) => entry.category === "Salaire personnel")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const theoreticalEmergency = automaticAllocations
      .filter((entry) => entry.category === "Fonds d’urgence")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const smartCapital = calculateSmartCapital({
      cash: reconciledTreasury.total,
      netProfit: finance.profit,
      unpaidPurchases: finance.unpaidPurchases,
      unpaidOperatingExpenses: finance.unpaidOperatingExpenses,
      safetyReserve,
      theoreticalReinvestment: finance.reinvestAllocation,
      theoreticalSalary,
      theoreticalEmergency,
    });
    return {
      revenue: finance.collected,
      shippingFees: finance.shippingCollected,
      collectionFees: finance.feesCollected,
      netCollected: finance.netCollected,
      profit: finance.profit,
      losses: finance.losses,
      adSpend: finance.adSpend,
      roas: finance.adSpend ? adRevenue / finance.adSpend : 0,
      cash: reconciledTreasury.total,
      theoreticalCash: theoreticalTreasury.total,
      reconciliationVariance: latestReconciliation?.totalVariance || 0,
      reconciliationDate: latestReconciliation?.closeDate || "",
      capitalNet: finance.manualCapitalNet,
      margin: finance.margin,
      reinvest: finance.reinvestAllocation,
      reinvestable: smartCapital.reinvestableNow,
      theoreticalSalary,
      theoreticalEmergency,
      salaryWithdrawable: smartCapital.withdrawableSalary,
      emergencyAvailable: smartCapital.emergencyAvailable,
      cashBackedProfit: smartCapital.cashBackedProfit,
      protectedTotal: smartCapital.protectedTotal,
      protectionShortfall: smartCapital.protectionShortfall,
      freeCashAfterProtection: smartCapital.freeCashAfterProtection,
      fundedEnvelopePool: smartCapital.fundedEnvelopePool,
      allocationFundingRate: smartCapital.allocationFundingRate,
      unallocatedFreeCash: smartCapital.unallocatedFreeCash,
      unpaidPurchases: finance.unpaidPurchases,
      operatingExpenses: finance.operatingExpenses,
      paidOperatingExpenses: finance.paidOperatingExpenses,
      unpaidOperatingExpenses: finance.unpaidOperatingExpenses,
      safetyReserve,
    };
  }, [data]);
  const delivery = useMemo(() => {
    const deliveryOrders = data.orders.filter((order) => order.fulfillmentType !== "Magasin physique");
    const count = (states: string[]) => deliveryOrders.filter((o) => states.includes(o.status)).length;
    return [
      { label: "Livrés", value: count(["Livrée"]), tone: "green" },
      {
        label: "En transit",
        value: count(["Expédiée", "En livraison"]),
        tone: "blue",
      },
      {
        label: "En attente",
        value: count(["En attente", "Confirmée", "Nouvelle"]),
        tone: "orange",
      },
      {
        label: "Retours / annulations",
        value: count(["Retour", "Annulée", "Retournée", "Refusée"]),
        tone: "red",
      },
    ];
  }, [data.orders]);

  const currentTheme = safeTheme(data.settings.theme);
  const carrierNames = parseCarrierNames(data.settings);

  if (authChecking) {
    return <main className="auth-shell auth-loading-shell"><Loading /></main>;
  }
  if (authRequired) {
    return <AuthPage configured={authConfigured} onAuthenticated={() => void loadData()} />;
  }
  const roleLabel = data.access.isOwner ? "Propriétaire principal" : data.access.role === "admin" ? "Administrateur" : data.access.role === "editor" ? "Éditeur" : "Lecture seule";

  return (
    <main className={`app-shell theme-${currentTheme}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-logo" src="/maison-jiya-logo.jpeg" alt="Logo Maison Jiya" />
          </span>
          <div>
            <strong>Maison Jiya</strong>
            <small>Gestion & opérations</small>
          </div>
        </div>
        <nav aria-label="Navigation principale">
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              <div className="nav-group-items">
                {group.items.map((item) => {
                  const index = navigation.indexOf(item);
                  return (
                    <button key={item} className={active === item ? "nav-item active" : "nav-item"} onClick={() => setActive(item)}>
                      <span className="nav-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="nav-label">{item}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <button
          type="button"
          className="connection-card connection-card-button"
          onClick={() => setActive("Paramètres")}
          aria-label="Configurer le transporteur dans Paramètres"
        >
          <span className="live-dot" />
          <div>
            <strong>Transporteur</strong>
            <small>{carrierNames.length > 1 ? `${carrierNames.length} agences configurées` : carrierNames[0] || "Configurer les agences"}</small>
          </div>
        </button>
        <div className="profile">
          <span className="avatar">{data.access.displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{data.access.displayName}</strong>
            <small>{roleLabel}</small>
          </div>
          <button className="logout-button" type="button" onClick={() => void logout()} aria-label="Se déconnecter">↗</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-copy">
            <p className="eyebrow">Maison Jiya · Gestion privée · MAD</p>
            <div className="topbar-title-row">
              <h1>{active}</h1>
              <span className="workspace-live-status"><i /> Données actives</span>
            </div>
            <p className="section-subtitle">{sectionDescriptions[active]}</p>
          </div>
          <div className="top-actions">
            <SectionSearch key={active} active={active} data={data} openOrder={openOrder} openEntity={openEntity} />
            {addableSections.has(active) && (
              <button className="primary-button top-primary-action" onClick={() => openEntry(active === "Produits" ? "product" : active === "Achats" ? "purchase" : active === "Factures fournisseurs" ? "supplierInvoice" : active === "Dépenses" ? "expense" : active === "Publicités" ? "ad" : active === "Capital" ? "capital" : "order")}>
                <span>{data.access.canEdit ? "＋" : "🔒"}</span> {data.access.canEdit ? addActionLabels[active] : "Lecture seule"}
              </button>
            )}
          </div>
        </header>
        {!loading && (
          <section className={`edit-access-strip ${data.access.canEdit ? "unlocked" : "locked"}`} aria-label="Session et droits d’accès">
            <div>
              <span className="access-icon" aria-hidden="true">{data.access.canEdit ? "✓" : "🔒"}</span>
              <div>
                <strong>Session sécurisée · {roleLabel}</strong>
                <small>Connecté comme {data.access.displayName} (@{data.access.username}). {data.access.canEdit ? "Vous pouvez ajouter et modifier les données." : "Vous pouvez consulter les données sans les modifier."}</small>
              </div>
            </div>
            <button className="access-action" type="button" onClick={() => void logout()}>Se déconnecter</button>
          </section>
        )}
        {notice && (
          <div className="toast success-toast">
            <span>✓ {notice}</span>
          </div>
        )}
        {error && (
          <div className="toast error-toast">
            <span>{error}</span>
            <button onClick={() => void loadData()}>Réessayer</button>
          </div>
        )}
        {loading ? <Loading /> : <Page active={active} setActive={setActive} data={data} metrics={metrics} delivery={delivery} open={openEntry} edit={openOrder} print={printOrderSlip} remove={deleteOrder} editEntity={openEntity} removeEntity={deleteEntity} restoreProduct={restoreProduct} moveStock={openStock} countInventory={openInventory} submit={submit} />}
      </section>
      {modal && <EntryModal kind={modal} carrierNames={carrierNames} products={data.products.filter((product) => !product.archivedAt)} suppliers={data.suppliers} purchases={data.purchases} supplierInvoices={data.supplierInvoices} ads={data.ads} close={() => setModal(null)} submit={submit} />}
      {selectedOrder && <OrderModal order={selectedOrder} history={data.orderStatusHistory.filter((entry) => entry.orderId === selectedOrder.id)} carrierNames={carrierNames} ads={data.ads} close={() => setSelectedOrder(null)} print={() => printOrderSlip(selectedOrder)} submit={submit} />}
      {selectedEntity && <EntityModal selection={selectedEntity} products={data.products.filter((product) => !product.archivedAt)} suppliers={data.suppliers} close={() => setSelectedEntity(null)} submit={submit} />}
      {stockSelection && <StockMovementModal selection={stockSelection} close={() => setStockSelection(null)} submit={submit} />}
      {inventorySelection && <InventoryCountModal product={inventorySelection} close={() => setInventorySelection(null)} submit={submit} />}
      {printOrder && <PrintOrderSheet order={printOrder} />}
    </main>
  );
}

function AuthPage({ configured, onAuthenticated }: { configured: boolean; onAuthenticated: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const confirmation = String(formData.get("confirmation") || "");
    if (!configured && password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: configured ? "login" : "bootstrap",
          username: formData.get("username"),
          displayName: formData.get("displayName"),
          password,
          confirmation,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Connexion impossible.");
      form.reset();
      onAuthenticated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Connexion impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="auth-shell theme-mauve-froid">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="auth-logo-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/maison-jiya-logo.jpeg" alt="Logo Maison Jiya" />
          </span>
          <div><strong>Maison Jiya</strong><small>Pilotage</small></div>
        </div>
        <div className="auth-heading">
          <span className="card-kicker">Espace sécurisé</span>
          <h1>{configured ? "Bon retour parmi nous" : "Créer le compte principal"}</h1>
          <p>{configured ? "Connectez-vous avec le nom d’utilisateur et le mot de passe remis par l’administrateur." : "Cette première étape crée votre compte administrateur. Vos partenaires pourront ensuite avoir leurs propres accès."}</p>
        </div>
        <form className="auth-form" onSubmit={(event) => void authenticate(event)}>
          {!configured && (
            <label>
              <span>Nom affiché</span>
              <input name="displayName" type="text" defaultValue="Maison Jiya" minLength={2} maxLength={80} required autoComplete="name" />
            </label>
          )}
          <label>
            <span>Nom d’utilisateur</span>
            <input name="username" type="text" defaultValue={configured ? "" : "Maison Jiya"} minLength={2} maxLength={50} required autoComplete="username" autoCapitalize="none" />
          </label>
          <label>
            <span>Mot de passe</span>
            <input name="password" type="password" minLength={9} maxLength={128} required autoComplete={configured ? "current-password" : "new-password"} />
            {!configured && <small>Minimum 9 caractères, avec au moins une lettre et un chiffre.</small>}
          </label>
          {!configured && (
            <label>
              <span>Confirmer le mot de passe</span>
              <input name="confirmation" type="password" minLength={9} maxLength={128} required autoComplete="new-password" />
            </label>
          )}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="primary-button" type="submit" disabled={saving}>{saving ? "Vérification…" : configured ? "Se connecter" : "Créer mon compte sécurisé"}</button>
        </form>
        <p className="auth-security-note">Session sécurisée pendant 12 heures · 5 essais maximum · aucun compte ChatGPT requis</p>
      </section>
      <aside className="auth-showcase" aria-hidden="true">
        <span>MAISON JIYA · MAD</span>
        <h2>Toute votre activité, dans un espace simple et protégé.</h2>
        <div className="auth-benefits"><i>Commandes</i><i>Stock</i><i>Capital</i><i>Assistant IA</i><i>Partenaires</i></div>
      </aside>
    </main>
  );
}

function Loading() {
  return (
    <div className="loading-state">
      <span />
      <p>Préparation de votre espace de pilotage…</p>
    </div>
  );
}

function SectionSearch({ active, data, openOrder, openEntity }: { active: string; data: Data; openOrder: (order: Order) => void; openEntity: (selection: EditableEntity) => void }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("fr");
  const searchablePages = new Set(["Commandes", "Produits", "Réapprovisionnement", "Colis", "Clients", "Fournisseurs", "Achats", "Factures fournisseurs", "Dépenses", "Publicités", "Capital", "Corbeille"]);
  const results = useMemo<Array<{ key: string; label: string; detail: string; order?: Order; entity?: EditableEntity }>>(() => {
    if (normalized.length < 2) return [];
    const matches = (values: Array<string | number | null | undefined>) => values.some((value) => String(value || "").toLocaleLowerCase("fr").includes(normalized));

    if (active === "Commandes") {
      return data.orders
        .filter((order) => matches([order.orderRef, order.customerName, order.phone, order.city, order.products, order.trackingNumber, order.campaign, order.source, order.status]))
        .map((order) => ({ key: `order-${order.id}`, label: order.orderRef, detail: `${order.customerName || "Cliente"} · ${order.products}`, order }))
        .slice(0, 10);
    }
    if (active === "Produits") {
      return data.products
        .filter((product) => matches([product.productCode, product.name, product.category, product.stockQuantity]))
        .map((product) => ({ key: `product-${product.id}`, label: product.name, detail: `${product.productCode} · stock ${product.stockQuantity}`, entity: { kind: "product" as const, record: product } }))
        .slice(0, 10);
    }
    if (active === "Réapprovisionnement") {
      return data.stockRecommendations
        .filter((row) => matches([row.productCode, row.productName, row.category, row.supplier, row.status]))
        .map((row) => {
          const product = data.products.find((item) => item.id === row.productId);
          return {
            key: `reorder-${row.productId}`,
            label: row.productName,
            detail: `${row.supplier} · ${row.status} · conseillé ${row.recommendedQuantity}`,
            entity: product ? ({ kind: "product" as const, record: product }) : undefined,
          };
        })
        .slice(0, 10);
    }
    if (active === "Colis") {
      return data.orders
        .filter((order) => order.fulfillmentType !== "Magasin physique")
        .filter((order) => matches([order.orderRef, order.customerName, order.city, order.trackingNumber, order.carrier, order.status]))
        .map((order) => ({ key: `shipment-${order.id}`, label: order.orderRef, detail: `${order.carrier} · ${order.trackingNumber || "Sans numéro"} · ${order.status}`, order }))
        .slice(0, 10);
    }
    if (active === "Clients") {
      return data.customers
        .filter((customer) => matches([customer.name, customer.phone, customer.city]))
        .map((customer) => ({ key: `customer-${customer.id}`, label: customer.name, detail: `${customer.phone} · ${customer.city}`, entity: { kind: "customer" as const, record: customer } }))
        .slice(0, 10);
    }
    if (active === "Fournisseurs") {
      return data.suppliers
        .filter((supplier) => matches([supplier.name, supplier.contactName, supplier.phone, supplier.whatsapp, supplier.city, supplier.paymentTerms, supplier.notes]))
        .map((supplier) => ({
          key: `supplier-${supplier.id}`,
          label: supplier.name,
          detail: `${supplier.city || "Ville non renseignée"} · délai ${supplier.leadTimeDays} j · ${supplier.isActive ? "Actif" : "Inactif"}`,
          entity: { kind: "supplier" as const, record: supplier },
        }))
        .slice(0, 10);
    }
    if (active === "Achats") {
      return data.purchases
        .filter((purchase) => matches([purchase.purchaseRef, purchase.supplier, purchase.item, purchase.productCode, purchase.productName, purchase.procurementStatus, purchase.paymentStatus, purchase.totalCost, purchase.quantity, purchase.receivedAt ? "réceptionné" : "à réceptionner"]))
        .map((purchase) => ({ key: `purchase-${purchase.id}`, label: purchase.item, detail: `${purchase.supplier} · ${money(purchase.totalCost)} · ${purchase.paymentStatus}`, entity: { kind: "purchase" as const, record: purchase } }))
        .slice(0, 10);
    }
    if (active === "Factures fournisseurs") {
      return data.supplierInvoices
        .filter((invoice) => matches([invoice.invoiceNumber, invoice.purchaseRef, invoice.supplierName, invoice.paymentStatus, invoice.dueDate, invoice.totalAmount, invoice.remainingAmount]))
        .map((invoice) => ({ key: `supplier-invoice-${invoice.id}`, label: invoice.invoiceNumber, detail: `${invoice.supplierName || "Fournisseur"} · ${invoice.purchaseRef} · reste ${money(invoice.remainingAmount)}` }))
        .slice(0, 10);
    }
    if (active === "Dépenses") {
      return data.expenses
        .filter((expense) => matches([expense.category, expense.label, expense.account, expense.paymentStatus, expense.expenseDate, expense.note, expense.amount]))
        .map((expense) => ({ key: `expense-${expense.id}`, label: expense.label, detail: `${expense.category} · ${money(expense.amount)} · ${expense.paymentStatus}`, entity: { kind: "expense" as const, record: expense } }))
        .slice(0, 10);
    }
    if (active === "Publicités") {
      return data.ads
        .filter((ad) => matches([ad.campaign, ad.platform, ad.externalId, ad.source, ad.performanceDate]))
        .map((ad) => ({ key: `ad-${ad.id}`, label: ad.campaign, detail: `${ad.platform} · ${money(ad.spend)} · ${ad.source}`, entity: { kind: "ad" as const, record: ad } }))
        .slice(0, 10);
    }
    if (active === "Capital") {
      return data.capital
        .filter((entry) => matches([entry.label, entry.category, entry.account, entry.direction, entry.amount, entry.entryDate]))
        .map((entry) => ({
          key: `capital-${entry.id}`,
          label: entry.label || entry.category,
          detail: `${entry.direction} · ${money(entry.amount)} · ${entry.account}`,
          entity: entry.isAutomatic ? undefined : ({ kind: "capital" as const, record: entry }),
        }))
        .slice(0, 10);
    }
    if (active === "Corbeille") {
      return data.trash
        .filter((order) => matches([order.orderRef, order.customerName, order.phone, order.city, order.products, order.trackingNumber]))
        .map((order) => ({ key: `trash-${order.id}`, label: order.orderRef, detail: `${order.customerName || "Cliente"} · ${order.products}`, order }))
        .slice(0, 10);
    }
    return [];
  }, [active, data, normalized]);

  if (!searchablePages.has(active)) return null;

  return (
    <div className="global-search section-search">
      <label>
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Rechercher dans ${active}…`}
          aria-label={`Recherche dans ${active}`}
        />
      </label>
      {normalized.length >= 2 && (
        <div className="global-search-results">
          {results.length ? results.map((result) => (
            <button
              type="button"
              key={result.key}
              onClick={() => {
                setQuery("");
                if (result.order) openOrder(result.order);
                else if (result.entity) openEntity(result.entity);
              }}
            >
              <strong>{result.label}</strong>
              <small>{result.detail}</small>
            </button>
          )) : <p>Aucun résultat dans {active}</p>}
        </div>
      )}
    </div>
  );
}

function Page({
  active,
  setActive,
  data,
  metrics,
  delivery,
  open,
  edit,
  print,
  remove,
  editEntity,
  removeEntity,
  restoreProduct,
  moveStock,
  countInventory,
  submit,
}: {
  active: string;
  setActive: (v: string) => void;
  data: Data;
  metrics: {
    revenue: number;
    shippingFees: number;
    collectionFees: number;
    netCollected: number;
    profit: number;
    losses: number;
    adSpend: number;
    roas: number;
    cash: number;
    theoreticalCash: number;
    reconciliationVariance: number;
    reconciliationDate: string;
    capitalNet: number;
    margin: number;
    reinvest: number;
    reinvestable: number;
    theoreticalSalary: number;
    theoreticalEmergency: number;
    salaryWithdrawable: number;
    emergencyAvailable: number;
    cashBackedProfit: number;
    protectedTotal: number;
    protectionShortfall: number;
    freeCashAfterProtection: number;
    fundedEnvelopePool: number;
    allocationFundingRate: number;
    unallocatedFreeCash: number;
    unpaidPurchases: number;
    operatingExpenses: number;
    paidOperatingExpenses: number;
    unpaidOperatingExpenses: number;
    safetyReserve: number;
  };
  delivery: { label: string; value: number; tone: string }[];
  open: (m: ModalName) => void;
  edit: (o: Order) => void;
  print: (o: Order) => void;
  remove: (o: Order) => void;
  editEntity: (selection: EditableEntity) => void;
  removeEntity: (selection: EditableEntity) => void;
  restoreProduct: (product: Product) => void;
  moveStock: (selection: StockSelection) => void;
  countInventory: (product: Product) => void;
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  const allocationPolicy = allocationPolicyFromSettings(data.settings);
  if (active === "Commandes") return <OrdersPage orders={data.orders} onAdd={() => open("order")} onEdit={edit} onPrint={print} onDelete={remove} />;
  if (active === "Inventaire") return <InventoryPage products={data.products} sessions={data.inventorySessions} counts={data.inventoryCounts} canEdit={data.access.canEdit} submit={submit} />;
  if (active === "Produits") return <ProductsPage products={data.products} orders={data.orders} movements={data.stockMovements} inventoryCounts={data.inventoryCounts} canEdit={data.access.canEdit} submit={submit} onAdd={() => open("product")} onMove={moveStock} onCount={countInventory} onEdit={editEntity} onDelete={removeEntity} onRestore={restoreProduct} />;
  if (active === "Réapprovisionnement") return <ReorderingPage data={data} metrics={metrics} submit={submit} onEditProduct={editEntity} />;
  if (active === "Colis") return <ShippingPage orders={data.orders} history={data.orderStatusHistory} settings={data.settings} onEdit={edit} onPrint={print} onDelete={remove} />;
  if (active === "Règlements transporteurs") return <CarrierSettlementsPage data={data} submit={submit} />;
  if (active === "Clients") return <CustomersPage customers={data.customers} orders={data.orders} onEdit={editEntity} onDelete={removeEntity} />;
  if (active === "Fournisseurs") return <SuppliersPage suppliers={data.suppliers} purchases={data.purchases} supplierInvoices={data.supplierInvoices} supplierPayments={data.supplierPayments} canEdit={data.access.canEdit} submit={submit} onAdd={() => open("supplier")} onEdit={editEntity} />;
  if (active === "Achats") return <PurchasesPage purchases={data.purchases} supplierInvoices={data.supplierInvoices} products={data.products.filter((product) => !product.archivedAt)} suppliers={data.suppliers} canEdit={data.access.canEdit} submit={submit} onAdd={() => open("purchase")} onEdit={editEntity} onDelete={removeEntity} />;
  if (active === "Factures fournisseurs") return <SupplierInvoicesPage invoices={data.supplierInvoices} payments={data.supplierPayments} canEdit={data.access.canEdit} onAdd={() => open("supplierInvoice")} submit={submit} />;
  if (active === "Dépenses") return <ExpensesPage expenses={data.expenses} recurringExpenses={data.recurringExpenses} canEdit={data.access.canEdit} submit={submit} onAdd={() => open("expense")} onEdit={editEntity} onDelete={removeEntity} />;
  if (active === "Publicités") return <AdsPage ads={data.ads} settings={data.settings} access={data.access} submit={submit} onAdd={() => open("ad")} onEdit={editEntity} onDelete={removeEntity} />;
  if (active === "Capital") return <CapitalPage data={data} metrics={metrics} onAdd={() => open("capital")} onEdit={editEntity} onDelete={removeEntity} />;
  if (active === "Trésorerie") return <CashflowForecastPage data={data} metrics={metrics} submit={submit} />;
  if (active === "Clôture") return <DailyClosingPage data={data} currentCash={metrics.cash} submit={submit} />;
  if (active === "Rapports") return <ReportsPage data={data} />;
  if (active === "Assistant IA") return <AiPage canEdit={data.access.canEdit} submit={submit} onOrderCreated={() => setActive("Commandes")} />;
  if (active === "Mode entraînement") return <TrainingPage onExit={() => setActive("Vue d’ensemble")} />;
  if (active === "Corbeille") return <TrashPage orders={data.trash} canRestore={data.access.isOwner} submit={submit} />;
  if (active === "Paramètres") return <SettingsPage settings={data.settings} currentTheme={safeTheme(data.settings.theme)} accountName={data.settings.account_name || "Maison Jiya"} accountEmail={data.settings.account_email || ""} carriers={parseCarrierNames(data.settings)} backupConfigured={data.settings.backup_configured === "true"} backupSheetUrl={data.settings.backup_sheet_url || ""} backupWebhookUrl={data.settings.backup_webhook_url || ""} backupWebhookConfigured={data.settings.backup_webhook_configured === "true"} backupHealthStatus={data.settings.backup_health_status || ""} backupHealthCheckedAt={data.settings.backup_health_checked_at || ""} backupHealthCreatedAt={data.settings.backup_health_backup_created_at || ""} backupHealthRecordCount={Number(data.settings.backup_health_record_count || 0)} backupHealthLastError={data.settings.backup_health_last_error || ""} googleSheetsSync={data.googleSheetsSync} senditApiConfigured={data.settings.sendit_api_configured === "true"} senditApiVerified={data.settings.sendit_api_verified === "true"} senditApiCheckedAt={data.settings.sendit_api_checked_at || ""} senditApiLastError={data.settings.sendit_api_last_error || ""} senditWebhookConfigured={data.settings.sendit_webhook_configured === "true"} senditWebhookVerifiedAt={data.settings.sendit_webhook_verified_at || ""} forceLogApiConfigured={data.settings.forcelog_api_configured === "true"} forceLogApiVerified={data.settings.forcelog_api_verified === "true"} forceLogApiCheckedAt={data.settings.forcelog_api_checked_at || ""} forceLogApiLastError={data.settings.forcelog_api_last_error || ""} carrierLastSyncAt={data.settings.carrier_last_sync_at || ""} access={data.access} members={data.members} auditLogs={data.auditLogs} backups={data.backups} products={data.products} submit={submit} />;
  const deliveryOrderCount = data.orders.filter((order) => order.fulfillmentType !== "Magasin physique").length;
  const total = Math.max(1, deliveryOrderCount);
  return (
    <>
      <section className="hero-grid">
        <article className="hero-card">
          <div className="hero-heading">
            <div>
              <p>{metrics.reconciliationDate ? "Trésorerie réelle estimée" : "Trésorerie théorique"}</p>
              <h2>{money(metrics.cash)}</h2>
            </div>
            <span className="trend positive">À piloter</span>
          </div>
          <div className="sparkline">
            {[31, 38, 34, 43, 49, 47, 55, 58, 64, 68, 72, 82].map((h, i) => (
              <span key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="hero-foot">
            <span>
              {metrics.reconciliationDate ? "Dernier contrôle" : "Capital net"} <strong>{metrics.reconciliationDate ? dateLabel(metrics.reconciliationDate) : money(metrics.capitalNet)}</strong>
            </span>
            <span>
              Virements nets <strong>{money(metrics.netCollected)}</strong>
            </span>
            <span>
              Marge nette <strong>{metrics.margin.toFixed(1)}%</strong>
            </span>
          </div>
        </article>
        <article className="reinvest-card">
          <span className="card-kicker">Répartition automatique</span>
          <h2>{money(metrics.reinvestable)}</h2>
          <p>Réinvestissable maintenant après protection des achats fournisseurs, des charges à payer et de la réserve de sécurité.</p>
          <div className="allocation-bar">
            <span className="stock" />
            <span className="ads" />
            <span className="reserve" />
          </div>
          <div className="allocation-legend">
            <span>
              <i className="stock-dot" />
              Réinvestir {allocationPolicy.reinvestment}%
            </span>
            <span>
              <i className="ads-dot" />
              Salaire {allocationPolicy.salary}%
            </span>
            <span>
              <i className="reserve-dot" />
              Urgence {allocationPolicy.emergency}%
            </span>
          </div>
        </article>
      </section>
      <section className="kpi-grid">
        <Kpi label="CA encaissé" value={money(metrics.revenue)} detail={`Transport et frais déduits : ${money(metrics.shippingFees + metrics.collectionFees)}`} />
        <Kpi label="Bénéfice net estimé" value={money(metrics.profit)} detail={`Après ${money(metrics.operatingExpenses)} de charges d’exploitation`} />
        <Kpi label="Dépenses Meta saisies" value={money(metrics.adSpend)} detail={`ROAS · ${metrics.roas.toFixed(2)}×`} />
        <Kpi label="Pertes & retours" value={money(metrics.losses)} detail="Coûts déclarés" danger />
      </section>
      <section className="content-grid">
        <article className="panel orders-panel">
          <PanelHead kicker="Opérations" title="Commandes récentes" action="Voir tout →" onClick={() => setActive("Commandes")} />
          <OrderTable orders={data.orders.slice(0, 5)} onEdit={edit} onPrint={print} onDelete={remove} />
        </article>
        <article className="panel delivery-panel">
          <PanelHead kicker="Livraison" title="État des colis" total={String(deliveryOrderCount)} />
          <div className="delivery-list">
            {delivery.map((r) => (
              <div className="delivery-row" key={r.label}>
                <div>
                  <span>{r.label}</span>
                  <strong>{r.value}</strong>
                </div>
                <div className="progress">
                  <span className={r.tone} style={{ width: `${(r.value / total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <button className="secondary-button" onClick={() => setActive("Colis")}>
            Ouvrir le suivi colis
          </button>
        </article>
      </section>
    </>
  );
}

function SettingsPage({ settings, currentTheme, accountName, accountEmail, carriers, backupConfigured, backupSheetUrl, backupWebhookUrl, backupWebhookConfigured, backupHealthStatus, backupHealthCheckedAt, backupHealthCreatedAt, backupHealthRecordCount, backupHealthLastError, googleSheetsSync, senditApiConfigured, senditApiVerified, senditApiCheckedAt, senditApiLastError, senditWebhookConfigured, senditWebhookVerifiedAt, forceLogApiConfigured, forceLogApiVerified, forceLogApiCheckedAt, forceLogApiLastError, carrierLastSyncAt, access, members, auditLogs, backups, products, submit }: {
  settings: Record<string, string>;
  currentTheme: ThemeKey;
  accountName: string;
  accountEmail: string;
  carriers: string[];
  backupConfigured: boolean;
  backupSheetUrl: string;
  backupWebhookUrl: string;
  backupWebhookConfigured: boolean;
  backupHealthStatus: string;
  backupHealthCheckedAt: string;
  backupHealthCreatedAt: string;
  backupHealthRecordCount: number;
  backupHealthLastError: string;
  googleSheetsSync: GoogleSheetsSync;
  senditApiConfigured: boolean;
  senditApiVerified: boolean;
  senditApiCheckedAt: string;
  senditApiLastError: string;
  senditWebhookConfigured: boolean;
  senditWebhookVerifiedAt: string;
  forceLogApiConfigured: boolean;
  forceLogApiVerified: boolean;
  forceLogApiCheckedAt: string;
  forceLogApiLastError: string;
  carrierLastSyncAt: string;
  access: Data["access"];
  members: Member[];
  auditLogs: AuditLog[];
  backups: DailyBackup[];
  products: Product[];
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  const [pendingTheme, setPendingTheme] = useState<ThemeKey | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingAllocation, setSavingAllocation] = useState(false);
  const [savingCarrier, setSavingCarrier] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [savingBackup, setSavingBackup] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [savingFullBackup, setSavingFullBackup] = useState(false);
  const [checkingBackup, setCheckingBackup] = useState(false);
  const [portableImportContent, setPortableImportContent] = useState("");
  const [portableImportFileName, setPortableImportFileName] = useState("");
  const [portableImportPreview, setPortableImportPreview] = useState<PortableExportPreview | null>(null);
  const [portableImportError, setPortableImportError] = useState("");
  const [importingPortableExport, setImportingPortableExport] = useState(false);
  const [resettingBusinessValues, setResettingBusinessValues] = useState(false);
  const [retryingSheets, setRetryingSheets] = useState(false);
  const [backupToken, setBackupToken] = useState("");
  const [copyState, setCopyState] = useState("");
  const selectedTheme = themeOptions.find((theme) => theme.key === currentTheme) || themeOptions[0];
  const allocationPolicy = allocationPolicyFromSettings(settings);
  const syncState = googleSheetsSync.state;
  const syncStatusLabel = syncState.status === "synced"
    ? "À jour"
    : syncState.status === "processing"
      ? "Synchronisation…"
      : syncState.status === "retrying"
        ? "Réessai programmé"
        : syncState.status === "unconfigured"
          ? "À configurer"
          : "En attente";

  async function applyTheme(theme: ThemeKey) {
    if (!access.canEdit || theme === currentTheme || pendingTheme) return;
    setPendingTheme(theme);
    try {
      await submit("updateSetting", { key: "theme", value: theme });
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setPendingTheme(null);
    }
  }

  async function addCarrier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingCarrier || !access.isOwner) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const carrierName = String(formData.get("carrierName") || "").trim();
    setSavingCarrier(true);
    try {
      await submit("updateCarriers", {
        carriers: JSON.stringify([...carriers, carrierName]),
      });
      form.reset();
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setSavingCarrier(false);
    }
  }

  async function generateBackupToken() {
    if (savingBackup || !access.isOwner) return;
    if (backupConfigured && !window.confirm("Créer une nouvelle clé ?\n\nL’ancienne clé ne fonctionnera plus et devra être remplacée dans Google Sheets.")) return;
    const token = createBackupToken();
    setSavingBackup(true);
    setCopyState("");
    try {
      await submit("updateBackupToken", { token });
      setBackupToken(token);
    } catch {
      setBackupToken("");
    } finally {
      setSavingBackup(false);
    }
  }

  async function copyBackupToken() {
    if (!backupToken) return;
    try {
      await navigator.clipboard.writeText(backupToken);
      setCopyState("Clé copiée");
    } catch {
      setCopyState("Sélectionnez puis copiez la clé");
    }
  }

  async function revokeBackupToken() {
    if (savingBackup || !access.isOwner || !backupConfigured) return;
    if (!window.confirm("Désactiver la sauvegarde Google Sheets ?\n\nLe classeur gardera les données déjà copiées, mais les prochaines synchronisations seront bloquées.")) return;
    setSavingBackup(true);
    try {
      await submit("revokeBackupToken", {});
      setBackupToken("");
      setCopyState("");
    } finally {
      setSavingBackup(false);
    }
  }

  async function saveBackupWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingWebhook || !access.isOwner) return;
    const formData = new FormData(event.currentTarget);
    setSavingWebhook(true);
    try {
      await submit("updateBackupWebhook", { url: formData.get("webhookUrl") || "" });
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setSavingWebhook(false);
    }
  }

  async function retryGoogleSheetsSync() {
    if (retryingSheets || !access.isOwner) return;
    setRetryingSheets(true);
    try {
      await submit("retryGoogleSheetsSync", {});
    } finally {
      setRetryingSheets(false);
    }
  }

  async function createFullBackup() {
    if (savingFullBackup || !access.isOwner) return;
    setSavingFullBackup(true);
    try {
      await submit("createBackupNow", {});
    } finally {
      setSavingFullBackup(false);
    }
  }

  async function verifyRecoveryBackup() {
    if (checkingBackup || !access.isOwner) return;
    setCheckingBackup(true);
    try {
      await submit("verifyBackupNow", {});
    } finally {
      setCheckingBackup(false);
    }
  }

  async function loadPortableExport(file: File | undefined) {
    if (!file || !access.isOwner || importingPortableExport) return;
    setPortableImportError("");
    setPortableImportPreview(null);
    setPortableImportFileName(file.name);
    try {
      const content = await file.text();
      const preview = inspectPortableExportFile(content);
      setPortableImportContent(content);
      setPortableImportPreview(preview);
    } catch (caught) {
      setPortableImportContent("");
      setPortableImportPreview(null);
      setPortableImportError(caught instanceof Error ? caught.message : "Export invalide.");
    }
  }

  async function restorePortableExport() {
    if (!portableImportPreview || !portableImportContent || !access.isOwner || importingPortableExport) return;
    const typed = window.prompt(
      `Restaurer l’export du ${dateTimeLabel(portableImportPreview.exportedAt)} ?\n\nLes données métier actuelles seront remplacées par cet export. Une sauvegarde de sécurité sera créée avant l’import.\n\nLes comptes, mots de passe, e-mail principal, sessions et secrets actuels ne seront pas remplacés.\n\nTapez RESTAURER pour confirmer.`,
    );
    if (typed !== "RESTAURER") return;
    setImportingPortableExport(true);
    try {
      await submit("importPortableExport", { portableExport: portableImportContent });
      setPortableImportContent("");
      setPortableImportFileName("");
      setPortableImportPreview(null);
      setPortableImportError("");
    } finally {
      setImportingPortableExport(false);
    }
  }

  async function restoreFullBackup(backup: DailyBackup) {
    if (savingFullBackup || !access.isOwner) return;
    const confirmed = window.confirm(
      `Restaurer la sauvegarde du ${dateLabel(backup.createdAt)} ?\n\nLes données commerciales actuelles seront remplacées par cette copie. Une sauvegarde de sécurité sera créée juste avant. Les comptes et mots de passe ne seront pas modifiés.`,
    );
    if (!confirmed) return;
    setSavingFullBackup(true);
    try {
      await submit("restoreBackup", { backupId: String(backup.id) });
    } finally {
      setSavingFullBackup(false);
    }
  }

  async function resetBusinessValues() {
    if (resettingBusinessValues || !access.isOwner) return;
    const typed = window.prompt(
      "Remettre à zéro toutes les valeurs commerciales ?\n\nSeront supprimés : commandes, clients, achats, dépenses, publicités, capital et historiques associés.\n\nProduits, quantités, mouvements de stock et inventaires seront conservés.\n\nUne sauvegarde restaurable sera créée juste avant.\n\nTapez REINITIALISER pour confirmer.",
    );
    if (typed !== "REINITIALISER") return;
    const confirmed = window.confirm(
      "Dernière confirmation : supprimer maintenant toutes les valeurs commerciales ?\n\nLe stock et les produits resteront inchangés.",
    );
    if (!confirmed) return;
    setResettingBusinessValues(true);
    try {
      await submit("resetBusinessValues", { confirmation: "REINITIALISER" });
    } finally {
      setResettingBusinessValues(false);
    }
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingAccount || !access.canEdit || !access.isOwner) return;
    const formData = new FormData(event.currentTarget);
    setSavingAccount(true);
    try {
      await submit("updateAccountSettings", {
        accountName: formData.get("accountName") || "",
        accountEmail: formData.get("accountEmail") || "",
        displayName: formData.get("displayName") || "",
        username: formData.get("username") || "",
      });
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setSavingAccount(false);
    }
  }

  async function saveAllocationPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingAllocation || !access.isOwner) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const reinvestment = Number(formData.get("reinvestment") || 0);
    const salary = Number(formData.get("salary") || 0);
    const emergency = Number(formData.get("emergency") || 0);
    if (![reinvestment, salary, emergency].every((value) => Number.isInteger(value) && value >= 0 && value <= 100)) {
      form.reportValidity();
      return;
    }
    if (reinvestment + salary + emergency !== 100) {
      window.alert("La répartition doit totaliser exactement 100 %.");
      return;
    }
    setSavingAllocation(true);
    try {
      await submit("updateAllocationPolicy", {
        reinvestment: String(reinvestment),
        salary: String(salary),
        emergency: String(emergency),
      });
    } finally {
      setSavingAllocation(false);
    }
  }

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingMember || !access.isOwner) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const confirmation = String(formData.get("confirmation") || "");
    const confirmationInput = form.elements.namedItem("confirmation") as HTMLInputElement | null;
    if (password !== confirmation) {
      confirmationInput?.setCustomValidity("Les deux mots de passe ne correspondent pas.");
      confirmationInput?.reportValidity();
      return;
    }
    confirmationInput?.setCustomValidity("");
    setSavingMember(true);
    try {
      await submit("createMember", {
        displayName: formData.get("displayName") || "",
        username: formData.get("username") || "",
        role: formData.get("role") || "viewer",
        password,
      });
      form.reset();
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setSavingMember(false);
    }
  }

  return (
    <div className="settings-page">
      <section className="settings-intro">
        <div>
          <span className="card-kicker">Personnalisation</span>
          <h2>Choisissez l’ambiance de Maison Jiya</h2>
          <p>Le thème sélectionné s’applique à toute la plateforme et reste enregistré pour vos prochaines connexions.</p>
        </div>
        <div className="current-theme-badge">
          <span>Thème actuel</span>
          <strong>{selectedTheme.name}</strong>
          <small>{selectedTheme.mode}</small>
        </div>
      </section>

      <section className="settings-panel carrier-settings-panel" id="carrier">
        <div className="carrier-settings-head">
          <div className="carrier-settings-copy">
            <span className="carrier-settings-icon" aria-hidden="true">T</span>
            <div>
              <span className="card-kicker">Livraison</span>
              <h2>Agences de transport</h2>
              <p>Ajoutez toutes les agences utilisées par Maison Jiya, puis choisissez l’agence lors de chaque commande.</p>
            </div>
          </div>
          <span className="carrier-count">{carriers.length} agence{carriers.length > 1 ? "s" : ""}</span>
        </div>
        <div className="carrier-management-grid">
          <form className="carrier-settings-form" onSubmit={(event) => void addCarrier(event)}>
            <label>
              <span>Ajouter une agence</span>
              <input name="carrierName" type="text" minLength={2} maxLength={80} required placeholder="Ex. Cathedis, Ozon Express…" disabled={!access.isOwner} />
              <small>Vous pourrez la sélectionner dans chaque nouvelle commande.</small>
            </label>
            <button className="primary-button" type="submit" disabled={savingCarrier || !access.isOwner}>
              {savingCarrier ? "Ajout…" : "＋ Ajouter l’agence"}
            </button>
            {!access.isOwner && <p>Seul l’administrateur peut gérer les agences.</p>}
          </form>
          <div className="carrier-agency-list">
            {carriers.length ? carriers.map((carrier) => (
              <CarrierAgencyRow key={carrier} name={carrier} carriers={carriers} canEdit={access.isOwner} submit={submit} />
            )) : (
              <div className="carrier-empty"><strong>Aucune agence enregistrée</strong><small>Ajoutez votre première agence avec le formulaire.</small></div>
            )}
          </div>
        </div>
        <div className="carrier-api-grid">
          <article className={`carrier-api-card ${senditApiVerified ? "active" : ""}`}>
            <div><span className="carrier-api-logo">S</span><div><strong>Sendit automatique</strong><small>{!senditApiConfigured ? "Clés API à ajouter dans Cloudflare" : senditApiVerified ? `API vérifiée${senditApiCheckedAt ? ` · ${dateTimeLabel(senditApiCheckedAt)}` : ""}` : senditApiLastError ? "Clés présentes · dernière vérification en erreur" : "Clés présentes · vérification en attente"}</small></div></div>
            <span className={`backup-status ${senditApiVerified ? "active" : ""}`}>{!senditApiConfigured ? "À configurer" : senditApiVerified ? "API vérifiée" : senditApiLastError ? "Erreur" : "À vérifier"}</span>
            <ul>
              <li className={senditApiVerified ? "done" : ""}>{senditApiVerified ? "Authentification Sendit vérifiée en direct" : "Authentification Sendit non encore vérifiée"}</li>
              <li className={senditApiVerified ? "done" : ""}>Création de colis uniquement après « Autoriser et créer le colis »</li>
              <li className={senditWebhookVerifiedAt ? "done" : ""}>{senditWebhookVerifiedAt ? `Webhook signé réellement reçu · ${dateTimeLabel(senditWebhookVerifiedAt)}` : senditWebhookConfigured ? "Secret webhook configuré · aucun événement signé reçu pour l’instant" : "Secret webhook à configurer"}</li>
            </ul>
            {senditApiLastError && <small className="meta-sync-error">{senditApiLastError}</small>}
            <label><span>URL à mettre dans le webhook Sendit</span><input readOnly value="https://maison-jiya-site.maisonjya1.workers.dev/api/integrations/sendit/webhook" onFocus={(event) => event.currentTarget.select()} /></label>
            <small>Le badge webhook passe au vert seulement après réception réelle d’un événement Sendit avec signature valide.</small>
          </article>
          <article className={`carrier-api-card ${forceLogApiVerified ? "active" : ""}`}>
            <div><span className="carrier-api-logo">F</span><div><strong>ForceLog automatique</strong><small>{!forceLogApiConfigured ? "Clé API à ajouter dans Cloudflare" : forceLogApiVerified ? `API vérifiée${forceLogApiCheckedAt ? ` · ${dateTimeLabel(forceLogApiCheckedAt)}` : ""}` : forceLogApiLastError ? "Clé présente · dernière vérification en erreur" : "Clé présente · vérification en attente"}</small></div></div>
            <span className={`backup-status ${forceLogApiVerified ? "active" : ""}`}>{!forceLogApiConfigured ? "À configurer" : forceLogApiVerified ? "API vérifiée" : forceLogApiLastError ? "Erreur" : "À vérifier"}</span>
            <ul>
              <li className={forceLogApiVerified ? "done" : ""}>{forceLogApiVerified ? "Clé ForceLog vérifiée sur l’API Cities" : "Connexion ForceLog non encore vérifiée"}</li>
              <li className={forceLogApiVerified ? "done" : ""}>Création de colis uniquement après votre autorisation</li>
              <li className={forceLogApiVerified ? "done" : ""}>Suivi et paiement contrôlés automatiquement toutes les 30 minutes</li>
            </ul>
            {forceLogApiLastError && <small className="meta-sync-error">{forceLogApiLastError}</small>}
            <small>La clé reste dans Cloudflare et n’apparaît jamais dans le site ni dans Google Sheets.</small>
          </article>
        </div>
        <div className="carrier-sync-actions">
          {carrierLastSyncAt && <p className="carrier-sync-stamp">Dernière activité transporteur enregistrée : {dateTimeLabel(carrierLastSyncAt)}</p>}
          {access.isOwner && <button type="button" className="secondary-button" onClick={() => void submit("syncCarriersNow", {})}>Vérifier les connexions et actualiser</button>}
        </div>
      </section>

      <section className="settings-panel sheets-backup-panel" id="google-sheets">
        <div className="sheets-backup-head">
          <div className="sheets-backup-title">
            <span className="sheets-backup-icon" aria-hidden="true">▦</span>
            <div>
              <span className="card-kicker">Sauvegarde indépendante</span>
              <h2>Google Sheets automatique</h2>
              <p>Les données sont copiées dans des onglets séparés et restent enregistrées dans le classeur, même si le site devient indisponible.</p>
            </div>
          </div>
          <span className={`backup-status ${backupConfigured ? "active" : ""}`}>{backupConfigured ? "Clé active" : "À configurer"}</span>
        </div>

        <div className="sheets-backup-grid">
          <div className="backup-key-card">
            <span className="card-kicker">1 · Connexion sécurisée</span>
            <h3>{backupConfigured ? "La sauvegarde est autorisée" : "Générez votre clé privée"}</h3>
            <p>La clé n’est jamais stockée en clair dans le site. Elle est affichée uniquement au moment de sa création.</p>
            {backupToken && (
              <div className="backup-token-box">
                <label><span>Votre nouvelle clé privée</span><input value={backupToken} readOnly onFocus={(event) => event.currentTarget.select()} /></label>
                <button className="secondary-button" type="button" onClick={() => void copyBackupToken()}>{copyState || "Copier la clé"}</button>
                <small>Collez maintenant cette clé dans l’onglet Configuration, cellule B6. Si vous la perdez, générez-en une nouvelle.</small>
              </div>
            )}
            <div className="backup-actions">
              <button className="primary-button" type="button" onClick={() => void generateBackupToken()} disabled={savingBackup || !access.isOwner}>
                {savingBackup ? "Préparation…" : backupConfigured ? "Régénérer la clé" : "Générer la clé privée"}
              </button>
              {backupConfigured && <button className="danger-text-button" type="button" onClick={() => void revokeBackupToken()} disabled={savingBackup || !access.isOwner}>Désactiver</button>}
            </div>
            {!access.isOwner && <small>Seul l’administrateur peut gérer la clé de sauvegarde.</small>}
          </div>

          <div className="backup-steps-card">
            <span className="card-kicker">2 · Classeur préparé</span>
            <h3>Sauvegarde Maison Jiya</h3>
            <ol>
              <li><span>1</span><p><strong>Ouvrez le classeur</strong><small>Tous les onglets et le code de synchronisation sont déjà préparés.</small></p></li>
              <li><span>2</span><p><strong>Collez la clé dans Configuration!B6</strong><small>Gardez cette clé privée et ne la partagez pas avec vos partenaires.</small></p></li>
              <li><span>3</span><p><strong>Suivez l’onglet Installation</strong><small>Autorisez Google une seule fois. Le déclencheur périodique restera actif comme sauvegarde de secours.</small></p></li>
            </ol>
            <a className="primary-button backup-sheet-link" href={backupSheetUrl} target="_blank" rel="noreferrer">Ouvrir le Google Sheet ↗</a>
          </div>

          <form className="backup-key-card" onSubmit={(event) => void saveBackupWebhook(event)}>
            <span className="card-kicker">3 · Synchronisation instantanée</span>
            <h3>{backupWebhookConfigured ? "Connexion immédiate active" : "Connectez le Web App Apps Script"}</h3>
            <p>L’adresse Apps Script est conservée côté serveur et n’est jamais envoyée aux comptes partenaires. Après chaque enregistrement, le serveur demande immédiatement la mise à jour du classeur.</p>
            <label>
              <span>URL du Web App Apps Script</span>
              <input
                name="webhookUrl"
                type="url"
                defaultValue={backupWebhookUrl}
                placeholder="https://script.google.com/macros/s/…/exec"
                required
                disabled={!access.isOwner}
              />
              <small>Gardez cette adresse privée. Le déclencheur périodique reste actif si Google est momentanément indisponible.</small>
            </label>
            <button className="primary-button" type="submit" disabled={savingWebhook || !access.isOwner}>
              {savingWebhook ? "Connexion…" : backupWebhookConfigured ? "Mettre à jour la connexion" : "Activer la synchronisation immédiate"}
            </button>
            {!access.isOwner && <small>Seul l’administrateur peut connecter Apps Script.</small>}
          </form>
        </div>

        <div className="sheets-sync-monitor">
          <div className="sheets-sync-monitor-head">
            <div>
              <span className="card-kicker">File durable D1</span>
              <h3>État de la synchronisation</h3>
              <p>Chaque modification est d’abord conservée dans Maison Jiya. Google Sheets est ensuite mis à jour, avec reprise automatique en cas d’échec.</p>
            </div>
            <span className={`backup-status ${syncState.status === "synced" ? "active" : ""}`}>{syncStatusLabel}</span>
          </div>
          <div className="sheets-sync-stats">
            <div><span>Dernière réussite</span><strong>{syncState.lastSyncAt ? dateTimeLabel(syncState.lastSyncAt) : "Pas encore"}</strong></div>
            <div><span>Modifications en attente</span><strong>{Math.max(0, syncState.pendingChanges).toLocaleString("fr-MA")}</strong></div>
            <div><span>Tentatives</span><strong>{syncState.attemptCount.toLocaleString("fr-MA")}</strong></div>
            <div><span>Prochaine tentative</span><strong>{syncState.nextAttemptAt ? dateTimeLabel(syncState.nextAttemptAt) : "Automatique"}</strong></div>
          </div>
          {syncState.lastError && <p className="sheets-sync-error">{syncState.lastError}</p>}
          <div className="sheets-sync-actions">
            <button className="secondary-button" type="button" onClick={() => void retryGoogleSheetsSync()} disabled={retryingSheets || !access.isOwner || !backupConfigured || !backupWebhookConfigured}>
              {retryingSheets ? "Nouvelle tentative…" : "Réessayer maintenant"}
            </button>
            <small>Les réessais continuent sans limite interne jusqu’au retour de Google ou à la désactivation de la connexion.</small>
          </div>
          <details className="sheets-sync-log">
            <summary>Journal de synchronisation · {googleSheetsSync.logs.length} événement{googleSheetsSync.logs.length === 1 ? "" : "s"}</summary>
            <div className="sheets-sync-log-list">
              {googleSheetsSync.logs.length ? googleSheetsSync.logs.map((entry) => (
                <article key={entry.id}>
                  <div><strong>Version {entry.version}</strong><small>{entry.eventId}</small></div>
                  <div>
                    <span>{entry.status === "synced" ? "Synchronisée" : entry.status === "covered" ? "Incluse dans une version récente" : entry.status === "retrying" ? "À réessayer" : "En cours"}</span>
                    <small>{dateTimeLabel(entry.lastAttemptAt)} · {entry.attemptCount} tentative{entry.attemptCount === 1 ? "" : "s"}</small>
                    {entry.lastError && <small className="sheets-sync-log-error">{entry.lastError}</small>}
                  </div>
                </article>
              )) : <p>Aucune tentative enregistrée pour le moment.</p>}
            </div>
          </details>
        </div>

        <div className="backup-privacy-note">
          <strong>Données protégées</strong>
          <span>Les mots de passe, les clés de session et les codes de sécurité ne sont jamais exportés. Les partenaires apparaissent seulement avec leur nom, leur rôle et l’état du compte.</span>
        </div>
      </section>

      <details className="settings-panel settings-disclosure continuity-panel" id="backups">
        <summary className="settings-disclosure-summary">
          <div>
            <span className="card-kicker">Continuité des données</span>
            <h2>Sauvegardes quotidiennes restaurables</h2>
            <p>{backups.length} sauvegarde{backups.length === 1 ? "" : "s"} disponible{backups.length === 1 ? "" : "s"} · cliquez pour afficher</p>
          </div>
          <span className="settings-disclosure-toggle" aria-hidden="true">⌄</span>
        </summary>
        <div className="settings-disclosure-body">
          <div className="settings-disclosure-actions">
            <p>Une copie complète des données commerciales est créée chaque jour et conservée pendant 90 jours. Google Sheets fournit en plus une copie lisible hors D1. Les comptes, mots de passe et clés privées restent séparés.</p>
            <div className="sheets-backup-grid">
              <div className="backup-key-card">
                <span className="card-kicker">1 · Copie D1 restaurable</span>
                <h3>{backupHealthStatus === "verified" ? "Dernière sauvegarde contrôlée" : backupHealthStatus === "error" ? "Contrôle à corriger" : "Contrôle en attente"}</h3>
                <span className={`backup-status ${backupHealthStatus === "verified" ? "active" : ""}`}>{backupHealthStatus === "verified" ? "Structure vérifiée" : backupHealthStatus === "error" ? "Erreur" : "À vérifier"}</span>
                {backupHealthCreatedAt && <small>Sauvegarde : {dateTimeLabel(backupHealthCreatedAt)} · {backupHealthRecordCount.toLocaleString("fr-MA")} enregistrement(s)</small>}
                {backupHealthCheckedAt && <small>Dernier contrôle non destructif : {dateTimeLabel(backupHealthCheckedAt)}</small>}
                {backupHealthLastError && <small className="meta-sync-error">{backupHealthLastError}</small>}
              </div>
              <div className="backup-key-card">
                <span className="card-kicker">2 · Copie indépendante hors D1</span>
                <h3>Google Sheets</h3>
                <span className={`backup-status ${syncState.status === "synced" ? "active" : ""}`}>{syncStatusLabel}</span>
                <small>{syncState.status === "synced" && syncState.lastSyncAt ? `Dernière copie confirmée : ${dateTimeLabel(syncState.lastSyncAt)}` : "La copie externe reste distincte des sauvegardes D1."}</small>
              </div>
              <div className="backup-key-card">
                <span className="card-kicker">3 · Test de restauration</span>
                <h3>Chemin de restauration testé en CI</h3>
                <span className="backup-status active">Test isolé</span>
                <small>Les tests reconstruisent une base isolée et vérifient le rollback en cas d’erreur. La production n’est jamais écrasée pour un simple test.</small>
              </div>
            </div>
            <div className="backup-export-actions">
              {access.isOwner && <a className="secondary-button" href="/api/export?format=json">Exporter tout en JSON</a>}
              {access.isOwner && <a className="secondary-button" href="/api/export?format=csv">Exporter les CSV (.zip)</a>}
              <button className="secondary-button" type="button" onClick={() => void verifyRecoveryBackup()} disabled={checkingBackup || !access.isOwner}>
                {checkingBackup ? "Contrôle…" : "✓ Vérifier la dernière sauvegarde"}
              </button>
              <button className="primary-button" type="button" onClick={() => void createFullBackup()} disabled={savingFullBackup || !access.isOwner}>
                {savingFullBackup ? "Préparation…" : "＋ Sauvegarder maintenant"}
              </button>
            </div>
            {access.isOwner && (
              <div className="sheets-backup-grid">
                <div className="backup-key-card">
                  <span className="card-kicker">4 · Réimportation complète</span>
                  <h3>Restaurer depuis un export JSON</h3>
                  <small>Utilisez un fichier « maison-jiya-export-AAAA-MM-JJ.json ». Le fichier est contrôlé avant toute modification.</small>
                  <input
                    type="file"
                    accept=".json,application/json"
                    disabled={importingPortableExport}
                    onChange={(event) => void loadPortableExport(event.target.files?.[0])}
                  />
                  {portableImportFileName && <small>Fichier : {portableImportFileName}</small>}
                  {portableImportError && <small className="meta-sync-error">{portableImportError}</small>}
                  {portableImportPreview && (
                    <>
                      <span className="backup-status active">Export reconnu</span>
                      <small>
                        {dateTimeLabel(portableImportPreview.exportedAt)} · {portableImportPreview.totalRows.toLocaleString("fr-MA")} ligne(s) · {Number(portableImportPreview.counts.produits || 0).toLocaleString("fr-MA")} produit(s) · {Number(portableImportPreview.counts.commandes || 0).toLocaleString("fr-MA")} commande(s)
                      </small>
                      {portableImportPreview.warnings.map((warning) => <small key={warning}>{warning}</small>)}
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => void restorePortableExport()}
                        disabled={importingPortableExport}
                      >
                        {importingPortableExport ? "Restauration…" : "Restaurer cet export"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          {access.isOwner ? (
            <div className="backup-history-list">
              {backups.length ? backups.slice(0, 12).map((backup) => (
                <article className="backup-history-row" key={backup.id}>
                  <span className="backup-history-icon" aria-hidden="true">↻</span>
                  <div>
                    <strong>{dateTimeLabel(backup.createdAt)}</strong>
                    <small>{backup.reason} · {backup.recordCount.toLocaleString("fr-MA")} enregistrements</small>
                  </div>
                  <button className="secondary-button" type="button" onClick={() => void restoreFullBackup(backup)} disabled={savingFullBackup}>Restaurer</button>
                </article>
              )) : <div className="empty-state"><strong>Première sauvegarde en préparation</strong><p>Elle apparaîtra ici après l’actualisation de la page.</p></div>}
            </div>
          ) : <p className="settings-readonly-note">Seul l’administrateur peut consulter et restaurer les sauvegardes.</p>}
        </div>
      </details>

      <section className="settings-panel business-reset-panel" id="business-reset">
        <div className="business-reset-copy">
          <span className="card-kicker">Remise à zéro contrôlée</span>
          <h2>Repartir de zéro sur les valeurs commerciales</h2>
          <p>Supprime commandes, clients, achats, dépenses, publicités, capital et historiques associés. Les produits, quantités, mouvements de stock et inventaires restent conservés.</p>
          <small>Une sauvegarde restaurable est créée automatiquement juste avant la suppression.</small>
        </div>
        <button
          className="business-reset-button"
          type="button"
          onClick={() => void resetBusinessValues()}
          disabled={resettingBusinessValues || !access.isOwner}
        >
          {resettingBusinessValues ? "Remise à zéro…" : "Remettre les valeurs à zéro"}
        </button>
      </section>

      <details className="settings-panel settings-disclosure audit-panel" id="audit">
        <summary className="settings-disclosure-summary">
          <div>
            <span className="card-kicker">Traçabilité</span>
            <h2>Journal des actions</h2>
            <p>{auditLogs.length} action{auditLogs.length === 1 ? "" : "s"} récente{auditLogs.length === 1 ? "" : "s"} · cliquez pour afficher</p>
          </div>
          <span className="settings-disclosure-toggle" aria-hidden="true">⌄</span>
        </summary>
        <div className="settings-disclosure-body">
          <p className="settings-disclosure-description">Le compte utilisé, l’action et l’heure sont enregistrés automatiquement pour chaque modification.</p>
          {access.isOwner ? (
            <div className="audit-list">
              {auditLogs.length ? auditLogs.slice(0, 30).map((entry) => (
                <article className="audit-row" key={entry.id}>
                  <span className="audit-avatar">{entry.displayName.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{entry.displayName}</strong>
                    <small>{entry.action} · {entry.entityType}{entry.entityLabel ? ` · ${entry.entityLabel}` : entry.entityId ? ` #${entry.entityId}` : ""}</small>
                  </div>
                  <time dateTime={entry.createdAt}>{dateTimeLabel(entry.createdAt)}</time>
                </article>
              )) : <div className="empty-state"><strong>Aucune action enregistrée</strong><p>Les prochaines modifications apparaîtront ici.</p></div>}
            </div>
          ) : <p className="settings-readonly-note">Le journal détaillé est réservé au propriétaire principal.</p>}
          </div>
      </details>

      <section className="settings-panel security-settings-panel" id="security">
        <div className="security-overview">
          <span className="security-shield active" aria-hidden="true">✓</span>
          <div>
            <span className="card-kicker">Accès et sécurité</span>
            <h2>Comptes partenaires sécurisés</h2>
            <p>Chaque personne se connecte avec son propre nom d’utilisateur et son propre mot de passe. Aucun compte ChatGPT ni adresse e-mail n’est nécessaire.</p>
            <div className="security-badges">
              <span>Mot de passe haché et salé</span>
              <span>5 essais maximum</span>
              <span>Session 12 heures</span>
            </div>
          </div>
        </div>

        <div className="security-forms">
          {access.isOwner ? (
            <form className="security-form member-create-form" onSubmit={(event) => void createMember(event)}>
              <div>
                <strong>Ajouter un partenaire</strong>
                <small>Choisissez exactement ce que cette personne pourra faire.</small>
              </div>
              <div className="member-create-grid">
                <label><span>Nom affiché</span><input name="displayName" type="text" minLength={2} maxLength={80} required placeholder="Ex. Salma" /></label>
                <label><span>Nom d’utilisateur</span><input name="username" type="text" minLength={2} maxLength={50} required autoCapitalize="none" placeholder="Ex. salma" /></label>
                <label>
                  <span>Rôle</span>
                  <select name="role" defaultValue="editor">
                    <option value="editor">Éditeur — peut ajouter et modifier</option>
                    <option value="viewer">Lecture seule — peut seulement consulter</option>
                    <option value="admin">Administrateur — droits métier étendus</option>
                  </select>
                </label>
                <label><span>Mot de passe</span><input name="password" type="password" minLength={9} maxLength={128} required autoComplete="new-password" /></label>
                <label><span>Confirmer</span><input name="confirmation" type="password" minLength={9} maxLength={128} required autoComplete="new-password" onInput={(event) => event.currentTarget.setCustomValidity("")} /></label>
              </div>
              <small className="password-rule">Au moins 9 caractères, avec une lettre et un chiffre.</small>
              <button className="primary-button" type="submit" disabled={savingMember}>{savingMember ? "Création…" : "Créer le compte partenaire"}</button>
            </form>
          ) : (
            <div className="owner-security-note">
              <strong>Votre rôle : {access.role === "admin" ? "Administrateur" : access.role === "editor" ? "Éditeur" : "Lecture seule"}</strong>
              <p>Seul le propriétaire principal peut créer des partenaires, modifier leurs rôles ou remplacer leurs mots de passe.</p>
            </div>
          )}
        </div>
      </section>

      {access.isOwner && (
        <section className="settings-panel members-panel">
          <div className="settings-panel-head">
            <div><span className="card-kicker">Équipe</span><h2>{members.length} compte{members.length > 1 ? "s" : ""}</h2></div>
            <p>Les mots de passe ne sont jamais affichés. Vous pouvez seulement les remplacer.</p>
          </div>
          <div className="member-list">
            {members.map((member) => <MemberCard key={member.id} member={member} currentUsername={access.username} submit={submit} />)}
          </div>
        </section>
      )}

      <section className="settings-panel account-settings-panel">
        <div className="account-identity">
          <span className="account-logo-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/maison-jiya-logo.jpeg" alt="Logo Maison Jiya" />
          </span>
          <div>
            <span className="card-kicker">Compte principal</span>
            <h2>{accountName}</h2>
            <p>{accountEmail || "E-mail privé à configurer"}</p>
      <small>Profil principal affiché dans la plateforme</small>
          </div>
        </div>
        <form className="account-settings-form" key={`${accountName}-${accountEmail}-${access.username}-${access.displayName}`} onSubmit={(event) => void saveAccount(event)}>
          <label>
            <span>Nom de la marque</span>
            <input name="accountName" type="text" minLength={2} maxLength={80} defaultValue={accountName} required autoComplete="organization" disabled={!access.canEdit || !access.isOwner} />
          </label>
          <label>
            <span>Adresse e-mail principale</span>
            <input name="accountEmail" type="email" maxLength={254} defaultValue={accountEmail} required autoComplete="email" disabled={!access.canEdit || !access.isOwner} />
          </label>
          <label>
            <span>Nom affiché du compte principal</span>
            <input name="displayName" type="text" minLength={2} maxLength={80} defaultValue={access.displayName} required autoComplete="name" disabled={!access.isOwner} />
          </label>
          <label>
            <span>Nom d’utilisateur de connexion</span>
            <input name="username" type="text" minLength={2} maxLength={50} defaultValue={access.username} required autoComplete="username" autoCapitalize="none" disabled={!access.isOwner} />
          </label>
          <div className="account-form-footer">
            <p>Ces informations sont modifiables uniquement par le propriétaire principal. Si vous changez le nom d’utilisateur de connexion, utilisez le nouveau nom dès la prochaine session.</p>
            <button className="primary-button" type="submit" disabled={savingAccount || !access.canEdit || !access.isOwner}>{savingAccount ? "Enregistrement…" : "Enregistrer le compte"}</button>
          </div>
        </form>
      </section>

      {access.isOwner && (
        <section className="settings-panel account-settings-panel">
          <div className="settings-panel-head">
            <div>
              <span className="card-kicker">Pilotage financier</span>
              <h2>Répartition automatique de la marge encaissée</h2>
            </div>
            <p>Ces trois enveloppes doivent toujours totaliser 100 %. Toute modification recalcule uniquement les écritures automatiques, jamais vos mouvements manuels.</p>
          </div>
          <form
            className="account-settings-form"
            key={`${allocationPolicy.reinvestment}-${allocationPolicy.salary}-${allocationPolicy.emergency}`}
            onSubmit={(event) => void saveAllocationPolicy(event)}
          >
            <label>
              <span>Réinvestissement</span>
              <input name="reinvestment" type="number" min="0" max="100" step="1" defaultValue={allocationPolicy.reinvestment} required />
              <small>Part conservée pour réinvestir dans l’activité.</small>
            </label>
            <label>
              <span>Salaire personnel</span>
              <input name="salary" type="number" min="0" max="100" step="1" defaultValue={allocationPolicy.salary} required />
              <small>Part théorique affectée au salaire personnel.</small>
            </label>
            <label>
              <span>Fonds d’urgence</span>
              <input name="emergency" type="number" min="0" max="100" step="1" defaultValue={allocationPolicy.emergency} required />
              <small>Part protégée pour les imprévus.</small>
            </label>
            <div className="account-form-footer">
              <p>Configuration active : {allocationPolicy.reinvestment}% / {allocationPolicy.salary}% / {allocationPolicy.emergency}%.</p>
              <button className="primary-button" type="submit" disabled={savingAllocation}>
                {savingAllocation ? "Recalcul…" : "Enregistrer la répartition"}
              </button>
            </div>
          </form>
        </section>
      )}

      <ImportOrdersPanel products={products} canEdit={access.canEdit} submit={submit} />

      <section className="settings-panel">
        <div className="settings-panel-head">
          <div>
            <span className="card-kicker">Couleurs de l’interface</span>
            <h2>5 thèmes disponibles</h2>
          </div>
          <p>Vous pouvez changer de thème à tout moment.</p>
        </div>
        <div className="theme-grid" role="radiogroup" aria-label="Choisir le thème de la plateforme">
          {themeOptions.map((theme) => {
            const selected = currentTheme === theme.key;
            const pending = pendingTheme === theme.key;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className={`theme-choice ${selected ? "selected" : ""}`}
                key={theme.key}
                disabled={!access.canEdit || Boolean(pendingTheme)}
                onClick={() => void applyTheme(theme.key)}
              >
                <span className={`theme-mini-preview preview-${theme.key}`} aria-hidden="true">
                  <i className="preview-sidebar">MJ</i>
                  <i className="preview-content">
                    <b />
                    <em />
                    <small />
                  </i>
                </span>
                <span className="theme-choice-copy">
                  <span className="theme-choice-title">
                    <strong>{theme.name}</strong>
                    <small>{theme.mode}</small>
                  </span>
                  <span className="theme-description">{theme.description}</span>
                  <span className="theme-swatches" aria-hidden="true">
                    {theme.colors.map((color) => <i key={color} style={{ backgroundColor: color }} />)}
                  </span>
                </span>
                <span className="theme-state">{pending ? "Application…" : selected ? "✓ Actif" : "Choisir"}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const importColumns = ["productCode", "customerName", "phone", "city", "address", "quantity", "saleAmount", "source", "fulfillmentType", "status", "paymentStatus", "campaign", "carrier", "shippingCost", "adCost", "fees"];
function parseDelimitedTable(text: string, aliases: Record<string, string>) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let current = "", row: string[] = [], quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(current.trim()); current = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      current = ""; row = [];
    } else current += char;
  }
  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLocaleLowerCase("fr");
  const headers = rows[0].map((header) => aliases[normalize(header)] || header.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function parseDelimitedOrders(text: string) {
  return parseDelimitedTable(text, {
    idproduit: "productCode", produit: "productCode", productcode: "productCode", client: "customerName", nomclient: "customerName", customername: "customerName",
    telephone: "phone", phone: "phone", ville: "city", city: "city", adresse: "address", address: "address", quantite: "quantity", quantity: "quantity",
    prixvente: "saleAmount", montant: "saleAmount", saleamount: "saleAmount", source: "source", mode: "fulfillmentType", modedevente: "fulfillmentType", fulfillmenttype: "fulfillmentType",
    statut: "status", status: "status", paiement: "paymentStatus", paymentstatus: "paymentStatus", campagne: "campaign", campaign: "campaign", agence: "carrier", carrier: "carrier",
    livraison: "shippingCost", shippingcost: "shippingCost", publicite: "adCost", adcost: "adCost", frais: "fees", fees: "fees",
  });
}

function parseDelimitedProducts(text: string) {
  const rows = parseDelimitedTable(text, {
    idproduct: "productCode", idproduit: "productCode", productcode: "productCode", sku: "productCode", reference: "productCode",
    nomduproduit: "name", nomproduit: "name", produit: "name", name: "name",
    categorie: "category", category: "category",
    prixdachatdh: "purchasePrice", prixachat: "purchasePrice", purchaseprice: "purchasePrice", coutdachat: "purchasePrice",
    prixdeventedh: "salePrice", prixvente: "salePrice", saleprice: "salePrice",
    prixdeventeminimumdh: "minimumSalePrice", prixminimum: "minimumSalePrice", minimumsaleprice: "minimumSalePrice",
    quantitestockinitial: "initialQuantity", quantiteinitiale: "initialQuantity", stockinitial: "initialQuantity", initialquantity: "initialQuantity",
    stockrestant: "stockRemaining", quantiterestante: "stockRemaining", stockremaining: "stockRemaining",
    seuilalertestock: "stockAlertThreshold", seuilstock: "stockAlertThreshold", stockalertthreshold: "stockAlertThreshold",
    couvertureciblejours: "reorderCoverDays", couverturejours: "reorderCoverDays", reordercoverdays: "reorderCoverDays",
  });
  return rows.filter((row) => String(row.productCode || "").trim() || String(row.name || "").trim());
}

function ImportOrdersPanel({ products, canEdit, submit }: { products: Product[]; canEdit: boolean; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseDelimitedOrders(content), [content]);
  function downloadTemplate() {
    const exampleCode = products[0]?.productCode || "MJ-001";
    const csv = `${importColumns.join(";")}\n${[exampleCode, "Cliente Exemple", "0612345678", "Casablanca", "Adresse complète", "1", products[0]?.salePrice || "199", "WhatsApp", "Livraison", "En attente", "À encaisser", "", "Sendit", "0", "0", "0"].join(";")}\n`;
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "modele-commandes-maison-jiya.csv"; link.click(); URL.revokeObjectURL(url);
  }
  async function importRows() {
    if (!parsed.length || !canEdit || saving) return;
    setSaving(true);
    try {
      await submit("importOrders", { rows: JSON.stringify(parsed) });
      setContent("");
    } finally { setSaving(false); }
  }
  return (
    <section className="settings-panel import-orders-panel">
      <div className="settings-panel-head"><div><span className="card-kicker">Importation</span><h2>Excel ou Google Sheets</h2></div><p>Jusqu’à 200 commandes par import.</p></div>
      <div className="import-orders-grid">
        <div><h3>1 · Préparer le tableau</h3><p>Téléchargez le modèle, remplissez-le dans Excel ou Google Sheets, puis enregistrez-le en CSV. Vous pouvez aussi copier directement les cellules depuis Google Sheets.</p><button type="button" className="secondary-button" onClick={downloadTemplate}>↓ Télécharger le modèle CSV</button></div>
        <div><h3>2 · Charger ou coller</h3><input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" disabled={!canEdit} onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(setContent); }} /><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Collez ici les cellules copiées depuis Google Sheets…" disabled={!canEdit} /><div className="import-preview"><span>{parsed.length} ligne{parsed.length === 1 ? "" : "s"} reconnue{parsed.length === 1 ? "" : "s"}</span><button type="button" className="primary-button" disabled={!parsed.length || !canEdit || saving} onClick={() => void importRows()}>{saving ? "Importation…" : "Importer les commandes"}</button></div></div>
      </div>
      <small>Colonnes obligatoires : ID produit, client, téléphone, ville, quantité et prix de vente. Le stock et l’historique sont mis à jour automatiquement.</small>
    </section>
  );
}

function CarrierAgencyRow({ name, carriers, canEdit, submit }: {
  name: string;
  carriers: string[];
  canEdit: boolean;
  submit: (action: string, values: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function renameCarrier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || saving) return;
    const formData = new FormData(event.currentTarget);
    const nextName = String(formData.get("carrierName") || "").trim();
    setSaving(true);
    try {
      await submit("updateCarriers", {
        carriers: JSON.stringify(carriers.map((carrier) => carrier === name ? nextName : carrier)),
        renameFrom: name,
        renameTo: nextName,
      });
      setEditing(false);
    } catch {
      setSaving(false);
    }
  }

  async function removeCarrier() {
    if (!canEdit || saving || !window.confirm(`Supprimer l’agence « ${name} » de la liste ?\n\nLes anciennes commandes garderont le nom de cette agence.`)) return;
    setSaving(true);
    try {
      await submit("updateCarriers", {
        carriers: JSON.stringify(carriers.filter((carrier) => carrier !== name)),
      });
    } catch {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form className="carrier-agency-edit" onSubmit={(event) => void renameCarrier(event)}>
        <label><span>Nouveau nom</span><input name="carrierName" type="text" minLength={2} maxLength={80} defaultValue={name} required autoFocus /></label>
        <div><button type="button" className="cancel-button" onClick={() => setEditing(false)}>Annuler</button><button className="primary-button" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button></div>
      </form>
    );
  }

  return (
    <article className="carrier-agency-card">
      <span className="carrier-agency-mark" aria-hidden="true">T</span>
      <div><strong>{name}</strong><small>Disponible dans les commandes</small></div>
      {canEdit && <RecordActions label={`l’agence ${name}`} onEdit={() => setEditing(true)} onDelete={() => void removeCarrier()} />}
    </article>
  );
}

function MemberCard({ member, currentUsername, submit }: {
  member: Member;
  currentUsername: string;
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const isCurrent = member.username === currentUsername;

  async function updateMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || isCurrent) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const activeInput = form.elements.namedItem("isActive") as HTMLInputElement | null;
    setSaving(true);
    try {
      await submit("updateMember", {
        memberId: String(member.id),
        role: formData.get("role") || member.role,
        isActive: activeInput?.checked ? "true" : "false",
      });
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetting || isCurrent) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const confirmation = String(formData.get("confirmation") || "");
    const confirmationInput = form.elements.namedItem("confirmation") as HTMLInputElement | null;
    if (password !== confirmation) {
      confirmationInput?.setCustomValidity("Les deux mots de passe ne correspondent pas.");
      confirmationInput?.reportValidity();
      return;
    }
    confirmationInput?.setCustomValidity("");
    setResetting(true);
    try {
      await submit("resetMemberPassword", { memberId: String(member.id), password, confirmation });
      form.reset();
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setResetting(false);
    }
  }

  const roleLabel = member.isOwner ? "Propriétaire principal" : member.role === "admin" ? "Administrateur" : member.role === "editor" ? "Éditeur" : "Lecture seule";
  return (
    <article className={`member-card ${member.isActive ? "" : "inactive"}`}>
      <div className="member-card-head">
        <span className="member-avatar">{member.displayName.slice(0, 1).toUpperCase()}</span>
        <div><strong>{member.displayName}</strong><small>@{member.username} · {roleLabel}{isCurrent ? " · Vous" : ""}</small></div>
        <span className={`member-status ${member.isActive ? "active" : ""}`}>{member.isActive ? "Actif" : "Suspendu"}</span>
      </div>
      <form className="member-rights-form" onSubmit={(event) => void updateMember(event)}>
        <label><span>Rôle</span><select name="role" defaultValue={member.role} disabled={isCurrent || member.isOwner}><option value="admin">Administrateur</option><option value="editor">Éditeur</option><option value="viewer">Lecture seule</option></select></label>
        <label className="member-active-toggle"><input name="isActive" type="checkbox" defaultChecked={member.isActive} disabled={isCurrent || member.isOwner} /><span>Compte actif</span></label>
        <button className="secondary-button" type="submit" disabled={saving || isCurrent}>{saving ? "Mise à jour…" : isCurrent ? "Compte principal" : "Enregistrer les droits"}</button>
      </form>
      {!isCurrent && (
        <form className="member-password-form" onSubmit={(event) => void resetPassword(event)}>
          <label><span>Nouveau mot de passe</span><input name="password" type="password" minLength={9} maxLength={128} required autoComplete="new-password" /></label>
          <label><span>Confirmer</span><input name="confirmation" type="password" minLength={9} maxLength={128} required autoComplete="new-password" onInput={(event) => event.currentTarget.setCustomValidity("")} /></label>
          <button className="secondary-button" type="submit" disabled={resetting}>{resetting ? "Remplacement…" : "Remplacer le mot de passe"}</button>
        </form>
      )}
    </article>
  );
}

function Kpi({ label, value, detail, danger = false }: { label: string; value: string; detail: string; danger?: boolean }) {
  return (
    <article>
      <p>{label}</p>
      <h3>{value}</h3>
      <small className={danger ? "down" : "up"}>{detail}</small>
    </article>
  );
}
function PanelHead({ kicker, title, action, onClick, total }: { kicker: string; title: string; action?: string; onClick?: () => void; total?: string }) {
  return (
    <div className="panel-head">
      <div>
        <span className="card-kicker">{kicker}</span>
        <h2>{title}</h2>
      </div>
      {action ? <button onClick={onClick}>{action}</button> : <span className="panel-total">{total}</span>}
    </div>
  );
}
function OrderActions({ order, onEdit, onPrint, onDelete }: { order: Order; onEdit: (o: Order) => void; onPrint: (o: Order) => void; onDelete: (o: Order) => void }) {
  return (
    <details className="order-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <summary aria-label={`Actions pour la commande ${order.orderRef}`} title="Actions">
        ⋯
      </summary>
      <div className="order-action-menu" role="menu">
        {whatsappUrl(order.phone, order.orderRef) && <a role="menuitem" href={whatsappUrl(order.phone, order.orderRef)} target="_blank" rel="noopener noreferrer" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}><span aria-hidden="true">◉</span>Contacter sur WhatsApp</a>}
        <button type="button" role="menuitem" onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onEdit(order);
        }}>
          <span aria-hidden="true">✎</span>
          Modifier la commande
        </button>
        <button type="button" role="menuitem" onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onPrint(order);
        }}>
          <span aria-hidden="true">▣</span>
          Imprimer le bordereau
        </button>
        <button type="button" role="menuitem" className="danger" onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onDelete(order);
        }}>
          <span aria-hidden="true">⌫</span>
          Supprimer
        </button>
      </div>
    </details>
  );
}
function RecordActions({ label, onEdit, onDelete }: { label: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <details className="order-actions record-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <summary aria-label={`Actions pour ${label}`} title="Actions">⋯</summary>
      <div className="order-action-menu" role="menu">
        <button type="button" role="menuitem" onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onEdit();
        }}>
          <span aria-hidden="true">✎</span>
          Modifier
        </button>
        <button type="button" role="menuitem" className="danger" onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onDelete();
        }}>
          <span aria-hidden="true">⌫</span>
          Supprimer
        </button>
      </div>
    </details>
  );
}
function TrashPage({ orders, canRestore, submit }: { orders: Order[]; canRestore: boolean; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [renderedAt] = useState(() => Date.now());
  async function restore(order: Order) {
    if (!canRestore) return;
    if (!window.confirm(`Restaurer la commande ${order.orderRef} ?\n\nElle réapparaîtra dans Commandes et Colis.`)) return;
    await submit("restoreOrder", { id: String(order.id) });
  }
  async function removePermanently(order: Order) {
    if (!canRestore) return;
    const confirmed = window.confirm(
      `Supprimer définitivement la commande ${order.orderRef} ?\n\nElle quittera la Corbeille avec son historique de statuts. Une sauvegarde de sécurité sera créée juste avant.`,
    );
    if (!confirmed) return;
    await submit("deleteOrderPermanently", { id: String(order.id) });
  }

  return (
    <section className="panel page-panel trash-page">
      <div className="section-toolbar">
        <div>
          <span className="card-kicker">Conservation 90 jours</span>
          <h2>{orders.length} commande{orders.length > 1 ? "s" : ""} dans la corbeille</h2>
          <p>Une commande supprimée peut être restaurée. Après 90 jours, elle est effacée automatiquement.</p>
        </div>
      </div>
      {!canRestore ? (
        <div className="empty-state"><strong>Accès administrateur requis</strong><p>Seul le compte principal peut consulter et restaurer la corbeille.</p></div>
      ) : orders.length ? (
        <div className="trash-list">
          {orders.map((order) => {
            const deletedAt = order.deletedAt ? new Date(order.deletedAt) : new Date();
            const expiresAt = new Date(deletedAt.getTime() + 90 * 24 * 60 * 60 * 1000);
            const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - renderedAt) / (24 * 60 * 60 * 1000)));
            return (
              <article className="trash-row" key={order.id}>
                <div>
                  <strong>{order.orderRef} · {order.customerName}</strong>
                  <small>{order.products} · {order.city} · supprimée le {dateLabel(deletedAt.toISOString())}</small>
                </div>
                <span className="trash-expiry">{daysLeft} jour{daysLeft > 1 ? "s" : ""} restant{daysLeft > 1 ? "s" : ""}</span>
                <details className="order-actions trash-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                  <summary aria-label={`Actions pour la commande supprimée ${order.orderRef}`} title="Actions">⋯</summary>
                  <div className="order-action-menu" role="menu">
                    <button type="button" role="menuitem" onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      void restore(order);
                    }}>
                      <span aria-hidden="true">↶</span>
                      Restaurer
                    </button>
                    <button type="button" role="menuitem" className="danger" onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      void removePermanently(order);
                    }}>
                      <span aria-hidden="true">⌫</span>
                      Supprimer définitivement
                    </button>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state"><strong>La corbeille est vide</strong><p>Les commandes supprimées apparaîtront ici pendant 90 jours.</p></div>
      )}
    </section>
  );
}
function OrdersPage({ orders, onAdd, onEdit, onPrint, onDelete }: { orders: Order[]; onAdd: () => void; onEdit: (o: Order) => void; onPrint: (o: Order) => void; onDelete: (o: Order) => void }) {
  return (
    <section className="panel page-panel">
      <div className="section-toolbar">
        <div>
          <h2>{orders.length} commandes</h2>
          <p>Utilisez le menu ⋯ pour modifier ou supprimer une commande saisie par erreur.</p>
        </div>
        <button className="primary-button" onClick={onAdd}>
          ＋ Saisir une commande
        </button>
      </div>
      <OrderTable orders={orders} onEdit={onEdit} onPrint={onPrint} onDelete={onDelete} />
    </section>
  );
}
function OrderTable({ orders, onEdit, onPrint, onDelete }: { orders: Order[]; onEdit: (o: Order) => void; onPrint: (o: Order) => void; onDelete: (o: Order) => void }) {
  return (
    <>
      <div className="desktop-order-table table-scroll">
        <table>
          <thead>
            <tr>
              <th>Commande</th>
              <th>Cliente</th>
              <th>Ville</th>
              <th>Vente</th>
              <th>Marge commande</th>
              <th>Statut</th>
              <th className="order-actions-heading">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const gain = exactOrderProfit(o);
              return (
                <tr key={o.id} className="clickable-row" onClick={() => onEdit(o)}>
                  <td>
                    <strong>{o.orderRef}</strong>
                    <small>{dateLabel(o.createdAt)}</small>
                  </td>
                  <td>
                    {o.customerName}
                    <small>{o.products} · {o.source} · {o.fulfillmentType === "Magasin physique" ? "Magasin" : "Livraison"}</small>
                  </td>
                  <td>{o.city}</td>
                  <td><strong>{money(o.saleAmount)}</strong></td>
                  <td className={gain >= 0 ? "money-positive" : "money-negative"}>{money(gain)}</td>
                  <td><Status value={o.status} /></td>
                  <td className="order-actions-cell">
                    <OrderActions order={o} onEdit={onEdit} onPrint={onPrint} onDelete={onDelete} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mobile-order-list">
        {orders.map((o) => {
          const gain = exactOrderProfit(o);
          return (
            <article key={o.id} className="mobile-order-card" role="button" tabIndex={0} aria-label={`Ouvrir la commande ${o.orderRef}`} onClick={() => onEdit(o)} onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onEdit(o);
              }
            }}>
              <div className="mobile-order-top">
                <span>
                  <strong>{o.orderRef}</strong>
                  <small>{dateLabel(o.createdAt)} · {o.source} · {o.fulfillmentType === "Magasin physique" ? "Magasin" : "Livraison"}</small>
                </span>
                <div className="mobile-order-status">
                  <Status value={o.status} />
                  <OrderActions order={o} onEdit={onEdit} onPrint={onPrint} onDelete={onDelete} />
                </div>
              </div>
              <div className="mobile-order-client">
                <strong>{o.customerName}</strong>
                <small>{o.city} · {o.products}</small>
              </div>
              <div className="mobile-order-money">
                <span>Vente <strong>{money(o.saleAmount)}</strong></span>
                <span>Marge <strong className={gain >= 0 ? "money-positive" : "money-negative"}>{money(gain)}</strong></span>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
function carrierTrackingPortal(carrier: string) {
  const normalized = carrier.toLocaleLowerCase("fr").replace(/\s+/g, "");
  if (normalized.includes("forcelog")) return { label: "Suivre sur ForceLog", url: "https://forcelog.ma/suivi-de-colis/" };
  if (normalized.includes("sendit")) return { label: "Ouvrir l’espace Sendit", url: "https://app.sendit.ma/deliveries" };
  return null;
}

function elapsedDays(from: string, to = new Date().toISOString()) {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 86_400_000)) : 0;
}

function ShippingPage({ orders, history, settings, onEdit, onPrint, onDelete }: { orders: Order[]; history: OrderStatusHistory[]; settings: Record<string, string>; onEdit: (o: Order) => void; onPrint: (o: Order) => void; onDelete: (o: Order) => void }) {
  const carrierNames = useMemo(() => parseCarrierNames(settings), [settings]);
  const deliveryOrders = useMemo(() => orders.filter((order) => order.fulfillmentType !== "Magasin physique"), [orders]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [query, setQuery] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("Toutes");
  const [statusFilter, setStatusFilter] = useState("Tous");
  const [manifestCarrier, setManifestCarrier] = useState(carrierNames[0] || "");
  const effectiveManifestCarrier = carrierNames.includes(manifestCarrier) ? manifestCarrier : carrierNames[0] || "";
  const [manifestDate, setManifestDate] = useState(today);
  const [manifestToPrint, setManifestToPrint] = useState<{ carrier: string; date: string; orders: Order[] } | null>(null);
  const historyByOrder = useMemo(() => {
    const grouped = new Map<number, OrderStatusHistory[]>();
    history.forEach((entry) => grouped.set(entry.orderId, [...(grouped.get(entry.orderId) || []), entry]));
    grouped.forEach((entries) => entries.sort((left, right) => new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime()));
    return grouped;
  }, [history]);
  useEffect(() => {
    const clearManifest = () => setManifestToPrint(null);
    window.addEventListener("afterprint", clearManifest);
    return () => window.removeEventListener("afterprint", clearManifest);
  }, []);

  const carrierComparison = carrierNames.map((carrier) => {
    const assigned = deliveryOrders.filter((order) => order.carrier.toLocaleLowerCase("fr") === carrier.toLocaleLowerCase("fr"));
    const delivered = assigned.filter((order) => order.status === "Livrée");
    const returned = assigned.filter((order) => order.status === "Retour");
    const completed = delivered.length + returned.length;
    const deliveryDays = delivered.map((order) => {
      const deliveredEntry = (historyByOrder.get(order.id) || []).find((entry) => entry.toStatus === "Livrée");
      return elapsedDays(order.createdAt, deliveredEntry?.changedAt || order.updatedAt || order.createdAt);
    });
    return {
      carrier,
      assigned: assigned.length,
      delivered: delivered.length,
      returned: returned.length,
      active: assigned.filter((order) => ["Confirmée", "Expédiée", "En livraison"].includes(order.status)).length,
      successRate: completed ? (delivered.length / completed) * 100 : 0,
      averageDelay: deliveryDays.length ? deliveryDays.reduce((sum, value) => sum + value, 0) / deliveryDays.length : null,
      averageCost: assigned.length ? assigned.reduce((sum, order) => sum + order.shippingCost, 0) / assigned.length : 0,
      completed,
    };
  });
  const rankedCarriers = carrierComparison.filter((row) => row.completed > 0).sort((left, right) => right.successRate - left.successRate || (left.averageDelay ?? 999) - (right.averageDelay ?? 999));
  const bestCarrier = rankedCarriers[0]?.carrier || "";

  const trackingRows = deliveryOrders.map((order) => {
    const latestHistory = historyByOrder.get(order.id)?.[0];
    const age = elapsedDays(latestHistory?.changedAt || order.updatedAt || order.createdAt);
    const needsTrackingNumber = ["Expédiée", "En livraison", "Livrée"].includes(order.status) && !order.trackingNumber;
    const delayed = (["Confirmée"].includes(order.status) && age >= 2) || (["Expédiée", "En livraison"].includes(order.status) && age >= 4);
    return { order, age, needsTrackingNumber, delayed, alert: needsTrackingNumber || delayed };
  }).filter(({ order }) => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    const matchesQuery = !normalizedQuery || [order.orderRef, order.trackingNumber, order.customerName || "", order.city].some((value) => value.toLocaleLowerCase("fr").includes(normalizedQuery));
    const matchesCarrier = carrierFilter === "Toutes" || order.carrier === carrierFilter;
    const matchesStatus = statusFilter === "Tous" || order.status === statusFilter;
    return matchesQuery && matchesCarrier && matchesStatus;
  }).sort((left, right) => Number(right.alert) - Number(left.alert) || new Date(right.order.createdAt).getTime() - new Date(left.order.createdAt).getTime());
  const alertCount = trackingRows.filter((row) => row.alert).length;
  const manifestOrders = deliveryOrders.filter((order) => order.carrier === effectiveManifestCarrier && ["Confirmée", "Expédiée", "En livraison"].includes(order.status));

  function printManifest() {
    if (!effectiveManifestCarrier || manifestOrders.length === 0) return;
    setManifestToPrint({ carrier: effectiveManifestCarrier, date: manifestDate, orders: manifestOrders });
    window.setTimeout(() => window.print(), 80);
  }
  return (
    <>
      <section className="integration-banner">
        <div>
          <span className="live-dot" />
          <div>
            <strong>{carrierNames.length ? `${carrierNames.length} agence${carrierNames.length > 1 ? "s" : ""} disponible${carrierNames.length > 1 ? "s" : ""}` : "Agences de livraison"}</strong>
            <p>{carrierNames.length ? carrierNames.join(" · ") : "Aucune agence configurée. Ajoutez vos agences dans Paramètres."}</p>
          </div>
        </div>
        <Status value={carrierNames.length ? "Configuré" : "À configurer"} />
      </section>
      <section className="carrier-comparison-grid" aria-label="Comparaison des agences de livraison">
        {carrierComparison.map((row) => (
          <article className={`carrier-performance-card ${row.carrier === bestCarrier ? "best" : ""}`} key={row.carrier}>
            <div className="carrier-performance-head">
              <div><span>Agence</span><h2>{row.carrier}</h2></div>
              {row.carrier === bestCarrier ? <strong>Meilleur taux</strong> : <small>{row.completed ? "Données disponibles" : "À mesurer"}</small>}
            </div>
            <div className="carrier-performance-stats">
              <p><span>Taux livré</span><strong>{row.completed ? `${row.successRate.toFixed(1)} %` : "—"}</strong></p>
              <p><span>Délai moyen</span><strong>{row.averageDelay === null ? "—" : `${row.averageDelay.toFixed(1)} j`}</strong></p>
              <p><span>Coût moyen</span><strong>{row.assigned ? money(row.averageCost) : "—"}</strong></p>
            </div>
            <footer><span>{row.delivered} livré(s)</span><span>{row.returned} retour(s)</span><span>{row.active} en cours</span></footer>
          </article>
        ))}
        {carrierComparison.length === 0 && <article className="panel carrier-empty-card"><strong>Ajoutez une agence dans Paramètres</strong><p>La comparaison commencera dès que des commandes lui seront affectées.</p></article>}
      </section>
      <section className="panel carrier-manifest-panel">
        <div className="manifest-copy"><span className="card-kicker">Préparation agence</span><h2>Manifeste quotidien</h2><p>Le document regroupe les colis confirmés ou en cours pour l’agence choisie. Il peut être imprimé et remis au transporteur.</p></div>
        <div className="manifest-controls">
          <label><span>Agence</span><select value={effectiveManifestCarrier} onChange={(event) => setManifestCarrier(event.target.value)}>{carrierNames.map((carrier) => <option key={carrier}>{carrier}</option>)}</select></label>
          <label><span>Date du manifeste</span><input type="date" value={manifestDate} onChange={(event) => setManifestDate(event.target.value)} /></label>
          <button className="primary-button" type="button" disabled={!effectiveManifestCarrier || manifestOrders.length === 0} onClick={printManifest}>▣ Imprimer · {manifestOrders.length} colis</button>
        </div>
      </section>
      <section className="panel page-panel shipping-tracking-panel">
        <div className="shipping-tracking-head">
          <div><span className="card-kicker">Paiement à la livraison</span><h2>Suivi opérationnel des colis</h2><p>Statuts du site, retards détectés et accès au portail officiel de l’agence.</p></div>
          <span className={`tracking-alert-total ${alertCount ? "active" : ""}`}>{alertCount} alerte{alertCount === 1 ? "" : "s"}</span>
        </div>
        <div className="shipping-filters">
          <label><span>Rechercher</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Commande, cliente ou suivi" /></label>
          <label><span>Agence</span><select value={carrierFilter} onChange={(event) => setCarrierFilter(event.target.value)}><option>Toutes</option>{carrierNames.map((carrier) => <option key={carrier}>{carrier}</option>)}</select></label>
          <label><span>Statut</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Tous</option>{orderStatusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
        </div>
        <div className="card-list">
          {trackingRows.map(({ order: o, age, delayed, needsTrackingNumber }) => {
            const portal = carrierTrackingPortal(o.carrier);
            return (
            <article className={`shipment-card ${delayed || needsTrackingNumber ? "needs-attention" : ""}`} key={o.id} role="button" tabIndex={0} onClick={() => onEdit(o)} onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onEdit(o);
              }
            }}>
              <div>
                <strong>{o.orderRef}</strong>
                <small>{o.customerName} · {o.city} · {o.source}</small>
              </div>
              <div>
                <strong>{o.trackingNumber || "Sans numéro"}</strong>
                <small>{o.carrier}</small>
                {portal && <a className="carrier-tracking-link" href={portal.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{portal.label} ↗</a>}
              </div>
              <div>
                <Status value={o.status} />
                <small>{o.paymentStatus} · statut depuis {age} j</small>
                {needsTrackingNumber && <span className="shipment-alert">Numéro manquant</span>}
                {delayed && <span className="shipment-alert">Délai à vérifier</span>}
              </div>
              <div className="shipment-actions">
                <OrderActions order={o} onEdit={onEdit} onPrint={onPrint} onDelete={onDelete} />
              </div>
            </article>
          );})}
          {trackingRows.length === 0 && <EmptyState title="Aucun colis trouvé" text="Modifiez les filtres ou ajoutez une commande." />}
        </div>
        <p className="tracking-source-note">Lorsque le webhook sécurisé est connecté, Sendit met à jour automatiquement les statuts. Une commande confirmée n’est envoyée à Sendit ou ForceLog qu’après votre clic sur « Autoriser et créer le colis ». Les ventes magasin restent hors de cette page.</p>
      </section>
      {manifestToPrint && <CarrierManifestSheet manifest={manifestToPrint} />}
    </>
  );
}

function CarrierManifestSheet({ manifest }: { manifest: { carrier: string; date: string; orders: Order[] } }) {
  const total = manifest.orders.reduce((sum, order) => sum + order.saleAmount, 0);
  return (
    <section className="print-carrier-manifest" aria-label={`Manifeste ${manifest.carrier}`}>
      <header className="manifest-print-header">
        <div><strong>Maison Jiya</strong><span>Manifeste de remise des colis</span></div>
        <div><small>Agence</small><strong>{manifest.carrier}</strong><span>{dateLabel(`${manifest.date}T12:00:00`)}</span></div>
      </header>
      <div className="manifest-print-summary"><p><span>Nombre de colis</span><strong>{manifest.orders.length}</strong></p><p><span>Montant COD total</span><strong>{money(total)}</strong></p></div>
      <table>
        <thead><tr><th>#</th><th>Commande</th><th>Cliente</th><th>Téléphone</th><th>Ville</th><th>Produit</th><th>Suivi</th><th>COD</th><th>Statut</th></tr></thead>
        <tbody>{manifest.orders.map((order, index) => <tr key={order.id}><td>{index + 1}</td><td>{order.orderRef}</td><td>{order.customerName}</td><td>{order.phone}</td><td>{order.city}</td><td>{order.products} × {order.quantity}</td><td>{order.trackingNumber || "À compléter"}</td><td>{money(order.saleAmount)}</td><td>{order.status}</td></tr>)}</tbody>
      </table>
      <footer><div><span>Remis par Maison Jiya</span></div><div><span>Reçu par {manifest.carrier}</span></div></footer>
    </section>
  );
}
function CustomersPage({ customers, orders, onEdit, onDelete }: { customers: Customer[]; orders: Order[]; onEdit: (selection: EditableEntity) => void; onDelete: (selection: EditableEntity) => void }) {
  return (
    <section className="panel page-panel">
      <PanelHead kicker="CRM" title="Fichier clients" total={String(customers.length)} />
      <div className="customer-grid">
        {customers.map((c) => {
          const own = orders.filter((o) => o.customerId === c.id),
            spent = own.filter((o) => o.paymentStatus === "Encaissé").reduce((sum, o) => sum + o.saleAmount, 0);
          return (
            <article className="customer-card" key={c.id}>
              <span className="customer-avatar">{c.name.slice(0, 1)}</span>
              <div>
                <strong>{c.name}</strong>
                <p>{c.phone} · {c.city}</p>
                <small>{own.length} commande(s) · {money(spent)} encaissé</small>
              </div>
              <RecordActions label={`le client ${c.name}`} onEdit={() => onEdit({ kind: "customer", record: c })} onDelete={() => onDelete({ kind: "customer", record: c })} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
function ImportProductsPanel({ products, canEdit, submit }: { products: Product[]; canEdit: boolean; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [conflictMode, setConflictMode] = useState<"skip" | "update">("skip");
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseDelimitedProducts(content), [content]);
  const existingCodes = useMemo(() => new Set(products.map((product) => product.productCode.toLocaleUpperCase("fr"))), [products]);
  const existingCount = parsed.filter((row) => existingCodes.has(String(row.productCode || "").trim().toLocaleUpperCase("fr"))).length;
  const newCount = parsed.length - existingCount;

  async function importRows() {
    if (!parsed.length || !canEdit || saving) return;
    if (conflictMode === "update" && existingCount && !window.confirm(`Mettre à jour ${existingCount} produit(s) déjà présent(s), y compris leur stock restant ?`)) return;
    setSaving(true);
    try {
      await submit("importProducts", { rows: JSON.stringify(parsed), conflictMode });
      setContent("");
      setFileName("");
      setConflictMode("skip");
    } finally { setSaving(false); }
  }

  return (
    <section className="panel product-import-panel">
      <div className="product-import-head">
        <div><span className="card-kicker">Importation en masse</span><h2>Google Sheets ou CSV</h2><p>Chargez votre fichier : le site reconnaît automatiquement vos intitulés de colonnes et ignore les lignes vides.</p></div>
        <label className={`product-import-file ${!canEdit ? "disabled" : ""}`}>
          <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" disabled={!canEdit || saving} onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setFileName(file.name);
            void file.text().then(setContent);
          }} />
          <span>{fileName ? "Changer de fichier" : "＋ Choisir le fichier CSV"}</span>
        </label>
      </div>
      {parsed.length ? (
        <div className="product-import-preview">
          <div className="product-import-summary">
            <strong>{parsed.length} produit{parsed.length === 1 ? "" : "s"} reconnu{parsed.length === 1 ? "" : "s"}</strong>
            <span>{newCount} nouveau{newCount === 1 ? "" : "x"} · {existingCount} déjà présent{existingCount === 1 ? "" : "s"}</span>
            <small>Le stock importé correspond à « Stock restant ». Les ventes et bénéfices historiques du fichier ne créent pas de fausses commandes.</small>
          </div>
          <div className="table-scroll product-import-table">
            <table><thead><tr><th>ID</th><th>Produit</th><th>Catégorie</th><th>Achat</th><th>Vente</th><th>Minimum</th><th>Stock restant</th><th>Seuil</th><th>Couverture</th></tr></thead><tbody>
              {parsed.slice(0, 5).map((row, index) => <tr key={`${row.productCode}-${index}`}><td><strong>{row.productCode}</strong></td><td>{row.name}</td><td>{row.category}</td><td>{row.purchasePrice || "0"} MAD</td><td>{row.salePrice || "0"} MAD</td><td>{row.minimumSalePrice || row.salePrice || "0"} MAD</td><td>{row.stockRemaining || row.initialQuantity || "0"}</td><td>{row.stockAlertThreshold || "5"}</td><td>{row.reorderCoverDays || "30"} j</td></tr>)}
            </tbody></table>
          </div>
          <div className="product-import-actions">
            <label><span>Si un ID existe déjà</span><select value={conflictMode} onChange={(event) => setConflictMode(event.target.value === "update" ? "update" : "skip")} disabled={saving}><option value="skip">Le conserver sans modification</option><option value="update">Mettre à jour informations et stock</option></select></label>
            <button type="button" className="primary-button" disabled={!canEdit || saving} onClick={() => void importRows()}>{saving ? "Importation…" : `Importer ${parsed.length} produits`}</button>
          </div>
        </div>
      ) : <p className="product-import-empty">Aucun fichier chargé. Votre fichier « Products Database.csv » sera accepté directement.</p>}
    </section>
  );
}

function ReorderingPage({
  data,
  metrics,
  submit,
  onEditProduct,
}: {
  data: Data;
  metrics: {
    cash: number;
    reinvest: number;
    reinvestable: number;
    unpaidPurchases: number;
    unpaidOperatingExpenses: number;
    safetyReserve: number;
  };
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
  onEditProduct: (selection: EditableEntity) => void;
}) {
  const [creatingSupplierId, setCreatingSupplierId] = useState<string | null>(null);
  const [creatingAll, setCreatingAll] = useState(false);
  const recommendations = data.stockRecommendations;
  const purchasePlan = useMemo(
    () => buildPurchasePlan(recommendations, metrics.reinvestable),
    [recommendations, metrics.reinvestable],
  );
  const attention = purchasePlan.lines.filter((row) => row.priority !== "Pas nécessaire");
  const ruptureCount = recommendations.filter((row) => row.status === "Rupture").length;
  const criticalCount = recommendations.filter((row) => row.status === "Critique").length;
  const pendingUnits = recommendations.reduce((sum, row) => sum + row.pendingInbound, 0);
  const protectedCash = Math.max(0, metrics.cash - metrics.unpaidPurchases - metrics.unpaidOperatingExpenses - metrics.safetyReserve);
  const executableGroups = purchasePlan.supplierGroups.filter((group) => group.meetsMinimumOrder);
  const blockedMinimumGroups = purchasePlan.supplierGroups.filter((group) => !group.meetsMinimumOrder);
  const executableSpend = executableGroups.reduce((sum, group) => sum + group.totalCost, 0);
  const blockedSpend = blockedMinimumGroups.reduce((sum, group) => sum + group.totalCost, 0);

  function legacySupplierDebt(supplierId: number | null, supplierName: string) {
    return data.purchases
      .filter((purchase) =>
        !purchase.invoiceId
        && !["Brouillon", "Annulé"].includes(purchase.procurementStatus)
        && purchase.paymentStatus !== "Payé"
        && (supplierId ? purchase.supplierId === supplierId || (!purchase.supplierId && purchase.supplier === supplierName) : purchase.supplier === supplierName),
      )
      .reduce((sum, purchase) => sum + purchase.totalCost, 0);
  }

  function supplierDebt(supplierId: number | null, supplierName: string) {
    const invoiceDebt = supplierId
      ? data.supplierInvoices.filter((invoice) => invoice.supplierId === supplierId).reduce((sum, invoice) => sum + invoice.remainingAmount, 0)
      : 0;
    return legacySupplierDebt(supplierId, supplierName) + invoiceDebt;
  }

  async function createSupplierOrder(group: PurchasePlanSupplierGroup) {
    if (!data.access.canEdit || creatingAll || creatingSupplierId || !group.lines.length || !group.meetsMinimumOrder) return;
    const key = group.supplierId ? String(group.supplierId) : group.supplier;
    const debt = supplierDebt(group.supplierId, group.supplier);
    const confirmed = window.confirm(
      `Créer un bon d’achat chez ${group.supplier} ?\n\n${group.units} unité(s) · ${money(group.totalCost)}\nDette fournisseur actuelle : ${money(debt)}\n\nLe bon sera créé « Commandé », « À payer » et en retrait fournisseur. Le stock ne changera qu’à la réception.`,
    );
    if (!confirmed) return;
    setCreatingSupplierId(key);
    try {
      await submit("addPurchaseOrder", {
        supplierId: group.supplierId ? String(group.supplierId) : "",
        supplier: group.supplier,
        linesJson: JSON.stringify(group.lines.map((line) => ({
          productId: line.productId,
          item: `Réapprovisionnement intelligent · ${line.productName}`,
          quantity: line.plannedQuantity,
          unitCost: line.unitCost,
        }))),
        purchaseMode: "Retrait fournisseur",
        receiveImmediately: "false",
        procurementStatus: "Commandé",
        expectedDate: "",
        account: "Banque",
        paymentStatus: "À payer",
        paidDate: new Date().toISOString().slice(0, 10),
        travelCost: "0",
        travelExpenseAccount: "Espèces",
      });
    } finally {
      setCreatingSupplierId(null);
    }
  }

  async function createAllFundedOrders() {
    if (!data.access.canEdit || creatingAll || creatingSupplierId || !executableGroups.length) return;
    const total = executableGroups.reduce((sum, group) => sum + group.totalCost, 0);
    const units = executableGroups.reduce((sum, group) => sum + group.units, 0);
    const blockedText = blockedMinimumGroups.length
      ? `\n\n${blockedMinimumGroups.length} fournisseur(s) seront ignorés car leur minimum de commande n’est pas atteint.`
      : "";
    const confirmed = window.confirm(
      `Préparer tous les achats financés ?\n\n${executableGroups.length} bon(s) fournisseur · ${units} unité(s) · ${money(total)}\nBudget maximum actuel : ${money(purchasePlan.availableBudget)}.${blockedText}`,
    );
    if (!confirmed) return;
    setCreatingAll(true);
    try {
      for (const group of executableGroups) {
        await submit("addPurchaseOrder", {
          supplierId: group.supplierId ? String(group.supplierId) : "",
          supplier: group.supplier,
          linesJson: JSON.stringify(group.lines.map((line) => ({
            productId: line.productId,
            item: `Réapprovisionnement intelligent · ${line.productName}`,
            quantity: line.plannedQuantity,
            unitCost: line.unitCost,
          }))),
          purchaseMode: "Retrait fournisseur",
          receiveImmediately: "false",
          procurementStatus: "Commandé",
          expectedDate: "",
          account: "Banque",
          paymentStatus: "À payer",
          paidDate: new Date().toISOString().slice(0, 10),
          travelCost: "0",
          travelExpenseAccount: "Espèces",
        });
      }
    } finally {
      setCreatingAll(false);
    }
  }

  return (
    <div className="reports-page">
      <section className="report-automation-banner purchase-plan-banner">
        <div>
          <span>↻</span>
          <div>
            <strong>Plan d’achat intelligent</strong>
            <p>Maison Jiya priorise les ruptures et stocks critiques, puis limite les quantités au budget réellement réinvestissable après protection des dettes, charges et réserve.</p>
          </div>
        </div>
        <small>Aucun achat n’est créé sans votre confirmation</small>
      </section>

      <section className="kpi-grid purchase-plan-kpis">
        <Kpi label="Trésorerie estimée" value={money(metrics.cash)} detail="Argent théorique actuel" />
        <Kpi label="Dettes fournisseurs" value={money(metrics.unpaidPurchases)} detail="Protégées avant tout nouvel achat" danger={metrics.unpaidPurchases > 0} />
        <Kpi label="Réserve + charges" value={money(metrics.safetyReserve + metrics.unpaidOperatingExpenses)} detail={`Réserve ${money(metrics.safetyReserve)} · charges ${money(metrics.unpaidOperatingExpenses)}`} />
        <Kpi label="Budget achat maximum" value={money(purchasePlan.availableBudget)} detail={`Cash protégé : ${money(protectedCash)} · enveloppe réinvestissement : ${money(metrics.reinvest)}`} />
      </section>

      <section className="panel purchase-plan-summary">
        <div className="purchase-plan-summary-head">
          <div>
            <span className="card-kicker">Réinvestissement proposé</span>
            <h2>{money(executableSpend)} à engager maintenant</h2>
            <p>Besoin théorique total : {money(purchasePlan.totalRecommendedCost)} · plan financé : {money(purchasePlan.plannedSpend)}{blockedSpend > 0 ? ` · ${money(blockedSpend)} bloqués par un minimum fournisseur` : ""}.</p>
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={!data.access.canEdit || creatingAll || Boolean(creatingSupplierId) || executableGroups.length === 0}
            onClick={() => void createAllFundedOrders()}
          >
            {creatingAll ? "Création des bons…" : `Préparer les achats · ${executableGroups.length} bon(s)`}
          </button>
        </div>
        <div className="purchase-plan-budget-track">
          <span style={{ width: `${purchasePlan.availableBudget ? Math.min(100, (executableSpend / purchasePlan.availableBudget) * 100) : 0}%` }} />
        </div>
        <div className="purchase-plan-stats">
          <span><strong>{purchasePlan.fullyFundedLines}</strong> besoin(s) financé(s)</span>
          <span><strong>{purchasePlan.partiallyFundedLines}</strong> partiellement financé(s)</span>
          <span><strong>{purchasePlan.unfundedLines}</strong> hors budget</span>
          <span><strong>{purchasePlan.incompleteLines}</strong> fournisseur/coût à compléter</span>
        </div>
        <p className="profitability-note">
          Budget maximum = minimum entre votre enveloppe de réinvestissement et la trésorerie restante après dettes fournisseurs, charges à payer et réserve de sécurité. Maison Jiya ne propose jamais plus que cette limite.
        </p>
      </section>

      <section className="panel">
        <PanelHead kicker="Priorités" title="Quoi acheter maintenant" total={`${attention.length} besoin(s)`} />
        {attention.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Priorité</th><th>Produit</th><th>Stock</th><th>Sorties 30 j</th><th>Besoin</th><th>Plan financé</th><th>Coût</th><th>Fournisseur</th><th>Financement</th><th>Réglages</th>
                </tr>
              </thead>
              <tbody>{attention.map((row) => {
                const product = data.products.find((item) => item.id === row.productId);
                const debt = supplierDebt(row.supplierId, row.supplier);
                return (
                  <tr key={row.productId}>
                    <td><Status value={row.priority} /><small>{row.status}</small></td>
                    <td><strong>{row.productName}</strong><small>{row.productCode} · {row.daysOfCover === null ? "couverture inconnue" : `${row.daysOfCover} j de couverture`}</small></td>
                    <td><strong>{row.stockQuantity}</strong><small>Seuil {row.alertThreshold}</small></td>
                    <td>{row.soldUnits30}<small>{row.averageDailyDemand.toFixed(2)} / jour</small></td>
                    <td><strong>{row.recommendedQuantity}</strong><small>{money(row.recommendedQuantity * row.unitCost)}</small></td>
                    <td className={row.plannedQuantity > 0 ? "money-positive" : "money-negative"}><strong>{row.plannedQuantity}</strong><small>{row.plannedQuantity < row.recommendedQuantity ? `sur ${row.recommendedQuantity}` : "besoin couvert"}</small></td>
                    <td>{row.plannedQuantity > 0 ? money(row.plannedCost) : "—"}<small>{row.unitCost > 0 ? `${money(row.unitCost)} / unité` : "Coût inconnu"}</small></td>
                    <td>{row.supplier}<small>{row.supplierId ? `Dette actuelle : ${money(debt)}` : "Fournisseur non relié"}</small></td>
                    <td><Status value={row.funding} /></td>
                    <td>{product ? <button className="secondary-button" type="button" onClick={() => onEditProduct({ kind: "product", record: product })}>Réglages</button> : "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : <EmptyState title="Stock suffisamment couvert" text="Aucun achat complémentaire n’est recommandé pour le moment." />}
      </section>

      {purchasePlan.supplierGroups.length ? (
        <section className="panel">
          <PanelHead kicker="Bons fournisseurs" title="Achats prêts à créer" total={`${purchasePlan.supplierGroups.length} fournisseur(s)`} />
          <div className="purchase-plan-supplier-grid">
            {purchasePlan.supplierGroups.map((group) => {
              const key = group.supplierId ? String(group.supplierId) : group.supplier;
              const debt = supplierDebt(group.supplierId, group.supplier);
              const missingMinimum = Math.max(0, group.minimumOrderAmount - group.totalCost);
              return (
                <article key={key} className={!group.meetsMinimumOrder ? "purchase-plan-supplier blocked" : "purchase-plan-supplier"}>
                  <div className="purchase-plan-supplier-head">
                    <div><span className="card-kicker">Fournisseur</span><h3>{group.supplier}</h3><small>Dette actuelle : {money(debt)}</small></div>
                    <strong>{money(group.totalCost)}</strong>
                  </div>
                  <div className="purchase-plan-supplier-lines">
                    {group.lines.map((line) => <span key={line.productId}><strong>{line.plannedQuantity}×</strong> {line.productName}<small>{money(line.plannedCost)}</small></span>)}
                  </div>
                  {group.minimumOrderAmount > 0 ? (
                    <p className={group.meetsMinimumOrder ? "purchase-minimum-ok" : "purchase-minimum-warning"}>
                      Minimum fournisseur : {money(group.minimumOrderAmount)} {group.meetsMinimumOrder ? "✓" : `· il manque ${money(missingMinimum)}`}
                    </p>
                  ) : null}
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!data.access.canEdit || creatingAll || Boolean(creatingSupplierId) || !group.meetsMinimumOrder}
                    onClick={() => void createSupplierOrder(group)}
                  >
                    {creatingSupplierId === key ? "Création…" : "Créer ce bon"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <PanelHead kicker="Méthode" title="Comment le plan décide" total="30 jours" />
        <p className="profitability-note">
          La demande vient uniquement des ventes nettes des 30 derniers jours. Les pertes et corrections d’inventaire ne gonflent pas artificiellement la demande. Les achats déjà commandés sont retirés du besoin. Les ruptures passent avant les stocks critiques, puis les besoins « À prévoir ».
        </p>
      </section>

      <section className="panel">
        <PanelHead kicker="Vue complète" title="Tous les produits actifs" total={String(recommendations.length)} />
        <div className="table-scroll">
          <table>
            <thead><tr><th>Produit</th><th>Stock</th><th>Seuil</th><th>Couverture cible</th><th>Déjà commandé</th><th>Fournisseur connu</th><th>Conseil</th></tr></thead>
            <tbody>{recommendations.map((row) => (
              <tr key={row.productId}>
                <td><strong>{row.productName}</strong><small>{row.productCode}</small></td>
                <td><StockLevel quantity={row.stockQuantity} threshold={row.alertThreshold} /></td>
                <td>{row.alertThreshold}</td>
                <td>{row.coverDays} jours</td>
                <td>{row.pendingInbound}</td>
                <td>{row.supplier}<small>{row.lastPurchaseAt ? `Dernier achat : ${dateLabel(row.lastPurchaseAt)}` : "Aucun achat lié"}</small></td>
                <td><Status value={row.status} /><small>{row.recommendedQuantity > 0 ? `Besoin ${row.recommendedQuantity}` : row.pendingInbound > 0 ? `${row.pendingInbound} en réception` : "Stock couvert"}</small></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function InventorySessionCountModal({ session, product, close, submit }: { session: InventorySession; product: Product; close: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [physicalQuantity, setPhysicalQuantity] = useState(String(product.stockQuantity));
  const parsed = Math.max(0, Math.round(Number(physicalQuantity) || 0));
  const difference = parsed - product.stockQuantity;
  const loss = difference < 0 ? Math.abs(difference) * product.purchasePrice : 0;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal compact inventory-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div><span className="card-kicker">{session.sessionRef} · {product.productCode}</span><h2>Compter {product.name}</h2><p>Stock affiché : {product.stockQuantity} · valeur actuelle : {money(product.stockQuantity * product.purchasePrice)}</p></div>
          <button type="button" onClick={close} aria-label="Fermer">×</button>
        </div>
        <form onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setFormError("");
          try {
            if (!Number.isInteger(Number(physicalQuantity)) || Number(physicalQuantity) < 0) throw new Error("La quantité physique doit être un entier positif ou nul.");
            await submit("countInventorySessionProduct", {
              sessionId: String(session.id),
              productId: String(product.id),
              expectedSystemQuantity: String(product.stockQuantity),
              ...Object.fromEntries(new FormData(event.currentTarget)),
            });
            close();
          } catch (error) {
            setFormError(error instanceof Error ? error.message : "Comptage impossible.");
            setSaving(false);
          }
        }}>
          <div className="inventory-summary">
            <div><span>Système</span><strong>{product.stockQuantity}</strong></div>
            <div><span>Physique</span><strong>{parsed}</strong></div>
            <div className={difference > 0 ? "positive" : difference < 0 ? "negative" : "neutral"}><span>Écart</span><strong>{difference > 0 ? "+" : ""}{difference}</strong></div>
          </div>
          <div className="form-grid">
            <label className="field"><span>Quantité physique *</span><input name="physicalQuantity" type="number" inputMode="numeric" min="0" value={physicalQuantity} onChange={(event) => setPhysicalQuantity(event.target.value)} required /></label>
            {difference !== 0 ? <Select label="Motif de l’écart *" name="reason" options={["Casse", "Perte", "Vol", "Erreur de saisie", "Autre"]} /> : <input type="hidden" name="reason" value="Aucun écart" />}
            <Field label="Note complémentaire" name="note" maxLength={240} />
          </div>
          <p className="inventory-warning">{difference === 0 ? "✓ Stock conforme." : difference < 0 ? `Le stock sera corrigé à ${parsed}. Perte valorisée : ${money(loss)}.` : `Le stock sera corrigé à ${parsed}. L’écart positif sera tracé.`}</p>
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          <div className="modal-actions"><button type="button" className="cancel-button" onClick={close}>Annuler</button><button className="primary-button" disabled={saving}>{saving ? "Validation…" : "Valider le comptage"}</button></div>
        </form>
      </section>
    </div>
  );
}

function InventoryPage({ products, sessions, counts, canEdit, submit }: { products: Product[]; sessions: InventorySession[]; counts: InventoryCount[]; canEdit: boolean; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const activeProducts = products.filter((product) => !product.archivedAt);
  const activeSession = sessions.find((session) => session.status === "En cours") || null;
  const sessionCounts = activeSession ? counts.filter((count) => count.sessionId === activeSession.id) : [];
  const countedIds = new Set(sessionCounts.map((count) => count.productId));
  const remaining = activeProducts.filter((product) => !countedIds.has(product.id));
  const normalizedSearch = search.trim().toLocaleLowerCase("fr");
  const visibleProducts = remaining.filter((product) => !normalizedSearch || `${product.productCode} ${product.name} ${product.category}`.toLocaleLowerCase("fr").includes(normalizedSearch));
  const neverCounted = activeProducts.filter((product) => !counts.some((count) => count.productId === product.id));
  const frequent = activeProducts.map((product) => ({
    product,
    differences: counts.filter((count) => count.productId === product.id && count.difference !== 0).length,
    loss: counts.filter((count) => count.productId === product.id).reduce((sum, count) => sum + count.lossValue, 0),
  })).filter((row) => row.differences > 0).sort((a, b) => b.differences - a.differences || b.loss - a.loss).slice(0, 8);
  const latestClosed = sessions.filter((session) => session.status === "Clôturé").slice(0, 10);

  async function startSession() {
    if (!canEdit || starting) return;
    setStarting(true);
    try { await submit("startInventorySession", { note: "" }); } finally { setStarting(false); }
  }
  async function finalizeSession() {
    if (!activeSession || !canEdit || finalizing) return;
    if (activeSession.countedProductCount < activeSession.expectedProductCount) return;
    if (!window.confirm(`Clôturer ${activeSession.sessionRef} ?\n\nLes corrections de stock déjà validées resteront définitives et le bilan sera figé.`)) return;
    setFinalizing(true);
    try { await submit("finalizeInventorySession", { sessionId: String(activeSession.id) }); } finally { setFinalizing(false); }
  }

  const currentValue = activeProducts.reduce((sum, product) => sum + product.stockQuantity * product.purchasePrice, 0);
  return (
    <>
      <section className="kpi-grid stock-kpis">
        <Kpi label="Valeur stock réelle" value={money(currentValue)} detail="Quantités actuelles × coût d’achat" />
        <Kpi label="Jamais comptés" value={String(neverCounted.length)} detail={`${activeProducts.length} produit(s) actif(s)`} danger={neverCounted.length > 0} />
        <Kpi label="Sessions clôturées" value={String(sessions.filter((session) => session.status === "Clôturé").length)} detail="Historique conservé" />
        <Kpi label="Pertes inventaire" value={money(sessions.reduce((sum, session) => sum + session.lossValue, 0))} detail="Valeur des écarts négatifs" danger={sessions.some((session) => session.lossValue > 0)} />
      </section>

      {activeSession ? (
        <section className="panel inventory-session-active">
          <div className="inventory-session-head">
            <div><span className="card-kicker">Session en cours</span><h2>{activeSession.sessionRef}</h2><p>Démarrée par {activeSession.startedByName} · {dateTimeLabel(activeSession.startedAt)}</p></div>
            <Status value="En cours" />
          </div>
          <div className="inventory-session-progress">
            <div><span>Progression</span><strong>{activeSession.countedProductCount} / {activeSession.expectedProductCount}</strong></div>
            <div className="progress"><span className="green" style={{ width: `${activeSession.expectedProductCount ? Math.min(100, (activeSession.countedProductCount / activeSession.expectedProductCount) * 100) : 100}%` }} /></div>
            <div><span>Ajustements</span><strong>{activeSession.totalAdjustmentUnits} unité(s)</strong></div>
            <div><span>Pertes détectées</span><strong className={activeSession.lossValue > 0 ? "money-negative" : ""}>{money(activeSession.lossValue)}</strong></div>
          </div>
          <div className="inventory-session-toolbar">
            <label><span>Rechercher un produit à compter</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="SKU, nom ou catégorie" /></label>
            <button className="primary-button" type="button" disabled={!canEdit || activeSession.countedProductCount < activeSession.expectedProductCount || finalizing} onClick={() => void finalizeSession()}>{finalizing ? "Clôture…" : "Clôturer l’inventaire"}</button>
          </div>
          {visibleProducts.length ? (
            <div className="inventory-product-grid">{visibleProducts.map((product) => (
              <article key={product.id}>
                <div><strong>{product.name}</strong><small>{product.productCode} · {product.category}</small></div>
                <div><span>Stock système</span><strong>{product.stockQuantity}</strong></div>
                <div><span>Valeur</span><strong>{money(product.stockQuantity * product.purchasePrice)}</strong></div>
                <button type="button" className="secondary-button" disabled={!canEdit} onClick={() => setSelectedProduct(product)}>Compter</button>
              </article>
            ))}</div>
          ) : remaining.length ? <EmptyState title="Aucun produit trouvé" text="Modifiez la recherche." /> : <div className="inventory-ready-to-close"><strong>✓ Tous les produits de la session sont comptés.</strong><p>Vous pouvez maintenant clôturer l’inventaire.</p></div>}

          {sessionCounts.length ? (
            <details className="inventory-counted-details">
              <summary>Déjà comptés · {sessionCounts.length}</summary>
              <div className="table-scroll"><table><thead><tr><th>Produit</th><th>Système</th><th>Physique</th><th>Écart</th><th>Motif</th><th>Perte</th></tr></thead><tbody>
                {sessionCounts.map((count) => <tr key={count.id}><td><strong>{count.productName}</strong><small>{count.productCode}</small></td><td>{count.systemQuantity}</td><td>{count.physicalQuantity}</td><td className={moneyTone(count.difference)}>{count.difference > 0 ? "+" : ""}{count.difference}</td><td>{count.reason}</td><td className={count.lossValue > 0 ? "money-negative" : ""}>{money(count.lossValue)}</td></tr>)}
              </tbody></table></div>
            </details>
          ) : null}
        </section>
      ) : (
        <section className="panel inventory-start-card">
          <div><span className="card-kicker">Inventaire physique</span><h2>Démarrer un nouveau comptage</h2><p>La session fige le nombre de produits à contrôler. Chaque écart corrigera le stock et restera justifié dans l’historique.</p></div>
          <button className="primary-button" type="button" disabled={!canEdit || starting} onClick={() => void startSession()}>{starting ? "Création…" : "＋ Démarrer l’inventaire"}</button>
        </section>
      )}

      <section className="panel page-panel">
        <PanelHead kicker="Contrôle" title="Produits jamais comptés" total={String(neverCounted.length)} />
        {neverCounted.length ? <div className="inventory-never-grid">{neverCounted.slice(0, 12).map((product) => <article key={product.id}><strong>{product.name}</strong><small>{product.productCode} · stock {product.stockQuantity}</small></article>)}</div> : <div className="pending-empty">✓ Tous les produits actifs ont déjà été contrôlés au moins une fois.</div>}
      </section>

      <section className="panel page-panel">
        <PanelHead kicker="Anomalies" title="Écarts fréquents" total={String(frequent.length)} />
        {frequent.length ? <div className="table-scroll"><table><thead><tr><th>Produit</th><th>Inventaires avec écart</th><th>Pertes cumulées</th></tr></thead><tbody>{frequent.map((row) => <tr key={row.product.id}><td><strong>{row.product.name}</strong><small>{row.product.productCode}</small></td><td>{row.differences}</td><td className={row.loss > 0 ? "money-negative" : ""}>{money(row.loss)}</td></tr>)}</tbody></table></div> : <div className="pending-empty">Aucun écart d’inventaire récurrent détecté.</div>}
      </section>

      <section className="panel page-panel">
        <PanelHead kicker="Historique" title="Sessions clôturées" total={String(sessions.filter((session) => session.status === "Clôturé").length)} />
        {latestClosed.length ? <div className="table-scroll"><table><thead><tr><th>Session</th><th>Date</th><th>Responsable</th><th>Produits</th><th>Unités système</th><th>Unités réelles</th><th>Valeur avant</th><th>Valeur après</th><th>Pertes</th></tr></thead><tbody>{latestClosed.map((session) => <tr key={session.id}><td><strong>{session.sessionRef}</strong></td><td>{session.completedAt ? dateTimeLabel(session.completedAt) : "—"}</td><td>{session.startedByName}</td><td>{session.countedProductCount}</td><td>{session.totalSystemUnits}</td><td>{session.totalPhysicalUnits}</td><td>{money(session.valueBefore)}</td><td>{money(session.valueAfter)}</td><td className={session.lossValue > 0 ? "money-negative" : ""}>{money(session.lossValue)}</td></tr>)}</tbody></table></div> : <EmptyState title="Aucun inventaire clôturé" text="Le premier bilan apparaîtra ici après la clôture d’une session." />}
      </section>
      {activeSession && selectedProduct ? <InventorySessionCountModal session={activeSession} product={selectedProduct} close={() => setSelectedProduct(null)} submit={submit} /> : null}
    </>
  );
}

function ProductsPage({ products, orders, movements, inventoryCounts, canEdit, submit, onAdd, onMove, onCount, onEdit, onDelete, onRestore }: { products: Product[]; orders: Order[]; movements: StockMovement[]; inventoryCounts: InventoryCount[]; canEdit: boolean; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>; onAdd: () => void; onMove: (selection: StockSelection) => void; onCount: (product: Product) => void; onEdit: (selection: EditableEntity) => void; onDelete: (selection: EditableEntity) => void; onRestore: (product: Product) => void }) {
  const [profitSearch, setProfitSearch] = useState("");
  const [profitCategory, setProfitCategory] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const activeProducts = products.filter((product) => !product.archivedAt);
  const archivedProducts = products.filter((product) => product.archivedAt);
  const units = activeProducts.reduce((sum, product) => sum + product.stockQuantity, 0),
    purchaseValue = activeProducts.reduce((sum, product) => sum + product.stockQuantity * product.purchasePrice, 0),
    saleValue = activeProducts.reduce((sum, product) => sum + product.stockQuantity * product.salePrice, 0),
    lowStock = activeProducts.filter((product) => product.stockQuantity <= product.stockAlertThreshold).length;
  const quantityForProduct = (order: Order, product: Product) => {
    if (order.productId === product.id) return order.quantity;
    const linkedQuantity = movements
      .filter((movement) => movement.orderId === order.id && movement.productId === product.id && movement.movementType === "Commande")
      .reduce((sum, movement) => sum + movement.quantity, 0);
    if (linkedQuantity > 0) return linkedQuantity;
    const escapedName = product.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = order.products.match(new RegExp(`${escapedName}\\s*×\\s*(\\d+)`, "i"));
    return match ? Math.max(0, Number(match[1]) || 0) : 0;
  };
  const orderShareForProduct = (order: Order, product: Product, quantity: number) => {
    const lines = products
      .map((candidate) => ({ candidate, quantity: quantityForProduct(order, candidate) }))
      .filter((line) => line.quantity > 0);
    if (lines.length <= 1) return 1;
    const totalWeight = lines.reduce((sum, line) => sum + Math.max(0, line.candidate.salePrice) * line.quantity, 0);
    const ownWeight = Math.max(0, product.salePrice) * quantity;
    return totalWeight > 0 ? ownWeight / totalWeight : 1 / lines.length;
  };
  const profitability = products.map((product) => {
    let deliveredUnits = 0;
    let revenue = 0;
    let costs = 0;
    for (const order of orders) {
      const quantity = quantityForProduct(order, product);
      if (quantity <= 0) continue;
      const share = orderShareForProduct(order, product, quantity);
      if (order.status === "Livrée") {
        deliveredUnits += quantity;
        revenue += order.saleAmount * share;
        costs += (order.productCost + order.shippingCost + order.fees) * share;
      }
      costs += order.returnCost * share;
    }
    const profit = revenue - costs;
    return {
      product,
      deliveredUnits,
      revenue,
      costs,
      profit,
      margin: revenue ? (profit / revenue) * 100 : 0,
    };
  }).sort((left, right) => right.profit - left.profit);
  const productCategories = Array.from(new Set(products.map((product) => product.category).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" }));
  const productMatches = (product: Product, search: string, category: string) => {
    const query = search.trim().toLocaleLowerCase("fr");
    const searchable = `${product.name} ${product.productCode}`.toLocaleLowerCase("fr");
    return (!category || product.category === category) && (!query || searchable.includes(query));
  };
  const filteredProfitability = profitability.filter((row) => productMatches(row.product, profitSearch, profitCategory));
  const catalogProducts = showArchived ? archivedProducts : activeProducts;
  const filteredProducts = catalogProducts.filter((product) => productMatches(product, catalogSearch, catalogCategory));
  const filteredProfit = filteredProfitability.reduce((sum, row) => sum + row.profit, 0);
  return (
    <>
      <section className="kpi-grid stock-kpis">
        <Kpi label="Produits actifs" value={String(activeProducts.length)} detail={`${lowStock} stock(s) faible(s) · ${archivedProducts.length} archivé(s)`} />
        <Kpi label="Unités restantes" value={String(units)} detail="Stock disponible" />
        <Kpi label="Valeur d’achat" value={money(purchaseValue)} detail="Au prix d’achat" />
        <Kpi label="Valeur de vente" value={money(saleValue)} detail="Potentiel du stock" />
      </section>
      <ImportProductsPanel products={products} canEdit={canEdit} submit={submit} />
      <details className="panel product-disclosure product-profit-panel">
        <summary className="product-disclosure-summary">
          <div><span className="card-kicker">Rentabilité</span><h2>Marge contributive par produit</h2><p>Cliquez pour rechercher, filtrer et comparer les produits.</p></div>
          <div className="product-disclosure-meta"><strong>{money(filteredProfit)}</strong><span className="product-disclosure-toggle" aria-hidden="true">⌄</span></div>
        </summary>
        <div className="product-disclosure-body">
          <ProductFilterBar search={profitSearch} category={profitCategory} categories={productCategories} resultCount={filteredProfitability.length} totalCount={products.length} onSearch={setProfitSearch} onCategory={setProfitCategory} />
          <p className="profitability-note">Marge des commandes livrées après produit, livraison, frais et retours. Les dépenses Meta réelles et charges d’exploitation sont déduites uniquement dans le bénéfice global pour éviter un double comptage.</p>
          {products.length === 0 ? (
            <EmptyState title="Aucune rentabilité à calculer" text="Ajoutez un produit puis rattachez-le à vos commandes." />
          ) : filteredProfitability.length === 0 ? (
            <EmptyState title="Aucun produit trouvé" text="Modifiez la recherche ou choisissez une autre catégorie." />
          ) : (
            <div className="table-scroll profitability-table">
              <table>
                <thead><tr><th>Produit</th><th>Unités livrées</th><th>CA livré</th><th>Coûts directs</th><th>Marge contributive</th><th>Taux</th></tr></thead>
                <tbody>
                  {filteredProfitability.map((row) => (
                    <tr key={row.product.id}>
                      <td><strong>{row.product.name}</strong><small>{row.product.productCode}</small></td>
                      <td>{row.deliveredUnits}</td>
                      <td>{money(row.revenue)}</td>
                      <td>{money(row.costs)}</td>
                      <td className={moneyTone(row.profit)}><strong>{money(row.profit)}</strong></td>
                      <td><span className={`margin-chip ${row.margin < 0 ? "negative" : row.margin > 0 ? "positive" : "neutral"}`}>{row.margin.toFixed(1)} %</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
      <details className="panel product-disclosure product-catalog-panel">
        <summary className="product-disclosure-summary">
          <div><span className="card-kicker">Produits</span><h2>Catalogue & stock</h2><p>Cliquez pour rechercher, filtrer ou gérer les produits.</p></div>
          <div className="product-disclosure-meta"><strong>{filteredProducts.length} / {products.length}</strong><span className="product-disclosure-toggle" aria-hidden="true">⌄</span></div>
        </summary>
        <div className="product-disclosure-body">
          <div className="product-catalog-actions">
            <p>{showArchived ? "Les produits archivés restent dans l’historique mais ne sont plus utilisables dans les nouvelles opérations." : "Les commandes confirmées déduisent le stock. Utilisez « Sortie » seulement pour une correction manuelle."}</p>
            <div className="entity-actions-row">
              <button className="secondary-button" type="button" onClick={() => setShowArchived((value) => !value)}>
                {showArchived ? `Voir les actifs (${activeProducts.length})` : `Archives (${archivedProducts.length})`}
              </button>
              {!showArchived && <button className="primary-button" onClick={onAdd}>＋ Ajouter un produit</button>}
            </div>
          </div>
          <ProductFilterBar search={catalogSearch} category={catalogCategory} categories={productCategories} resultCount={filteredProducts.length} totalCount={catalogProducts.length} onSearch={setCatalogSearch} onCategory={setCatalogCategory} />
          {catalogProducts.length === 0 ? (
            <EmptyState title={showArchived ? "Aucun produit archivé" : "Aucun produit actif"} text={showArchived ? "Les produits archivés apparaîtront ici sans perdre leur historique." : "Ajoutez votre premier produit pour commencer le suivi du stock."} />
          ) : filteredProducts.length === 0 ? (
            <EmptyState title="Aucun produit trouvé" text="Modifiez la recherche ou choisissez une autre catégorie." />
          ) : (
            <>
              <div className="desktop-product-table table-scroll">
                <table>
                  <thead><tr><th>ID produit</th><th>Produit</th><th>Catégorie</th><th>Achat</th><th>Vente</th><th>Minimum</th><th>Seuil stock</th><th>Restant</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={product.id}>
                        <td><strong>{product.productCode}</strong></td>
                        <td>{product.name}{product.archivedAt && <small>Archivé le {dateLabel(product.archivedAt)}</small>}</td>
                        <td><span className="category-chip">{product.category}</span></td>
                        <td>{money(product.purchasePrice)}</td>
                        <td><strong>{money(product.salePrice)}</strong></td>
                        <td>{money(product.minimumSalePrice || product.salePrice)}</td>
                        <td>{product.stockAlertThreshold}</td>
                        <td><StockLevel quantity={product.stockQuantity} threshold={product.stockAlertThreshold} /></td>
                        <td>
                          <div className="entity-actions-row">
                            {product.archivedAt ? (
                              <>
                                <Status value="Archivé" />
                                <button className="secondary-button" type="button" disabled={!canEdit} onClick={() => onRestore(product)}>Restaurer</button>
                              </>
                            ) : (
                              <>
                                <div className="stock-actions">
                                  <button className="stock-in" onClick={() => onMove({ product, type: "Entrée" })}>＋ Stock</button>
                                  <button className="stock-out" disabled={product.stockQuantity === 0} onClick={() => onMove({ product, type: "Vente" })}>− Sortie</button>
                                  <button className="inventory-button" onClick={() => onCount(product)}>≋ Inventaire</button>
                                </div>
                                <RecordActions label={`le produit ${product.name}`} onEdit={() => onEdit({ kind: "product", record: product })} onDelete={() => onDelete({ kind: "product", record: product })} />
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-product-list">
                {filteredProducts.map((product) => (
                  <article className="product-card" key={product.id}>
                    <div className="product-card-head">
                      <div><span>{product.productCode}</span><h3>{product.name}</h3></div>
                      <div className="product-card-actions">
                        <StockLevel quantity={product.stockQuantity} threshold={product.stockAlertThreshold} />
                        {product.archivedAt ? <Status value="Archivé" /> : <RecordActions label={`le produit ${product.name}`} onEdit={() => onEdit({ kind: "product", record: product })} onDelete={() => onDelete({ kind: "product", record: product })} />}
                      </div>
                    </div>
                    <span className="category-chip">{product.category}</span>
                    <div className="product-prices">
                      <p>Prix d’achat<strong>{money(product.purchasePrice)}</strong></p>
                      <p>Prix de vente<strong>{money(product.salePrice)}</strong></p>
                      <p>Prix minimum<strong>{money(product.minimumSalePrice || product.salePrice)}</strong></p>
                      <p>Seuil stock<strong>{product.stockAlertThreshold}</strong></p>
                      <p>Couverture cible<strong>{product.reorderCoverDays} j</strong></p>
                    </div>
                    {product.archivedAt ? (
                      <div className="stock-actions">
                        <button className="secondary-button" type="button" disabled={!canEdit} onClick={() => onRestore(product)}>Restaurer dans le catalogue</button>
                      </div>
                    ) : (
                      <div className="stock-actions">
                        <button className="stock-in" onClick={() => onMove({ product, type: "Entrée" })}>＋ Ajouter du stock</button>
                        <button className="stock-out" disabled={product.stockQuantity === 0} onClick={() => onMove({ product, type: "Vente" })}>− Sortie manuelle</button>
                        <button className="inventory-button" onClick={() => onCount(product)}>≋ Faire l’inventaire</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </details>
      <details className="panel product-disclosure stock-history">
        <summary className="product-disclosure-summary">
          <div><span className="card-kicker">Historique</span><h2>Derniers mouvements</h2><p>Cliquez pour afficher les entrées, sorties et inventaires récents.</p></div>
          <div className="product-disclosure-meta"><strong>{movements.length}</strong><span className="product-disclosure-toggle" aria-hidden="true">⌄</span></div>
        </summary>
        <div className="product-disclosure-body">
          {movements.length === 0 ? (
            <EmptyState title="Aucun mouvement" text="Les entrées et les ventes apparaîtront ici." />
          ) : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Date</th><th>Produit</th><th>Mouvement</th><th>Quantité</th><th>Note</th><th>Actions</th></tr></thead>
                <tbody>
                  {movements.slice(0, 12).map((movement) => (
                    <tr key={movement.id}>
                      <td>{dateLabel(movement.createdAt)}</td>
                      <td><strong>{movement.productName}</strong><small>{movement.productCode}</small></td>
                      <td><Status value={movement.movementType} /></td>
                      <td className={["Entrée", "Réintégration", "Inventaire +", "Réception fournisseur"].includes(movement.movementType) ? "money-positive" : "money-negative"}>{["Entrée", "Réintégration", "Inventaire +", "Réception fournisseur"].includes(movement.movementType) ? "+" : "−"}{movement.quantity}</td>
                      <td>{movement.note || "—"}</td>
                      <td className="order-actions-cell">
                        {movement.orderId || movement.purchaseId || movement.movementType.startsWith("Inventaire") ? <span className="automatic-movement">{movement.orderId ? "Commande" : movement.purchaseId ? "Fournisseur" : "Inventaire"}</span> : <RecordActions label="ce mouvement de stock" onEdit={() => onEdit({ kind: "movement", record: movement })} onDelete={() => onDelete({ kind: "movement", record: movement })} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
      <section className="panel inventory-history-panel">
        <PanelHead kicker="Contrôle physique" title="Historique des inventaires" total={String(inventoryCounts.length)} />
        {inventoryCounts.length === 0 ? (
          <EmptyState title="Aucun inventaire enregistré" text="Cliquez sur « Inventaire » près d’un produit pour comparer le stock physique au stock du site." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Date</th><th>Référence</th><th>Produit</th><th>Stock site</th><th>Stock physique</th><th>Écart</th><th>Compté par</th><th>Note</th></tr></thead>
              <tbody>
                {inventoryCounts.slice(0, 20).map((count) => (
                  <tr key={count.id}>
                    <td>{dateTimeLabel(count.createdAt)}</td>
                    <td><strong>{count.countRef}</strong></td>
                    <td><strong>{count.productName}</strong><small>{count.productCode}</small></td>
                    <td>{count.systemQuantity}</td>
                    <td>{count.physicalQuantity}</td>
                    <td className={count.difference > 0 ? "money-positive" : count.difference < 0 ? "money-negative" : ""}><strong>{count.difference > 0 ? "+" : ""}{count.difference}</strong></td>
                    <td>{count.countedByName}</td>
                    <td>{count.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
function ProductFilterBar({ search, category, categories, resultCount, totalCount, onSearch, onCategory }: { search: string; category: string; categories: string[]; resultCount: number; totalCount: number; onSearch: (value: string) => void; onCategory: (value: string) => void }) {
  const filtered = Boolean(search.trim() || category);
  return (
    <div className="product-filter-bar">
      <label className="product-search-field">
        <span>Rechercher</span>
        <input type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Nom ou ID du produit…" />
      </label>
      <label className="product-category-filter">
        <span>Catégorie</span>
        <select value={category} onChange={(event) => onCategory(event.target.value)}>
          <option value="">Toutes les catégories</option>
          {categories.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <div className="product-filter-result" aria-live="polite"><strong>{resultCount}</strong><span>sur {totalCount} produit{totalCount === 1 ? "" : "s"}</span></div>
      {filtered ? <button type="button" className="product-filter-reset" onClick={() => { onSearch(""); onCategory(""); }}>Effacer les filtres</button> : null}
    </div>
  );
}
function StockLevel({ quantity, threshold = 5 }: { quantity: number; threshold?: number }) {
  return (
    <span className={`stock-level ${quantity === 0 ? "empty" : quantity <= threshold ? "low" : "ok"}`}>
      <strong>{quantity}</strong> unité{quantity === 1 ? "" : "s"}
      <small>{quantity === 0 ? "Rupture" : quantity <= threshold ? `Stock faible · seuil ${threshold}` : "Disponible"}</small>
    </span>
  );
}
function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
function supplierStatementCsvCell(value: string | number) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

function downloadSupplierStatementCsv(supplier: Supplier, entries: SupplierStatementEntry[]) {
  const headers = ["Date", "Type", "Référence", "Détail", "Débit (MAD)", "Crédit (MAD)", "Solde (MAD)"];
  const rows = entries.map((entry) => [
    entry.date.slice(0, 10),
    entry.kind,
    entry.reference,
    entry.detail,
    entry.debit ? entry.debit.toFixed(2) : "",
    entry.credit ? entry.credit.toFixed(2) : "",
    entry.balance.toFixed(2),
  ]);
  const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(supplierStatementCsvCell).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = supplier.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "fournisseur";
  anchor.href = url;
  anchor.download = `releve-${safeName}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function SupplierStatementModal({
  supplier,
  purchases,
  invoices,
  payments,
  close,
}: {
  supplier: Supplier;
  purchases: Purchase[];
  invoices: SupplierInvoice[];
  payments: SupplierPayment[];
  close: () => void;
}) {
  const statement = useMemo(
    () => buildSupplierStatement(supplier.id, supplier.name, purchases, invoices, payments),
    [supplier, purchases, invoices, payments],
  );
  const supplierInvoices = invoices
    .filter((invoice) => invoice.supplierId === supplier.id)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  const openInvoices = supplierInvoices.filter((invoice) => invoice.remainingAmount > 0);

  return (
    <div className="modal-backdrop supplier-statement-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal supplier-statement-modal" role="dialog" aria-modal="true" aria-label={`Relevé fournisseur ${supplier.name}`}>
        <div className="modal-head supplier-statement-head">
          <div>
            <span className="card-kicker">Compte fournisseur</span>
            <h2>{supplier.name}</h2>
            <p>{supplier.contactName || "Contact non renseigné"} · {supplier.city || "Ville non renseignée"} · {supplier.phone || supplier.whatsapp || "Sans téléphone"}</p>
          </div>
          <button type="button" onClick={close} aria-label="Fermer">×</button>
        </div>

        <div className="supplier-statement-actions">
          <button type="button" className="secondary-button" onClick={() => downloadSupplierStatementCsv(supplier, statement.entries)}>Exporter CSV</button>
          <button type="button" className="secondary-button" onClick={close}>Fermer</button>
        </div>

        <section className="supplier-statement-kpis">
          <article><span>Total facturé / acheté</span><strong>{money(statement.totalBilled)}</strong><small>{statement.orderCount} bon(s) · {statement.invoiceCount} facture(s)</small></article>
          <article><span>Total réglé</span><strong className="money-positive">{money(statement.totalPaid)}</strong><small>{statement.paymentCount} paiement(s) de facture</small></article>
          <article><span>Solde fournisseur</span><strong className={statement.balance > 0 ? "money-negative" : "money-positive"}>{money(statement.balance)}</strong><small>{statement.openInvoiceCount} facture(s) ouverte(s)</small></article>
          <article className={statement.overdueAmount > 0 ? "statement-overdue-kpi" : ""}><span>Échu</span><strong className={statement.overdueAmount > 0 ? "money-negative" : ""}>{money(statement.overdueAmount)}</strong><small>Échéances dépassées non soldées</small></article>
        </section>

        <section className="supplier-statement-section">
          <div className="supplier-statement-section-head">
            <div><span className="card-kicker">Échéances</span><h3>Factures ouvertes</h3></div>
            <strong>{money(openInvoices.reduce((sum, invoice) => sum + invoice.remainingAmount, 0))}</strong>
          </div>
          {openInvoices.length ? (
            <div className="supplier-open-invoices">
              {openInvoices.map((invoice) => (
                <article key={invoice.id} className={invoice.isOverdue ? "overdue" : ""}>
                  <div><strong>{invoice.invoiceNumber}</strong><small>{invoice.purchaseRef} · facture {dateLabel(invoice.invoiceDate)}</small></div>
                  <div><span>Échéance</span><strong>{dateLabel(invoice.dueDate)}</strong></div>
                  <div><span>Reste</span><strong>{money(invoice.remainingAmount)}</strong></div>
                  <Status value={invoice.isOverdue ? "En retard" : invoice.paymentStatus} />
                </article>
              ))}
            </div>
          ) : <div className="pending-empty">✓ Aucune facture fournisseur ouverte.</div>}
        </section>

        <section className="supplier-statement-section">
          <div className="supplier-statement-section-head">
            <div><span className="card-kicker">Grand livre</span><h3>Historique du compte</h3></div>
            <small>Débit = dette créée · crédit = règlement</small>
          </div>
          {statement.entries.length ? (
            <div className="table-scroll supplier-statement-table">
              <table>
                <thead><tr><th>Date</th><th>Type</th><th>Référence</th><th>Détail</th><th>Débit</th><th>Crédit</th><th>Solde</th></tr></thead>
                <tbody>{statement.entries.map((entry) => (
                  <tr key={entry.key}>
                    <td>{dateLabel(entry.date)}</td>
                    <td><span className={`statement-entry-kind ${entry.credit > 0 ? "credit" : "debit"}`}>{entry.kind}</span></td>
                    <td><strong>{entry.reference}</strong></td>
                    <td>{entry.detail}</td>
                    <td className={entry.debit > 0 ? "money-negative" : ""}>{entry.debit > 0 ? money(entry.debit) : "—"}</td>
                    <td className={entry.credit > 0 ? "money-positive" : ""}>{entry.credit > 0 ? money(entry.credit) : "—"}</td>
                    <td className={entry.balance > 0 ? "money-negative" : "money-positive"}><strong>{money(entry.balance)}</strong></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyState title="Aucun mouvement fournisseur" text="Les factures, paiements et anciens achats de ce fournisseur apparaîtront ici." />}
        </section>
      </section>
    </div>
  );
}

function SuppliersPage({
  suppliers,
  purchases,
  supplierInvoices,
  supplierPayments,
  canEdit,
  submit,
  onAdd,
  onEdit,
}: {
  suppliers: Supplier[];
  purchases: Purchase[];
  supplierInvoices: SupplierInvoice[];
  supplierPayments: SupplierPayment[];
  canEdit: boolean;
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
  onAdd: () => void;
  onEdit: (selection: EditableEntity) => void;
}) {
  const activeSuppliers = suppliers.filter((supplier) => supplier.isActive);
  const totalDue =
    purchases.filter((purchase) => !purchase.invoiceId && !["Brouillon", "Annulé"].includes(purchase.procurementStatus) && purchase.paymentStatus !== "Payé").reduce((sum, purchase) => sum + purchase.totalCost, 0)
    + supplierInvoices.reduce((sum, invoice) => sum + invoice.remainingAmount, 0);
  const openOrders = new Set(
    purchases
      .filter((purchase) => !["Reçu", "Annulé"].includes(purchase.procurementStatus))
      .map((purchase) => purchase.purchaseRef || `legacy-${purchase.id}`),
  ).size;
  const todayKey = new Date().toISOString().slice(0, 10);
  const [statementSupplier, setStatementSupplier] = useState<Supplier | null>(null);

  async function toggle(supplier: Supplier) {
    if (!canEdit) return;
    const next = !supplier.isActive;
    const confirmed = window.confirm(
      next
        ? `Réactiver ${supplier.name} ?`
        : `Désactiver ${supplier.name} ?\n\nSon historique reste conservé. Il ne sera plus proposé pour de nouveaux bons de commande.`,
    );
    if (!confirmed) return;
    await submit("toggleSupplier", { id: String(supplier.id), active: String(next) });
  }

  return (
    <>
      <section className="kpi-grid three">
        <Kpi label="Fournisseurs actifs" value={String(activeSuppliers.length)} detail={`${suppliers.length} fiche(s) au total`} />
        <Kpi label="Bons ouverts" value={String(openOrders)} detail="Brouillon, commandé ou partiellement reçu" />
        <Kpi label="Reste fournisseur" value={money(totalDue)} detail="Factures et anciens achats restant à payer" danger={totalDue > 0} />
      </section>

      <section className="panel page-panel">
        <div className="section-toolbar">
          <div>
            <h2>Répertoire fournisseurs</h2>
            <p>Contacts, délais, produits fournis, derniers prix, retards et historique d’achat.</p>
          </div>
          <button className="primary-button" type="button" onClick={onAdd} disabled={!canEdit}>＋ Nouveau fournisseur</button>
        </div>
        {suppliers.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Fournisseur</th><th>Contact</th><th>Ville</th><th>Délai</th><th>Minimum</th><th>Conditions</th><th>Produits fournis</th><th>Achats</th><th>À payer</th><th>Dernier prix</th><th>Retards</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>{suppliers.map((supplier) => {
                const rows = purchases
                  .filter((purchase) => purchase.supplierId === supplier.id || (!purchase.supplierId && purchase.supplier.toLocaleLowerCase("fr") === supplier.name.toLocaleLowerCase("fr")))
                  .sort((left, right) => (right.orderedAt || right.createdAt).localeCompare(left.orderedAt || left.createdAt));
                const spent = rows.reduce((sum, purchase) => sum + purchase.totalCost, 0);
                const invoiceDue = supplierInvoices.filter((invoice) => invoice.supplierId === supplier.id).reduce((sum, invoice) => sum + invoice.remainingAmount, 0);
                const due = rows.filter((purchase) => !purchase.invoiceId && !["Brouillon", "Annulé"].includes(purchase.procurementStatus) && purchase.paymentStatus !== "Payé").reduce((sum, purchase) => sum + purchase.totalCost, 0) + invoiceDue;
                const orderCount = new Set(rows.map((purchase) => purchase.purchaseRef || `legacy-${purchase.id}`)).size;
                const lastPurchase = rows[0] || null;
                const suppliedProducts = Array.from(new Set(rows.map((purchase) => purchase.productName || purchase.item).filter(Boolean)));
                const lateOrders = rows.filter((purchase) =>
                  Boolean(
                    purchase.expectedAt
                    && purchase.expectedAt < todayKey
                    && purchase.receivedQuantity < purchase.quantity
                    && ["Commandé", "Partiellement reçu"].includes(purchase.procurementStatus),
                  )
                );
                const lateOrderCount = new Set(lateOrders.map((purchase) => purchase.purchaseRef || `legacy-${purchase.id}`)).size;
                return (
                  <tr key={supplier.id}>
                    <td>
                      <strong>{supplier.name}</strong>
                      <small>{supplier.notes || "Aucune note"}</small>
                      {rows.length ? (
                        <details>
                          <summary>Historique achats</summary>
                          <ul>
                            {rows.slice(0, 5).map((purchase) => (
                              <li key={purchase.id}>
                                <strong>{purchase.purchaseRef || `#${purchase.id}`}</strong> · L{purchase.purchaseLineNo} · {purchase.item} · {purchase.quantity} × {money(purchase.unitCost)} · {purchase.procurementStatus}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </td>
                    <td>
                      <strong>{supplier.contactName || "—"}</strong>
                      <small>{supplier.phone || supplier.whatsapp || "Coordonnées non renseignées"}</small>
                    </td>
                    <td>{supplier.city || "—"}</td>
                    <td>{supplier.leadTimeDays} j</td>
                    <td>{supplier.minimumOrderAmount ? money(supplier.minimumOrderAmount) : "—"}</td>
                    <td>{supplier.paymentTerms || "—"}</td>
                    <td>
                      {suppliedProducts.length ? (
                        <>
                          <strong>{suppliedProducts.slice(0, 2).join(" · ")}</strong>
                          <small>{suppliedProducts.length > 2 ? `+${suppliedProducts.length - 2} autre(s)` : `${suppliedProducts.length} produit(s)`}</small>
                        </>
                      ) : "—"}
                    </td>
                    <td><strong>{money(spent)}</strong><small>{orderCount} bon(s) · {rows.length} ligne(s)</small></td>
                    <td className={moneyTone(-due)}><strong>{money(due)}</strong></td>
                    <td>{lastPurchase ? <><strong>{money(lastPurchase.unitCost)}</strong><small>{dateLabel(lastPurchase.orderedAt || lastPurchase.createdAt)}</small></> : "—"}</td>
                    <td>{lateOrderCount ? <><Status value="En retard" /><small>{lateOrderCount} bon(s) · {lateOrders.length} ligne(s)</small></> : <Status value="À jour" />}</td>
                    <td><Status value={supplier.isActive ? "Actif" : "Inactif"} /></td>
                    <td>
                      <div className="entity-actions-row">
                        <button className="secondary-button" type="button" onClick={() => setStatementSupplier(supplier)}>Relevé</button>
                        <button className="secondary-button" type="button" onClick={() => onEdit({ kind: "supplier", record: supplier })} disabled={!canEdit}>Modifier</button>
                        <button className="secondary-button" type="button" onClick={() => void toggle(supplier)} disabled={!canEdit}>{supplier.isActive ? "Désactiver" : "Réactiver"}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : <EmptyState title="Aucun fournisseur" text="Créez votre première fiche fournisseur pour centraliser contacts et conditions d’achat." />}
      </section>
      {statementSupplier ? (
        <SupplierStatementModal
          supplier={statementSupplier}
          purchases={purchases}
          invoices={supplierInvoices}
          payments={supplierPayments}
          close={() => setStatementSupplier(null)}
        />
      ) : null}
    </>
  );
}

function PurchasesPage({ purchases, supplierInvoices, products, suppliers, canEdit, submit, onAdd, onEdit, onDelete }: { purchases: Purchase[]; supplierInvoices: SupplierInvoice[]; products: Product[]; suppliers: Supplier[]; canEdit: boolean; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>; onAdd: () => void; onEdit: (selection: EditableEntity) => void; onDelete: (selection: EditableEntity) => void }) {
  const [receivingId, setReceivingId] = useState<number | null>(null);
  const todayKey = new Date().toISOString().slice(0, 10);
  const groups = new Map<string, Purchase[]>();
  for (const purchase of purchases) {
    const key = purchase.purchaseRef || `legacy-${purchase.id}`;
    const current = groups.get(key) || [];
    current.push(purchase);
    groups.set(key, current);
  }
  const purchaseOrders = Array.from(groups.entries()).map(([key, rawLines]) => {
    const lines = [...rawLines].sort((left, right) => left.purchaseLineNo - right.purchaseLineNo || left.id - right.id);
    const first = lines[0];
    const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    const receivedQuantity = lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
    const remainingQuantity = Math.max(0, quantity - receivedQuantity);
    const totalCost = lines.reduce((sum, line) => sum + line.totalCost, 0);
    const received = quantity > 0 && remainingQuantity === 0;
    const anyReceived = receivedQuantity > 0;
    const cancelled = lines.every((line) => line.procurementStatus === "Annulé");
    const draft = lines.every((line) => line.procurementStatus === "Brouillon");
    const status = cancelled
      ? "Annulé"
      : received
        ? "Reçu"
        : anyReceived
          ? "Partiellement reçu"
          : draft
            ? "Brouillon"
            : "Commandé";
    const paymentStatus = lines.every((line) => line.paymentStatus === "Payé")
      ? "Payé"
      : lines.some((line) => line.paymentStatus === "Partiellement payé")
        ? "Partiellement payé"
        : "À payer";
    const expectedAt = first.expectedAt;
    const overdue = Boolean(
      expectedAt
      && expectedAt < todayKey
      && remainingQuantity > 0
      && ["Commandé", "Partiellement reçu"].includes(status),
    );
    return {
      key,
      ref: first.purchaseRef || `#${first.id}`,
      first,
      lines,
      quantity,
      receivedQuantity,
      remainingQuantity,
      totalCost,
      status,
      paymentStatus,
      expectedAt,
      overdue,
      orderedAt: first.orderedAt || first.createdAt,
    };
  }).sort((left, right) => right.orderedAt.localeCompare(left.orderedAt) || right.first.id - left.first.id);

  const total = purchaseOrders.reduce((sum, order) => sum + order.totalCost, 0);
  const legacyLines = purchases.filter((purchase) => !purchase.invoiceId);
  const paidTotal = legacyLines.filter((line) => line.paymentStatus === "Payé").reduce((sum, line) => sum + line.totalCost, 0)
    + supplierInvoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0);
  const dueTotal = legacyLines.filter((line) => line.paymentStatus !== "Payé").reduce((sum, line) => sum + line.totalCost, 0)
    + supplierInvoices.reduce((sum, invoice) => sum + invoice.remainingAmount, 0);
  const waitingLines = purchases.filter((purchase) => purchase.productId && purchase.receivedQuantity < purchase.quantity && ["Commandé", "Partiellement reçu"].includes(purchase.procurementStatus));
  const waitingOrders = purchaseOrders.filter((order) => order.remainingQuantity > 0 && ["Commandé", "Partiellement reçu"].includes(order.status));
  const receivedCount = purchaseOrders.filter((order) => order.status === "Reçu").length;
  const supplierRows = Array.from(new Set(purchases.map((purchase) => purchase.supplier).filter(Boolean)))
    .map((supplier) => {
      const rows = purchases.filter((purchase) => purchase.supplier === supplier);
      const operationKeys = new Set(rows.map((purchase) => purchase.purchaseRef || `legacy-${purchase.id}`));
      const supplierIds = new Set(rows.map((purchase) => purchase.supplierId).filter((id): id is number => Boolean(id)));
      const invoiceDue = supplierInvoices.filter((invoice) => supplierIds.has(invoice.supplierId)).reduce((sum, invoice) => sum + invoice.remainingAmount, 0);
      const legacyDue = rows.filter((purchase) => !purchase.invoiceId && !["Brouillon", "Annulé"].includes(purchase.procurementStatus) && purchase.paymentStatus !== "Payé").reduce((sum, purchase) => sum + purchase.totalCost, 0);
      return {
        supplier,
        purchased: rows.filter((purchase) => purchase.procurementStatus !== "Annulé").reduce((sum, purchase) => sum + purchase.totalCost, 0),
        due: legacyDue + invoiceDue,
        operations: operationKeys.size,
        lastPurchase: rows.reduce((latest, purchase) => purchase.createdAt > latest ? purchase.createdAt : latest, ""),
      };
    })
    .sort((left, right) => right.due - left.due || right.purchased - left.purchased);

  async function receive(purchase: Purchase) {
    if (!canEdit || receivingId || purchase.receivedQuantity >= purchase.quantity || purchase.procurementStatus === "Annulé") return;
    const remaining = purchase.quantity - purchase.receivedQuantity;
    const raw = window.prompt(
      `Quantité reçue pour ${purchase.productName || purchase.item} ?\n\nReste à recevoir sur cette ligne : ${remaining} unité(s). ${purchase.productId ? "Le stock sera augmenté uniquement de la quantité saisie." : "Cette ligne n’est pas liée au stock : aucun stock ne sera modifié."}`,
      String(remaining),
    );
    if (raw === null) return;
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > remaining) {
      window.alert(`Saisissez un nombre entier entre 1 et ${remaining}.`);
      return;
    }
    setReceivingId(purchase.id);
    try {
      await submit("receivePurchase", { id: String(purchase.id), receiveQuantity: String(quantity) });
    } finally {
      setReceivingId(null);
    }
  }

  return (
    <>
      <section className="kpi-grid three">
        <Kpi label="Total achats" value={money(total)} detail={`${purchaseOrders.length} bon(s) · ${purchases.length} ligne(s)`} />
        <Kpi label="Achats payés" value={money(paidTotal)} detail={`${receivedCount} bon(s) entièrement réceptionné(s)`} />
        <Kpi label="Reste à payer" value={money(dueTotal)} detail={`${waitingOrders.length} bon(s) · ${waitingLines.length} ligne(s) stock en attente`} danger />
      </section>
      <section className="panel supplier-receiving-guide">
        <div>
          <span className="card-kicker">Réception fournisseur</span>
          <h2>Achat ≠ stock reçu — même avec plusieurs produits</h2>
          <p>Chaque ligne est réceptionnée séparément. Le stock augmente uniquement du produit et de la quantité réellement reçus, même si les autres lignes du même bon restent en attente.</p>
        </div>
        <strong>{waitingLines.length} ligne{waitingLines.length === 1 ? "" : "s"} à réceptionner</strong>
      </section>
      <section className="panel report-table">
        <PanelHead kicker="Fournisseurs" title="Suivi des engagements" total={`${supplierRows.length} fournisseur${supplierRows.length === 1 ? "" : "s"}`} />
        <div className="table-scroll">
          <table>
            <thead><tr><th>Fournisseur</th><th>Achats cumulés</th><th>À payer</th><th>Bons</th><th>Dernier achat</th></tr></thead>
            <tbody>{supplierRows.length ? supplierRows.map((row) => <tr key={row.supplier}><td><strong>{row.supplier}</strong></td><td>{money(row.purchased)}</td><td className={moneyTone(-row.due)}><strong>{money(row.due)}</strong></td><td>{row.operations}</td><td>{row.lastPurchase ? dateLabel(row.lastPurchase) : "—"}</td></tr>) : <tr><td colSpan={5}>Aucun fournisseur enregistré.</td></tr>}</tbody>
          </table>
        </div>
      </section>
      <section className="panel page-panel">
        <div className="section-toolbar">
          <div><h2>Bons de commande fournisseurs</h2><p>Un seul bon regroupe désormais plusieurs produits. La progression et le total sont calculés automatiquement sur toutes ses lignes.</p></div>
          <button className="primary-button" onClick={onAdd}>＋ Nouveau bon de commande</button>
        </div>
        <div className="table-scroll">
          <table className="purchase-orders-table">
            <thead><tr><th>Bon</th><th>Commandé le</th><th>Fournisseur</th><th>Produits / lignes</th><th>Qté</th><th>Reçue</th><th>Reste</th><th>Total</th><th>État</th><th>Prévu</th><th>Paiement</th></tr></thead>
            <tbody>
              {purchaseOrders.length ? purchaseOrders.map((order) => (
                <tr key={order.key}>
                  <td>
                    <strong>{order.ref}</strong>
                    <small>{order.first.purchaseMode || "Retrait fournisseur"} · {order.lines.length} ligne{order.lines.length === 1 ? "" : "s"}</small>
                  </td>
                  <td>{dateLabel(order.orderedAt)}</td>
                  <td><strong>{order.first.supplier}</strong><small>{suppliers.find((supplier) => supplier.id === order.first.supplierId)?.city || ""}</small></td>
                  <td className="purchase-order-lines-cell">
                    <div className="purchase-order-lines">
                      {order.lines.map((line) => {
                        const remaining = Math.max(0, line.quantity - line.receivedQuantity);
                        const received = remaining === 0 && line.quantity > 0;
                        return (
                          <article className="purchase-order-line" key={line.id}>
                            <div className="purchase-order-line-main">
                              <span className="purchase-line-number">L{line.purchaseLineNo}</span>
                              <div>
                                <strong>{line.productName || line.item}</strong>
                                <small>{line.productCode ? `${line.productCode} · ` : ""}{line.item !== line.productName ? line.item : ""}</small>
                              </div>
                              <span>{line.quantity} × {money(line.unitCost)}</span>
                              <strong>{money(line.totalCost)}</strong>
                            </div>
                            <div className="purchase-order-line-actions">
                              <span className={remaining > 0 ? "money-negative" : "money-positive"}>{line.receivedQuantity}/{line.quantity} reçu · reste {remaining}</span>
                              {received ? (
                                <span className="purchase-received">✓ Reçu</span>
                              ) : line.procurementStatus === "Brouillon" ? (
                                <span className="purchase-unlinked">Brouillon</span>
                              ) : line.procurementStatus === "Annulé" ? (
                                <span className="purchase-unlinked">Annulé</span>
                              ) : (
                                <button className="secondary-button purchase-receive-button" type="button" disabled={!canEdit || receivingId === line.id} onClick={() => void receive(line)}>
                                  {receivingId === line.id ? "Réception…" : line.productId ? `Réceptionner ${remaining}` : `Marquer reçu · ${remaining}`}
                                </button>
                              )}
                              <RecordActions label={`la ligne ${line.purchaseLineNo} du bon ${order.ref}`} onEdit={() => onEdit({ kind: "purchase", record: line })} onDelete={() => onDelete({ kind: "purchase", record: line })} />
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </td>
                  <td><strong>{order.quantity}</strong></td>
                  <td>{order.receivedQuantity}</td>
                  <td className={order.remainingQuantity > 0 ? "money-negative" : "money-positive"}><strong>{order.remainingQuantity}</strong></td>
                  <td><strong>{money(order.totalCost)}</strong></td>
                  <td><Status value={order.status} /></td>
                  <td>{order.expectedAt ? <>{dateLabel(order.expectedAt)}{order.overdue ? <small><Status value="En retard" /></small> : null}</> : "—"}</td>
                  <td><Status value={order.paymentStatus} />{order.paymentStatus === "Payé" && order.first.paidAt ? <small>{dateLabel(order.first.paidAt)}</small> : null}</td>
                </tr>
              )) : <tr><td colSpan={11}>Aucun bon de commande enregistré.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SupplierPaymentModal({ invoice, close, submit }: { invoice: SupplierInvoice; close: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await submit("addSupplierPayment", Object.fromEntries(new FormData(event.currentTarget)));
      close();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Paiement impossible.");
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal supplier-payment-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div><span className="card-kicker">Règlement fournisseur</span><h2>{invoice.invoiceNumber}</h2><p>{invoice.supplierName || "Fournisseur"} · {invoice.purchaseRef}</p></div>
          <button type="button" onClick={close} aria-label="Fermer">×</button>
        </div>
        <form onSubmit={handle}>
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <div className="invoice-payment-summary">
            <span>Total <strong>{money(invoice.totalAmount)}</strong></span>
            <span>Déjà payé <strong>{money(invoice.paidAmount)}</strong></span>
            <span>Reste <strong>{money(invoice.remainingAmount)}</strong></span>
          </div>
          <div className="form-grid">
            <Field label="Montant payé (MAD) *" name="amount" type="number" inputMode="decimal" min="0.01" max={String(invoice.remainingAmount)} step="0.01" defaultValue={String(invoice.remainingAmount)} required />
            <Select label="Compte débité *" name="account" options={["Banque", "Caisse", "Espèces", "Carte", "Autre"]} />
            <Field label="Date du paiement *" name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            <Field label="Référence paiement" name="reference" placeholder="Virement, reçu, référence…" maxLength={160} />
            <Field label="Note" name="note" placeholder="Détail du règlement…" maxLength={500} />
          </div>
          {formError ? <div className="auth-error">{formError}</div> : null}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Annuler</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer le paiement"}</button></div>
        </form>
      </section>
    </div>
  );
}

function SupplierInvoiceEditModal({ invoice, close, submit }: { invoice: SupplierInvoice; close: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await submit("updateSupplierInvoice", Object.fromEntries(new FormData(event.currentTarget)));
      close();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Modification impossible.");
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div><span className="card-kicker">Facture fournisseur</span><h2>Modifier {invoice.invoiceNumber}</h2><p>{invoice.purchaseRef} · montant verrouillé à {money(invoice.totalAmount)}</p></div>
          <button type="button" onClick={close} aria-label="Fermer">×</button>
        </div>
        <form onSubmit={handle}>
          <input type="hidden" name="id" value={invoice.id} />
          <div className="form-grid">
            <Field label="N° facture *" name="invoiceNumber" defaultValue={invoice.invoiceNumber} required maxLength={120} />
            <Field label="Date de facture *" name="invoiceDate" type="date" defaultValue={invoice.invoiceDate} required />
            <Field label="Échéance *" name="dueDate" type="date" defaultValue={invoice.dueDate} required />
            <Field label="Note" name="note" defaultValue={invoice.note} maxLength={500} />
          </div>
          {formError ? <div className="auth-error">{formError}</div> : null}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Annuler</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button></div>
        </form>
      </section>
    </div>
  );
}

function SupplierInvoicesPage({ invoices, payments, canEdit, onAdd, submit }: { invoices: SupplierInvoice[]; payments: SupplierPayment[]; canEdit: boolean; onAdd: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [paymentInvoice, setPaymentInvoice] = useState<SupplierInvoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<SupplierInvoice | null>(null);
  const openInvoices = invoices.filter((invoice) => invoice.remainingAmount > 0);
  const totalRemaining = openInvoices.reduce((sum, invoice) => sum + invoice.remainingAmount, 0);
  const overdueInvoices = openInvoices.filter((invoice) => invoice.isOverdue);
  const overdueAmount = overdueInvoices.reduce((sum, invoice) => sum + invoice.remainingAmount, 0);

  async function removeInvoice(invoice: SupplierInvoice) {
    if (!canEdit) return;
    const invoicePayments = payments.filter((payment) => payment.invoiceId === invoice.id);
    const message = invoicePayments.length
      ? "Cette facture possède des paiements. Supprimez d’abord les règlements si vous devez retirer la facture."
      : `Supprimer la facture ${invoice.invoiceNumber} liée au bon ${invoice.purchaseRef} ?`;
    if (invoicePayments.length) {
      window.alert(message);
      return;
    }
    if (!window.confirm(message)) return;
    await submit("deleteSupplierInvoice", { id: String(invoice.id) });
  }

  async function removePayment(payment: SupplierPayment) {
    if (!canEdit || !window.confirm(`Supprimer ce paiement de ${money(payment.amount)} ?\n\nLe reste à payer de la facture sera recalculé automatiquement.`)) return;
    await submit("deleteSupplierPayment", { id: String(payment.id) });
  }

  return (
    <>
      <section className="kpi-grid three">
        <Kpi label="Factures ouvertes" value={String(openInvoices.length)} detail={`${invoices.length} facture(s) au total`} />
        <Kpi label="Reste à payer" value={money(totalRemaining)} detail="Montant fournisseur encore engagé" danger={totalRemaining > 0} />
        <Kpi label="En retard" value={money(overdueAmount)} detail={`${overdueInvoices.length} échéance(s) dépassée(s)`} danger={overdueAmount > 0} />
      </section>
      <section className="panel supplier-receiving-guide">
        <div>
          <span className="card-kicker">Comptes fournisseurs</span>
          <h2>Facture ≠ paiement</h2>
          <p>Une facture crée une dette fournisseur. Chaque règlement réduit uniquement le reste à payer et la trésorerie du compte réellement utilisé.</p>
        </div>
        <strong>{money(totalRemaining)} à régler</strong>
      </section>
      <section className="panel page-panel">
        <div className="section-toolbar">
          <div><h2>Factures fournisseurs</h2><p>Échéances, paiements partiels, soldes et historique des règlements liés aux bons de commande.</p></div>
          <button className="primary-button" type="button" onClick={onAdd} disabled={!canEdit}>＋ Nouvelle facture</button>
        </div>
        {invoices.length ? (
          <div className="invoice-list">
            {invoices.map((invoice) => {
              const invoicePayments = payments.filter((payment) => payment.invoiceId === invoice.id).sort((left, right) => right.paidAt.localeCompare(left.paidAt));
              const displayStatus = invoice.isOverdue && invoice.remainingAmount > 0 ? "En retard" : invoice.paymentStatus;
              return (
                <article className={`supplier-invoice-card ${invoice.isOverdue && invoice.remainingAmount > 0 ? "overdue" : ""}`} key={invoice.id}>
                  <div className="supplier-invoice-head">
                    <div>
                      <span className="card-kicker">{invoice.purchaseRef}</span>
                      <h3>{invoice.invoiceNumber}</h3>
                      <small>{invoice.supplierName || "Fournisseur"} · facture du {dateLabel(invoice.invoiceDate)} · échéance {dateLabel(invoice.dueDate)}</small>
                    </div>
                    <Status value={displayStatus} />
                  </div>
                  <div className="supplier-invoice-money">
                    <span>Total<strong>{money(invoice.totalAmount)}</strong></span>
                    <span>Payé<strong className="money-positive">{money(invoice.paidAmount)}</strong></span>
                    <span>Reste<strong className={invoice.remainingAmount > 0 ? "money-negative" : "money-positive"}>{money(invoice.remainingAmount)}</strong></span>
                  </div>
                  {invoice.note ? <p className="supplier-invoice-note">{invoice.note}</p> : null}
                  <div className="supplier-invoice-actions">
                    {invoice.remainingAmount > 0 ? <button type="button" className="primary-button" disabled={!canEdit} onClick={() => setPaymentInvoice(invoice)}>＋ Enregistrer un paiement</button> : null}
                    <button type="button" className="secondary-button" disabled={!canEdit} onClick={() => setEditingInvoice(invoice)}>Modifier la facture</button>
                    <button type="button" className="secondary-button" disabled={!canEdit || invoicePayments.length > 0} onClick={() => void removeInvoice(invoice)}>Supprimer</button>
                  </div>
                  <details className="supplier-payment-history" open={invoicePayments.length > 0}>
                    <summary>Paiements · {invoicePayments.length}</summary>
                    {invoicePayments.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead><tr><th>Date</th><th>Montant</th><th>Compte</th><th>Référence</th><th>Note</th><th>Action</th></tr></thead>
                          <tbody>{invoicePayments.map((payment) => (
                            <tr key={payment.id}>
                              <td>{dateLabel(payment.paidAt)}</td>
                              <td className="money-negative"><strong>{money(payment.amount)}</strong></td>
                              <td>{payment.account}</td>
                              <td>{payment.reference || "—"}</td>
                              <td>{payment.note || "—"}</td>
                              <td><button type="button" className="text-button danger" disabled={!canEdit} onClick={() => void removePayment(payment)}>Supprimer</button></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    ) : <div className="pending-empty">Aucun règlement enregistré.</div>}
                  </details>
                </article>
              );
            })}
          </div>
        ) : <EmptyState title="Aucune facture fournisseur" text="Créez une facture depuis un bon de commande pour suivre l’échéance et les règlements réels." />}
      </section>
      {paymentInvoice ? <SupplierPaymentModal invoice={paymentInvoice} close={() => setPaymentInvoice(null)} submit={submit} /> : null}
      {editingInvoice ? <SupplierInvoiceEditModal invoice={editingInvoice} close={() => setEditingInvoice(null)} submit={submit} /> : null}
    </>
  );
}

function ExpensesPage({
  expenses,
  recurringExpenses,
  canEdit,
  submit,
  onAdd,
  onEdit,
  onDelete,
}: {
  expenses: Expense[];
  recurringExpenses: RecurringExpense[];
  canEdit: boolean;
  submit: (action: string, values: Record<string, FormDataEntryValue>) => Promise<void>;
  onAdd: () => void;
  onEdit: (selection: EditableEntity) => void;
  onDelete: (selection: EditableEntity) => void;
}) {
  const [recurringModal, setRecurringModal] = useState<RecurringExpense | "new" | null>(null);
  const todayKey = businessDateKey(new Date());
  const recognizedExpenses = expenses.filter((expense) => businessDateKey(expense.expenseDate) <= todayKey);
  const upcomingExpenses = expenses.filter((expense) => businessDateKey(expense.expenseDate) > todayKey);
  const total = recognizedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const paid = recognizedExpenses.filter((expense) => expense.paymentStatus === "Payé").reduce((sum, expense) => sum + expense.amount, 0);
  const due = recognizedExpenses.filter((expense) => expense.paymentStatus !== "Payé").reduce((sum, expense) => sum + expense.amount, 0);
  const upcoming = upcomingExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const activeRecurring = recurringExpenses.filter((expense) => Boolean(expense.isActive));
  const recurringMonthly = activeRecurring.reduce((sum, expense) => sum + expense.amount, 0);
  const categories = Array.from(new Set(recognizedExpenses.map((expense) => expense.category).filter(Boolean)))
    .map((category) => {
      const rows = recognizedExpenses.filter((expense) => expense.category === category);
      return { category, amount: rows.reduce((sum, expense) => sum + expense.amount, 0), count: rows.length };
    })
    .sort((left, right) => right.amount - left.amount);

  async function toggleRecurring(expense: RecurringExpense) {
    if (!canEdit) return;
    await submit("toggleRecurringExpense", { id: String(expense.id), isActive: expense.isActive ? "false" : "true" });
  }

  return (
    <>
      <section className="kpi-grid three">
        <Kpi label="Charges enregistrées" value={money(total)} detail={expenses.length + " dépense(s) comptabilisée(s)"} />
        <Kpi label="Déjà payées" value={money(paid)} detail="Déduit de la trésorerie estimée" />
        <Kpi label="À payer maintenant" value={money(due)} detail={upcoming > 0 ? money(upcoming) + " déjà planifiés pour plus tard" : "Aucune autre échéance future planifiée"} danger={due > 0} />
      </section>

      <section className="panel page-panel">
        <div className="section-toolbar">
          <div>
            <span className="card-kicker">Automatisation</span>
            <h2>Charges récurrentes</h2>
            <p>Loyer, téléphone, logiciels… Maison Jiya prépare automatiquement les échéances jusqu’à 60 jours à l’avance, sans les compter comme payées.</p>
          </div>
          <button className="primary-button" type="button" disabled={!canEdit} onClick={() => setRecurringModal("new")}>＋ Programmer une charge</button>
        </div>
        <div className="kpi-grid three">
          <Kpi label="Mensuel programmé" value={money(recurringMonthly)} detail={activeRecurring.length + " charge(s) active(s)"} />
          <Kpi label="Actives" value={String(activeRecurring.length)} detail="Échéances générées automatiquement" />
          <Kpi label="Suspendues" value={String(recurringExpenses.length - activeRecurring.length)} detail="Aucune nouvelle échéance créée" />
        </div>
        {recurringExpenses.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Charge</th><th>Montant</th><th>Échéance</th><th>Compte</th><th>Période</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>
                {recurringExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <td><strong>{expense.label}</strong><small className="table-subline">{expense.category}</small></td>
                    <td><strong>{money(expense.amount)}</strong></td>
                    <td>Le {expense.dayOfMonth} de chaque mois</td>
                    <td>{expense.account}</td>
                    <td>{dateLabel(expense.startDate)}{expense.endDate ? " → " + dateLabel(expense.endDate) : " → sans fin"}</td>
                    <td><Status value={expense.isActive ? "Actif" : "Suspendu"} /></td>
                    <td className="order-actions-cell">
                      <div className="inline-actions">
                        <button type="button" className="secondary-button" disabled={!canEdit} onClick={() => setRecurringModal(expense)}>Modifier</button>
                        <button type="button" className={expense.isActive ? "danger-button" : "secondary-button"} disabled={!canEdit} onClick={() => void toggleRecurring(expense)}>{expense.isActive ? "Suspendre" : "Réactiver"}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Aucune charge récurrente" text="Programmez les dépenses qui reviennent chaque mois pour ne plus les oublier." />}
      </section>

      <section className="panel expense-explainer">
        <div>
          <span className="card-kicker">Charges d’exploitation</span>
          <h2>Dépenses ≠ achats de stock</h2>
          <p>Utilisez ce module pour le loyer, emballages hors stock, téléphone, transport, frais bancaires, outils, prestations et autres charges. Les achats destinés au stock restent dans « Achats ».</p>
        </div>
        <strong>{money(total)}</strong>
      </section>

      {categories.length > 0 && (
        <section className="panel report-table">
          <PanelHead kicker="Répartition" title="Dépenses par catégorie" total={String(categories.length)} />
          <div className="expense-category-grid">
            {categories.slice(0, 8).map((row) => (
              <article key={row.category}>
                <span>{row.category}</span>
                <strong>{money(row.amount)}</strong>
                <small>{row.count} opération(s)</small>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel page-panel">
        <div className="section-toolbar">
          <div><h2>Registre des dépenses</h2><p>Chaque charge réduit le résultat. Seules les dépenses marquées « Payé » réduisent immédiatement la trésorerie estimée.</p></div>
          <button className="primary-button" onClick={onAdd}>＋ Ajouter une dépense</button>
        </div>
        {expenses.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Date</th><th>Catégorie</th><th>Libellé</th><th>Compte</th><th>Montant</th><th>Paiement</th><th>Payé le</th><th>Note</th><th>Actions</th></tr></thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{dateLabel(expense.expenseDate)}</td>
                    <td><span className="category-chip">{expense.category}</span></td>
                    <td>
                      <strong>{expense.label}</strong>
                      {expense.recurringExpenseId ? <small className="table-subline">Récurrente · {expense.recurringPeriod || "échéance"}</small> : null}
                    </td>
                    <td>{expense.account}</td>
                    <td className="money-negative"><strong>{money(expense.amount)}</strong></td>
                    <td><Status value={expense.paymentStatus} /></td>
                    <td>{expense.paymentStatus === "Payé" && expense.paidAt ? dateLabel(expense.paidAt) : "—"}</td>
                    <td>{expense.note || "—"}</td>
                    <td className="order-actions-cell">
                      <RecordActions
                        label={"la dépense " + expense.label}
                        onEdit={() => onEdit({ kind: "expense", record: expense })}
                        onDelete={() => expense.recurringExpenseId
                          ? window.alert("Cette échéance vient d’une charge récurrente. Suspendez ou modifiez la programmation pour agir sur les prochaines échéances.")
                          : onDelete({ kind: "expense", record: expense })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Aucune dépense enregistrée" text="Ajoutez vos charges réelles pour que bénéfice et trésorerie reflètent mieux l’activité Maison Jiya." />}
      </section>

      {recurringModal ? (
        <RecurringExpenseModal
          expense={recurringModal === "new" ? null : recurringModal}
          close={() => setRecurringModal(null)}
          submit={submit}
        />
      ) : null}
    </>
  );
}

function RecurringExpenseModal({
  expense,
  close,
  submit,
}: {
  expense: RecurringExpense | null;
  close: () => void;
  submit: (action: string, values: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      await submit(expense ? "updateRecurringExpense" : "addRecurringExpense", {
        ...(expense ? { id: String(expense.id) } : {}),
        ...values,
      });
      close();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Enregistrement impossible.");
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="modal compact" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="card-kicker">Automatisation des charges</span>
            <h2>{expense ? "Modifier la charge récurrente" : "Programmer une charge récurrente"}</h2>
            <p>Une échéance « À payer » sera préparée automatiquement chaque mois.</p>
          </div>
          <button type="button" onClick={close} aria-label="Fermer">×</button>
        </div>
        <form onSubmit={handle}>
          <div className="form-grid">
            <Select label="Catégorie *" name="category" defaultValue={expense?.category || "Loyer"} options={["Loyer", "Emballage", "Transport", "Téléphone / Internet", "Frais bancaires", "Outils / logiciels", "Prestataire", "Matériel", "Autre"]} />
            <Field label="Libellé *" name="label" defaultValue={expense?.label || ""} placeholder="Ex. Loyer showroom" required />
            <Field label="Montant mensuel (MAD) *" name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={expense ? String(expense.amount) : ""} required />
            <Select label="Compte prévu" name="account" defaultValue={expense?.account || "Banque"} options={["Banque", "Caisse", "Espèces", "Carte", "Autre"]} />
            <Field label="Jour d’échéance (1–31) *" name="dayOfMonth" type="number" inputMode="numeric" min="1" max="31" defaultValue={String(expense?.dayOfMonth || Number(today.slice(8, 10)))} required />
            <Field label="Début *" name="startDate" type="date" defaultValue={expense?.startDate?.slice(0, 10) || today} required />
            <Field label="Fin (facultatif)" name="endDate" type="date" defaultValue={expense?.endDate?.slice(0, 10) || ""} />
            <Field label="Note" name="note" defaultValue={expense?.note || ""} placeholder="Contrat, référence, détail…" maxLength={300} />
          </div>
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          <div className="modal-actions">
            <button type="button" className="cancel-button" onClick={close}>Annuler</button>
            <button className="primary-button" disabled={saving}>{saving ? "Enregistrement…" : expense ? "Enregistrer" : "Programmer"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

type AdSummary = {
  key: string;
  record: Ad;
  platform: string;
  campaign: string;
  externalId: string;
  spend: number;
  revenue: number;
  orderCount: number;
  nativeSpendCents: number;
  nativeCurrency: string;
  source: string;
  firstDate: string;
  lastDate: string;
  rowCount: number;
};

function summarizeAds(ads: Ad[]) {
  const grouped = new Map<string, AdSummary>();
  for (const ad of ads) {
    const isMeta = ad.source === "Meta API";
    const key = isMeta ? `meta:${ad.externalId || ad.campaign}:${ad.platform}` : `manual:${ad.id}`;
    const current = grouped.get(key);
    if (current) {
      current.spend += ad.spend;
      current.revenue += ad.revenue;
      current.orderCount += ad.orderCount;
      current.nativeSpendCents += ad.nativeSpendCents;
      current.firstDate = ad.performanceDate < current.firstDate ? ad.performanceDate : current.firstDate;
      current.lastDate = ad.performanceDate > current.lastDate ? ad.performanceDate : current.lastDate;
      current.rowCount += 1;
      continue;
    }
    grouped.set(key, {
      key,
      record: ad,
      platform: ad.platform,
      campaign: ad.campaign,
      externalId: ad.externalId,
      spend: ad.spend,
      revenue: ad.revenue,
      orderCount: ad.orderCount,
      nativeSpendCents: ad.nativeSpendCents,
      nativeCurrency: ad.nativeCurrency,
      source: ad.source,
      firstDate: ad.performanceDate,
      lastDate: ad.performanceDate,
      rowCount: 1,
    });
  }
  return [...grouped.values()].sort((left, right) => right.lastDate.localeCompare(left.lastDate) || right.spend - left.spend);
}

function nativeMoney(cents: number, currency: string) {
  return `${(cents / 100).toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function AdsPage({ ads, settings, access, submit, onAdd, onEdit, onDelete }: { ads: Ad[]; settings: Record<string, string>; access: Data["access"]; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>; onAdd: () => void; onEdit: (selection: EditableEntity) => void; onDelete: (selection: EditableEntity) => void }) {
  const spend = ads.reduce((sum, ad) => sum + ad.spend, 0),
    revenue = ads.reduce((sum, ad) => sum + ad.revenue, 0),
    count = ads.reduce((sum, ad) => sum + ad.orderCount, 0);
  const summaries = summarizeAds(ads);
  const metaConfigured = settings.meta_api_configured === "true";
  const metaStatus = metaConfigured ? settings.meta_status || "À connecter" : settings.meta_last_sync_at ? "À reconnecter" : "À connecter";
  const metaVerified = metaConfigured && metaStatus === "Connecté" && Boolean(settings.meta_last_sync_at);
  const metaMessage = !metaConfigured
    ? settings.meta_last_sync_at
      ? "Les dernières données sont conservées, mais les trois secrets Meta ne sont plus présents dans Cloudflare."
      : "Ajoutez les trois secrets Meta dans Cloudflare pour pouvoir vérifier la connexion."
    : metaVerified
      ? `Connexion Meta vérifiée lors de la dernière synchronisation · ${dateTimeLabel(settings.meta_last_sync_at)}.`
      : settings.meta_last_error
        ? "Secrets Meta présents, mais la dernière vérification API a échoué."
        : "Secrets Meta présents. Lancez une synchronisation pour vérifier réellement l’accès au compte publicitaire.";
  const syncPeriod = settings.meta_sync_since && settings.meta_sync_until
    ? `${dateLabel(settings.meta_sync_since)} → ${dateLabel(settings.meta_sync_until)}`
    : "Période synchronisée depuis Meta";
  return (
    <>
      <section className="integration-banner">
        <div><span className="meta-mark">M</span><div><strong>Meta Ads</strong><p>{metaMessage}</p>{settings.meta_currency && settings.meta_fx_rate && <small>Devise Meta : {settings.meta_currency} · 1 {settings.meta_currency} = {Number(settings.meta_fx_rate).toFixed(4)} MAD · <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Taux du jour</a></small>}{settings.meta_last_native_spend && settings.meta_last_converted_spend && settings.meta_currency && <small className="meta-conversion-summary">Dernière conversion : {Number(settings.meta_last_native_spend).toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.meta_currency} → {money(Number(settings.meta_last_converted_spend))}</small>}{settings.meta_last_error && <small className="meta-sync-error">{settings.meta_last_error}</small>}</div></div>
        <div className="meta-sync-actions"><Status value={metaStatus} />{access.isOwner && <button type="button" className="secondary-button" onClick={() => void submit("syncMetaNow", {})}>↻ Recalculer depuis Meta</button>}</div>
      </section>
      <section className="meta-spend-explainer" aria-label="Comprendre les dépenses Meta">
        <strong>Le texte « 10$/j » dans le nom d’une campagne indique son nom ou son budget, pas la dépense réellement facturée.</strong>
        <p>Après synchronisation, chaque carte affiche le montant exact reçu de Meta dans la devise du compte, puis sa conversion en MAD.</p>
      </section>
      <section className="kpi-grid three">
        <Kpi label="Dépenses réelles" value={money(spend)} detail={`${syncPeriod} · converties en MAD`} />
        <Kpi label="CA attribué" value={money(revenue)} detail={`${count} commandes`} />
        <Kpi label="ROAS" value={`${spend ? (revenue / spend).toFixed(2) : "0.00"}×`} detail="CA attribué ÷ dépenses" />
      </section>
      <section className="panel page-panel">
        <div className="section-toolbar">
          <div><h2>Performance des campagnes</h2><p>Données manuelles et données Meta API réunies dans le même tableau.</p></div>
          <button className="primary-button" onClick={onAdd}>＋ Saisir une campagne</button>
        </div>
        <div className="ad-grid">
          {summaries.map((ad) => (
            <article className="ad-card" key={ad.key}>
              <div className="ad-card-heading">
                <div><span>{ad.platform}</span><h3>{ad.campaign}</h3></div>
                {ad.source !== "Meta API" && <RecordActions label={`la campagne ${ad.campaign}`} onEdit={() => onEdit({ kind: "ad", record: ad.record })} onDelete={() => onDelete({ kind: "ad", record: ad.record })} />}
              </div>
              <div>
                <p>Dépense réelle<strong>{money(ad.spend)}</strong></p>
                <p>CA attribué<strong>{money(ad.revenue)}</strong></p>
                <p>ROAS<strong>{ad.spend ? (ad.revenue / ad.spend).toFixed(2) : "0"}×</strong></p>
              </div>
              {ad.source === "Meta API" && settings.meta_import_revision === "2" && <small className="ad-native-conversion">Reçu de Meta : {nativeMoney(ad.nativeSpendCents, ad.nativeCurrency)} → {money(ad.spend)}</small>}
              <small>{ad.source} · {ad.firstDate === ad.lastDate ? dateLabel(ad.lastDate) : `${dateLabel(ad.firstDate)} → ${dateLabel(ad.lastDate)}`}{ad.rowCount > 1 ? ` · ${ad.rowCount} jours` : ""}{ad.externalId ? ` · ID ${ad.externalId}` : ""}</small>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

type AnalysisRow = { label: string; orders: number; revenue: number; profit: number };
function groupOrderAnalysis(orders: Order[], label: (order: Order) => string): AnalysisRow[] {
  const grouped = new Map<string, AnalysisRow>();
  orders.forEach((order) => {
    const key = label(order) || "Non renseigné";
    const current = grouped.get(key) || { label: key, orders: 0, revenue: 0, profit: 0 };
    current.orders += 1; current.revenue += order.saleAmount; current.profit += exactOrderProfit(order); grouped.set(key, current);
  });
  return [...grouped.values()].sort((left, right) => right.profit - left.profit);
}
function AnalysisTable({ title, rows }: { title: string; rows: AnalysisRow[] }) {
  return <section className="panel report-table"><PanelHead kicker="Analyse automatique" title={title} total={`${rows.length} ligne${rows.length === 1 ? "" : "s"}`} /><div className="table-scroll"><table><thead><tr><th>Élément</th><th>Commandes</th><th>CA</th><th>Marge commandes</th><th>Taux</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.label}><td><strong>{row.label}</strong></td><td>{row.orders}</td><td>{money(row.revenue)}</td><td className={moneyTone(row.profit)}>{money(row.profit)}</td><td>{row.revenue ? `${((row.profit / row.revenue) * 100).toFixed(1)}%` : "0%"}</td></tr>) : <tr><td colSpan={5}>Aucune donnée pour le moment.</td></tr>}</tbody></table></div></section>;
}
function MonthlyClosingPanel({
  data,
  currentCash,
  submit,
}: {
  data: Data;
  currentCash: number;
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  const todayKey = businessDateKey(new Date());
  const currentMonth = todayKey.slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(() => previousMonthKey(currentMonth));
  const [saving, setSaving] = useState(false);
  const monthOptions = (() => {
    const values = new Set<string>(data.monthlyClosings.map((closing) => closing.monthKey));
    const cursor = new Date(`${currentMonth}-01T12:00:00Z`);
    for (let index = 0; index < 24; index += 1) {
      values.add(cursor.toISOString().slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() - 1);
    }
    return [...values].sort((left, right) => right.localeCompare(left));
  })();
  const bounds = monthBounds(selectedMonth);
  const previousKey = previousMonthKey(selectedMonth);
  const previousClosing = data.monthlyClosings.find((closing) => closing.monthKey === previousKey) || null;
  const existing = data.monthlyClosings.find((closing) => closing.monthKey === selectedMonth) || null;
  const latestInventory = [...data.inventorySessions]
    .filter((session) => session.status === "Clôturé" && session.completedAt && businessDateKey(session.completedAt) >= bounds.start && businessDateKey(session.completedAt) <= bounds.end)
    .sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)))[0] || null;
  const stockValueEnd = latestInventory ? latestInventory.valueAfter : null;
  const stockValueSource = latestInventory
    ? `Inventaire ${latestInventory.sessionRef} · ${businessDateKey(latestInventory.completedAt || latestInventory.startedAt)}`
    : "Aucun inventaire clôturé pendant ce mois";
  const latestDailyClosing = data.dailyClosings.find((closing) => closing.closeDate === bounds.end) || null;
  const cashEnd = latestDailyClosing ? latestDailyClosing.actualTotal : currentCash;
  const cashEndSource = latestDailyClosing
    ? `Clôture quotidienne ${latestDailyClosing.closeDate}`
    : "Aperçu : trésorerie actuelle · le serveur reconstruira le solde historique à la clôture";
  const preview = useMemo(() => buildMonthlyFinancialSnapshot({
    monthKey: selectedMonth,
    orders: data.orders,
    history: data.orderStatusHistory,
    expenses: data.expenses,
    ads: data.ads,
    inventoryCounts: data.inventoryCounts,
    capital: data.capital,
    carrierSettlements: data.carrierSettlements,
    stockValueStart: previousClosing?.stockValueEnd ?? null,
    stockValueEnd,
    stockValueSource,
    cashEnd,
    cashEndSource,
  }), [
    selectedMonth,
    data.orders,
    data.orderStatusHistory,
    data.expenses,
    data.ads,
    data.inventoryCounts,
    data.capital,
    data.carrierSettlements,
    previousClosing,
    stockValueEnd,
    stockValueSource,
    cashEnd,
    cashEndSource,
  ]);
  const view = existing || preview;
  const complete = isCompletedBusinessMonth(selectedMonth, todayKey);
  const monthLabel = (key: string) => new Intl.DateTimeFormat("fr-MA", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${key}-01T12:00:00Z`));
  const nextMonthStart = (() => {
    const date = new Date(`${selectedMonth}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString().slice(0, 10);
  })();
  const delta = (value: number, previous: number) => Math.round((value - previous + Number.EPSILON) * 100) / 100;

  async function closeMonth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !data.access.canEdit || existing || !complete) return;
    const form = event.currentTarget;
    const note = String(new FormData(form).get("monthlyNote") || "").trim();
    const confirmed = window.confirm(
      `Clôturer définitivement ${monthLabel(selectedMonth)} ?\n\nCette photo financière ne sera plus recalculée même si des données anciennes sont modifiées ensuite.`,
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      await submit("saveMonthlyClosing", {
        monthKey: selectedMonth,
        note,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="monthly-closing-divider">
        <div>
          <span className="card-kicker">Clôture mensuelle</span>
          <h2>Compte de résultat officiel</h2>
          <p>Une fois clôturé, le mois garde sa photo financière. Les modifications futures des commandes, dépenses ou stocks ne changent pas cette archive.</p>
        </div>
        <label>
          <span>Mois analysé</span>
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
            {monthOptions.map((key) => <option value={key} key={key}>{monthLabel(key)}</option>)}
          </select>
        </label>
      </section>

      <section className="kpi-grid monthly-closing-kpis">
        <Kpi label="CA livré" value={money(view.deliveredRevenue)} detail={`${view.deliveredOrders} commande(s) livrée(s)`} />
        <Kpi label="CA encaissé brut" value={money(view.collectedAmount)} detail="Encaissements datés dans le mois" />
        <Kpi label="Marge commandes" value={money(view.contributionMargin)} detail="Après produit, livraison, frais et retours" danger={view.contributionMargin < 0} />
        <Kpi label="Bénéfice net" value={money(view.netProfit)} detail="Après Meta, charges, inventaire et écarts transporteurs" danger={view.netProfit < 0} />
      </section>

      <section className="panel monthly-pnl-panel">
        <div className="monthly-pnl-head">
          <div>
            <span className="card-kicker">{existing ? "Photo officielle" : "Aperçu dynamique"}</span>
            <h2>{monthLabel(selectedMonth)}</h2>
            <p>{existing ? `Clôturé le ${dateTimeLabel(existing.createdAt)} par ${existing.closedByName}.` : "Les chiffres seront recalculés côté serveur au moment de la clôture définitive."}</p>
          </div>
          <Status value={existing ? "Clôturé" : complete ? "À clôturer" : "En cours"} />
        </div>
        <div className="monthly-pnl-grid">
          <div><span>Chiffre d’affaires livré</span><strong>{money(view.deliveredRevenue)}</strong></div>
          <div><span>Coût des produits vendus</span><strong className="money-negative">-{money(view.productCost)}</strong></div>
          <div><span>Livraison</span><strong className="money-negative">-{money(view.shippingCost)}</strong></div>
          <div><span>Frais commandes</span><strong className="money-negative">-{money(view.fees)}</strong></div>
          <div><span>Retours / pertes commandes</span><strong className="money-negative">-{money(view.returnCost)}</strong></div>
          <div><span>Meta Ads</span><strong className="money-negative">-{money(view.adSpend)}</strong></div>
          <div><span>Charges d’exploitation</span><strong className="money-negative">-{money(view.operatingExpenses)}</strong></div>
          <div><span>Pertes inventaire</span><strong className="money-negative">-{money(view.inventoryLoss)}</strong></div>
          <div><span>Écarts transporteurs</span><strong className={moneyTone(view.carrierAdjustment)}>{view.carrierAdjustment > 0 ? "+" : ""}{money(view.carrierAdjustment)}</strong></div>
          <div className="monthly-pnl-total"><span>Bénéfice net du mois</span><strong className={moneyTone(view.netProfit)}>{money(view.netProfit)}</strong></div>
        </div>
      </section>

      <section className="monthly-closing-secondary-grid">
        <article className="panel">
          <PanelHead kicker="Stock" title="Valeur immobilisée" total={view.stockValueEnd === null ? "Non disponible" : money(view.stockValueEnd)} />
          <div className="monthly-snapshot-values">
            <div><span>Début du mois</span><strong>{view.stockValueStart === null ? "Non disponible" : money(view.stockValueStart)}</strong><small>{view.stockValueStart === null ? "Première clôture ou mois précédent non clôturé." : `Repris de la clôture ${previousKey}.`}</small></div>
            <div><span>Fin du mois</span><strong>{view.stockValueEnd === null ? "Non disponible" : money(view.stockValueEnd)}</strong><small>{view.stockValueSource}</small></div>
          </div>
        </article>
        <article className="panel">
          <PanelHead kicker="Capital & cash" title="Situation de fin de mois" total={money(view.cashEnd)} />
          <div className="monthly-snapshot-values">
            <div><span>Réinvestissement affecté</span><strong>{money(view.reinvestmentAllocated)}</strong><small>Affectations automatiques du mois.</small></div>
            <div><span>Apports / retraits manuels</span><strong>{money(view.manualCapitalIn - view.manualCapitalOut)}</strong><small>Entrées {money(view.manualCapitalIn)} · sorties {money(view.manualCapitalOut)}</small></div>
            <div><span>Trésorerie de référence</span><strong>{money(view.cashEnd)}</strong><small>{view.cashEndSource}</small></div>
          </div>
        </article>
      </section>

      {previousClosing ? (
        <section className="panel monthly-comparison-panel">
          <PanelHead kicker="Comparaison" title={`${monthLabel(selectedMonth)} vs ${monthLabel(previousKey)}`} total="Mois précédent" />
          <div className="monthly-comparison-grid">
            <div><span>CA livré</span><strong className={moneyTone(delta(view.deliveredRevenue, previousClosing.deliveredRevenue))}>{delta(view.deliveredRevenue, previousClosing.deliveredRevenue) > 0 ? "+" : ""}{money(delta(view.deliveredRevenue, previousClosing.deliveredRevenue))}</strong></div>
            <div><span>Bénéfice net</span><strong className={moneyTone(delta(view.netProfit, previousClosing.netProfit))}>{delta(view.netProfit, previousClosing.netProfit) > 0 ? "+" : ""}{money(delta(view.netProfit, previousClosing.netProfit))}</strong></div>
            <div><span>Valeur stock</span>{view.stockValueEnd === null || previousClosing.stockValueEnd === null ? <strong>Non comparable</strong> : <strong className={moneyTone(delta(view.stockValueEnd, previousClosing.stockValueEnd))}>{delta(view.stockValueEnd, previousClosing.stockValueEnd) > 0 ? "+" : ""}{money(delta(view.stockValueEnd, previousClosing.stockValueEnd))}</strong>}</div>
            <div><span>Trésorerie</span><strong className={moneyTone(delta(view.cashEnd, previousClosing.cashEnd))}>{delta(view.cashEnd, previousClosing.cashEnd) > 0 ? "+" : ""}{money(delta(view.cashEnd, previousClosing.cashEnd))}</strong></div>
          </div>
        </section>
      ) : null}

      <section className="settings-panel monthly-close-action">
        <div className="settings-panel-head">
          <div>
            <span className="card-kicker">Verrouillage du mois</span>
            <h2>{existing ? "Ce mois est clôturé définitivement" : complete ? "Créer la photo officielle du mois" : "Mois encore en cours"}</h2>
          </div>
          <p>{existing ? "Les chiffres ci-dessus viennent de la photo enregistrée et ne sont plus recalculés." : complete ? "Le serveur recalcule une dernière fois toutes les données avant de figer le résultat." : `Clôture disponible à partir du ${dateLabel(nextMonthStart)}.`}</p>
        </div>
        {!existing ? (
          <form className="monthly-close-form" onSubmit={(event) => void closeMonth(event)}>
            <label className="field">
              <span>Note de clôture</span>
              <input name="monthlyNote" maxLength={500} placeholder="Ex. mois validé après vérification fournisseurs et stock…" />
            </label>
            <button className="primary-button" disabled={!data.access.canEdit || !complete || saving}>
              {saving ? "Clôture…" : "Clôturer définitivement le mois"}
            </button>
          </form>
        ) : <div className="monthly-locked-note">✓ Photo financière verrouillée · {existing.note || "aucune note"}</div>}
      </section>

      <section className="panel">
        <PanelHead kicker="Historique officiel" title="Clôtures mensuelles" total={String(data.monthlyClosings.length)} />
        {data.monthlyClosings.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Mois</th><th>CA livré</th><th>Marge commandes</th><th>Meta</th><th>Charges</th><th>Pertes inventaire</th><th>Bénéfice net</th><th>Stock fin</th><th>Cash fin</th><th>Clôturé par</th></tr></thead>
              <tbody>{data.monthlyClosings.map((closing) => (
                <tr key={closing.id}>
                  <td><strong>{monthLabel(closing.monthKey)}</strong><small>{dateTimeLabel(closing.createdAt)}</small></td>
                  <td>{money(closing.deliveredRevenue)}<small>{closing.deliveredOrders} livrée(s)</small></td>
                  <td className={moneyTone(closing.contributionMargin)}>{money(closing.contributionMargin)}</td>
                  <td>{money(closing.adSpend)}</td>
                  <td>{money(closing.operatingExpenses)}</td>
                  <td>{money(closing.inventoryLoss)}</td>
                  <td className={moneyTone(closing.netProfit)}><strong>{money(closing.netProfit)}</strong></td>
                  <td>{closing.stockValueEnd === null ? "Non disponible" : money(closing.stockValueEnd)}</td>
                  <td>{money(closing.cashEnd)}</td>
                  <td>{closing.closedByName}<small>{closing.note || "—"}</small></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="pending-empty">Aucun mois clôturé définitivement pour le moment.</div>}
      </section>
    </>
  );
}

function DailyClosingPage({
  data,
  currentCash,
  submit,
}: {
  data: Data;
  currentCash: number;
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  const preview = data.dailyClosingPreview;
  const existing = data.dailyClosings.find((closing) => closing.closeDate === preview.closeDate) || null;
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !data.access.canEdit) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries()) as Record<string, FormDataEntryValue>;
    setSaving(true);
    try {
      await submit("saveDailyClosing", values);
    } finally {
      setSaving(false);
    }
  }

  const varianceStatus = (value: number) => Math.abs(value) <= 0.01 ? "Conforme" : "Écart";
  const todayMovement = preview.collectedAmount - preview.refundedAmount - preview.paidPurchasesAmount - preview.paidExpensesAmount - preview.adSpend;

  return (
    <div className="reports-page">
      <section className="report-automation-banner">
        <div>
          <span>✓</span>
          <div>
            <strong>Clôture du {preview.closeDate || "jour"}</strong>
            <p>Maison Jiya calcule la trésorerie théorique. Vous saisissez ce qui existe réellement sur vos comptes et le logiciel conserve l’écart.</p>
          </div>
        </div>
        <small>{existing ? "Clôture déjà enregistrée · modifiable" : "À clôturer"}</small>
      </section>

      <section className="hero-grid">
        <article className="hero-card">
          <div className="hero-heading">
            <div>
              <p>Trésorerie théorique totale</p>
              <h2>{money(preview.expectedTotal)}</h2>
              <small>Banque/carte + caisse/espèces + autres comptes</small>
            </div>
          </div>
          <div className="capital-summary">
            <p>Banque / carte<strong>{money(preview.expectedBank)}</strong></p>
            <p>Caisse / espèces<strong>{money(preview.expectedCash)}</strong></p>
            <p>Autres comptes<strong>{money(preview.expectedOther)}</strong></p>
          </div>
        </article>
        <article className="reinvest-card">
          <span className="card-kicker">Mouvement net du jour</span>
          <h2 className={moneyTone(todayMovement)}>{money(todayMovement)}</h2>
          <p>Encaissements − remboursements − fournisseurs − charges − publicité Meta du jour.</p>
          <small>{preview.collectedOrders} encaissement(s) · {preview.refundedOrders} remboursement(s)</small>
        </article>
      </section>

      <section className="kpi-grid">
        <Kpi label="Chez transporteurs" value={money(preview.carrierMoney)} detail="Livré mais pas encore viré" />
        <Kpi label="Créances en transit" value={money(preview.receivables)} detail="Confirmé, expédié ou en livraison" />
        <Kpi label="Fournisseurs à payer" value={money(preview.unpaidPurchases)} detail="Achats encore marqués À payer" />
        <Kpi label="Charges à payer" value={money(preview.unpaidExpenses)} detail="Dépenses encore marquées À payer" />
      </section>

      <section className="panel">
        <PanelHead kicker="Activité du jour" title="Flux réellement enregistrés" total={preview.closeDate} />
        <div className="financial-account-grid">
          <article><span>Encaissements</span><strong>{money(preview.collectedAmount)}</strong><small>{preview.collectedOrders} commande(s)</small></article>
          <article><span>Remboursements</span><strong className={preview.refundedAmount ? "money-negative" : ""}>{money(preview.refundedAmount)}</strong><small>{preview.refundedOrders} commande(s)</small></article>
          <article><span>Fournisseurs payés</span><strong>{money(preview.paidPurchasesAmount)}</strong><small>{preview.paidPurchasesCount} paiement(s)</small></article>
          <article><span>Charges payées</span><strong>{money(preview.paidExpensesAmount)}</strong><small>{preview.paidExpensesCount} paiement(s)</small></article>
          <article><span>Meta Ads</span><strong>{money(preview.adSpend)}</strong><small>Dépense enregistrée aujourd’hui</small></article>
        </div>
      </section>

      <section className="settings-panel account-settings-panel">
        <div className="settings-panel-head">
          <div>
            <span className="card-kicker">Rapprochement réel</span>
            <h2>Comptez l’argent réellement disponible</h2>
          </div>
          <p>Ces valeurs ne modifient aucune commande ni aucun mouvement. Elles servent uniquement à détecter et conserver les écarts.</p>
        </div>
        <form
          className="account-settings-form"
          key={existing ? `closing-${existing.id}-${existing.updatedAt || existing.createdAt}` : `closing-${preview.closeDate}`}
          onSubmit={(event) => void save(event)}
        >
          <label>
            <span>Banque / carte réelle (MAD)</span>
            <input name="actualBank" type="number" inputMode="decimal" step="0.01" min="0" defaultValue={existing ? String(existing.actualBank) : ""} placeholder={String(preview.expectedBank)} required />
            <small>Théorique : {money(preview.expectedBank)}</small>
          </label>
          <label>
            <span>Caisse / espèces réelle (MAD)</span>
            <input name="actualCash" type="number" inputMode="decimal" step="0.01" min="0" defaultValue={existing ? String(existing.actualCash) : ""} placeholder={String(preview.expectedCash)} required />
            <small>Théorique : {money(preview.expectedCash)}</small>
          </label>
          <label>
            <span>Autres comptes réels (MAD)</span>
            <input name="actualOther" type="number" inputMode="decimal" step="0.01" min="0" defaultValue={existing ? String(existing.actualOther) : ""} placeholder={String(preview.expectedOther)} required />
            <small>Théorique : {money(preview.expectedOther)}</small>
          </label>
          <label>
            <span>Note / explication d’un écart</span>
            <input name="note" maxLength={500} defaultValue={existing?.note || ""} placeholder="Ex. dépôt bancaire en attente, dépense non saisie…" />
            <small>Facultatif, mais utile si un écart existe.</small>
          </label>
          <div className="account-form-footer">
            <p>{existing ? <>Dernier écart enregistré : <strong className={moneyTone(existing.totalVariance)}>{money(existing.totalVariance)}</strong></> : "Aucune clôture enregistrée pour aujourd’hui."}</p>
            <button className="primary-button" type="submit" disabled={saving || !data.access.canEdit}>
              {saving ? "Enregistrement…" : existing ? "Mettre à jour la clôture" : "Enregistrer la clôture"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <PanelHead kicker="Historique" title="Clôtures enregistrées" total={String(data.dailyClosings.length)} />
        {data.dailyClosings.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Date</th><th>Théorique</th><th>Réel</th><th>Écart</th><th>Banque</th><th>Caisse</th><th>Transporteurs</th><th>Créances</th><th>Clôturé par</th><th>Note</th></tr></thead>
              <tbody>{data.dailyClosings.slice(0, 120).map((closing) => (
                <tr key={closing.id}>
                  <td><strong>{closing.closeDate}</strong><small>{dateTimeLabel(closing.updatedAt || closing.createdAt)}</small></td>
                  <td>{money(closing.expectedTotal)}</td>
                  <td>{money(closing.actualTotal)}</td>
                  <td><Status value={varianceStatus(closing.totalVariance)} /><small className={moneyTone(closing.totalVariance)}>{money(closing.totalVariance)}</small></td>
                  <td>{money(closing.bankVariance)}</td>
                  <td>{money(closing.cashVariance)}</td>
                  <td>{money(closing.carrierMoney)}</td>
                  <td>{money(closing.receivables)}</td>
                  <td>{closing.closedByName}</td>
                  <td>{closing.note || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="pending-empty">Aucune clôture enregistrée. La première apparaîtra ici.</div>}
      </section>

      <MonthlyClosingPanel data={data} currentCash={currentCash} submit={submit} />
    </div>
  );
}

function CarrierSettlementsPage({
  data,
  submit,
}: {
  data: Data;
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  const linkedOrderIds = useMemo(() => new Set(data.carrierSettlementOrders.map((row) => row.orderId)), [data.carrierSettlementOrders]);
  const eligibleOrders = useMemo(() => data.orders
    .filter((order) =>
      order.status === "Livrée"
      && ["À encaisser", "Encaissé"].includes(order.paymentStatus)
      && order.fulfillmentType !== "Magasin physique"
      && Boolean(order.carrier?.trim())
      && order.carrier !== "Non affecté"
      && !linkedOrderIds.has(order.id),
    )
    .sort((left, right) => new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime()),
  [data.orders, linkedOrderIds]);
  const carriers = useMemo(
    () => Array.from(new Set(eligibleOrders.map((order) => order.carrier))).sort((a, b) => a.localeCompare(b, "fr")),
    [eligibleOrders],
  );
  const [carrier, setCarrier] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [actualAmount, setActualAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const effectiveCarrier = carriers.includes(carrier) ? carrier : carriers[0] || "";
  const carrierOrders = eligibleOrders.filter((order) => order.carrier === effectiveCarrier);
  const selectedOrders = carrierOrders.filter((order) => selectedIds.includes(order.id));
  const expectedAmount = selectedOrders.reduce((sum, order) => sum + Math.max(0, order.saleAmount - order.shippingCost - order.fees), 0);
  const parsedActual = Math.max(0, Number(actualAmount.replace(",", ".")) || 0);
  const difference = Math.round((parsedActual - expectedAmount + Number.EPSILON) * 100) / 100;
  const pendingOrders = eligibleOrders.filter((order) => order.paymentStatus === "À encaisser");
  const pendingTotal = pendingOrders.reduce((sum, order) => sum + Math.max(0, order.saleAmount - order.shippingCost - order.fees), 0);
  const unresolved = data.carrierSettlements.filter((settlement) => settlement.status === "À vérifier");
  const historicalDifference = data.carrierSettlements.reduce((sum, settlement) => sum + settlement.differenceAmount, 0);
  const autoPaidOutsideSettlement = data.orders.filter((order) =>
    order.fulfillmentType !== "Magasin physique"
    && order.paymentStatus === "Encaissé"
    && Boolean(order.carrierInvoiceCode)
    && !linkedOrderIds.has(order.id),
  );

  function toggleOrder(id: number) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function chooseCarrier(value: string) {
    setCarrier(value);
    setSelectedIds([]);
    setActualAmount("");
    setFormError("");
  }

  async function saveSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (saving || !data.access.canEdit) return;
    if (!effectiveCarrier || !selectedIds.length) {
      setFormError("Sélectionnez un transporteur et au moins une commande.");
      return;
    }
    if (parsedActual <= 0) {
      setFormError("Indiquez le montant réellement reçu sur votre compte.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const values = Object.fromEntries(new FormData(form));
      await submit("addCarrierSettlement", {
        ...values,
        carrier: effectiveCarrier,
        actualAmount: String(parsedActual),
        orderIdsJson: JSON.stringify(selectedIds),
      });
      setSelectedIds([]);
      setActualAmount("");
      form.reset();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Rapprochement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="reports-page carrier-settlement-page">
      <section className="report-automation-banner carrier-settlement-banner">
        <div>
          <span>⇄</span>
          <div>
            <strong>Rapprochement des virements transporteurs</strong>
            <p>Comparez ce que Sendit / ForceLog devait vous verser avec le montant réellement arrivé sur votre compte. Un écart reste visible jusqu’à vérification.</p>
          </div>
        </div>
        <small>Aucun virement n’est inventé automatiquement</small>
      </section>

      <section className="kpi-grid">
        <Kpi label="À recevoir des transporteurs" value={money(pendingTotal)} detail={`${pendingOrders.length} commande(s) pas encore encaissée(s)`} danger={pendingTotal > 0} />
        <Kpi label="Règlements rapprochés" value={String(data.carrierSettlements.length - unresolved.length)} detail={`${data.carrierSettlements.length} règlement(s) enregistrés`} />
        <Kpi label="Écarts à vérifier" value={String(unresolved.length)} detail={money(unresolved.reduce((sum, settlement) => sum + Math.abs(settlement.differenceAmount), 0))} danger={unresolved.length > 0} />
        <Kpi label="Impact cash cumulé" value={money(historicalDifference)} detail="Différence reçu réel − montant attendu" danger={historicalDifference < 0} />
      </section>

      <section className="panel carrier-reconcile-panel">
        <PanelHead kicker="Nouveau rapprochement" title="Associer un virement aux commandes livrées" total={effectiveCarrier || "Aucun transporteur"} />
        {carriers.length ? (
          <form onSubmit={saveSettlement}>
            <div className="carrier-settlement-form-head">
              <label className="field">
                <span>Transporteur *</span>
                <select value={effectiveCarrier} onChange={(event) => chooseCarrier(event.target.value)}>
                  {carriers.map((name) => <option key={name}>{name}</option>)}
                </select>
              </label>
              <Field label="Référence du virement / facture *" name="reference" placeholder="Ex. VIR-2026-0928 ou facture Sendit" required maxLength={120} />
              <Field label="Date reçue *" name="settlementDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              <label className="field">
                <span>Montant réellement reçu (MAD) *</span>
                <input name="actualAmount" type="number" inputMode="decimal" min="0.01" step="0.01" value={actualAmount} onChange={(event) => setActualAmount(event.target.value)} required />
              </label>
            </div>

            <div className="carrier-select-toolbar">
              <div>
                <strong>{selectedIds.length} commande(s) sélectionnée(s)</strong>
                <small>Attendu : {money(expectedAmount)}</small>
              </div>
              <button type="button" className="secondary-button" onClick={() => setSelectedIds(selectedIds.length === carrierOrders.length ? [] : carrierOrders.map((order) => order.id))}>
                {selectedIds.length === carrierOrders.length && carrierOrders.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
            </div>

            <div className="carrier-settlement-order-list">
              {carrierOrders.map((order) => {
                const expected = Math.max(0, order.saleAmount - order.shippingCost - order.fees);
                const selected = selectedIds.includes(order.id);
                return (
                  <label key={order.id} className={selected ? "selected" : ""}>
                    <input type="checkbox" checked={selected} onChange={() => toggleOrder(order.id)} />
                    <span><strong>{order.orderRef}</strong><small>{order.customerName || "Cliente"} · {order.trackingNumber || "sans suivi"} · {order.paymentStatus === "Encaissé" ? "déjà marqué encaissé par API" : "à encaisser"}</small></span>
                    <span><small>Vente</small><strong>{money(order.saleAmount)}</strong></span>
                    <span><small>Livraison + frais</small><strong>{money(order.shippingCost + order.fees)}</strong></span>
                    <span><small>À recevoir</small><strong>{money(expected)}</strong></span>
                  </label>
                );
              })}
            </div>

            <div className="carrier-settlement-result">
              <div><span>Montant attendu</span><strong>{money(expectedAmount)}</strong></div>
              <div><span>Montant reçu</span><strong>{money(parsedActual)}</strong></div>
              <div className={difference === 0 ? "ok" : "warning"}><span>Écart</span><strong>{difference > 0 ? "+" : ""}{money(difference)}</strong><small>{difference === 0 ? "Rapproché" : "À vérifier avant de considérer les frais exacts"}</small></div>
            </div>
            <Field label="Note" name="note" placeholder="Ex. retenue agence à vérifier, ajustement exceptionnel…" maxLength={500} />
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            <div className="modal-actions">
              <button className="primary-button" disabled={!data.access.canEdit || saving || !selectedIds.length || parsedActual <= 0}>
                {saving ? "Enregistrement…" : "Confirmer le virement reçu"}
              </button>
            </div>
          </form>
        ) : <EmptyState title="Aucun virement à rapprocher" text="Aucune commande livrée n’est actuellement en attente d’encaissement transporteur." />}
      </section>

      <section className="panel">
        <PanelHead kicker="Historique" title="Règlements transporteurs" total={String(data.carrierSettlements.length)} />
        {data.carrierSettlements.length ? (
          <div className="table-scroll"><table>
            <thead><tr><th>Date</th><th>Transporteur</th><th>Référence</th><th>Commandes</th><th>Attendu</th><th>Reçu</th><th>Écart</th><th>Statut</th><th>Enregistré par</th></tr></thead>
            <tbody>{data.carrierSettlements.map((settlement) => {
              const lines = data.carrierSettlementOrders.filter((line) => line.settlementId === settlement.id);
              return <tr key={settlement.id}>
                <td>{dateLabel(settlement.settlementDate)}</td>
                <td><strong>{settlement.carrier}</strong></td>
                <td><strong>{settlement.reference}</strong>{settlement.note ? <small>{settlement.note}</small> : null}</td>
                <td>{settlement.orderCount}<small>{lines.slice(0, 3).map((line) => line.orderRef).filter(Boolean).join(" · ")}{lines.length > 3 ? ` · +${lines.length - 3}` : ""}</small></td>
                <td>{money(settlement.expectedAmount)}</td>
                <td>{money(settlement.actualAmount)}</td>
                <td className={moneyTone(settlement.differenceAmount)}>{settlement.differenceAmount > 0 ? "+" : ""}{money(settlement.differenceAmount)}</td>
                <td><Status value={settlement.status} /></td>
                <td>{settlement.createdByName}<small>{dateTimeLabel(settlement.createdAt)}</small></td>
              </tr>;
            })}</tbody>
          </table></div>
        ) : <EmptyState title="Aucun règlement enregistré" text="Le premier rapprochement apparaîtra ici." />}
      </section>

      {autoPaidOutsideSettlement.length ? (
        <section className="panel carrier-auto-paid-panel">
          <PanelHead kicker="Automatique" title="Encaissements détectés par les API" total={String(autoPaidOutsideSettlement.length)} />
          <p className="profitability-note">Ces commandes ont déjà été marquées encaissées par Sendit ou ForceLog. Vous pouvez maintenant les sélectionner dans le rapprochement ci-dessus pour vérifier le montant réellement reçu en banque, sans compter l’argent deux fois.</p>
          <div className="carrier-auto-paid-grid">
            {autoPaidOutsideSettlement.slice(0, 20).map((order) => <article key={order.id}><strong>{order.orderRef}</strong><small>{order.carrier} · {order.carrierInvoiceCode}</small><span>{money(Math.max(0, order.saleAmount - order.shippingCost - order.fees))}</span></article>)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function CashflowForecastPage({
  data,
  metrics,
  submit,
}: {
  data: Data;
  metrics: {
    cash: number;
    theoreticalCash: number;
    reconciliationVariance: number;
    reconciliationDate: string;
    reinvestable: number;
    safetyReserve: number;
  };
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [savingReconciliation, setSavingReconciliation] = useState(false);
  const latestReconciliation = data.dailyClosings[0] || null;
  const todayClosing = data.dailyClosings.find((closing) => closing.closeDate === data.dailyClosingPreview.closeDate) || null;
  const theoreticalAccounts = useMemo(() => calculateTreasuryAccounts({
    orders: data.orders,
    purchases: data.purchases,
    supplierPayments: data.supplierPayments,
    expenses: data.expenses,
    ads: data.ads,
    capital: data.capital,
    carrierSettlementAdjustment: data.carrierSettlements.reduce((sum, settlement) => sum + settlement.differenceAmount, 0),
  }), [data.orders, data.purchases, data.supplierPayments, data.expenses, data.ads, data.capital, data.carrierSettlements]);
  const reconciledAccounts = useMemo(
    () => applyTreasuryReconciliation(theoreticalAccounts, latestReconciliation),
    [theoreticalAccounts, latestReconciliation],
  );

  async function saveReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingReconciliation || !data.access.canEdit) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setSavingReconciliation(true);
    try {
      await submit("saveDailyClosing", Object.fromEntries(new FormData(form).entries()) as Record<string, FormDataEntryValue>);
      setShowReconciliation(false);
    } finally {
      setSavingReconciliation(false);
    }
  }
  const purchasePlan = useMemo(
    () => buildPurchasePlan(data.stockRecommendations, metrics.reinvestable),
    [data.stockRecommendations, metrics.reinvestable],
  );
  const executablePurchaseSpend = purchasePlan.supplierGroups
    .filter((group) => group.meetsMinimumOrder)
    .reduce((sum, group) => sum + group.totalCost, 0);
  const forecastDate = businessDateKey(new Date());
  const forecast = useMemo(
    () => buildCashflowForecast({
      asOf: forecastDate,
      openingCash: metrics.cash,
      safetyReserve: metrics.safetyReserve,
      supplierInvoices: data.supplierInvoices,
      expenses: data.expenses,
      purchases: data.purchases,
      orders: data.orders,
      plannedPurchaseSpend: executablePurchaseSpend,
    }),
    [forecastDate, data.supplierInvoices, data.expenses, data.purchases, data.orders, executablePurchaseSpend, metrics.cash, metrics.safetyReserve],
  );

  const datedEvents = forecast.events.filter((event) => !event.scenario);
  const purchaseScenario = forecast.events.find((event) => event.scenario);
  const reserveRisk = forecast.firstReserveRiskDate;
  const scenarioReserveRisk = forecast.scenarioFirstReserveRiskDate;
  const negativeRisk = forecast.firstNegativeDate;
  const scenarioNegativeRisk = forecast.scenarioFirstNegativeDate;
  const totalUndatedReceivables = forecast.deliveredReceivables + forecast.transitReceivables;

  return (
    <div className="reports-page cashflow-page">
      <section className="report-automation-banner cashflow-banner">
        <div>
          <span>↗</span>
          <div>
            <strong>Prévision prudente de trésorerie</strong>
            <p>Les projections utilisent uniquement les sorties déjà connues et datées. Les ventes futures ne sont jamais inventées et les encaissements sans date restent séparés.</p>
          </div>
        </div>
        <small>Base · {dateLabel(forecast.asOf)}</small>
      </section>

      <section className="kpi-grid cashflow-main-kpis">
        <Kpi label={metrics.reconciliationDate ? "Trésorerie réelle estimée" : "Trésorerie théorique"} value={money(forecast.openingCash)} detail={metrics.reconciliationDate ? `Dernier contrôle : ${dateLabel(metrics.reconciliationDate)}` : "Aucun rapprochement réel enregistré"} danger={forecast.openingCash < forecast.safetyReserve} />
        <Kpi label="Sorties datées · 60 j" value={money(forecast.scheduledOutflows60)} detail="Factures fournisseurs + dépenses non payées" danger={forecast.scheduledOutflows60 > forecast.openingCash} />
        <Kpi label="Engagements sans date" value={money(forecast.undatedSupplierCommitments)} detail="Anciens achats fournisseurs non facturés" danger={forecast.undatedSupplierCommitments > 0} />
        <Kpi label="À encaisser sans date" value={money(totalUndatedReceivables)} detail={`Livré ${money(forecast.deliveredReceivables)} · transit ${money(forecast.transitReceivables)}`} />
      </section>

      <section className="panel treasury-reconciliation-panel">
        <div className="section-toolbar">
          <div>
            <span className="card-kicker">Rapprochement caisse / banque</span>
            <h2>Comparer le logiciel avec l’argent réellement présent</h2>
            <p>{latestReconciliation ? `Dernier contrôle le ${dateLabel(latestReconciliation.closeDate)} · correction conservée ${money(latestReconciliation.totalVariance)}.` : "Aucun contrôle réel enregistré : la trésorerie reste entièrement théorique."}</p>
          </div>
          <button className="primary-button" type="button" disabled={!data.access.canEdit} onClick={() => setShowReconciliation((value) => !value)}>
            {showReconciliation ? "Fermer" : "Vérifier ma trésorerie"}
          </button>
        </div>
        <div className="financial-account-grid treasury-real-grid">
          <article>
            <span>Banque / carte estimée</span>
            <strong className={moneyTone(reconciledAccounts.bank)}>{money(reconciledAccounts.bank)}</strong>
            <small>Théorique {money(theoreticalAccounts.bank)}{latestReconciliation ? ` · correction ${money(latestReconciliation.bankVariance)}` : ""}</small>
          </article>
          <article>
            <span>Caisse / espèces estimée</span>
            <strong className={moneyTone(reconciledAccounts.cash)}>{money(reconciledAccounts.cash)}</strong>
            <small>Théorique {money(theoreticalAccounts.cash)}{latestReconciliation ? ` · correction ${money(latestReconciliation.cashVariance)}` : ""}</small>
          </article>
          <article>
            <span>Autres comptes estimés</span>
            <strong className={moneyTone(reconciledAccounts.other)}>{money(reconciledAccounts.other)}</strong>
            <small>Théorique {money(theoreticalAccounts.other)}{latestReconciliation ? ` · correction ${money(latestReconciliation.otherVariance)}` : ""}</small>
          </article>
        </div>
        {showReconciliation ? (
          <form className="account-settings-form treasury-check-form" onSubmit={(event) => void saveReconciliation(event)}>
            <label>
              <span>Banque / carte réellement disponible (MAD)</span>
              <input name="actualBank" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={todayClosing ? String(todayClosing.actualBank) : ""} placeholder={String(data.dailyClosingPreview.expectedBank)} required />
              <small>Le logiciel attend {money(data.dailyClosingPreview.expectedBank)}</small>
            </label>
            <label>
              <span>Caisse / espèces réellement disponible (MAD)</span>
              <input name="actualCash" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={todayClosing ? String(todayClosing.actualCash) : ""} placeholder={String(data.dailyClosingPreview.expectedCash)} required />
              <small>Le logiciel attend {money(data.dailyClosingPreview.expectedCash)}</small>
            </label>
            <label>
              <span>Autres comptes réellement disponibles (MAD)</span>
              <input name="actualOther" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={todayClosing ? String(todayClosing.actualOther) : ""} placeholder={String(data.dailyClosingPreview.expectedOther)} required />
              <small>Le logiciel attend {money(data.dailyClosingPreview.expectedOther)}</small>
            </label>
            <label>
              <span>Explication éventuelle</span>
              <input name="note" maxLength={500} defaultValue={todayClosing?.note || ""} placeholder="Ex. dépense oubliée, dépôt bancaire en attente…" />
              <small>L’écart est conservé dans l’historique pour expliquer le solde.</small>
            </label>
            <div className="account-form-footer">
              <p>Théorique total : <strong>{money(data.dailyClosingPreview.expectedTotal)}</strong></p>
              <button className="primary-button" type="submit" disabled={savingReconciliation || !data.access.canEdit}>{savingReconciliation ? "Vérification…" : todayClosing ? "Mettre à jour le contrôle" : "Enregistrer le contrôle réel"}</button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="cashflow-horizon-grid">
        {forecast.horizons.map((horizon) => (
          <article key={horizon.days} className={horizon.baselineBalance < forecast.safetyReserve ? "cashflow-horizon danger" : "cashflow-horizon"}>
            <div className="cashflow-horizon-head">
              <span>Dans {horizon.days} jours</span>
              <small>{dateLabel(horizon.date)}</small>
            </div>
            <strong className={moneyTone(horizon.baselineBalance)}>{money(horizon.baselineBalance)}</strong>
            <p>Après {money(horizon.scheduledOutflows)} de sorties datées.</p>
            <div className="cashflow-horizon-reserve">
              <span>Vs réserve</span>
              <strong className={moneyTone(horizon.reserveGap)}>{horizon.reserveGap >= 0 ? "+" : ""}{money(horizon.reserveGap)}</strong>
            </div>
            {forecast.plannedPurchaseSpend > 0 ? (
              <div className="cashflow-horizon-scenario">
                <span>Si plan d’achat exécuté maintenant</span>
                <strong className={moneyTone(horizon.scenarioBalance)}>{money(horizon.scenarioBalance)}</strong>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      <section className="panel cashflow-risk-panel">
        <div>
          <span className="card-kicker">À surveiller</span>
          <h2>{negativeRisk ? `Cash négatif prévu le ${dateLabel(negativeRisk)}` : reserveRisk ? `Réserve touchée le ${dateLabel(reserveRisk)}` : "Aucun passage sous la réserve avec les flux datés connus"}</h2>
          <p>Réserve de sécurité actuelle : {money(forecast.safetyReserve)}.</p>
        </div>
        {forecast.plannedPurchaseSpend > 0 ? (
          <div className={scenarioNegativeRisk || scenarioReserveRisk ? "cashflow-scenario-warning" : "cashflow-scenario-ok"}>
            <span>Scénario réapprovisionnement</span>
            <strong>{money(forecast.plannedPurchaseSpend)}</strong>
            <small>{scenarioNegativeRisk ? `Cash négatif dès le ${dateLabel(scenarioNegativeRisk)}` : scenarioReserveRisk ? `Réserve touchée le ${dateLabel(scenarioReserveRisk)}` : "Le plan reste au-dessus de la réserve avec les échéances connues."}</small>
          </div>
        ) : <div className="cashflow-scenario-ok"><span>Scénario réapprovisionnement</span><strong>0 MAD</strong><small>Aucun bon supplémentaire finançable proposé actuellement.</small></div>}
      </section>

      <section className="panel">
        <PanelHead kicker="Échéancier" title="Sorties de trésorerie connues" total={String(datedEvents.length)} />
        {datedEvents.length ? (
          <div className="cashflow-timeline">
            {datedEvents.slice(0, 100).map((event) => (
              <article key={event.key}>
                <div className="cashflow-date"><strong>{dateLabel(event.date)}</strong><small>{event.kind}</small></div>
                <div><strong>{event.label}</strong><small>{event.detail}</small></div>
                <strong className="money-negative">-{money(event.amount)}</strong>
                <div><span>Solde après</span><strong className={moneyTone(event.balanceAfter)}>{money(event.balanceAfter)}</strong></div>
              </article>
            ))}
          </div>
        ) : <div className="pending-empty">✓ Aucune facture fournisseur ou dépense non payée avec échéance connue.</div>}
      </section>

      <section className="cashflow-secondary-grid">
        <article className="panel">
          <PanelHead kicker="Non daté" title="Engagements fournisseurs" total={money(forecast.undatedSupplierCommitments)} />
          <p className="profitability-note">Ces achats sont bien des dettes, mais Maison Jiya ne connaît pas leur date de paiement. Ils sont donc affichés ici sans les placer artificiellement dans 7, 30 ou 60 jours.</p>
          {forecast.undatedSupplierCommitments > 0 ? <div className="cashflow-callout warning"><strong>{money(forecast.undatedSupplierCommitments)}</strong><span>à garder disponible en plus des échéances datées.</span></div> : <div className="pending-empty">✓ Aucun engagement fournisseur non daté.</div>}
        </article>
        <article className="panel">
          <PanelHead kicker="Encaissements" title="Argent attendu sans date" total={money(totalUndatedReceivables)} />
          <p className="profitability-note">Cet argent n’augmente pas la projection tant qu’aucune date de virement réelle n’est connue. Cela évite de surestimer votre trésorerie future.</p>
          <div className="cashflow-receivable-split">
            <div><span>Livré · transporteur doit virer</span><strong>{money(forecast.deliveredReceivables)}</strong></div>
            <div><span>Confirmé / en transit</span><strong>{money(forecast.transitReceivables)}</strong></div>
          </div>
        </article>
      </section>

      {purchaseScenario ? (
        <section className="panel cashflow-purchase-scenario">
          <div>
            <span className="card-kicker">Scénario facultatif</span>
            <h2>Plan d’achat intelligent · {money(purchaseScenario.amount)}</h2>
            <p>La colonne « si plan d’achat exécuté » simule ce décaissement aujourd’hui. Aucun bon supplémentaire n’est créé depuis cette page.</p>
          </div>
          <div><span>Solde immédiatement après scénario</span><strong className={moneyTone(forecast.openingCash - purchaseScenario.amount)}>{money(forecast.openingCash - purchaseScenario.amount)}</strong></div>
        </section>
      ) : null}
    </div>
  );
}

function ReportsPage({ data }: { data: Data }) {
  const allocationPolicy = allocationPolicyFromSettings(data.settings);
  const now = new Date();
  const today = businessDateKey(now);
  const weekStartKey = businessDateKey(new Date(now.getTime() - 6 * 86_400_000));
  const monthKey = today.slice(0, 7);
  const monthStartKey = `${monthKey}-01`;
  const completed = data.orders.filter((order) => Boolean(deliveryRecognitionDate(order, data.orderStatusHistory)));
  const collected = data.orders.filter((order) => order.paymentStatus === "Encaissé");
  const deliveredBetween = (startKey: string, endKey: string) => completed.filter((order) => {
    const recognizedAt = deliveryRecognitionDate(order, data.orderStatusHistory);
    if (!recognizedAt) return false;
    const key = businessDateKey(recognizedAt);
    return key >= startKey && key <= endKey;
  });
  const returnedBetween = (startKey: string, endKey: string) => completed.filter((order) => {
    const recognizedAt = returnRecognitionDate(order.id, data.orderStatusHistory);
    if (!recognizedAt) return false;
    const key = businessDateKey(recognizedAt);
    return key >= startKey && key <= endKey;
  });
  const periodCard = (label: string, startKey: string, endKey: string) => {
    const deliveredOrders = deliveredBetween(startKey, endKey);
    const returnedOrders = returnedBetween(startKey, endKey);
    const periodOrders = [
      ...deliveredOrders.map((order) => ({ ...order, status: "Livrée", returnCost: 0 })),
      ...returnedOrders.map((order) => ({
        ...order,
        status: "Livrée",
        saleAmount: -order.saleAmount,
        productCost: 0,
        shippingCost: 0,
        fees: 0,
      })),
    ];
    const periodAds = data.ads.filter((ad) => {
      const key = businessDateKey(ad.performanceDate);
      return key >= startKey && key <= endKey;
    });
    const periodExpenses = data.expenses.filter((expense) => {
      const key = businessDateKey(expense.expenseDate);
      return key >= startKey && key <= endKey;
    });
    const finance = calculateOperatingProfit(periodOrders, periodAds, periodExpenses);
    return {
      label,
      count: deliveredOrders.length,
      revenue: finance.deliveredRevenue,
      profit: finance.profit,
      adSpend: finance.adSpend,
      operatingExpenses: finance.operatingExpenses,
    };
  };
  const periods = [
    periodCard("Aujourd’hui", today, today),
    periodCard("7 derniers jours", weekStartKey, today),
    periodCard("Mois en cours", monthStartKey, today),
  ];
  const stockAlerts = data.stockRecommendations.filter((row) => row.status !== "OK");
  const delayed = data.orders.filter((order) => ["Confirmée", "Expédiée", "En livraison"].includes(order.status) && elapsedDays(order.updatedAt || order.createdAt) >= 4);
  const unpaid = data.orders.filter((order) => order.status === "Livrée" && order.paymentStatus !== "Encaissé" && elapsedDays(order.updatedAt || order.createdAt) >= 3);
  const supplierDue = data.purchases.filter((purchase) => !purchase.invoiceId && purchase.paymentStatus !== "Payé");
  const supplierInvoiceDue = data.supplierInvoices.filter((invoice) => invoice.remainingAmount > 0);
  const dormantProducts = data.products.filter((product) => {
    if (product.stockQuantity <= 0 || elapsedDays(product.createdAt) < 45) return false;
    const recentOutbound = data.stockMovements.some((movement) => movement.productId === product.id && ["Commande", "Vente", "Inventaire -"].includes(movement.movementType) && elapsedDays(movement.createdAt) < 45);
    return !recentOutbound;
  });
  const theoreticalTreasury = calculateTreasuryAccounts({
    orders: data.orders,
    purchases: data.purchases,
    supplierPayments: data.supplierPayments,
    expenses: data.expenses,
    ads: data.ads,
    capital: data.capital,
    carrierSettlementAdjustment: data.carrierSettlements.reduce((sum, settlement) => sum + settlement.differenceAmount, 0),
  });
  const treasury = applyTreasuryReconciliation(theoreticalTreasury, data.dailyClosings[0] || null);
  const storeCash = treasury.cash;
  const bank = treasury.bank;
  const otherAccounts = treasury.other;
  const carrierMoney = data.orders.filter((order) => order.status === "Livrée" && order.paymentStatus === "À encaisser").reduce((sum, order) => sum + order.saleAmount - order.shippingCost - order.fees, 0);
  const receivables = data.orders.filter((order) => ["Confirmée", "Expédiée", "En livraison"].includes(order.status) && order.paymentStatus !== "Encaissé").reduce((sum, order) => sum + order.saleAmount - order.shippingCost - order.fees, 0);
  const unpaidExpenses = data.expenses.filter((expense) => expense.paymentStatus !== "Payé" && businessDateKey(expense.expenseDate) <= today);
  const automaticAllocations = data.capital.filter((entry) => entry.isAutomatic);
  const positiveProfit = automaticAllocations.reduce((sum, entry) => sum + entry.amount, 0);
  const allocationAmount = (category: string) => automaticAllocations.filter((entry) => entry.category === category).reduce((sum, entry) => sum + entry.amount, 0);
  const alerts = [
    ...stockAlerts.map((row) => ({
      key: `stock-${row.productId}`,
      level: row.status === "À prévoir" ? "warning" : "danger",
      title: `${row.productName} : ${row.status.toLocaleLowerCase("fr")} · stock ${row.stockQuantity}`,
      detail: row.recommendedQuantity > 0
        ? `Seuil ${row.alertThreshold} · commander ${row.recommendedQuantity} unité(s) · ${row.supplier}`
        : `Seuil ${row.alertThreshold} · ${row.pendingInbound} unité(s) déjà en attente de réception`,
    })),
    ...delayed.map((order) => ({ key: `delay-${order.id}`, level: "warning", title: `${order.orderRef} semble bloquée`, detail: `${order.carrier} · ${order.status} depuis ${elapsedDays(order.updatedAt || order.createdAt)} jours` })),
    ...unpaid.map((order) => ({ key: `unpaid-${order.id}`, level: "danger", title: `${order.orderRef} livrée mais non encaissée`, detail: `${order.carrier} · ${money(order.saleAmount - order.shippingCost - order.fees)} à vérifier` })),
    ...supplierDue.map((purchase) => ({ key: `supplier-${purchase.id}`, level: "danger", title: `${purchase.supplier} : paiement fournisseur à prévoir`, detail: `${purchase.item} · ${money(purchase.totalCost)} à payer` })),
    ...supplierInvoiceDue.map((invoice) => ({
      key: `supplier-invoice-${invoice.id}`,
      level: invoice.isOverdue ? "danger" : "warning",
      title: `${invoice.supplierName || "Fournisseur"} : facture ${invoice.invoiceNumber} ${invoice.isOverdue ? "en retard" : "à payer"}`,
      detail: `${invoice.purchaseRef} · échéance ${dateLabel(invoice.dueDate)} · reste ${money(invoice.remainingAmount)}`,
    })),
    ...unpaidExpenses.map((expense) => ({ key: `expense-${expense.id}`, level: "danger", title: `${expense.label} : dépense à payer`, detail: `${expense.category} · ${money(expense.amount)} à prévoir` })),
    ...dormantProducts.map((product) => ({ key: `dormant-${product.id}`, level: "warning", title: `${product.name} : stock dormant`, detail: `${product.stockQuantity} unité(s) sans sortie depuis au moins 45 jours` })),
  ];
  const platformRows = groupOrderAnalysis(completed.filter((order) => ["Facebook", "Instagram", "TikTok", "WhatsApp"].includes(order.source)), (order) => order.source);
  const campaignRows = groupOrderAnalysis(completed.filter((order) => order.campaign), (order) => order.campaign);
  return <div className="reports-page">
    <section className="report-automation-banner"><div><span>↻</span><div><strong>Rapports automatiques actifs</strong><p>Les chiffres quotidiens, hebdomadaires et mensuels se recalculent à chaque commande, paiement, retour, achat, dépense ou publicité.</p></div></div><small>Actualisé maintenant</small></section>
    <section className="report-period-grid">{periods.map((period) => <article key={period.label}><span>{period.label}</span><strong>{money(period.profit)}</strong><p>{period.count} livrée{period.count === 1 ? "" : "s"} · CA {money(period.revenue)}</p><small>Meta {money(period.adSpend)} · charges {money(period.operatingExpenses)}</small></article>)}</section>
    <section className="financial-account-grid"><article><span>Caisse / espèces</span><strong className={moneyTone(storeCash)}>{money(storeCash)}</strong><small>Ventes magasin et mouvements payés en espèces</small></article><article><span>Banque / carte</span><strong className={moneyTone(bank)}>{money(bank)}</strong><small>Virements et paiements affectés à Banque ou Carte</small></article><article><span>Autres comptes</span><strong className={moneyTone(otherAccounts)}>{money(otherAccounts)}</strong><small>Mouvements explicitement classés « Autre »</small></article><article><span>Argent transporteurs</span><strong>{money(carrierMoney)}</strong><small>Livré, en attente de virement</small></article><article><span>Créances en cours</span><strong>{money(receivables)}</strong><small>Confirmé ou en transit</small></article></section>
    <section className="allocation-report"><div><span className="card-kicker">Mouvements automatiques enregistrés</span><h2>{money(positiveProfit)} affectés</h2><p>Chaque vente encaissée crée trois enveloppes théoriques à partir de la marge commande. Les dépenses Meta réelles et charges restent déduites globalement pour éviter le double comptage.</p></div><div><article><span>Réinvestissement · {allocationPolicy.reinvestment}%</span><strong>{money(allocationAmount("Réinvestissement"))}</strong></article><article><span>Salaire personnel · {allocationPolicy.salary}%</span><strong>{money(allocationAmount("Salaire personnel"))}</strong></article><article><span>Fonds d’urgence · {allocationPolicy.emergency}%</span><strong>{money(allocationAmount("Fonds d’urgence"))}</strong></article></div></section>
    <section className="panel alerts-panel"><PanelHead kicker="Surveillance automatique" title="Alertes actives" total={String(alerts.length)} />{alerts.length ? <div className="alerts-list">{alerts.map((alert) => <article className={alert.level} key={alert.key}><span aria-hidden="true">{alert.level === "danger" ? "!" : "◷"}</span><div><strong>{alert.title}</strong><small>{alert.detail}</small></div></article>)}</div> : <div className="pending-empty">✓ Aucun stock critique, colis bloqué ou encaissement en retard détecté.</div>}</section>
    <div className="report-analysis-grid"><AnalysisTable title="Marge commandes par produit" rows={groupOrderAnalysis(completed, (order) => order.products)} /><AnalysisTable title="Marge commandes par ville" rows={groupOrderAnalysis(completed, (order) => order.city)} /><AnalysisTable title="Marge commandes par source" rows={groupOrderAnalysis(completed, (order) => order.source)} /><AnalysisTable title="Marge commandes par agence" rows={groupOrderAnalysis(completed.filter((order) => order.fulfillmentType !== "Magasin physique"), (order) => order.carrier)} /><AnalysisTable title="Facebook, Instagram, TikTok et WhatsApp" rows={platformRows} /><AnalysisTable title="Campagnes reliées aux commandes" rows={campaignRows} /></div>
    <section className="panel exact-profit-panel"><PanelHead kicker="Rentabilité" title="Marge par commande avant dépenses globales" total={`${completed.length} livrée${completed.length === 1 ? "" : "s"}`} /><p className="profitability-note">Cette marge retire le produit, la livraison, les frais et les retours. La dépense Meta réelle et les charges d’exploitation sont déduites au niveau global, pas artificiellement réparties sur chaque commande.</p><div className="table-scroll"><table><thead><tr><th>Commande</th><th>Produit</th><th>Source / campagne</th><th>Vente</th><th>Produit</th><th>Livraison</th><th>Frais</th><th>Pub attribuée*</th><th>Retour</th><th>Marge commande</th></tr></thead><tbody>{completed.slice(0, 200).map((order) => <tr key={order.id}><td><strong>{order.orderRef}</strong><small>{dateLabel(deliveryRecognitionDate(order, data.orderStatusHistory) || order.createdAt)}</small></td><td>{order.products}</td><td>{order.source}<small>{order.campaign || "Sans campagne"}</small></td><td>{money(order.saleAmount)}</td><td>{money(order.productCost)}</td><td>{money(order.shippingCost)}</td><td>{money(order.fees)}</td><td>{money(order.adCost)}</td><td>{money(order.returnCost)}</td><td className={moneyTone(exactOrderProfit(order))}><strong>{money(exactOrderProfit(order))}</strong></td></tr>)}</tbody></table></div></section>
  </div>;
}

function CapitalPage({
  data,
  metrics,
  onAdd,
  onEdit,
  onDelete,
}: {
  data: Data;
  metrics: {
    cash: number;
    capitalNet: number;
    netCollected: number;
    profit: number;
    reinvest: number;
    reinvestable: number;
    theoreticalSalary: number;
    theoreticalEmergency: number;
    salaryWithdrawable: number;
    emergencyAvailable: number;
    cashBackedProfit: number;
    protectedTotal: number;
    protectionShortfall: number;
    freeCashAfterProtection: number;
    fundedEnvelopePool: number;
    allocationFundingRate: number;
    unallocatedFreeCash: number;
    unpaidPurchases: number;
    unpaidOperatingExpenses: number;
    safetyReserve: number;
  };
  onAdd: () => void;
  onEdit: (selection: EditableEntity) => void;
  onDelete: (selection: EditableEntity) => void;
}) {
  const currentYear = new Date().getFullYear();
  const allocationPolicy = allocationPolicyFromSettings(data.settings);
  const personalSalary = metrics.theoreticalSalary;
  const emergencyFund = metrics.theoreticalEmergency;
  const distributableCapital = metrics.reinvest + personalSalary + emergencyFund;
  const fundingPercent = Math.round(metrics.allocationFundingRate * 100);
  const automatedFlows: CapitalFlow[] = [
    ...data.orders
      .filter((order) => order.paymentStatus === "Encaissé")
      .map((order) => ({
        direction: "Entrée" as const,
        source: `Ventes · ${order.source || "Non renseignée"}`,
        amount: Math.max(0, order.saleAmount - order.shippingCost),
        date: order.paidAt || order.createdAt,
      })),
    ...data.orders
      .filter((order) => order.paymentStatus === "Encaissé" && order.fees > 0)
      .map((order) => ({
        direction: "Sortie" as const,
        source: "Frais de commande",
        amount: order.fees,
        date: order.paidAt || order.createdAt,
      })),
    ...data.orders
      .filter((order) => order.returnCost > 0)
      .map((order) => ({
        direction: "Sortie" as const,
        source: "Retours déclarés",
        amount: order.returnCost,
        date: order.updatedAt || order.createdAt,
      })),
    ...data.purchases
      .filter((purchase) => !purchase.invoiceId && purchase.paymentStatus === "Payé")
      .map((purchase) => ({
        direction: "Sortie" as const,
        source: `Achats fournisseurs · ${purchase.account || "Banque"}`,
        amount: purchase.totalCost,
        date: purchase.paidAt || purchase.createdAt,
      })),
    ...data.supplierPayments.map((payment) => ({
      direction: "Sortie" as const,
      source: `Paiement fournisseur · ${payment.account || "Banque"}`,
      amount: payment.amount,
      date: payment.paidAt,
    })),
    ...data.ads
      .filter((ad) => ad.spend > 0)
      .map((ad) => ({
        direction: "Sortie" as const,
        source: "Publicités Meta",
        amount: ad.spend,
        date: ad.performanceDate,
      })),
    ...data.expenses
      .filter((expense) => expense.paymentStatus === "Payé")
      .map((expense) => ({
        direction: "Sortie" as const,
        source: `Dépenses · ${expense.category} · ${expense.account}`,
        amount: expense.amount,
        date: expense.paidAt || expense.expenseDate,
      })),

  ];
  const manualEntries = data.capital.filter((entry) => !entry.isAutomatic);
  const manualFlows: CapitalFlow[] = manualEntries.map((entry) => ({
    direction: entry.direction === "Entrée" ? "Entrée" : "Sortie",
    source: `Capital · ${entry.category || "Sans source"}`,
    amount: entry.amount,
    date: entry.entryDate,
  }));
  const flows = [...automatedFlows, ...manualFlows];
  const pendingOrders = data.orders.filter((order) => order.status === "Livrée" && order.paymentStatus === "À encaisser");
  const pendingBySource = Array.from(new Set(pendingOrders.map((order) => order.source || "Non renseignée")))
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((source) => {
      const orders = pendingOrders.filter((order) => (order.source || "Non renseignée") === source);
      return {
        source,
        count: orders.length,
        amount: orders.reduce((sum, order) => sum + Math.max(0, order.saleAmount - order.shippingCost - order.fees), 0),
      };
    });
  const pendingTotal = pendingBySource.reduce((sum, row) => sum + row.amount, 0);
  const dataYears = Array.from(new Set(flows.map((flow) => Number(flow.date.slice(0, 4))).filter(Number.isFinite))).sort((a, b) => b - a);
  const yearOptions = Array.from(new Set([currentYear, ...dataYears])).sort((a, b) => b - a);
  const [selectedYear, setSelectedYear] = useState(() => dataYears[0] || currentYear);
  const annualEntries = flows.filter((flow) => Number(flow.date.slice(0, 4)) === selectedYear);
  const sources = Array.from(new Set(annualEntries.map((flow) => flow.source))).sort((a, b) => a.localeCompare(b, "fr"));
  const rows = capitalMonthLabels.map((month, index) => {
    const entries = annualEntries.filter((entry) => Number(entry.date.slice(5, 7)) === index + 1);
    const sourceValues = Object.fromEntries(sources.map((source) => [source, entries.filter((entry) => entry.source === source).reduce((sum, entry) => sum + (entry.direction === "Entrée" ? entry.amount : -entry.amount), 0)]));
    const inflow = entries.filter((entry) => entry.direction === "Entrée").reduce((sum, entry) => sum + entry.amount, 0);
    const outflow = entries.filter((entry) => entry.direction !== "Entrée").reduce((sum, entry) => sum + entry.amount, 0);
    return {
      month,
      monthShort: capitalMonthShort[index],
      sourceValues,
      inflow,
      outflow,
      net: inflow - outflow,
    };
  });
  const annualInflow = rows.reduce((sum, row) => sum + row.inflow, 0),
    annualOutflow = rows.reduce((sum, row) => sum + row.outflow, 0),
    annualNet = annualInflow - annualOutflow;
  return (
    <>
      <section className="capital-automation-banner">
        <div className="automation-copy">
          <span className="automation-icon">↻</span>
          <div>
            <strong>Automatisation active</strong>
            <p>Les mouvements sont calculés depuis vos commandes, achats, dépenses, publicités et retours. Aucune double saisie n’est nécessaire.</p>
          </div>
        </div>
        <div className="automation-tags">
          <span>Ventes encaissées</span>
          <span>Achats payés</span>
          <span>Dépenses payées</span>
          <span>Meta saisie</span>
          <span>Retours & frais</span>
        </div>
      </section>
      <section className="hero-grid">
        <article className="hero-card">
          <div className="hero-heading">
            <div>
              <p>Capital liquide réel estimé</p>
              <h2>{money(metrics.cash)}</h2>
              <small className="capital-main-note">Après le dernier rapprochement caisse / banque</small>
            </div>
          </div>
          <div className="capital-summary">
            <p>
              Fournisseurs réservés
              <strong>{money(metrics.unpaidPurchases)}</strong>
            </p>
            <p>
              Charges réservées<strong>{money(metrics.unpaidOperatingExpenses)}</strong>
            </p>
            <p>
              Réserve protégée<strong>{money(metrics.safetyReserve)}</strong>
            </p>
            <p>
              Cash libre après protection<strong className={moneyTone(metrics.freeCashAfterProtection)}>{money(metrics.freeCashAfterProtection)}</strong>
            </p>
            <p>
              Bénéfice disponible en cash<strong className={moneyTone(metrics.cashBackedProfit)}>{money(metrics.cashBackedProfit)}</strong>
            </p>
            <p>
              Manque de couverture<strong className={metrics.protectionShortfall > 0 ? "money-negative" : "money-positive"}>{money(metrics.protectionShortfall)}</strong>
            </p>
          </div>
        </article>
        <article className="reinvest-card unallocated-card">
          <span className="card-kicker">Répartition automatique</span>
          <h2>{fundingPercent}% financé</h2>
          <p>Les enveloppes automatiques restent théoriques tant que le bénéfice net et la trésorerie libre ne permettent pas réellement de les financer.</p>
          <small>{money(metrics.fundedEnvelopePool)} disponibles sur {money(distributableCapital)} affectés</small>
        </article>
      </section>
      <section className="capital-envelope-section">
        <div className="capital-envelope-head">
          <span className="card-kicker">Répartition personnelle</span>
          <h2>Vos trois enveloppes</h2>
          <p>Chaque commande encaissée crée automatiquement trois écritures liées à sa marge commande. Le montant réellement mobilisable reste plafonné par la trésorerie après fournisseurs, charges, Meta et réserve.</p>
        </div>
        <div className="capital-envelope-grid">
          <article className="capital-envelope-card reinvest-envelope">
            <span className="envelope-icon">↗</span>
            <span className="envelope-label">Montant de réinvestissement</span>
            <h3>{money(metrics.reinvestable)}</h3>
            <p>Montant réellement réinvestissable aujourd’hui sans toucher aux fournisseurs, charges, réserve ni dépasser le bénéfice disponible.</p>
            <small>Affectation théorique : {money(metrics.reinvest)} · financée à {fundingPercent}%</small>
          </article>
          <article className="capital-envelope-card salary-envelope">
            <span className="envelope-icon">◎</span>
            <span className="envelope-label">Retirable personnel maintenant</span>
            <h3>{money(metrics.salaryWithdrawable)}</h3>
            <p>Part réellement retirable aujourd’hui après protection du magasin et plafonnement par le bénéfice net disponible.</p>
            <small>Affectation théorique : {money(personalSalary)} · {allocationPolicy.salary}%</small>
          </article>
          <article className="capital-envelope-card emergency-envelope">
            <span className="envelope-icon">◇</span>
            <span className="envelope-label">Fonds d’urgence réellement couvert</span>
            <h3>{money(metrics.emergencyAvailable)}</h3>
            <p>Part de l’enveloppe urgence réellement couverte par le bénéfice disponible et la trésorerie libre.</p>
            <small>Affectation théorique : {money(emergencyFund)} · {allocationPolicy.emergency}%</small>
          </article>
        </div>
      </section>
      <section className="panel capital-protection-panel">
        <PanelHead kicker="Capital intelligent" title="Ce que vous pouvez réellement utiliser" total={money(metrics.cashBackedProfit)} />
        <div className="financial-account-grid">
          <article><span>Capital liquide réel</span><strong className={moneyTone(metrics.cash)}>{money(metrics.cash)}</strong><small>Argent estimé présent après rapprochement</small></article>
          <article><span>Argent protégé</span><strong>{money(metrics.protectedTotal)}</strong><small>Fournisseurs + charges + réserve sécurité</small></article>
          <article><span>Bénéfice disponible</span><strong className={moneyTone(metrics.cashBackedProfit)}>{money(metrics.cashBackedProfit)}</strong><small>Plafonné par le bénéfice net et le cash libre</small></article>
          <article><span>Retirable personnel</span><strong className={moneyTone(metrics.salaryWithdrawable)}>{money(metrics.salaryWithdrawable)}</strong><small>Sans fragiliser les obligations du magasin</small></article>
          <article><span>Réinvestissable</span><strong className={moneyTone(metrics.reinvestable)}>{money(metrics.reinvestable)}</strong><small>Disponible pour nouveaux achats / croissance</small></article>
          <article><span>Cash libre non affecté</span><strong className={moneyTone(metrics.unallocatedFreeCash)}>{money(metrics.unallocatedFreeCash)}</strong><small>Reste après financement des enveloppes</small></article>
        </div>
        {metrics.protectionShortfall > 0 ? (
          <div className="cashflow-callout warning">
            <strong>{money(metrics.protectionShortfall)}</strong>
            <span>manquent pour couvrir fournisseurs, charges et réserve. Salaire et réinvestissement restent donc bloqués.</span>
          </div>
        ) : (
          <div className="cashflow-callout">
            <strong>Protection couverte</strong>
            <span>Les obligations connues et la réserve de sécurité sont couvertes par la trésorerie actuelle.</span>
          </div>
        )}
      </section>
      <section className="panel capital-pending-panel">
        <PanelHead kicker="Paiement à la livraison" title="Ventes livrées à encaisser" total={money(pendingTotal)} />
        <p className="pending-explainer">Ces ventes apparaissent automatiquement ici dès qu’elles sont livrées. Elles entreront dans la trésorerie après le statut « Encaissé ».</p>
        {pendingBySource.length === 0 ? (
          <div className="pending-empty">Aucune vente livrée en attente de virement.</div>
        ) : (
          <div className="pending-source-grid">
            {pendingBySource.map((row) => (
              <article key={row.source}>
                <span>{row.source}</span>
                <strong>{money(row.amount)}</strong>
                <small>
                  {row.count} commande{row.count === 1 ? "" : "s"}
                </small>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="capital-analytics-head">
        <div>
          <span className="card-kicker">Analyse mensuelle automatique</span>
          <h2>Capital par source et par mois</h2>
          <p>Ventes encaissées nettes du transport, achats payés, publicités, retours et ajustements manuels.</p>
        </div>
        <label className="year-select">
          <span>Année</span>
          <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
            {yearOptions.map((year) => (
              <option key={year}>{year}</option>
            ))}
          </select>
        </label>
      </section>
      <section className="kpi-grid three capital-year-kpis">
        <Kpi label={`Entrées ${selectedYear}`} value={money(annualInflow)} detail="Encaissements et apports" />
        <Kpi label={`Sorties ${selectedYear}`} value={money(annualOutflow)} detail="Dépenses confirmées" danger />
        <Kpi label={`Solde net ${selectedYear}`} value={money(annualNet)} detail="Entrées − sorties" danger={annualNet < 0} />
      </section>
      <section className="panel capital-chart-panel">
        <PanelHead kicker="Graphique" title={`Évolution mensuelle · ${selectedYear}`} total={`${sources.length} source${sources.length === 1 ? "" : "s"}`} />
        <MonthlyCapitalChart rows={rows} sources={sources} />
      </section>
      <section className="panel capital-table-panel">
        <PanelHead kicker="Tableau chiffré" title={`Détail des 12 mois · ${selectedYear}`} total={money(annualNet)} />
        <div className="table-scroll">
          <table className="capital-monthly-table">
            <thead>
              <tr>
                <th>Mois</th>
                {sources.map((source) => (
                  <th key={source}>{source}</th>
                ))}
                <th>Entrées</th>
                <th>Sorties</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month}>
                  <td>
                    <strong>{row.month}</strong>
                  </td>
                  {sources.map((source) => (
                    <td key={source} className={moneyTone(row.sourceValues[source])}>
                      {money(row.sourceValues[source])}
                    </td>
                  ))}
                  <td className={moneyTone(row.inflow)}>{money(row.inflow)}</td>
                  <td className={row.outflow > 0 ? "money-negative" : ""}>{money(row.outflow)}</td>
                  <td className={moneyTone(row.net)}>{money(row.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <strong>Total annuel</strong>
                </td>
                {sources.map((source) => {
                  const total = rows.reduce((sum, row) => sum + row.sourceValues[source], 0);
                  return (
                    <td key={source} className={moneyTone(total)}>
                      <strong>{money(total)}</strong>
                    </td>
                  );
                })}
                <td className={moneyTone(annualInflow)}>
                  <strong>{money(annualInflow)}</strong>
                </td>
                <td className={annualOutflow > 0 ? "money-negative" : ""}>
                  <strong>{money(annualOutflow)}</strong>
                </td>
                <td className={moneyTone(annualNet)}>
                  <strong>{money(annualNet)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <section className="panel page-panel capital-ledger-panel">
        <div className="section-toolbar">
          <div>
            <h2>Ajustements manuels</h2>
            <p>Réservé aux apports, retraits et mouvements qui ne viennent pas déjà des ventes, achats ou publicités.</p>
          </div>
          <button className="primary-button" onClick={onAdd}>
            ＋ Nouveau mouvement
          </button>
        </div>
        {manualEntries.length === 0 ? (
          <EmptyState title="Aucun ajustement manuel" text="C’est normal : les opérations courantes alimentent automatiquement le capital." />
        ) : (
          <div className="ledger-list">
            {manualEntries.map((r) => (
              <article key={r.id}>
                <span className={r.direction === "Entrée" ? "ledger-icon in" : "ledger-icon out"}>{r.direction === "Entrée" ? "↘" : "↗"}</span>
                <div>
                  <strong>{r.label}</strong>
                  <small>
                    {r.category} · {dateLabel(r.entryDate)}
                  </small>
                </div>
                <b className={r.direction === "Entrée" ? "money-positive" : "money-negative"}>
                  {r.direction === "Entrée" ? "+" : "−"}
                  {money(r.amount)}
                </b>
                <RecordActions label={`le mouvement ${r.label}`} onEdit={() => onEdit({ kind: "capital", record: r })} onDelete={() => onDelete({ kind: "capital", record: r })} />
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function MonthlyCapitalChart({
  rows,
  sources,
}: {
  rows: {
    month: string;
    monthShort: string;
    sourceValues: Record<string, number>;
    inflow: number;
    outflow: number;
    net: number;
  }[];
  sources: string[];
}) {
  if (sources.length === 0) return <EmptyState title="Aucune donnée pour cette année" text="Ajoutez un mouvement avec une date comprise dans l’année sélectionnée." />;
  const width = 920,
    height = 270,
    left = 62,
    right = 20,
    top = 22,
    bottom = 45,
    plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const maxAbs = Math.max(1, ...rows.flatMap((row) => sources.map((source) => Math.abs(row.sourceValues[source] || 0))));
  const x = (index: number) => left + (plotWidth * index) / (rows.length - 1);
  const y = (value: number) => top + plotHeight / 2 - (value / maxAbs) * (plotHeight / 2);
  const axisValues = [maxAbs, 0, -maxAbs];
  return (
    <div className="capital-chart-wrap">
      <div className="capital-chart-legend">
        {sources.map((source, index) => (
          <span key={source}>
            <i
              style={{
                background: capitalChartColors[index % capitalChartColors.length],
              }}
            />
            {source}
          </span>
        ))}
      </div>
      <svg className="capital-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Graphique du capital par source pour chaque mois">
        <title>Capital mensuel par source</title>
        {axisValues.map((value) => (
          <g key={value}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className={value === 0 ? "chart-zero" : "chart-grid"} />
            <text x={left - 10} y={y(value) + 4} textAnchor="end" className="chart-axis-value">
              {Math.round(value).toLocaleString("fr-MA")}
            </text>
          </g>
        ))}
        {rows.map((row, index) => (
          <text key={row.month} x={x(index)} y={height - 16} textAnchor="middle" className="chart-month">
            {row.monthShort}
          </text>
        ))}
        {sources.map((source, sourceIndex) => {
          const color = capitalChartColors[sourceIndex % capitalChartColors.length],
            points = rows.map((row, index) => `${x(index)},${y(row.sourceValues[source] || 0)}`).join(" ");
          return (
            <g key={source}>
              <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {rows.map((row, index) => (
                <circle key={row.month} cx={x(index)} cy={y(row.sourceValues[source] || 0)} r="4" fill={color} stroke="#fff" strokeWidth="2">
                  <title>
                    {row.month} · {source} : {money(row.sourceValues[source] || 0)}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <p className="chart-note">Valeurs positives : entrées · valeurs négatives : sorties · montants en MAD</p>
    </div>
  );
}
function Status({ value }: { value: string }) {
  const tone = ["Livrée", "Encaissé", "Payé", "Connecté", "Configuré", "Entrée", "Réintégration", "OK", "Actif", "Reçu", "Rapproché"].includes(value) ? "success" : ["Retour", "Annulée", "Annulé", "Inactif", "Refusée", "Retournée", "Remboursé", "Non encaissé", "Rupture", "Critique", "En retard"].includes(value) ? "danger" : ["Expédiée", "En livraison", "Vente", "Commande", "Commandé"].includes(value) ? "info" : "warning";
  return <span className={`status ${tone}`}>{value}</span>;
}

function ProductPricingFields({ initialPurchasePrice = 0, initialSalePrice = 0, initialMinimumSalePrice = 0 }: { initialPurchasePrice?: number; initialSalePrice?: number; initialMinimumSalePrice?: number }) {
  const [purchasePrice, setPurchasePrice] = useState(initialPurchasePrice ? String(initialPurchasePrice) : "");
  const [salePrice, setSalePrice] = useState(initialSalePrice ? String(initialSalePrice) : "");
  const [packagingCost, setPackagingCost] = useState("0");
  const [adCost, setAdCost] = useState("0");
  const [deliveryCost, setDeliveryCost] = useState("0");
  const [otherCost, setOtherCost] = useState("0");
  const [targetProfit, setTargetProfit] = useState("50");
  const amount = (value: string) => Math.max(0, Number(value) || 0);
  const totalCost = amount(purchasePrice) + amount(packagingCost) + amount(adCost) + amount(deliveryCost) + amount(otherCost);
  const suggestedPrice = Math.ceil(totalCost + amount(targetProfit));
  const actualProfit = amount(salePrice) - totalCost;
  const actualMargin = amount(salePrice) ? (actualProfit / amount(salePrice)) * 100 : 0;

  return (
    <>
      <label className="field"><span>Prix d’achat (MAD) *</span><input name="purchasePrice" type="number" inputMode="decimal" min="0" step="0.01" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} required /></label>
      <label className="field"><span>Prix de vente (MAD) *</span><input name="salePrice" type="number" inputMode="decimal" min="0" step="0.01" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} required /></label>
      <label className="field"><span>Prix de vente minimum (MAD)</span><input name="minimumSalePrice" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={initialMinimumSalePrice || initialSalePrice || ""} placeholder="Même prix si vide" /></label>
      <section className="product-pricing-calculator" aria-label="Calculateur du prix de vente">
        <div className="product-pricing-head">
          <div><strong>Ajuster le prix de vente</strong><small>Indiquez les coûts estimés pour une seule vente. Seul le prix de vente final sera enregistré.</small></div>
          <span>Calcul en MAD</span>
        </div>
        <div className="product-pricing-inputs">
          <label><span>Emballage</span><input type="number" inputMode="decimal" min="0" step="0.01" value={packagingCost} onChange={(event) => setPackagingCost(event.target.value)} /></label>
          <label><span>Publicité / vente</span><input type="number" inputMode="decimal" min="0" step="0.01" value={adCost} onChange={(event) => setAdCost(event.target.value)} /></label>
          <label><span>Livraison à votre charge</span><input type="number" inputMode="decimal" min="0" step="0.01" value={deliveryCost} onChange={(event) => setDeliveryCost(event.target.value)} /></label>
          <label><span>Autres coûts</span><input type="number" inputMode="decimal" min="0" step="0.01" value={otherCost} onChange={(event) => setOtherCost(event.target.value)} /></label>
          <label><span>Bénéfice souhaité</span><input type="number" inputMode="decimal" min="0" step="0.01" value={targetProfit} onChange={(event) => setTargetProfit(event.target.value)} /></label>
        </div>
        <div className="product-pricing-results">
          <div><span>Coût total estimé</span><strong>{money(totalCost)}</strong></div>
          <div><span>Prix conseillé</span><strong>{money(suggestedPrice)}</strong></div>
          <div><span>Bénéfice avec votre prix</span><strong className={moneyTone(actualProfit)}>{money(actualProfit)}</strong><small>Marge {actualMargin.toFixed(1)} %</small></div>
          <button type="button" onClick={() => setSalePrice(String(suggestedPrice))} disabled={!suggestedPrice}>Utiliser le prix conseillé</button>
        </div>
      </section>
    </>
  );
}

function CarrierQuoteChooser({ city, defaultCarrier = "", defaultFee = 0, locked = false }: { city: string; defaultCarrier?: string; defaultFee?: number; locked?: boolean }) {
  const [result, setResult] = useState<CarrierQuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedCarrier, setSelectedCarrier] = useState(defaultCarrier);
  const [selectedFee, setSelectedFee] = useState(defaultFee);
  const [manuallySelected, setManuallySelected] = useState(false);

  useEffect(() => {
    const cleanCity = city.trim();
    if (cleanCity.length < 2 || locked) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/integrations/carriers/quote?city=${encodeURIComponent(cleanCity)}`, { signal: controller.signal });
        const body = (await response.json()) as CarrierQuoteResult & { error?: string };
        if (!response.ok) throw new Error(body.error || "Tarifs indisponibles.");
        setResult(body);
        if (!manuallySelected && body.recommendedCarrier) {
          const recommended = body.quotes.find((quote) => quote.carrier === body.recommendedCarrier);
          setSelectedCarrier(body.recommendedCarrier);
          if (recommended?.fee !== null && recommended?.fee !== undefined) setSelectedFee(recommended.fee);
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Tarifs indisponibles.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [city, locked, manuallySelected]);

  function choose(quote: CarrierQuote) {
    if (!quote.available || quote.fee === null || locked) return;
    setManuallySelected(true);
    setSelectedCarrier(quote.carrier);
    setSelectedFee(quote.fee);
  }

  return (
    <section className="carrier-quote-chooser">
      <input type="hidden" name="carrier" value={selectedCarrier || defaultCarrier || "Non affecté"} />
      <input type="hidden" name="shippingCost" value={String(selectedFee)} />
      <div className="carrier-quote-head">
        <div><strong>Comparer les agences</strong><small>Départ : Casablanca · aucune création de colis à cette étape</small></div>
        <span>{loading ? "Comparaison…" : result?.recommendedCarrier ? `${result.recommendedCarrier} recommandée` : "Saisissez la ville"}</span>
      </div>
      {result && (
        <div className="carrier-quote-grid">
          {result.quotes.map((quote) => {
            const recommended = result.recommendedCarrier === quote.carrier;
            const selected = selectedCarrier === quote.carrier;
            return (
              <button className={`${selected ? "selected" : ""} ${recommended ? "recommended" : ""}`} key={quote.carrier} type="button" onClick={() => choose(quote)} disabled={!quote.available || locked}>
                <span>{quote.carrier}{recommended ? " · moins chère" : ""}</span>
                <strong>{quote.fee === null ? "Indisponible" : money(quote.fee)}</strong>
                {quote.error && <small>{quote.error}</small>}
              </button>
            );
          })}
        </div>
      )}
      {error && <small className="carrier-quote-error">{error}</small>}
      {!result && !error && <small>Les tarifs Sendit et ForceLog apparaîtront automatiquement après la ville.</small>}
    </section>
  );
}

function EntryModal({ kind, carrierNames, products, suppliers, purchases, supplierInvoices, ads, close, submit }: { kind: Exclude<ModalName, null>; carrierNames: string[]; products: Product[]; suppliers: Supplier[]; purchases: Purchase[]; supplierInvoices: SupplierInvoice[]; ads: Ad[]; close: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const labels = {
    order: "Nouvelle commande",
    purchase: "Nouveau bon de commande",
    supplier: "Nouveau fournisseur",
    supplierInvoice: "Nouvelle facture fournisseur",
    expense: "Nouvelle dépense",
    ad: "Performance Meta Ads",
    capital: "Mouvement de capital",
    product: "Nouveau produit",
  };
  const [saving, setSaving] = useState(false),
    [formError, setFormError] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(products[0] ? String(products[0].id) : "");
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [orderSaleAmount, setOrderSaleAmount] = useState(products[0] ? String(products[0].salePrice) : "");
  const [selectedOrderStatus, setSelectedOrderStatus] = useState("En attente");
  const [orderCity, setOrderCity] = useState("");
  const [orderFulfillment, setOrderFulfillment] = useState<"Livraison" | "Magasin physique">("Livraison");
  const [purchaseMode, setPurchaseMode] = useState<"Retrait fournisseur" | "Livraison fournisseur">("Retrait fournisseur");
  const [receiveImmediately, setReceiveImmediately] = useState(true);
  const selectedProduct = products.find((product) => String(product.id) === selectedProductId) || null;

  const initialPurchaseProduct = products[0] || null;
  const [purchaseLines, setPurchaseLines] = useState<Array<{ key: number; productId: string; item: string; quantity: string; unitCost: string }>>([
    {
      key: 1,
      productId: initialPurchaseProduct ? String(initialPurchaseProduct.id) : "",
      item: initialPurchaseProduct?.name || "",
      quantity: "1",
      unitCost: initialPurchaseProduct ? String(initialPurchaseProduct.purchasePrice) : "",
    },
  ]);
  const purchaseOrderTotal = purchaseLines.reduce((sum, line) => {
    const quantity = Math.max(0, Number(line.quantity) || 0);
    const unitCost = Math.max(0, Number(String(line.unitCost).replace(",", ".")) || 0);
    return sum + quantity * unitCost;
  }, 0);

  function updatePurchaseLine(key: number, patch: Partial<{ productId: string; item: string; quantity: string; unitCost: string }>) {
    setPurchaseLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  function choosePurchaseProduct(key: number, productId: string) {
    const product = products.find((entry) => String(entry.id) === productId);
    if (!product) {
      updatePurchaseLine(key, { productId });
      return;
    }
    updatePurchaseLine(key, {
      productId,
      item: product.name,
      unitCost: String(product.purchasePrice),
    });
  }

  function addPurchaseLine() {
    setPurchaseLines((current) => [
      ...current,
      {
        key: current.reduce((max, line) => Math.max(max, line.key), 0) + 1,
        productId: "",
        item: "",
        quantity: "1",
        unitCost: "",
      },
    ]);
  }

  function removePurchaseLine(key: number) {
    setPurchaseLines((current) => current.length > 1 ? current.filter((line) => line.key !== key) : current);
  }

  function changePurchaseMode(value: string) {
    const next = value === "Livraison fournisseur" ? "Livraison fournisseur" : "Retrait fournisseur";
    setPurchaseMode(next);
    setReceiveImmediately(next === "Retrait fournisseur");
  }

  function selectOrderProduct(productId: string) {
    const product = products.find((item) => String(item.id) === productId);
    setSelectedProductId(productId);
    if (product) setOrderSaleAmount(String(product.salePrice * Math.max(1, Number(orderQuantity) || 1)));
  }

  function updateOrderQuantity(quantity: string) {
    setOrderQuantity(quantity);
    if (selectedProduct) setOrderSaleAmount(String(selectedProduct.salePrice * Math.max(1, Number(quantity) || 1)));
  }

  function updateOrderFulfillment(value: string) {
    const next = value === "Magasin physique" ? "Magasin physique" : "Livraison";
    setOrderFulfillment(next);
    if (next === "Magasin physique") {
      if (!orderCity.trim()) setOrderCity("Casablanca");
      setSelectedOrderStatus("Livrée");
    } else if (selectedOrderStatus === "Livrée") {
      setSelectedOrderStatus("En attente");
    }
  }
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const values = Object.fromEntries(new FormData(e.currentTarget));
      if (kind === "purchase") {
        await submit("addPurchaseOrder", {
          ...values,
          linesJson: JSON.stringify(purchaseLines.map((line) => ({
            productId: line.productId,
            item: line.item,
            quantity: line.quantity,
            unitCost: line.unitCost,
          }))),
        });
      } else if (kind === "supplierInvoice") {
        await submit("addSupplierInvoice", values);
      } else {
        await submit(kind === "order" ? "addOrder" : kind === "product" ? "addProduct" : kind === "supplier" ? "addSupplier" : kind === "expense" ? "addExpense" : kind === "ad" ? "addAd" : "addCapital", values);
      }
    } catch (c) {
      setFormError(c instanceof Error ? c.message : "Erreur");
      setSaving(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="card-kicker">Saisie Maison Jiya</span>
            <h2>{labels[kind]}</h2>
            <p>Les champs marqués * sont obligatoires.</p>
          </div>
          <button onClick={close} aria-label="Fermer">
            ×
          </button>
        </div>
        <form onSubmit={handle}>
          <div className="form-grid">
            {kind === "product" && (
              <>
                <Field label="ID produit / SKU *" name="productCode" required />
                <Field label="Nom du produit *" name="name" required />
                <Select label="Catégorie *" name="category" options={productCategoryOptions} />
                <Field label="Quantité initiale *" name="initialQuantity" type="number" inputMode="numeric" defaultValue="0" min="0" required />
                <Field label="Seuil d’alerte stock *" name="stockAlertThreshold" type="number" inputMode="numeric" defaultValue="5" min="0" required />
                <Field label="Couverture cible (jours) *" name="reorderCoverDays" type="number" inputMode="numeric" defaultValue="30" min="1" required />
                <ProductPricingFields />
              </>
            )}
            {kind === "supplier" && (
              <>
                <Field label="Nom du fournisseur *" name="name" required />
                <Field label="Contact" name="contactName" placeholder="Nom de la personne à contacter" />
                <Field label="Téléphone" name="phone" type="tel" inputMode="tel" />
                <Field label="WhatsApp" name="whatsapp" type="tel" inputMode="tel" />
                <Field label="Ville" name="city" />
                <Field label="Délai moyen (jours) *" name="leadTimeDays" type="number" inputMode="numeric" min="0" defaultValue="7" required />
                <Field label="Minimum de commande (MAD)" name="minimumOrderAmount" type="number" inputMode="decimal" min="0" step="0.01" defaultValue="0" />
                <Field label="Conditions de paiement" name="paymentTerms" placeholder="Ex. Comptant, 50% avance…" />
                <Field label="Notes" name="notes" placeholder="Qualité, horaires, conditions particulières…" maxLength={500} />
              </>
            )}
            {kind === "supplierInvoice" && (() => {
              const invoiceRefs = new Set(supplierInvoices.map((invoice) => invoice.purchaseRef));
              const groups = new Map<string, Purchase[]>();
              for (const purchase of purchases) {
                if (!purchase.purchaseRef || invoiceRefs.has(purchase.purchaseRef) || ["Brouillon", "Annulé"].includes(purchase.procurementStatus)) continue;
                const rows = groups.get(purchase.purchaseRef) || [];
                rows.push(purchase);
                groups.set(purchase.purchaseRef, rows);
              }
              const eligible = Array.from(groups.entries()).map(([purchaseRef, rows]) => ({
                purchaseRef,
                supplier: rows[0]?.supplier || "Fournisseur",
                total: rows.reduce((sum, row) => sum + row.totalCost, 0),
              }));
              const today = new Date().toISOString().slice(0, 10);
              const due = new Date();
              due.setDate(due.getDate() + 30);
              return (
                <>
                  <label className="field">
                    <span>Bon de commande à facturer *</span>
                    <select name="purchaseRef" defaultValue="" required>
                      <option value="" disabled>Choisir un bon sans facture</option>
                      {eligible.map((row) => <option key={row.purchaseRef} value={row.purchaseRef}>{row.purchaseRef} · {row.supplier} · {money(row.total)}</option>)}
                    </select>
                    <small>Le montant de la facture sera repris automatiquement depuis le total du bon.</small>
                  </label>
                  <Field label="N° facture fournisseur *" name="invoiceNumber" required maxLength={120} />
                  <Field label="Date de facture *" name="invoiceDate" type="date" defaultValue={today} required />
                  <Field label="Échéance de paiement *" name="dueDate" type="date" defaultValue={due.toISOString().slice(0, 10)} required />
                  <Field label="Note" name="note" placeholder="Référence interne, conditions particulières…" maxLength={500} />
                  {!eligible.length ? <div className="form-warning">Aucun bon commandé sans facture n’est disponible.</div> : null}
                </>
              );
            })()}
            {kind === "order" && (
              <>
                <label className="field order-fulfillment-field">
                  <span>Mode de vente *</span>
                  <select name="fulfillmentType" value={orderFulfillment} onChange={(event) => updateOrderFulfillment(event.target.value)}>
                    {fulfillmentTypeOptions.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <Field label="Nom de la cliente *" name="customerName" autoComplete="name" required />
                <Field label="Téléphone *" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" maxLength={18} required />
                <label className="field"><span>{orderFulfillment === "Magasin physique" ? "Ville de la cliente *" : "Ville de livraison *"}</span><input name="city" autoComplete="address-level2" value={orderCity} onChange={(event) => setOrderCity(event.target.value)} required /></label>
                {orderFulfillment === "Livraison" ? <Field label="Adresse de livraison *" name="address" autoComplete="street-address" required /> : <input type="hidden" name="address" value="Magasin Maison Jiya" />}
                {products.length ? (
                  <label className="field order-product-select">
                    <span>Produit du catalogue *</span>
                    <select name="productId" value={selectedProductId} onChange={(event) => selectOrderProduct(event.target.value)} required>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.productCode} · {product.name} · stock {product.stockQuantity}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="order-product-empty" role="alert">
                    <strong>Aucun produit disponible</strong>
                    <small>Fermez cette fenêtre, ouvrez Produits et ajoutez d’abord votre produit au catalogue.</small>
                  </div>
                )}
                {orderFulfillment === "Livraison" ? <Select label="Source de la commande *" name="source" options={orderSourceOptions.filter((source) => source !== "Magasin physique")} /> : <input type="hidden" name="source" value="Magasin physique" />}
                {orderFulfillment === "Livraison" && <Select label="Campagne publicitaire" name="campaign" options={["Aucune campagne", ...Array.from(new Set(ads.map((ad) => ad.campaign))).sort((a, b) => a.localeCompare(b, "fr"))]} />}
                <label className="field">
                  <span>Statut de la commande</span>
                  <select name="status" value={selectedOrderStatus} onChange={(event) => setSelectedOrderStatus(event.target.value)} disabled={orderFulfillment === "Magasin physique"}>
                    {(orderFulfillment === "Magasin physique" ? ["Livrée"] : orderStatusOptions).map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                {selectedOrderStatus === "Retour" && (
                  <>
                    <label className="field">
                      <span>Motif du retour *</span>
                      <select name="returnReason" defaultValue="" required>
                        <option value="" disabled>Choisir un motif</option>
                        {returnReasonOptions.map((reason) => <option key={reason}>{reason}</option>)}
                      </select>
                    </label>
                    <label className="field return-note-field">
                      <span>Détail du retour</span>
                      <input name="returnNote" type="text" maxLength={240} placeholder="Précision utile, surtout si vous choisissez Autre" />
                    </label>
                  </>
                )}
                <label className="field"><span>Quantité *</span><input name="quantity" type="number" inputMode="numeric" min="1" value={orderQuantity} onChange={(event) => updateOrderQuantity(event.target.value)} required /></label>
                <label className="field"><span>Vente totale (MAD) *</span><input name="saleAmount" type="number" inputMode="decimal" min="0" step="0.01" value={orderSaleAmount} onChange={(event) => setOrderSaleAmount(event.target.value)} required /></label>
                {selectedProduct && (
                  <div className="order-product-summary">
                    <div><small>Stock disponible</small><strong>{selectedProduct.stockQuantity} unité{selectedProduct.stockQuantity === 1 ? "" : "s"}</strong></div>
                    <div><small>Coût automatique</small><strong>{money(selectedProduct.purchasePrice * Math.max(1, Number(orderQuantity) || 1))}</strong></div>
                    <p>{orderFulfillment === "Magasin physique" ? "Le stock sera déduit immédiatement avec la vente magasin." : "Le stock sera déduit une seule fois dès que le statut devient « Confirmée »."}</p>
                  </div>
                )}
                <Field label="Publicité attribuée (MAD)" name="adCost" type="number" inputMode="decimal" min="0" step="0.01" />
                <Field label="Autres frais (MAD)" name="fees" type="number" inputMode="decimal" min="0" step="0.01" />
                {orderFulfillment === "Livraison" ? (
                  <>
                    <CarrierQuoteChooser city={orderCity} defaultCarrier={carrierNames.find((carrier) => ["Sendit", "ForceLog"].includes(carrier)) || carrierNames[0]} />
                    <div className="order-carrier-safety-note"><strong>Validation en deux étapes</strong><small>Enregistrer cette commande ne crée aucun colis. Vous l’autoriserez ensuite depuis la commande confirmée.</small></div>
                  </>
                ) : (
                  <div className="order-carrier-safety-note store-sale-note"><strong>Vente encaissée sur place</strong><small>0 MAD de livraison · aucun colis ni suivi · stock, chiffre d’affaires et capital mis à jour automatiquement.</small></div>
                )}
              </>
            )}
            {kind === "purchase" && (
              <>
                {suppliers.some((supplier) => supplier.isActive) ? (
                  <label className="field">
                    <span>Fournisseur *</span>
                    <select name="supplierId" defaultValue="" required>
                      <option value="" disabled>Choisir un fournisseur</option>
                      {suppliers.filter((supplier) => supplier.isActive).map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.city ? ` · ${supplier.city}` : ""}</option>
                      ))}
                    </select>
                    <small>Une seule fiche fournisseur sera liée à toutes les lignes de ce bon.</small>
                  </label>
                ) : <Field label="Fournisseur *" name="supplier" required />}
                <div className="purchase-lines-editor">
                  <div className="purchase-lines-head">
                    <div>
                      <strong>Produits du bon</strong>
                      <small>Ajoutez jusqu’à 50 lignes. Chaque ligne pourra être réceptionnée séparément.</small>
                    </div>
                    <button type="button" className="secondary-button" onClick={addPurchaseLine}>＋ Ajouter un produit</button>
                  </div>
                  {purchaseLines.map((line, index) => {
                    const quantity = Math.max(0, Number(line.quantity) || 0);
                    const unitCost = Math.max(0, Number(String(line.unitCost).replace(",", ".")) || 0);
                    return (
                      <div className="purchase-line-card" key={line.key}>
                        <div className="purchase-line-title">
                          <strong>Ligne {index + 1}</strong>
                          <span>{money(quantity * unitCost)}</span>
                          {purchaseLines.length > 1 && (
                            <button type="button" className="text-button danger" onClick={() => removePurchaseLine(line.key)}>Supprimer</button>
                          )}
                        </div>
                        <label className="field">
                          <span>Produit lié au stock</span>
                          <select value={line.productId} onChange={(event) => choosePurchaseProduct(line.key, event.target.value)}>
                            <option value="">Aucun — achat non stock / emballage / autre</option>
                            {products.map((product) => <option key={product.id} value={product.id}>{product.productCode} · {product.name} · stock {product.stockQuantity}</option>)}
                          </select>
                        </label>
                        <label className="field">
                          <span>Article / motif *</span>
                          <input value={line.item} onChange={(event) => updatePurchaseLine(line.key, { item: event.target.value })} placeholder="Ex. Montre dorée" required />
                        </label>
                        <label className="field">
                          <span>Quantité *</span>
                          <input type="number" inputMode="numeric" min="1" value={line.quantity} onChange={(event) => updatePurchaseLine(line.key, { quantity: event.target.value })} required />
                        </label>
                        <label className="field">
                          <span>Coût unitaire (MAD) *</span>
                          <input type="number" inputMode="decimal" min="0" step="0.01" value={line.unitCost} onChange={(event) => updatePurchaseLine(line.key, { unitCost: event.target.value })} required />
                        </label>
                      </div>
                    );
                  })}
                  <div className="purchase-order-total">
                    <span>{purchaseLines.length} ligne{purchaseLines.length === 1 ? "" : "s"}</span>
                    <strong>Total du bon : {money(purchaseOrderTotal)}</strong>
                  </div>
                </div>
                <label className="field purchase-mode-field">
                  <span>Comment récupérez-vous cet achat ? *</span>
                  <select name="purchaseMode" value={purchaseMode} onChange={(event) => changePurchaseMode(event.target.value)}>
                    <option>Retrait fournisseur</option>
                    <option>Livraison fournisseur</option>
                  </select>
                  <small>{purchaseMode === "Retrait fournisseur" ? "Mode habituel : vous vous déplacez chez le fournisseur et repartez avec la marchandise." : "À utiliser seulement quand le fournisseur vous envoie la marchandise."}</small>
                </label>
                <label className="purchase-immediate-toggle">
                  <input
                    type="checkbox"
                    name="receiveImmediately"
                    value="true"
                    checked={receiveImmediately}
                    onChange={(event) => setReceiveImmediately(event.target.checked)}
                  />
                  <span>
                    <strong>{purchaseMode === "Retrait fournisseur" ? "Je repars avec la marchandise maintenant" : "Marchandise déjà reçue"}</strong>
                    <small>Si activé, toutes les lignes sont réceptionnées immédiatement et le stock est mis à jour automatiquement.</small>
                  </span>
                </label>
                {receiveImmediately ? <input type="hidden" name="procurementStatus" value="Commandé" /> : <Select label="État du bon" name="procurementStatus" options={["Commandé", "Brouillon"]} />}
                {!receiveImmediately ? <Field label={purchaseMode === "Retrait fournisseur" ? "Date de retrait prévue" : "Livraison prévue"} name="expectedDate" type="date" /> : null}
                {purchaseMode === "Retrait fournisseur" ? (
                  <div className="purchase-travel-expense">
                    <div>
                      <strong>Frais de déplacement</strong>
                      <small>Taxi, essence, parking… Ils seront enregistrés séparément en dépense Transport et ne modifieront pas le coût du stock.</small>
                    </div>
                    <Field label="Montant (MAD)" name="travelCost" type="number" inputMode="decimal" min="0" step="0.01" defaultValue="0" />
                    <Select label="Compte utilisé" name="travelExpenseAccount" options={["Espèces", "Caisse", "Banque", "Carte", "Autre"]} />
                  </div>
                ) : null}
                <Select label="Compte de paiement fournisseur" name="account" options={["Banque", "Caisse", "Espèces", "Carte", "Autre"]} />
                <Select label="Paiement fournisseur" name="paymentStatus" options={["À payer", "Payé"]} />
                <Field label="Date de paiement (si payé)" name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </>
            )}
            {kind === "expense" && (
              <>
                <Select label="Catégorie *" name="category" options={["Loyer", "Emballage", "Transport", "Téléphone / Internet", "Frais bancaires", "Outils / logiciels", "Prestataire", "Matériel", "Autre"]} />
                <Field label="Libellé *" name="label" placeholder="Ex. Loyer showroom septembre" required />
                <Field label="Montant (MAD) *" name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required />
                <Select label="Compte" name="account" options={["Banque", "Caisse", "Espèces", "Carte", "Autre"]} />
                <Select label="Paiement" name="paymentStatus" options={["Payé", "À payer"]} />
                <Field label="Date de paiement (si payée)" name="paidDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                <Field label="Date de la dépense *" name="expenseDate" type="date" required />
                <Field label="Note" name="note" placeholder="Facultatif" maxLength={300} />
              </>
            )}
            {kind === "ad" && (
              <>
                <Field label="Campagne *" name="campaign" required />
                <Field label="Dépenses (MAD) *" name="spend" type="number" inputMode="decimal" min="0" step="0.01" required />
                <Field label="CA attribué (MAD) *" name="revenue" type="number" inputMode="decimal" min="0" step="0.01" required />
                <Field label="Commandes *" name="orderCount" type="number" inputMode="numeric" min="0" required />
                <Field label="Date *" name="performanceDate" type="date" required />
              </>
            )}
            {kind === "capital" && (
              <>
                <Select label="Type" name="direction" options={["Entrée", "Sortie"]} />
                <Field label="Source du capital *" name="category" defaultValue="Apport" required />
                <Field label="Libellé *" name="label" required />
                <Field label="Montant (MAD) *" name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required />
                <Select label="Compte concerné" name="account" options={["Banque", "Caisse", "Espèces", "Carte", "Autre"]} />
                <Field label="Date *" name="entryDate" type="date" required />
              </>
            )}
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="modal-actions">
            <button type="button" className="cancel-button" onClick={close}>
              Annuler
            </button>
            <button className="primary-button" disabled={saving || (kind === "order" && products.length === 0)}>
              {saving ? "Enregistrement…" : kind === "order" && orderFulfillment === "Magasin physique" ? "Enregistrer la vente" : "Enregistrer"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function OrderModal({ order, history, carrierNames, ads, close, print, submit }: { order: Order; history: OrderStatusHistory[]; carrierNames: string[]; ads: Ad[]; close: () => void; print: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedStatus, setSelectedStatus] = useState(order.status);
  const [selectedFulfillment, setSelectedFulfillment] = useState<"Livraison" | "Magasin physique">(order.fulfillmentType === "Magasin physique" ? "Magasin physique" : "Livraison");
  const isStoreSale = selectedFulfillment === "Magasin physique";
  const currentCarrier = order.carrier && !["Non affecté", "Magasin physique"].includes(order.carrier) ? order.carrier : "";

  function changeFulfillment(value: string) {
    const next = value === "Magasin physique" ? "Magasin physique" : "Livraison";
    setSelectedFulfillment(next);
    if (next === "Magasin physique") setSelectedStatus("Livrée");
    else if (order.fulfillmentType === "Magasin physique") setSelectedStatus("Confirmée");
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="modal compact">
        <div className="modal-head">
          <div>
            <span className="card-kicker">{order.orderRef}</span>
            <h2>{order.customerName}</h2>
            <p>
              {order.products} · {money(order.saleAmount)}
            </p>
          </div>
          <button onClick={close} aria-label="Fermer">
            ×
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setFormError("");
            try {
              await submit("updateOrder", {
                id: String(order.id),
                ...Object.fromEntries(new FormData(e.currentTarget)),
              });
            } catch (caught) {
              setFormError(caught instanceof Error ? caught.message : "Mise à jour impossible.");
              setSaving(false);
            }
          }}
        >
          <div className="form-grid">
            <label className="field order-fulfillment-field">
              <span>Mode de vente</span>
              <select name="fulfillmentType" value={selectedFulfillment} onChange={(event) => changeFulfillment(event.target.value)}>
                <option>Livraison</option>
                <option disabled={Boolean(order.trackingNumber)}>Magasin physique</option>
              </select>
            </label>
            {isStoreSale ? <input type="hidden" name="source" value="Magasin physique" /> : <Select label="Source de la commande" name="source" defaultValue={order.source === "Magasin physique" ? "Non renseignée" : order.source || "Non renseignée"} options={[...orderSourceOptions.filter((source) => source !== "Magasin physique"), "Non renseignée"]} />}
            {isStoreSale ? <input type="hidden" name="campaign" value="" /> : <Select label="Campagne publicitaire" name="campaign" defaultValue={order.campaign || "Aucune campagne"} options={["Aucune campagne", ...Array.from(new Set([order.campaign, ...ads.map((ad) => ad.campaign)].filter((value) => value && value !== "Aucune campagne"))).sort((a, b) => a.localeCompare(b, "fr"))]} />}
            <label className="field">
              <span>Statut de la commande</span>
              <select name="status" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
                {(isStoreSale ? ["Livrée", "Retour", "Annulée"] : orderStatusOptions).map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            {selectedStatus === "Retour" && (
              <>
                <label className="field">
                  <span>Motif du retour *</span>
                  <select name="returnReason" defaultValue={order.returnReason || ""} required>
                    <option value="" disabled>Choisir un motif</option>
                    {returnReasonOptions.map((reason) => <option key={reason}>{reason}</option>)}
                  </select>
                </label>
                <label className="field return-note-field">
                  <span>Détail du retour</span>
                  <input name="returnNote" type="text" maxLength={240} defaultValue={order.returnNote} placeholder="Précision utile, surtout si vous choisissez Autre" />
                </label>
              </>
            )}
            <Select label="Encaissement" name="paymentStatus" defaultValue={order.paymentStatus} options={["À encaisser", "Encaissé", "Non encaissé", "Remboursé"]} />
            {(selectedStatus === "Retour" || selectedStatus === "Annulée") && (
              <div className="order-carrier-safety-note">
                <strong>Encaissement protégé automatiquement</strong>
                <small>Un retour ou une annulation ne peut pas rester « Encaissé ». S’il avait déjà été encaissé, Maison Jiya le passera en « Remboursé » ; sinon en « Non encaissé ».</small>
              </div>
            )}
            {(order.paidAt || order.refundedAt) && (
              <div className="order-carrier-safety-note created">
                <strong>Historique financier</strong>
                <small>{order.paidAt ? `Encaissé le ${dateTimeLabel(order.paidAt)}` : "Jamais encaissé"}{order.refundedAt ? ` · Remboursé le ${dateTimeLabel(order.refundedAt)}` : ""}</small>
              </div>
            )}
            <Field label={isStoreSale ? "Téléphone de la cliente *" : "Téléphone de livraison *"} name="phone" type="tel" inputMode="tel" defaultValue={order.phone || ""} autoComplete="tel" placeholder="06 12 34 56 78" maxLength={18} required />
            {isStoreSale ? <input type="hidden" name="address" value="Magasin Maison Jiya" /> : <Field label="Adresse de livraison *" name="address" defaultValue={order.address === "Magasin Maison Jiya" ? "" : order.address} autoComplete="street-address" required />}
            <Field label="Coût retour (MAD)" name="returnCost" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={String(order.returnCost)} />
            {isStoreSale ? (
              <div className="order-carrier-safety-note store-sale-note"><strong>Aucun transporteur</strong><small>Cette vente est remise sur place : 0 MAD de livraison, aucun colis et aucun numéro de suivi.</small></div>
            ) : (
              <CarrierQuoteChooser city={order.city} defaultCarrier={currentCarrier || carrierNames[0]} defaultFee={order.fulfillmentType === "Magasin physique" ? 0 : order.shippingCost} locked={Boolean(order.trackingNumber)} />
            )}
          </div>
          {isStoreSale ? (
            <div className="carrier-authorization-state created"><span aria-hidden="true">✓</span><div><strong>Vente en magasin</strong><small>Le montant encaissé alimente la trésorerie immédiatement et cette commande n’apparaît pas dans Colis.</small></div></div>
          ) : (
            <div className={`carrier-authorization-state ${order.trackingNumber ? "created" : order.status === "Confirmée" ? "ready" : "waiting"}`}>
              <span aria-hidden="true">{order.trackingNumber ? "✓" : order.status === "Confirmée" ? "🔒" : "◷"}</span>
              <div>
                <strong>{order.trackingNumber ? `Colis créé · ${order.trackingNumber}` : order.status === "Confirmée" ? "En attente de votre autorisation" : "Confirmez d’abord la commande"}</strong>
                <small>{order.trackingNumber ? `${order.carrier} suit maintenant ce colis. L’encaissement sera ajouté au capital après facturation payée.` : order.status === "Confirmée" ? "Vérifiez l’agence et son tarif, puis autorisez la création réelle du colis." : "Aucune donnée n’est envoyée à Sendit ou ForceLog avant la confirmation et votre autorisation."}</small>
              </div>
            </div>
          )}
          <div className={`order-stock-state ${order.productId ? (order.stockDeducted ? "deducted" : "waiting") : "legacy"}`}>
            <span aria-hidden="true">{order.productId ? (order.stockDeducted ? "✓" : "◷") : "!"}</span>
            <div>
              <strong>{order.productId ? (order.stockDeducted ? "Stock déjà déduit" : "Stock en attente") : "Commande historique non reliée"}</strong>
              <small>{order.productId ? (order.stockDeducted ? `${order.quantity} unité(s) retirée(s) automatiquement.` : "La quantité sera retirée au passage au statut Confirmée.") : "Cette ancienne commande conserve son produit en texte et ne modifie pas automatiquement le stock."}</small>
            </div>
          </div>
          <div className="status-history-panel">
            <div className="status-history-head">
              <span className="card-kicker">Historique des statuts</span>
              <small>{history.length} changement{history.length > 1 ? "s" : ""}</small>
            </div>
            <div className="status-history-list">
              {history.length ? history.map((entry) => (
                <article className="status-history-row" key={entry.id}>
                  <span className="status-history-dot" aria-hidden="true" />
                  <div>
                    <strong>{entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : entry.toStatus}</strong>
                    <small>{entry.changedByName} · {dateTimeLabel(entry.changedAt)}</small>
                  </div>
                </article>
              )) : <small>Aucun changement de statut enregistré.</small>}
            </div>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="modal-actions">
            <button type="button" className="secondary-button print-order-button" onClick={print}>
              {isStoreSale ? "▣ Imprimer le reçu" : "▣ Imprimer le bordereau"}
            </button>
            <button type="button" className="cancel-button" onClick={close}>
              Annuler
            </button>
            {!isStoreSale && !order.trackingNumber && order.status === "Confirmée" && (
              <button
                type="button"
                className="carrier-authorize-button"
                disabled={saving}
                onClick={async (event) => {
                  const form = event.currentTarget.form;
                  if (!form) return;
                  setSaving(true);
                  setFormError("");
                  try {
                    await submit("authorizeCarrierDispatch", { id: String(order.id), ...Object.fromEntries(new FormData(form)) });
                  } catch (caught) {
                    setFormError(caught instanceof Error ? caught.message : "Création du colis impossible.");
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Création chez l’agence…" : "Autoriser et créer le colis"}
              </button>
            )}
            <button className="primary-button" disabled={saving}>
              {saving ? "Mise à jour…" : "Mettre à jour"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function PrintOrderSheet({ order }: { order: Order }) {
  return (
    <section className="print-order-sheet" aria-label={`Bordereau de la commande ${order.orderRef}`}>
      <header className="print-slip-header">
        <div className="print-slip-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/maison-jiya-logo.jpeg" alt="Maison Jiya" />
          <div><strong>Maison Jiya</strong><span>L&apos;heure de briller</span></div>
        </div>
        <div className="print-slip-reference">
          <small>Bordereau de commande</small>
          <strong>{order.orderRef}</strong>
          <span>{dateLabel(order.createdAt)}</span>
        </div>
      </header>
      <div className="print-slip-highlight">
        <span>{order.fulfillmentType === "Magasin physique" ? "Montant encaissé" : "Montant à encaisser"}</span>
        <strong>{money(order.saleAmount)}</strong>
        <small>{order.fulfillmentType === "Magasin physique" ? "Vente en magasin" : "Paiement à la livraison"}</small>
      </div>
      <div className="print-slip-grid">
        <article>
          <span>Destinataire</span>
          <strong>{order.customerName || "Cliente"}</strong>
          <p>{order.phone || "Téléphone non renseigné"}</p>
          <p>{order.city}</p>
        </article>
        <article>
          <span>{order.fulfillmentType === "Magasin physique" ? "Remise" : "Livraison"}</span>
          <strong>{order.fulfillmentType === "Magasin physique" ? "Magasin Maison Jiya" : order.carrier || "Agence non affectée"}</strong>
          <p>{order.fulfillmentType === "Magasin physique" ? "Aucun colis nécessaire" : `N° de suivi : ${order.trackingNumber || "À compléter"}`}</p>
          <p>Statut : {order.status}</p>
        </article>
      </div>
      <div className="print-slip-product">
        <div><span>Produit</span><strong>{order.products}</strong></div>
        <div><span>Quantité</span><strong>{order.quantity}</strong></div>
        <div><span>Source</span><strong>{order.source}</strong></div>
      </div>
      {order.status === "Retour" && order.returnReason && (
        <div className="print-slip-return">
          <span>Retour</span>
          <strong>{order.returnReason}</strong>
          {order.returnNote && <p>{order.returnNote}</p>}
        </div>
      )}
      <footer className="print-slip-footer">
        <div><span>Signature / cachet</span></div>
        <p>{order.fulfillmentType === "Magasin physique" ? "Reçu de vente en magasin Maison Jiya." : "Merci de vérifier le nom, le téléphone, la ville et le montant avant l’expédition."}</p>
      </footer>
    </section>
  );
}
function EntityModal({ selection, products, suppliers, close, submit }: { selection: EditableEntity; products: Product[]; suppliers: Supplier[]; close: () => void; submit: (action: string, values: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const titles = {
    product: "Modifier le produit",
    movement: "Modifier le mouvement de stock",
    customer: "Modifier le client",
    supplier: "Modifier le fournisseur",
    purchase: "Modifier le bon de commande",
    expense: "Modifier la dépense",
    ad: "Modifier la publicité",
    capital: "Modifier le mouvement de capital",
  };
  const actions = {
    product: "updateProduct",
    movement: "updateStockMovement",
    customer: "updateCustomer",
    supplier: "updateSupplier",
    purchase: "updatePurchase",
    expense: "updateExpense",
    ad: "updateAd",
    capital: "updateCapital",
  };
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await submit(actions[selection.kind], {
        id: String(selection.record.id),
        ...Object.fromEntries(new FormData(event.currentTarget)),
      });
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Modification impossible.");
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="entity-modal-title">
        <div className="modal-head">
          <div><span className="card-kicker">Modification sécurisée</span><h2 id="entity-modal-title">{titles[selection.kind]}</h2><p>Les calculs du tableau de bord seront actualisés après l’enregistrement.</p></div>
          <button type="button" onClick={close} aria-label="Fermer">×</button>
        </div>
        <form onSubmit={handle}>
          <div className="form-grid">
            {selection.kind === "product" && <>
              <Field label="ID produit / SKU *" name="productCode" defaultValue={selection.record.productCode} required />
              <Field label="Nom du produit *" name="name" defaultValue={selection.record.name} required />
              <Select label="Catégorie *" name="category" defaultValue={selection.record.category} options={productCategoryOptions} />
              <Field label="Seuil d’alerte stock *" name="stockAlertThreshold" type="number" inputMode="numeric" min="0" defaultValue={String(selection.record.stockAlertThreshold)} required />
              <Field label="Couverture cible (jours) *" name="reorderCoverDays" type="number" inputMode="numeric" min="1" defaultValue={String(selection.record.reorderCoverDays)} required />
              <ProductPricingFields initialPurchasePrice={selection.record.purchasePrice} initialSalePrice={selection.record.salePrice} initialMinimumSalePrice={selection.record.minimumSalePrice} />
            </>}
            {selection.kind === "movement" && <>
              <div className="movement-edit-note"><strong>{selection.record.productName || "Produit"}</strong><small>Le stock restant sera recalculé automatiquement.</small></div>
              <Select label="Type de mouvement" name="movementType" defaultValue={selection.record.movementType} options={["Entrée", "Vente"]} />
              <Field label="Quantité *" name="quantity" type="number" inputMode="numeric" min="1" defaultValue={String(selection.record.quantity)} required />
              <Field label="Note" name="note" defaultValue={selection.record.note} />
            </>}
            {selection.kind === "customer" && <>
              <Field label="Nom du client *" name="name" defaultValue={selection.record.name} autoComplete="name" required />
              <Field label="Téléphone *" name="phone" type="tel" inputMode="tel" defaultValue={selection.record.phone} autoComplete="tel" placeholder="06 12 34 56 78" maxLength={18} required />
              <Field label="Ville *" name="city" defaultValue={selection.record.city} autoComplete="address-level2" required />
            </>}
            {selection.kind === "supplier" && <>
              <Field label="Nom du fournisseur *" name="name" defaultValue={selection.record.name} required />
              <Field label="Contact" name="contactName" defaultValue={selection.record.contactName} />
              <Field label="Téléphone" name="phone" type="tel" inputMode="tel" defaultValue={selection.record.phone} />
              <Field label="WhatsApp" name="whatsapp" type="tel" inputMode="tel" defaultValue={selection.record.whatsapp} />
              <Field label="Ville" name="city" defaultValue={selection.record.city} />
              <Field label="Délai moyen (jours) *" name="leadTimeDays" type="number" inputMode="numeric" min="0" defaultValue={String(selection.record.leadTimeDays)} required />
              <Field label="Minimum de commande (MAD)" name="minimumOrderAmount" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={String(selection.record.minimumOrderAmount)} />
              <Field label="Conditions de paiement" name="paymentTerms" defaultValue={selection.record.paymentTerms} />
              <Field label="Notes" name="notes" defaultValue={selection.record.notes} maxLength={500} />
            </>}
            {selection.kind === "purchase" && <>
              {suppliers.length ? (
                <label className="field">
                  <span>Fournisseur *</span>
                  <select name="supplierId" defaultValue={selection.record.supplierId || ""} required>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.isActive ? "" : " · inactif"}</option>)}
                  </select>
                </label>
              ) : <Field label="Fournisseur *" name="supplier" defaultValue={selection.record.supplier} required />}
              <div className="movement-edit-note">
                <strong>{selection.record.purchaseRef || `Bon #${selection.record.id}`}</strong>
                <small>La référence du bon est générée automatiquement et reste immuable.</small>
              </div>
              <Field label="Article / motif *" name="item" defaultValue={selection.record.item} required />
              {selection.record.receivedQuantity > 0 ? (
                <>
                  <input type="hidden" name="productId" value={selection.record.productId || ""} />
                  <input type="hidden" name="quantity" value={selection.record.quantity} />
                  <div className="movement-edit-note">
                    <strong>{selection.record.productName || selection.record.item} · {selection.record.quantity} unité(s)</strong>
                    <small>Réception déjà enregistrée : le produit et la quantité sont verrouillés pour préserver l’historique du stock.</small>
                  </div>
                </>
              ) : (
                <>
                  <label className="field">
                    <span>Produit lié au stock</span>
                    <select name="productId" defaultValue={selection.record.productId || ""}>
                      <option value="">Aucun — achat non stock / emballage / autre</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.productCode} · {product.name} · stock {product.stockQuantity}</option>)}
                    </select>
                  </label>
                  <Field label="Quantité *" name="quantity" type="number" inputMode="numeric" min="1" defaultValue={String(selection.record.quantity)} required />
                </>
              )}
              <Field label="Coût unitaire (MAD) *" name="unitCost" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={String(selection.record.unitCost)} required />
              {selection.record.receivedQuantity > 0 ? (
                <div className="movement-edit-note">
                  <strong>{selection.record.procurementStatus}</strong>
                  <small>Le statut de réception est calculé automatiquement dès qu’une quantité entre en stock.</small>
                </div>
              ) : (
                <Select label="État du bon" name="procurementStatus" defaultValue={selection.record.procurementStatus} options={["Brouillon", "Commandé", "Annulé"]} />
              )}
              <Field label="Livraison prévue" name="expectedDate" type="date" defaultValue={selection.record.expectedAt?.slice(0, 10) || ""} />
              <Select label="Compte de paiement" name="account" defaultValue={selection.record.account || "Banque"} options={["Banque", "Caisse", "Espèces", "Carte", "Autre"]} />
              <Select label="Paiement" name="paymentStatus" defaultValue={selection.record.paymentStatus} options={["Payé", "À payer"]} />
              <Field label="Date de paiement (si payé)" name="paidDate" type="date" defaultValue={selection.record.paidAt?.slice(0, 10) || ""} />
            </>}
            {selection.kind === "expense" && <>
              <Select label="Catégorie *" name="category" defaultValue={selection.record.category} options={["Loyer", "Emballage", "Transport", "Téléphone / Internet", "Frais bancaires", "Outils / logiciels", "Prestataire", "Matériel", "Autre"]} />
              <Field label="Libellé *" name="label" defaultValue={selection.record.label} required />
              <Field label="Montant (MAD) *" name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={String(selection.record.amount)} required />
              <Select label="Compte" name="account" defaultValue={selection.record.account} options={["Banque", "Caisse", "Espèces", "Carte", "Autre"]} />
              <Select label="Paiement" name="paymentStatus" defaultValue={selection.record.paymentStatus} options={["Payé", "À payer"]} />
              <Field label="Date de paiement (si payée)" name="paidDate" type="date" defaultValue={selection.record.paidAt?.slice(0, 10) || ""} />
              <Field label="Date de la dépense *" name="expenseDate" type="date" defaultValue={selection.record.expenseDate.slice(0, 10)} required />
              <Field label="Note" name="note" defaultValue={selection.record.note} maxLength={300} />
            </>}
            {selection.kind === "ad" && <>
              <Field label="Campagne *" name="campaign" defaultValue={selection.record.campaign} required />
              <Field label="Dépenses (MAD) *" name="spend" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={String(selection.record.spend)} required />
              <Field label="CA attribué (MAD) *" name="revenue" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={String(selection.record.revenue)} required />
              <Field label="Commandes *" name="orderCount" type="number" inputMode="numeric" min="0" defaultValue={String(selection.record.orderCount)} required />
              <Field label="Date *" name="performanceDate" type="date" defaultValue={selection.record.performanceDate.slice(0, 10)} required />
            </>}
            {selection.kind === "capital" && <>
              <Select label="Type" name="direction" defaultValue={selection.record.direction} options={["Entrée", "Sortie"]} />
              <Field label="Source du capital *" name="category" defaultValue={selection.record.category} required />
              <Field label="Libellé *" name="label" defaultValue={selection.record.label} required />
              <Field label="Montant (MAD) *" name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={String(selection.record.amount)} required />
              <Select label="Compte concerné" name="account" defaultValue={selection.record.account || "Banque"} options={["Banque", "Caisse", "Espèces", "Carte", "Autre"]} />
              <Field label="Date *" name="entryDate" type="date" defaultValue={selection.record.entryDate.slice(0, 10)} required />
            </>}
          </div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="modal-actions">
            <button type="button" className="cancel-button" onClick={close}>Annuler</button>
            <button className="primary-button" disabled={saving}>{saving ? "Mise à jour…" : "Enregistrer les modifications"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
function StockMovementModal({ selection, close, submit }: { selection: Exclude<StockSelection, null>; close: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [saving, setSaving] = useState(false),
    [formError, setFormError] = useState("");
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="modal compact" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="card-kicker">
              {selection.product.productCode} · {selection.product.category}
            </span>
            <h2>{selection.type === "Entrée" ? "Ajouter du stock" : "Enregistrer une sortie manuelle"}</h2>
            <p>
              {selection.product.name} · {selection.product.stockQuantity} unité(s) restante(s)
            </p>
          </div>
          <button onClick={close} aria-label="Fermer">
            ×
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setFormError("");
            try {
              await submit("addStockMovement", {
                productId: String(selection.product.id),
                movementType: selection.type,
                ...Object.fromEntries(new FormData(e.currentTarget)),
              });
            } catch (c) {
              setFormError(c instanceof Error ? c.message : "Erreur");
              setSaving(false);
            }
          }}
        >
          <div className="movement-summary">
            <span className={selection.type === "Entrée" ? "movement-symbol in" : "movement-symbol out"}>{selection.type === "Entrée" ? "＋" : "−"}</span>
            <div>
              <strong>{selection.type}</strong>
              <p>{selection.type === "Entrée" ? "La quantité sera ajoutée au stock restant." : "À utiliser pour une perte, un article abîmé ou une correction. Les ventes sont retirées automatiquement quand une commande passe à Confirmée."}</p>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Quantité *" name="quantity" type="number" inputMode="numeric" defaultValue="1" min="1" required />
            <Field label="Note" name="note" />
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="modal-actions">
            <button type="button" className="cancel-button" onClick={close}>
              Annuler
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? "Enregistrement…" : selection.type === "Entrée" ? "Ajouter au stock" : "Confirmer la vente"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function InventoryCountModal({ product, close, submit }: { product: Product; close: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [physicalQuantity, setPhysicalQuantity] = useState(String(product.stockQuantity));
  const parsedPhysicalQuantity = Math.max(0, Math.round(Number(physicalQuantity) || 0));
  const difference = parsedPhysicalQuantity - product.stockQuantity;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="modal compact inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-modal-title">
        <div className="modal-head">
          <div>
            <span className="card-kicker">{product.productCode} · Contrôle de stock</span>
            <h2 id="inventory-modal-title">Inventaire physique</h2>
            <p>Comptez les articles réellement présents. Le stock du site sera aligné et chaque écart restera dans l’historique.</p>
          </div>
          <button type="button" onClick={close} aria-label="Fermer">×</button>
        </div>
        <form onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setFormError("");
          try {
            const rawQuantity = Number(physicalQuantity);
            if (!Number.isInteger(rawQuantity) || rawQuantity < 0) {
              throw new Error("La quantité physique doit être un nombre entier positif ou nul.");
            }
            await submit("countInventory", {
              productId: String(product.id),
              expectedSystemQuantity: String(product.stockQuantity),
              ...Object.fromEntries(new FormData(event.currentTarget)),
            });
          } catch (caught) {
            setFormError(caught instanceof Error ? caught.message : "Inventaire impossible.");
            setSaving(false);
          }
        }}>
          <div className="inventory-summary">
            <div><span>Stock du site</span><strong>{product.stockQuantity}</strong></div>
            <div><span>Stock physique</span><strong>{parsedPhysicalQuantity}</strong></div>
            <div className={difference > 0 ? "positive" : difference < 0 ? "negative" : "neutral"}><span>Écart</span><strong>{difference > 0 ? "+" : ""}{difference}</strong></div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Quantité physique comptée *</span>
              <input name="physicalQuantity" type="number" inputMode="numeric" min="0" value={physicalQuantity} onChange={(event) => setPhysicalQuantity(event.target.value)} required />
            </label>
            {difference !== 0 ? <Select label="Motif de l’écart *" name="reason" options={["Casse", "Perte", "Vol", "Erreur de saisie", "Autre"]} /> : <input type="hidden" name="reason" value="Aucun écart" />}
            <Field label="Note complémentaire" name="note" />
          </div>
          <p className="inventory-warning">{difference === 0 ? "✓ Aucun écart : le contrôle sera quand même enregistré." : `Le site corrigera automatiquement le stock de ${product.stockQuantity} à ${parsedPhysicalQuantity} unité(s).`}</p>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="modal-actions">
            <button type="button" className="cancel-button" onClick={close}>Annuler</button>
            <button className="primary-button" disabled={saving}>{saving ? "Enregistrement…" : "Valider l’inventaire"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
function Field({ label, ...props }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string; inputMode?: "tel" | "numeric" | "decimal"; autoComplete?: string; min?: string; step?: string; placeholder?: string; maxLength?: number; max?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
function Select({ label, name, options, defaultValue }: { label: string; name: string; options: string[]; defaultValue?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={defaultValue}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
