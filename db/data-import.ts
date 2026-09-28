import { createDailyBackup } from "./backups";
import { markGoogleSheetsSyncPending } from "./google-sheets-sync";
import { ensureStorefrontCms } from "./storefront-cms";

type ImportValue = string | number | boolean | null;
type ImportRow = Record<string, unknown>;

type PortableDataExportInput = {
  exportVersion: number;
  source: string;
  exportedAt: string;
  tables: Record<string, ImportRow[]>;
};

export type PortableImportSummary = {
  exportVersion: number;
  exportedAt: string;
  totalRows: number;
  restoredRows: number;
  ignoredRows: number;
  counts: Record<string, number>;
  warnings: string[];
};

type TableSpec = {
  table: string;
  columns: string[];
  defaults?: Record<string, ImportValue | ((row: ImportRow) => ImportValue)>;
};

const TABLE_SPECS: Record<string, TableSpec> = {
  clients: {
    table: "customers",
    columns: ["id", "name", "phone", "city", "created_at"],
  },
  produits: {
    table: "products",
    columns: [
      "id", "product_code", "name", "category", "purchase_price", "sale_price", "minimum_sale_price",
      "stock_quantity", "stock_alert_threshold", "reorder_cover_days", "archived_at", "archived_by_user_id", "created_at",
    ],
    defaults: {
      minimum_sale_price: (row) => scalar(row.sale_price, 0),
      stock_quantity: 0,
      stock_alert_threshold: 5,
      reorder_cover_days: 30,
      archived_at: null,
      archived_by_user_id: null,
    },
  },
  fournisseurs: {
    table: "suppliers",
    columns: [
      "id", "name", "contact_name", "phone", "whatsapp", "city", "lead_time_days",
      "minimum_order_amount", "payment_terms", "notes", "is_active", "created_at", "updated_at",
    ],
    defaults: {
      contact_name: "",
      phone: "",
      whatsapp: "",
      city: "",
      lead_time_days: 7,
      minimum_order_amount: 0,
      payment_terms: "",
      notes: "",
      is_active: 1,
      updated_at: null,
    },
  },
  achats: {
    table: "purchases",
    columns: [
      "id", "supplier", "supplier_id", "purchase_ref", "purchase_line_no", "purchase_mode", "procurement_status", "ordered_at", "expected_at",
      "item", "product_id", "quantity", "unit_cost", "total_cost",
      "account", "payment_status", "paid_at", "received_quantity", "received_at", "created_at",
    ],
    defaults: {
      supplier_id: null,
      purchase_ref: null,
      purchase_line_no: 1,
      purchase_mode: "Retrait fournisseur",
      procurement_status: (row) => {
        const quantity = Number(row.quantity || 0);
        const received = Number(row.received_quantity || 0);
        return quantity > 0 && received >= quantity ? "Reçu" : received > 0 ? "Partiellement reçu" : "Commandé";
      },
      ordered_at: (row) => scalar(row.created_at, null),
      expected_at: null,
      product_id: null,
      account: "Banque",
      payment_status: "Payé",
      paid_at: (row) => String(row.payment_status || "Payé") === "Payé" ? scalar(row.created_at, null) : null,
      received_quantity: 0,
      received_at: null,
    },
  },
  factures_fournisseurs: {
    table: "supplier_invoices",
    columns: ["id", "supplier_id", "purchase_ref", "invoice_number", "invoice_date", "due_date", "total_amount", "note", "created_at", "updated_at"],
    defaults: { note: "", updated_at: null },
  },
  paiements_fournisseurs: {
    table: "supplier_payments",
    columns: ["id", "invoice_id", "amount", "account", "paid_at", "reference", "note", "created_at"],
    defaults: { account: "Banque", reference: "", note: "" },
  },
  charges_recurrentes: {
    table: "recurring_expenses",
    columns: ["id", "category", "label", "amount", "account", "day_of_month", "start_date", "end_date", "note", "is_active", "created_at", "updated_at"],
    defaults: {
      account: "Banque",
      day_of_month: 1,
      end_date: null,
      note: "",
      is_active: 1,
      updated_at: null,
    },
  },
  depenses: {
    table: "expenses",
    columns: ["id", "category", "label", "amount", "account", "payment_status", "paid_at", "expense_date", "note", "recurring_expense_id", "recurring_period", "created_at"],
    defaults: {
      account: "Banque",
      payment_status: "Payé",
      paid_at: (row) => String(row.payment_status || "Payé") === "Payé" ? scalar(row.expense_date ?? row.created_at, null) : null,
      note: "",
      recurring_expense_id: null,
      recurring_period: null,
    },
  },
  commandes: {
    table: "orders",
    columns: [
      "id", "order_ref", "customer_id", "product_id", "city", "address", "products", "quantity",
      "sale_amount", "product_cost", "shipping_cost", "ad_cost", "fees", "return_cost", "return_reason",
      "return_note", "source", "campaign", "fulfillment_type", "status", "payment_status", "carrier",
      "tracking_number", "carrier_dispatch_state", "carrier_authorized_at", "carrier_invoice_code",
      "stock_deducted", "paid_at", "refunded_at", "deleted_at", "deleted_by_user_id", "created_at", "updated_at", "items_json", "pack_name",
    ],
    defaults: {
      product_id: null,
      address: "",
      quantity: 1,
      product_cost: 0,
      shipping_cost: 0,
      ad_cost: 0,
      fees: 0,
      return_cost: 0,
      return_reason: "",
      return_note: "",
      source: "Non renseignée",
      campaign: "",
      fulfillment_type: "Livraison",
      payment_status: "À encaisser",
      carrier: "Non affecté",
      tracking_number: "",
      carrier_dispatch_state: "À autoriser",
      carrier_authorized_at: null,
      carrier_invoice_code: "",
      stock_deducted: 0,
      paid_at: null,
      refunded_at: null,
      deleted_at: null,
      deleted_by_user_id: null,
      updated_at: null,
      items_json: "[]",
      pack_name: "",
    },
  },
  tresorerie_capital: {
    table: "capital_ledger",
    columns: ["id", "direction", "category", "label", "amount", "account", "order_id", "is_automatic", "auto_key", "entry_date", "created_at"],
    defaults: { account: "Banque", order_id: null, is_automatic: 0, auto_key: null },
  },
  clotures_journalieres: {
    table: "daily_closings",
    columns: [
      "id", "close_date",
      "expected_bank", "actual_bank", "bank_variance",
      "expected_cash", "actual_cash", "cash_variance",
      "expected_other", "actual_other", "other_variance",
      "expected_total", "actual_total", "total_variance",
      "carrier_money", "receivables", "unpaid_purchases", "unpaid_expenses",
      "collected_orders", "collected_amount", "refunded_orders", "refunded_amount",
      "paid_purchases_count", "paid_purchases_amount", "paid_expenses_count", "paid_expenses_amount",
      "ad_spend", "note", "closed_by_user_id", "closed_by_name", "created_at", "updated_at",
    ],
    defaults: { note: "", closed_by_user_id: null, closed_by_name: "Import Maison Jiya", updated_at: null },
  },
  clotures_mensuelles: {
    table: "monthly_closings",
    columns: [
      "id", "month_key", "period_start", "period_end",
      "delivered_orders", "delivered_revenue", "collected_amount",
      "product_cost", "shipping_cost", "fees", "return_cost",
      "ad_spend", "operating_expenses", "inventory_loss", "carrier_adjustment",
      "contribution_margin", "net_profit", "reinvestment_allocated",
      "manual_capital_in", "manual_capital_out",
      "stock_value_start", "stock_value_end", "stock_value_source",
      "cash_end", "cash_end_source", "note",
      "closed_by_user_id", "closed_by_name", "created_at",
    ],
    defaults: {
      delivered_orders: 0,
      delivered_revenue: 0,
      collected_amount: 0,
      product_cost: 0,
      shipping_cost: 0,
      fees: 0,
      return_cost: 0,
      ad_spend: 0,
      operating_expenses: 0,
      inventory_loss: 0,
      carrier_adjustment: 0,
      contribution_margin: 0,
      net_profit: 0,
      reinvestment_allocated: 0,
      manual_capital_in: 0,
      manual_capital_out: 0,
      stock_value_start: null,
      stock_value_end: null,
      stock_value_source: "",
      cash_end: 0,
      cash_end_source: "",
      note: "",
      closed_by_user_id: null,
      closed_by_name: "Import Maison Jiya",
    },
  },
  mouvements_stock: {
    table: "stock_movements",
    columns: ["id", "product_id", "order_id", "purchase_id", "movement_type", "quantity", "note", "created_at"],
    defaults: { order_id: null, purchase_id: null, note: "" },
  },
  sessions_inventaire: {
    table: "inventory_sessions",
    columns: ["id", "session_ref", "status", "note", "expected_product_count", "counted_product_count", "total_system_units", "total_physical_units", "total_adjustment_units", "value_before", "value_after", "loss_value", "started_by_user_id", "started_by_name", "started_at", "completed_at"],
    defaults: {
      status: "Clôturé",
      note: "",
      expected_product_count: 0,
      counted_product_count: 0,
      total_system_units: 0,
      total_physical_units: 0,
      total_adjustment_units: 0,
      value_before: 0,
      value_after: 0,
      loss_value: 0,
      started_by_user_id: null,
      started_by_name: "Import Maison Jiya",
      completed_at: null,
    },
  },
  inventaires: {
    table: "inventory_counts",
    columns: ["id", "count_ref", "session_id", "product_id", "system_quantity", "physical_quantity", "difference", "reason", "unit_cost", "value_before", "value_after", "loss_value", "note", "counted_by_user_id", "counted_by_name", "created_at"],
    defaults: {
      session_id: null,
      reason: "Aucun écart",
      unit_cost: 0,
      value_before: 0,
      value_after: 0,
      loss_value: 0,
      note: "",
      counted_by_user_id: null,
      counted_by_name: "Import Maison Jiya",
    },
  },
  historique_commandes: {
    table: "order_status_history",
    columns: ["id", "order_id", "from_status", "to_status", "changed_by_user_id", "changed_by_name", "changed_at"],
    defaults: { from_status: null, changed_by_user_id: null, changed_by_name: "Import Maison Jiya" },
  },
  evenements_transporteurs: {
    table: "carrier_events",
    columns: [
      "id", "provider", "event_type", "external_code", "external_status", "payload_hash", "message",
      "proof_image", "occurred_at", "order_id", "processed", "error_message", "received_at",
    ],
    defaults: { message: "", proof_image: "", occurred_at: null, order_id: null, processed: 0, error_message: "" },
  },
  reglements_transporteurs: {
    table: "carrier_settlements",
    columns: [
      "id", "carrier", "reference", "settlement_date", "expected_amount", "actual_amount",
      "difference_amount", "order_count", "status", "note", "created_by_user_id", "created_by_name", "created_at",
    ],
    defaults: {
      expected_amount: 0,
      actual_amount: 0,
      difference_amount: 0,
      order_count: 0,
      status: "Rapproché",
      note: "",
      created_by_user_id: null,
      created_by_name: "Import Maison Jiya",
    },
  },
  reglement_commandes_transporteurs: {
    table: "carrier_settlement_orders",
    columns: ["id", "settlement_id", "order_id", "expected_amount", "created_at"],
    defaults: { expected_amount: 0 },
  },
  publicites: {
    table: "ad_performance",
    columns: [
      "id", "platform", "campaign", "external_id", "spend", "revenue", "order_count",
      "native_spend_cents", "native_revenue_cents", "native_currency", "source", "performance_date", "created_at",
    ],
    defaults: {
      platform: "Meta Ads",
      external_id: "",
      native_spend_cents: 0,
      native_revenue_cents: 0,
      native_currency: "MAD",
      source: "Manuel",
    },
  },
  journal_actions: {
    table: "audit_logs",
    columns: ["id", "user_id", "username", "display_name", "action", "entity_type", "entity_id", "entity_label", "created_at"],
    defaults: { user_id: null, entity_id: null, entity_label: "" },
  },
  parametres: {
    table: "settings",
    columns: ["key", "value", "updated_at"],
  },
  boutique_produits: {
    table: "storefront_product_settings",
    columns: ["product_id", "public_name", "public_price", "is_visible", "availability_mode", "badge", "description", "sort_order", "updated_at"],
    defaults: { public_name: "", public_price: 0, is_visible: 0, availability_mode: "available", badge: "", description: "", sort_order: 0 },
  },
  boutique_offres: {
    table: "storefront_offers",
    columns: ["id", "name", "description", "price", "compare_price", "badge", "is_active", "sort_order", "created_at", "updated_at"],
    defaults: { description: "", compare_price: 0, badge: "", is_active: 1, sort_order: 0, updated_at: null },
  },
  boutique_composition_offres: {
    table: "storefront_offer_items",
    columns: ["offer_id", "product_id", "quantity"],
    defaults: { quantity: 1 },
  },
  boutique_medias: {
    table: "storefront_media",
    columns: ["id", "owner_type", "owner_id", "kind", "mime_type", "data_base64", "byte_size", "sort_order", "created_at"],
    defaults: { owner_id: 0, kind: "gallery", byte_size: 0, sort_order: 0 },
  },
};

const REQUIRED_TABLES = [
  "clients", "produits", "commandes", "mouvements_stock", "achats", "publicites", "tresorerie_capital", "parametres",
] as const;

const OPTIONAL_TABLES = [
  "fournisseurs", "factures_fournisseurs", "paiements_fournisseurs", "sessions_inventaire", "inventaires", "charges_recurrentes", "depenses", "clotures_journalieres", "clotures_mensuelles", "historique_commandes", "evenements_transporteurs", "reglements_transporteurs", "reglement_commandes_transporteurs", "journal_actions",
  "boutique_produits", "boutique_offres", "boutique_composition_offres", "boutique_medias",
] as const;

const INFORMATIONAL_TABLES = ["membres", "journal_sync_google_sheets"] as const;

const USER_REFERENCE_COLUMNS = new Set([
  "deleted_by_user_id", "archived_by_user_id", "counted_by_user_id", "started_by_user_id", "changed_by_user_id", "closed_by_user_id", "created_by_user_id", "user_id",
]);

function isPlainRow(value: unknown): value is ImportRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function scalar(value: unknown, fallback: ImportValue = null): ImportValue {
  if (value === undefined) return fallback;
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new Error("Une cellule de l’export contient un format non pris en charge.");
}

function rowsFor(tables: Record<string, ImportRow[]>, key: string) {
  return tables[key] || [];
}

function numberId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function duplicateValue(rows: ImportRow[], key: string, allowBlank = false) {
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = row[key];
    if ((raw === null || raw === undefined || raw === "") && allowBlank) continue;
    const value = String(raw ?? "");
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return "";
}

function assertUnique(tables: Record<string, ImportRow[]>, tableKey: string, key: string, label: string, allowBlank = false) {
  const duplicate = duplicateValue(rowsFor(tables, tableKey), key, allowBlank);
  if (duplicate) throw new Error(`L’export contient un doublon de ${label} : ${duplicate}.`);
}

function assertForeignKey(value: unknown, allowed: Set<number>, label: string, nullable = true) {
  const id = numberId(value);
  if (id === null) {
    if (nullable) return;
    throw new Error(`Référence obligatoire invalide : ${label}.`);
  }
  if (!allowed.has(id)) throw new Error(`Référence introuvable dans l’export : ${label} #${id}.`);
}

function protectedSettingKey(key: string) {
  return key === "account_email"
    || key === "account_name"
    || key === "backup_webhook_url"
    || key === "backup_sheet_url"
    || key === "carrier_last_sync_at"
    || key.startsWith("security_")
    || key.startsWith("backup_health_")
    || key.startsWith("meta_")
    || key.startsWith("sendit_")
    || key.startsWith("forcelog_")
    || key.startsWith("force_log_")
    || key.startsWith("google_sheets_");
}

function validateReferences(tables: Record<string, ImportRow[]>) {
  const customerIds = new Set(rowsFor(tables, "clients").map((row) => numberId(row.id)).filter((id): id is number => id !== null));
  const productIds = new Set(rowsFor(tables, "produits").map((row) => numberId(row.id)).filter((id): id is number => id !== null));
  const supplierIds = new Set(rowsFor(tables, "fournisseurs").map((row) => numberId(row.id)).filter((id): id is number => id !== null));
  const purchaseIds = new Set(rowsFor(tables, "achats").map((row) => numberId(row.id)).filter((id): id is number => id !== null));
  const purchaseRefs = new Set(rowsFor(tables, "achats").map((row) => String(row.purchase_ref || "").trim()).filter(Boolean));
  const supplierInvoiceIds = new Set(rowsFor(tables, "factures_fournisseurs").map((row) => numberId(row.id)).filter((id): id is number => id !== null));
  const orderIds = new Set(rowsFor(tables, "commandes").map((row) => numberId(row.id)).filter((id): id is number => id !== null));
  const offerIds = new Set(rowsFor(tables, "boutique_offres").map((row) => numberId(row.id)).filter((id): id is number => id !== null));
  const inventorySessionIds = new Set(rowsFor(tables, "sessions_inventaire").map((row) => numberId(row.id)).filter((id): id is number => id !== null));
  const carrierSettlementIds = new Set(rowsFor(tables, "reglements_transporteurs").map((row) => numberId(row.id)).filter((id): id is number => id !== null));

  for (const row of rowsFor(tables, "commandes")) {
    assertForeignKey(row.customer_id, customerIds, "client de commande", false);
    assertForeignKey(row.product_id, productIds, "produit de commande", true);
    const rawItems = row.items_json;
    if (rawItems !== undefined && rawItems !== null && rawItems !== "") {
      let items: unknown = rawItems;
      if (typeof rawItems === "string") {
        try {
          items = JSON.parse(rawItems || "[]");
        } catch {
          throw new Error("Une commande contient une composition multi-produits illisible.");
        }
      }
      if (!Array.isArray(items)) throw new Error("Une commande contient une composition multi-produits invalide.");
      for (const item of items) {
        if (!isPlainRow(item)) throw new Error("Une commande contient une ligne multi-produits invalide.");
        assertForeignKey(item.productId, productIds, "produit de commande multi-produits", false);
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Une commande contient une quantité multi-produits invalide.");
      }
    }
  }
  for (const row of rowsFor(tables, "achats")) {
    assertForeignKey(row.product_id, productIds, "produit d’achat", true);
    assertForeignKey(row.supplier_id, supplierIds, "fournisseur d’achat", true);
  }
  for (const row of rowsFor(tables, "factures_fournisseurs")) {
    assertForeignKey(row.supplier_id, supplierIds, "fournisseur de facture", false);
    const purchaseRef = String(row.purchase_ref || "").trim();
    if (!purchaseRef || !purchaseRefs.has(purchaseRef)) throw new Error(`Référence de bon introuvable pour une facture fournisseur : ${purchaseRef || "vide"}.`);
  }
  for (const row of rowsFor(tables, "paiements_fournisseurs")) {
    assertForeignKey(row.invoice_id, supplierInvoiceIds, "facture du paiement fournisseur", false);
  }
  for (const row of rowsFor(tables, "mouvements_stock")) {
    assertForeignKey(row.product_id, productIds, "produit de mouvement de stock", false);
    assertForeignKey(row.order_id, orderIds, "commande de mouvement de stock", true);
    assertForeignKey(row.purchase_id, purchaseIds, "achat de mouvement de stock", true);
  }
  for (const row of rowsFor(tables, "inventaires")) {
    assertForeignKey(row.product_id, productIds, "produit d’inventaire", false);
    assertForeignKey(row.session_id, inventorySessionIds, "session d’inventaire", true);
  }
  for (const row of rowsFor(tables, "historique_commandes")) assertForeignKey(row.order_id, orderIds, "commande d’historique", false);
  for (const row of rowsFor(tables, "evenements_transporteurs")) assertForeignKey(row.order_id, orderIds, "commande d’événement transporteur", true);
  for (const row of rowsFor(tables, "reglement_commandes_transporteurs")) {
    assertForeignKey(row.settlement_id, carrierSettlementIds, "règlement transporteur", false);
    assertForeignKey(row.order_id, orderIds, "commande du règlement transporteur", false);
  }
  for (const row of rowsFor(tables, "tresorerie_capital")) assertForeignKey(row.order_id, orderIds, "commande de mouvement de capital", true);
  for (const row of rowsFor(tables, "boutique_produits")) assertForeignKey(row.product_id, productIds, "produit boutique", false);
  for (const row of rowsFor(tables, "boutique_composition_offres")) {
    assertForeignKey(row.offer_id, offerIds, "offre boutique", false);
    assertForeignKey(row.product_id, productIds, "produit d’offre boutique", false);
  }
  for (const row of rowsFor(tables, "boutique_medias")) {
    const ownerType = String(row.owner_type || "");
    if (ownerType === "product") assertForeignKey(row.owner_id, productIds, "média produit", false);
    if (ownerType === "offer") assertForeignKey(row.owner_id, offerIds, "média offre", false);
  }
}

function parsePortableExport(raw: string) {
  if (!raw.trim()) throw new Error("Le fichier JSON est vide.");
  if (raw.length > 12_000_000) throw new Error("Le fichier dépasse la limite de 12 Mo.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Le fichier JSON est illisible.");
  }
  if (!isPlainRow(parsed)) throw new Error("Le fichier ne correspond pas à un export Maison Jiya.");

  const exportVersion = Number(parsed.exportVersion);
  const source = String(parsed.source || "");
  const exportedAt = String(parsed.exportedAt || "");
  if (exportVersion !== 1 || source !== "Maison Jiya") throw new Error("Version d’export Maison Jiya incompatible.");
  if (!Number.isFinite(Date.parse(exportedAt))) throw new Error("La date de l’export est invalide.");
  if (!isPlainRow(parsed.tables)) throw new Error("Les tables de l’export sont manquantes.");

  const rawTables = parsed.tables as Record<string, unknown>;
  const tables: Record<string, ImportRow[]> = {};
  for (const [key, value] of Object.entries(rawTables)) {
    if (!Array.isArray(value)) throw new Error(`La table « ${key} » est invalide.`);
    if (value.some((row) => !isPlainRow(row))) throw new Error(`La table « ${key} » contient une ligne invalide.`);
    tables[key] = value as ImportRow[];
  }

  for (const key of REQUIRED_TABLES) {
    if (!Array.isArray(tables[key])) throw new Error(`La table obligatoire « ${key} » est absente de l’export.`);
  }

  const totalRows = Object.values(tables).reduce((total, rows) => total + rows.length, 0);
  if (totalRows > 60_000) throw new Error("Cet export contient trop de lignes pour une restauration sûre.");

  assertUnique(tables, "clients", "id", "client");
  assertUnique(tables, "clients", "phone", "téléphone client");
  assertUnique(tables, "produits", "id", "produit");
  assertUnique(tables, "produits", "product_code", "référence produit");
  assertUnique(tables, "fournisseurs", "id", "fournisseur");
  assertUnique(tables, "fournisseurs", "name", "nom fournisseur");
  assertUnique(tables, "achats", "id", "achat");
  assertUnique(tables, "sessions_inventaire", "id", "session d’inventaire");
  assertUnique(tables, "sessions_inventaire", "session_ref", "référence de session d’inventaire");
  assertUnique(tables, "inventaires", "id", "comptage d’inventaire");
  assertUnique(tables, "inventaires", "count_ref", "référence de comptage d’inventaire");
  assertUnique(tables, "factures_fournisseurs", "id", "facture fournisseur");
  assertUnique(tables, "factures_fournisseurs", "purchase_ref", "bon facturé");
  assertUnique(tables, "paiements_fournisseurs", "id", "paiement fournisseur");
  const invoiceNumbers = new Set<string>();
  for (const row of rowsFor(tables, "factures_fournisseurs")) {
    const key = `${row.supplier_id ?? ""}::${String(row.invoice_number || "").trim().toLocaleLowerCase("fr")}`;
    if (invoiceNumbers.has(key)) throw new Error(`L’export contient un doublon de numéro de facture fournisseur : ${row.invoice_number ?? ""}.`);
    invoiceNumbers.add(key);
  }
  const carrierSettlementRefs = new Set<string>();
  for (const row of rowsFor(tables, "reglements_transporteurs")) {
    const key = `${String(row.carrier || "").trim().toLocaleLowerCase("fr")}::${String(row.reference || "").trim().toLocaleLowerCase("fr")}`;
    if (carrierSettlementRefs.has(key)) throw new Error(`L’export contient un doublon de référence de règlement transporteur : ${row.reference ?? ""}.`);
    carrierSettlementRefs.add(key);
  }

  const purchaseOrderLines = new Set<string>();
  for (const row of rowsFor(tables, "achats")) {
    const purchaseRef = String(row.purchase_ref || "").trim();
    if (!purchaseRef) continue;
    const lineNo = Number(row.purchase_line_no || 1);
    if (!Number.isInteger(lineNo) || lineNo < 1) throw new Error(`Ligne de bon de commande invalide pour ${purchaseRef}.`);
    const lineKey = `${purchaseRef}::${lineNo}`;
    if (purchaseOrderLines.has(lineKey)) throw new Error(`L’export contient un doublon de ligne pour le bon ${purchaseRef}.`);
    purchaseOrderLines.add(lineKey);
  }
  assertUnique(tables, "commandes", "id", "commande");
  assertUnique(tables, "commandes", "order_ref", "référence commande");
  assertUnique(tables, "mouvements_stock", "id", "mouvement de stock");
  assertUnique(tables, "inventaires", "id", "inventaire");
  assertUnique(tables, "inventaires", "count_ref", "référence d’inventaire");
  assertUnique(tables, "publicites", "id", "ligne publicitaire");
  assertUnique(tables, "charges_recurrentes", "id", "charge récurrente");
  assertUnique(tables, "tresorerie_capital", "id", "mouvement de capital");
  assertUnique(tables, "tresorerie_capital", "auto_key", "clé automatique de capital", true);
  assertUnique(tables, "clotures_journalieres", "id", "clôture journalière");
  assertUnique(tables, "clotures_journalieres", "close_date", "date de clôture");
  assertUnique(tables, "clotures_mensuelles", "id", "clôture mensuelle");
  assertUnique(tables, "clotures_mensuelles", "month_key", "mois de clôture");
  assertUnique(tables, "historique_commandes", "id", "historique de commande");
  assertUnique(tables, "evenements_transporteurs", "id", "événement transporteur");
  assertUnique(tables, "evenements_transporteurs", "payload_hash", "empreinte transporteur");
  assertUnique(tables, "reglements_transporteurs", "id", "règlement transporteur");
  assertUnique(tables, "reglement_commandes_transporteurs", "id", "ligne de règlement transporteur");
  assertUnique(tables, "reglement_commandes_transporteurs", "order_id", "commande déjà rapprochée");
  assertUnique(tables, "journal_actions", "id", "journal d’action");
  assertUnique(tables, "boutique_offres", "id", "offre boutique");
  assertUnique(tables, "boutique_medias", "id", "média boutique");
  assertUnique(tables, "parametres", "key", "paramètre");

  const storefrontProducts = rowsFor(tables, "boutique_produits");
  const storefrontProductIds = new Set<string>();
  for (const row of storefrontProducts) {
    const id = String(row.product_id ?? "");
    if (storefrontProductIds.has(id)) throw new Error(`Le produit boutique #${id} apparaît plusieurs fois.`);
    storefrontProductIds.add(id);
  }
  const offerItemKeys = new Set<string>();
  for (const row of rowsFor(tables, "boutique_composition_offres")) {
    const key = `${row.offer_id ?? ""}:${row.product_id ?? ""}`;
    if (offerItemKeys.has(key)) throw new Error(`La composition d’offre ${key} apparaît plusieurs fois.`);
    offerItemKeys.add(key);
  }

  validateReferences(tables);

  const counts = Object.fromEntries(Object.entries(tables).map(([key, rows]) => [key, rows.length]));
  const warnings: string[] = [];
  for (const key of OPTIONAL_TABLES) {
    if (!tables[key]) warnings.push(`Table optionnelle absente : ${key}. Elle sera restaurée vide ou reconstruite automatiquement.`);
  }
  const members = rowsFor(tables, "membres").length;
  if (members) warnings.push(`${members} compte(s) utilisateur figurent dans l’export, mais les comptes et mots de passe actuels seront conservés pour éviter de perdre l’accès.`);
  const syncLogs = rowsFor(tables, "journal_sync_google_sheets").length;
  if (syncLogs) warnings.push(`${syncLogs} ancienne(s) ligne(s) de synchronisation Google Sheets ne seront pas rejouées ; une nouvelle synchronisation sera programmée après restauration.`);
  warnings.push("L’adresse e-mail du compte, les secrets, les clés d’API, les sessions et la configuration de sauvegarde externe actuels restent intacts.");

  const restoredRows = Object.keys(TABLE_SPECS).reduce((total, key) => {
    if (key === "parametres") return total + rowsFor(tables, key).filter((row) => !protectedSettingKey(String(row.key || ""))).length;
    return total + rowsFor(tables, key).length;
  }, 0);
  const ignoredRows = Math.max(0, totalRows - restoredRows);

  return {
    data: { exportVersion, source, exportedAt, tables } satisfies PortableDataExportInput,
    summary: { exportVersion, exportedAt, totalRows, restoredRows, ignoredRows, counts, warnings } satisfies PortableImportSummary,
  };
}

function valueFor(row: ImportRow, column: string, spec: TableSpec, allowedUserIds: Set<number>) {
  let value: ImportValue;
  if (row[column] === undefined) {
    const fallback = spec.defaults?.[column];
    value = typeof fallback === "function" ? fallback(row) : (fallback ?? null);
  } else {
    value = scalar(row[column]);
  }

  if (USER_REFERENCE_COLUMNS.has(column)) {
    const userId = numberId(value);
    if (userId === null || !allowedUserIds.has(userId)) return null;
    return userId;
  }
  return value;
}

function insertStatement(database: D1Database, exportKey: string, row: ImportRow, allowedUserIds: Set<number>) {
  const spec = TABLE_SPECS[exportKey];
  const values = spec.columns.map((column) => valueFor(row, column, spec, allowedUserIds));
  const placeholders = spec.columns.map(() => "?").join(", ");
  return database.prepare(`INSERT INTO ${spec.table} (${spec.columns.join(", ")}) VALUES (${placeholders})`).bind(...values);
}

function settingsRows(tables: Record<string, ImportRow[]>) {
  return rowsFor(tables, "parametres").filter((row) => {
    const key = String(row.key || "");
    return key && !protectedSettingKey(key);
  });
}

export function previewPortableDataImport(raw: string): PortableImportSummary {
  return parsePortableExport(raw).summary;
}

export async function restorePortableDataImport(database: D1Database, raw: string): Promise<PortableImportSummary> {
  const { data, summary } = parsePortableExport(raw);
  await ensureStorefrontCms(database);

  // Filet de sécurité persistant : cette copie est créée avant toute suppression.
  await createDailyBackup(database, "Avant import d’un export portable", true);

  const currentUsers = (await database.prepare("SELECT id FROM users").all<{ id: number }>()).results;
  const allowedUserIds = new Set(currentUsers.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0));

  const statements = [] as ReturnType<typeof database.prepare>[];

  // Un seul batch D1 : une erreur sur n’importe quelle ligne annule toute la restauration.
  statements.push(
    database.prepare("DELETE FROM storefront_offer_items"),
    database.prepare("DELETE FROM storefront_media"),
    database.prepare("DELETE FROM storefront_offers"),
    database.prepare("DELETE FROM storefront_product_settings"),
    database.prepare("DELETE FROM stock_movements"),
    database.prepare("DELETE FROM inventory_counts"),
    database.prepare("DELETE FROM inventory_sessions"),
    database.prepare("DELETE FROM daily_closings"),
    database.prepare("DELETE FROM monthly_closings"),
    database.prepare("DELETE FROM order_status_history"),
    database.prepare("DELETE FROM carrier_settlement_orders"),
    database.prepare("DELETE FROM carrier_settlements"),
    database.prepare("DELETE FROM carrier_events"),
    database.prepare("DELETE FROM capital_ledger"),
    database.prepare("DELETE FROM orders"),
    database.prepare("DELETE FROM customers"),
    database.prepare("DELETE FROM supplier_payments"),
    database.prepare("DELETE FROM supplier_invoices"),
    database.prepare("DELETE FROM purchases"),
    database.prepare("DELETE FROM suppliers"),
    database.prepare("DELETE FROM expenses"),
    database.prepare("DELETE FROM recurring_expenses"),
    database.prepare("DELETE FROM ad_performance"),
    database.prepare("DELETE FROM products"),
    database.prepare("DELETE FROM audit_logs"),
    database.prepare("DELETE FROM google_sheets_sync_log"),
    database.prepare(`
      DELETE FROM settings
      WHERE key <> 'account_email'
        AND key <> 'account_name'
        AND key <> 'backup_webhook_url'
        AND key <> 'backup_sheet_url'
        AND key <> 'carrier_last_sync_at'
        AND key NOT LIKE 'security_%'
        AND key NOT LIKE 'backup_health_%'
        AND key NOT LIKE 'meta_%'
        AND key NOT LIKE 'sendit_%'
        AND key NOT LIKE 'forcelog_%'
        AND key NOT LIKE 'force_log_%'
        AND key NOT LIKE 'google_sheets_%'
    `),
  );

  const orderedKeys = [
    "clients",
    "produits",
    "fournisseurs",
    "achats",
    "factures_fournisseurs",
    "paiements_fournisseurs",
    "charges_recurrentes",
    "depenses",
    "commandes",
    "tresorerie_capital",
    "clotures_journalieres",
    "clotures_mensuelles",
    "mouvements_stock",
    "sessions_inventaire",
    "inventaires",
    "historique_commandes",
    "evenements_transporteurs",
    "reglements_transporteurs",
    "reglement_commandes_transporteurs",
    "publicites",
    "journal_actions",
    "parametres",
    "boutique_produits",
    "boutique_offres",
    "boutique_composition_offres",
    "boutique_medias",
  ] as const;

  for (const exportKey of orderedKeys) {
    const rows = exportKey === "parametres" ? settingsRows(data.tables) : rowsFor(data.tables, exportKey);
    for (const row of rows) statements.push(insertStatement(database, exportKey, row, allowedUserIds));
  }

  await database.batch(statements);

  // Compatibilité avec les exports créés avant le module Fournisseurs.
  await database.batch([
    database.prepare(`
      INSERT OR IGNORE INTO suppliers (name, created_at)
      SELECT trim(supplier), MIN(created_at)
      FROM purchases
      WHERE trim(supplier) <> ''
      GROUP BY lower(trim(supplier))
    `),
    database.prepare(`
      UPDATE purchases
      SET supplier_id = COALESCE(
            supplier_id,
            (SELECT suppliers.id FROM suppliers WHERE lower(suppliers.name) = lower(trim(purchases.supplier)) LIMIT 1)
          ),
          purchase_ref = COALESCE(NULLIF(purchase_ref, ''), 'BC-' || printf('%06d', id)),
          procurement_status = CASE
            WHEN procurement_status IS NULL OR procurement_status = '' THEN
              CASE
                WHEN received_quantity >= quantity AND quantity > 0 THEN 'Reçu'
                WHEN received_quantity > 0 THEN 'Partiellement reçu'
                ELSE 'Commandé'
              END
            ELSE procurement_status
          END,
          ordered_at = COALESCE(ordered_at, created_at)
    `),
  ]);

  // Les triggers marquent déjà la copie externe comme modifiée ; on explicite néanmoins
  // une nouvelle tentative et on reconstruit les valeurs par défaut manquantes.
  await ensureStorefrontCms(database);
  await markGoogleSheetsSyncPending(database);

  return summary;
}
