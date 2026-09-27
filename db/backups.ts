type SnapshotValue = string | number | null;
type SnapshotRow = Record<string, SnapshotValue>;

export type BackupVerification = {
  ok: boolean;
  backupId: number | null;
  backupCreatedAt: string;
  checkedAt: string;
  recordCount: number;
  error: string;
};

type BusinessSnapshot = {
  version: 1;
  createdAt: string;
  tables: {
    customers: SnapshotRow[];
    orders: SnapshotRow[];
    products: SnapshotRow[];
    stockMovements: SnapshotRow[];
    inventoryCounts?: SnapshotRow[];
    suppliers?: SnapshotRow[];
    purchases: SnapshotRow[];
    supplierInvoices?: SnapshotRow[];
    supplierPayments?: SnapshotRow[];
    expenses?: SnapshotRow[];
    ads: SnapshotRow[];
    capital: SnapshotRow[];
    dailyClosings?: SnapshotRow[];
    settings: SnapshotRow[];
    orderStatusHistory: SnapshotRow[];
    carrierEvents?: SnapshotRow[];
    storefrontProducts?: SnapshotRow[];
    storefrontOffers?: SnapshotRow[];
    storefrontOfferItems?: SnapshotRow[];
    storefrontMedia?: SnapshotRow[];
  };
};

const TABLES = {
  customers: "customers",
  orders: "orders",
  products: "products",
  stockMovements: "stock_movements",
  inventoryCounts: "inventory_counts",
  suppliers: "suppliers",
  purchases: "purchases",
  supplierInvoices: "supplier_invoices",
  supplierPayments: "supplier_payments",
  expenses: "expenses",
  ads: "ad_performance",
  capital: "capital_ledger",
  dailyClosings: "daily_closings",
  settings: "settings",
  orderStatusHistory: "order_status_history",
  carrierEvents: "carrier_events",
  storefrontProducts: "storefront_product_settings",
  storefrontOffers: "storefront_offers",
  storefrontOfferItems: "storefront_offer_items",
  storefrontMedia: "storefront_media",
} as const;

const RESTORE_COLUMNS: Record<keyof BusinessSnapshot["tables"], string[]> = {
  customers: ["id", "name", "phone", "city", "created_at"],
  orders: ["id", "order_ref", "customer_id", "product_id", "city", "address", "products", "quantity", "sale_amount", "product_cost", "shipping_cost", "ad_cost", "fees", "return_cost", "return_reason", "return_note", "source", "campaign", "fulfillment_type", "status", "payment_status", "carrier", "tracking_number", "carrier_dispatch_state", "carrier_authorized_at", "carrier_invoice_code", "stock_deducted", "paid_at", "refunded_at", "deleted_at", "deleted_by_user_id", "created_at", "updated_at", "items_json", "pack_name"],
  products: ["id", "product_code", "name", "category", "purchase_price", "sale_price", "minimum_sale_price", "stock_quantity", "stock_alert_threshold", "reorder_cover_days", "archived_at", "archived_by_user_id", "created_at"],
  stockMovements: ["id", "product_id", "order_id", "purchase_id", "movement_type", "quantity", "note", "created_at"],
  inventoryCounts: ["id", "count_ref", "product_id", "system_quantity", "physical_quantity", "difference", "note", "counted_by_user_id", "counted_by_name", "created_at"],
  suppliers: ["id", "name", "contact_name", "phone", "whatsapp", "city", "lead_time_days", "minimum_order_amount", "payment_terms", "notes", "is_active", "created_at", "updated_at"],
  purchases: ["id", "supplier", "supplier_id", "purchase_ref", "purchase_line_no", "procurement_status", "ordered_at", "expected_at", "item", "product_id", "quantity", "unit_cost", "total_cost", "account", "payment_status", "paid_at", "received_quantity", "received_at", "created_at"],
  supplierInvoices: ["id", "supplier_id", "purchase_ref", "invoice_number", "invoice_date", "due_date", "total_amount", "note", "created_at", "updated_at"],
  supplierPayments: ["id", "invoice_id", "amount", "account", "paid_at", "reference", "note", "created_at"],
  expenses: ["id", "category", "label", "amount", "account", "payment_status", "paid_at", "expense_date", "note", "created_at"],
  ads: ["id", "platform", "campaign", "external_id", "spend", "revenue", "order_count", "native_spend_cents", "native_revenue_cents", "native_currency", "source", "performance_date", "created_at"],
  capital: ["id", "direction", "category", "label", "amount", "account", "order_id", "is_automatic", "auto_key", "entry_date", "created_at"],
  dailyClosings: ["id", "close_date", "expected_bank", "actual_bank", "bank_variance", "expected_cash", "actual_cash", "cash_variance", "expected_other", "actual_other", "other_variance", "expected_total", "actual_total", "total_variance", "carrier_money", "receivables", "unpaid_purchases", "unpaid_expenses", "collected_orders", "collected_amount", "refunded_orders", "refunded_amount", "paid_purchases_count", "paid_purchases_amount", "paid_expenses_count", "paid_expenses_amount", "ad_spend", "note", "closed_by_user_id", "closed_by_name", "created_at", "updated_at"],
  settings: ["key", "value", "updated_at"],
  orderStatusHistory: ["id", "order_id", "from_status", "to_status", "changed_by_user_id", "changed_by_name", "changed_at"],
  carrierEvents: ["id", "provider", "event_type", "external_code", "external_status", "payload_hash", "message", "proof_image", "occurred_at", "order_id", "processed", "error_message", "received_at"],
  storefrontProducts: ["product_id", "public_name", "public_price", "is_visible", "availability_mode", "badge", "description", "sort_order", "updated_at"],
  storefrontOffers: ["id", "name", "description", "price", "compare_price", "badge", "is_active", "sort_order", "created_at", "updated_at"],
  storefrontOfferItems: ["offer_id", "product_id", "quantity"],
  storefrontMedia: ["id", "owner_type", "owner_id", "kind", "mime_type", "data_base64", "byte_size", "sort_order", "created_at"],
};

function casablancaDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

async function readRows(database: D1Database, table: string, where = "") {
  const result = await database.prepare(`SELECT * FROM ${table}${where}`).all<SnapshotRow>();
  return result.results;
}

async function readOptionalRows(database: D1Database, table: string) {
  const existing = await database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  ).bind(table).first<{ name: string }>();
  if (!existing?.name) return undefined;
  return readRows(database, table);
}

async function buildSnapshot(database: D1Database): Promise<BusinessSnapshot> {
  const [customers, orders, products, stockMovements, inventoryCounts, suppliers, purchases, supplierInvoices, supplierPayments, expenses, ads, capital, dailyClosings, settings, orderStatusHistory, carrierEvents, storefrontProducts, storefrontOffers, storefrontOfferItems, storefrontMedia] = await Promise.all([
    readRows(database, TABLES.customers),
    readRows(database, TABLES.orders),
    readRows(database, TABLES.products),
    readRows(database, TABLES.stockMovements),
    readRows(database, TABLES.inventoryCounts),
    readOptionalRows(database, TABLES.suppliers),
    readRows(database, TABLES.purchases),
    readOptionalRows(database, TABLES.supplierInvoices),
    readOptionalRows(database, TABLES.supplierPayments),
    readRows(database, TABLES.expenses),
    readRows(database, TABLES.ads),
    readRows(database, TABLES.capital),
    readOptionalRows(database, TABLES.dailyClosings),
    readRows(database, TABLES.settings, " WHERE key NOT LIKE 'security_%' AND key <> 'backup_webhook_url'"),
    readRows(database, TABLES.orderStatusHistory),
    readRows(database, TABLES.carrierEvents),
    readOptionalRows(database, TABLES.storefrontProducts),
    readOptionalRows(database, TABLES.storefrontOffers),
    readOptionalRows(database, TABLES.storefrontOfferItems),
    readOptionalRows(database, TABLES.storefrontMedia),
  ]);
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    tables: {
      customers, orders, products, stockMovements, inventoryCounts, suppliers, purchases, supplierInvoices, supplierPayments, expenses, ads, capital, dailyClosings, settings,
      orderStatusHistory, carrierEvents, storefrontProducts, storefrontOffers, storefrontOfferItems, storefrontMedia,
    },
  };
}

function countRecords(snapshot: BusinessSnapshot) {
  return Object.values(snapshot.tables).reduce((total, rows) => total + (rows?.length || 0), 0);
}

const requiredSnapshotTables: Array<keyof BusinessSnapshot["tables"]> = [
  "customers", "orders", "products", "stockMovements", "purchases", "ads", "capital", "settings", "orderStatusHistory",
];

function inspectSnapshot(raw: string, expectedRecordCount?: number) {
  let snapshot: BusinessSnapshot;
  try {
    snapshot = JSON.parse(raw) as BusinessSnapshot;
  } catch {
    throw new Error("Le JSON de sauvegarde est illisible.");
  }
  if (!snapshot || snapshot.version !== 1 || !snapshot.tables || typeof snapshot.tables !== "object") {
    throw new Error("Format de sauvegarde incompatible.");
  }
  for (const tableKey of requiredSnapshotTables) {
    const rows = snapshot.tables[tableKey];
    if (!Array.isArray(rows) || rows.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
      throw new Error(`Table de sauvegarde invalide : ${tableKey}.`);
    }
  }
  for (const tableKey of ["inventoryCounts", "suppliers", "expenses", "dailyClosings", "carrierEvents", "storefrontProducts", "storefrontOffers", "storefrontOfferItems", "storefrontMedia"] as const) {
    const rows = snapshot.tables[tableKey];
    if (rows !== undefined && (!Array.isArray(rows) || rows.some((item) => !item || typeof item !== "object" || Array.isArray(item)))) {
      throw new Error(`Table de sauvegarde invalide : ${tableKey}.`);
    }
  }
  const storefrontKeys = ["storefrontProducts", "storefrontOffers", "storefrontOfferItems", "storefrontMedia"] as const;
  const storefrontTableCount = storefrontKeys.filter((key) => snapshot.tables[key] !== undefined).length;
  if (storefrontTableCount !== 0 && storefrontTableCount !== storefrontKeys.length) {
    throw new Error("Sauvegarde boutique incomplète.");
  }
    if (!Number.isFinite(Date.parse(snapshot.createdAt))) throw new Error("Date de sauvegarde invalide.");
  const recordCount = countRecords(snapshot);
  if (expectedRecordCount !== undefined && recordCount !== expectedRecordCount) {
    throw new Error(`Nombre d’enregistrements incohérent : ${recordCount} au lieu de ${expectedRecordCount}.`);
  }
  return { snapshot, recordCount };
}

async function storeBackupHealth(database: D1Database, result: BackupVerification) {
  const values = [
    ["backup_health_status", result.ok ? "verified" : "error"],
    ["backup_health_checked_at", result.checkedAt],
    ["backup_health_backup_created_at", result.backupCreatedAt],
    ["backup_health_backup_id", result.backupId ? String(result.backupId) : ""],
    ["backup_health_record_count", String(result.recordCount)],
    ["backup_health_last_error", result.error],
  ] as const;
  await database.batch(values.map(([key, value]) => database.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, value, result.checkedAt)));
}

export async function verifyLatestBackup(database: D1Database): Promise<BackupVerification> {
  const checkedAt = new Date().toISOString();
  const row = await database.prepare(`
    SELECT id, snapshot_json AS snapshotJson, record_count AS recordCount, created_at AS createdAt
    FROM daily_backups
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).first<{ id: number; snapshotJson: string; recordCount: number; createdAt: string }>();
  if (!row) {
    const result: BackupVerification = { ok: false, backupId: null, backupCreatedAt: "", checkedAt, recordCount: 0, error: "Aucune sauvegarde quotidienne disponible." };
    await storeBackupHealth(database, result);
    return result;
  }
  try {
    const inspected = inspectSnapshot(row.snapshotJson, Number(row.recordCount));
    const result: BackupVerification = {
      ok: true,
      backupId: row.id,
      backupCreatedAt: row.createdAt,
      checkedAt,
      recordCount: inspected.recordCount,
      error: "",
    };
    await storeBackupHealth(database, result);
    return result;
  } catch (error) {
    const result: BackupVerification = {
      ok: false,
      backupId: row.id,
      backupCreatedAt: row.createdAt,
      checkedAt,
      recordCount: Number(row.recordCount || 0),
      error: error instanceof Error ? error.message.slice(0, 300) : "Contrôle de sauvegarde impossible.",
    };
    await storeBackupHealth(database, result);
    return result;
  }
}

export async function createDailyBackup(database: D1Database, reason = "Automatique", force = false) {
  const now = new Date();
  const timeSuffix = now.toISOString().slice(11, 19).replace(/:/g, "");
  const date = force ? `${casablancaDate(now)}T${timeSuffix}` : casablancaDate(now);
  const [existing] = (await database.prepare("SELECT id FROM daily_backups WHERE backup_date = ? LIMIT 1").bind(date).all<{ id: number }>()).results;
  if (existing && !force) return existing.id;

  const snapshot = await buildSnapshot(database);
  const snapshotJson = JSON.stringify(snapshot);
  const recordCount = countRecords(snapshot);
  if (existing) {
    await database.prepare("UPDATE daily_backups SET reason = ?, snapshot_json = ?, record_count = ?, created_at = ? WHERE id = ?")
      .bind(reason, snapshotJson, recordCount, snapshot.createdAt, existing.id)
      .run();
  } else {
    await database.prepare("INSERT INTO daily_backups (backup_date, reason, snapshot_json, record_count, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(date, reason, snapshotJson, recordCount, snapshot.createdAt)
      .run();
  }
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  await database.prepare("DELETE FROM daily_backups WHERE created_at < ?").bind(cutoff.toISOString()).run();
  return existing?.id || null;
}

function insertStatement(database: D1Database, tableKey: keyof BusinessSnapshot["tables"], row: SnapshotRow) {
  const columns = RESTORE_COLUMNS[tableKey];
  const table = TABLES[tableKey];
  const values = columns.map((column) => {
    if (column === "stock_deducted") return row[column] ?? 0;
    if (column === "received_quantity") return row[column] ?? 0;
    if (column === "supplier_id") return row[column] ?? null;
    if (column === "purchase_ref") return row[column] ?? null;
    if (column === "purchase_line_no") return row[column] ?? 1;
    if (column === "procurement_status") {
      if (row[column] !== undefined) return row[column];
      const quantity = Number(row.quantity || 0);
      const received = Number(row.received_quantity || 0);
      return quantity > 0 && received >= quantity ? "Reçu" : received > 0 ? "Partiellement reçu" : "Commandé";
    }
    if (column === "ordered_at") return row[column] ?? row.created_at ?? null;
    if (column === "expected_at") return row[column] ?? null;
    if (column === "contact_name" || column === "phone" || column === "whatsapp" || column === "city" || column === "payment_terms" || column === "notes") return row[column] ?? "";
    if (column === "lead_time_days") return row[column] ?? 7;
    if (column === "minimum_order_amount") return row[column] ?? 0;
    if (column === "is_active") return row[column] ?? 1;
    if (column === "refunded_at") return row[column] ?? null;
    if (column === "paid_at") {
      if (row[column] !== undefined) return row[column];
      if (row.payment_status !== "Payé") return null;
      return row.created_at ?? row.expense_date ?? null;
    }
    if (column === "minimum_sale_price") return row[column] ?? row.sale_price ?? 0;
    if (column === "stock_alert_threshold") return row[column] ?? 5;
    if (column === "reorder_cover_days") return row[column] ?? 30;
    if (column === "fulfillment_type") return row[column] ?? "Livraison";
    if (column === "items_json") return row[column] ?? "[]";
    if (column === "pack_name") return row[column] ?? "";
    if (column === "external_id") return row[column] ?? "";
    if (column === "native_spend_cents" || column === "native_revenue_cents") return row[column] ?? 0;
    if (column === "native_currency") return row[column] ?? "MAD";
    if (["return_reason", "return_note", "campaign", "address", "carrier_dispatch_state", "carrier_invoice_code", "message", "proof_image", "error_message"].includes(column)) return row[column] ?? "";
    if (column === "account") return row[column] ?? "Banque";
    if (column === "is_automatic") return row[column] ?? 0;
    if (column === "processed") return row[column] ?? 0;
    return row[column] ?? null;
  });
  const placeholders = columns.map(() => "?").join(", ");
  return database.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`).bind(...values);
}

export async function restoreDailyBackup(database: D1Database, backupId: number) {
  const [row] = (await database.prepare("SELECT snapshot_json FROM daily_backups WHERE id = ? LIMIT 1").bind(backupId).all<{ snapshot_json: string }>()).results;
  if (!row) throw new Error("Sauvegarde introuvable.");

  const { snapshot } = inspectSnapshot(row.snapshot_json);

  const insertionOrder: Array<keyof BusinessSnapshot["tables"]> = [
    "settings", "customers", "products", "suppliers", "purchases", "supplierInvoices", "supplierPayments", "expenses", "ads", "capital", "orders", "stockMovements",
    "inventoryCounts", "dailyClosings", "orderStatusHistory", "carrierEvents", "storefrontProducts", "storefrontOffers",
    "storefrontOfferItems", "storefrontMedia",
  ];
  const inserts = insertionOrder.flatMap((tableKey) => {
    const rows = snapshot.tables[tableKey];
    // Ces tables n'existaient pas dans les premières sauvegardes v1.
    if (rows === undefined && ["inventoryCounts", "suppliers", "supplierInvoices", "supplierPayments", "carrierEvents", "expenses", "dailyClosings", "storefrontProducts", "storefrontOffers", "storefrontOfferItems", "storefrontMedia"].includes(tableKey)) return [];
    if (!Array.isArray(rows) || rows.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
      throw new Error("Format de sauvegarde incompatible.");
    }
    return rows
      .filter((item) => tableKey !== "settings" || (typeof item.key === "string" && !item.key.startsWith("security_") && item.key !== "backup_webhook_url"))
      .map((item) => insertStatement(database, tableKey, item));
  });

  const restoreStorefront = snapshot.tables.storefrontProducts !== undefined;
  const restoreSuppliers = snapshot.tables.suppliers !== undefined;

  // Un seul batch D1 : toute erreur annule aussi les suppressions précédentes.
  await database.batch([
    ...(restoreStorefront ? [
      database.prepare("DELETE FROM storefront_offer_items"),
      database.prepare("DELETE FROM storefront_media"),
      database.prepare("DELETE FROM storefront_offers"),
      database.prepare("DELETE FROM storefront_product_settings"),
    ] : []),
    database.prepare("DELETE FROM stock_movements"),
    database.prepare("DELETE FROM inventory_counts"),
    database.prepare("DELETE FROM daily_closings"),
    database.prepare("DELETE FROM order_status_history"),
    database.prepare("DELETE FROM carrier_events"),
    database.prepare("DELETE FROM orders"),
    database.prepare("DELETE FROM customers"),
    database.prepare("DELETE FROM supplier_payments"),
    database.prepare("DELETE FROM supplier_invoices"),
    database.prepare("DELETE FROM purchases"),
    ...(restoreSuppliers ? [database.prepare("DELETE FROM suppliers")] : []),
    database.prepare("DELETE FROM expenses"),
    database.prepare("DELETE FROM ad_performance"),
    database.prepare("DELETE FROM capital_ledger"),
    database.prepare("DELETE FROM products"),
    database.prepare("DELETE FROM settings WHERE key NOT LIKE 'security_%' AND key <> 'backup_webhook_url'"),
    ...inserts,
  ]);

  if (!restoreSuppliers) {
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
            ordered_at = COALESCE(ordered_at, created_at)
      `),
    ]);
  }
}

export async function purgeExpiredTrash(database: D1Database) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const expired = (await database.prepare("SELECT id FROM orders WHERE deleted_at IS NOT NULL AND deleted_at < ?").bind(cutoff.toISOString()).all<{ id: number }>()).results;
  if (expired.length) {
    const ids = expired.map((order) => order.id);
    const placeholders = ids.map(() => "?").join(", ");
    await database.batch([
      database.prepare(`UPDATE stock_movements SET order_id = NULL WHERE order_id IN (${placeholders})`).bind(...ids),
      database.prepare(`DELETE FROM order_status_history WHERE order_id IN (${placeholders})`).bind(...ids),
      database.prepare(`UPDATE carrier_events SET order_id = NULL WHERE order_id IN (${placeholders})`).bind(...ids),
      database.prepare(`DELETE FROM orders WHERE id IN (${placeholders})`).bind(...ids),
    ]);
    await database.prepare("DELETE FROM customers WHERE NOT EXISTS (SELECT 1 FROM orders WHERE orders.customer_id = customers.id)").run();
  }
}


export type BusinessResetSummary = {
  orders: number;
  customers: number;
  purchases: number;
  supplierInvoices: number;
  supplierPayments: number;
  expenses: number;
  ads: number;
  capital: number;
  orderHistory: number;
  carrierEvents: number;
};

function countFromResult(result: D1Result<unknown> | undefined) {
  const row = result?.results?.[0] as { count?: number } | undefined;
  return Number(row?.count || 0);
}

export async function resetBusinessValuesPreservingStock(database: D1Database): Promise<BusinessResetSummary> {
  const counts = await database.batch([
    database.prepare("SELECT COUNT(*) AS count FROM orders"),
    database.prepare("SELECT COUNT(*) AS count FROM customers"),
    database.prepare("SELECT COUNT(*) AS count FROM purchases"),
    database.prepare("SELECT COUNT(*) AS count FROM supplier_invoices"),
    database.prepare("SELECT COUNT(*) AS count FROM supplier_payments"),
    database.prepare("SELECT COUNT(*) AS count FROM expenses"),
    database.prepare("SELECT COUNT(*) AS count FROM ad_performance"),
    database.prepare("SELECT COUNT(*) AS count FROM capital_ledger"),
    database.prepare("SELECT COUNT(*) AS count FROM order_status_history"),
    database.prepare("SELECT COUNT(*) AS count FROM carrier_events"),
  ]);

  const summary: BusinessResetSummary = {
    orders: countFromResult(counts[0]),
    customers: countFromResult(counts[1]),
    purchases: countFromResult(counts[2]),
    supplierInvoices: countFromResult(counts[3]),
    supplierPayments: countFromResult(counts[4]),
    expenses: countFromResult(counts[5]),
    ads: countFromResult(counts[6]),
    capital: countFromResult(counts[7]),
    orderHistory: countFromResult(counts[8]),
    carrierEvents: countFromResult(counts[9]),
  };

  // Filet de sécurité : une copie restaurable est créée avant toute remise à zéro.
  await createDailyBackup(database, "Avant remise à zéro des valeurs", true);

  // Les produits, quantités, mouvements de stock et inventaires sont volontairement conservés.
  // On détache seulement la référence vers les anciennes commandes pour permettre leur suppression.
  await database.batch([
    database.prepare("UPDATE stock_movements SET order_id = NULL WHERE order_id IS NOT NULL"),
    database.prepare("UPDATE stock_movements SET purchase_id = NULL WHERE purchase_id IS NOT NULL"),
    database.prepare("DELETE FROM order_status_history"),
    database.prepare("DELETE FROM carrier_events"),
    database.prepare("DELETE FROM capital_ledger"),
    database.prepare("DELETE FROM orders"),
    database.prepare("DELETE FROM customers"),
    database.prepare("DELETE FROM supplier_payments"),
    database.prepare("DELETE FROM supplier_invoices"),
    database.prepare("DELETE FROM purchases"),
    database.prepare("DELETE FROM expenses"),
    database.prepare("DELETE FROM ad_performance"),
  ]);

  return summary;
}

export async function runDailyMaintenance(database: D1Database) {
  await createDailyBackup(database);
  await verifyLatestBackup(database);
  await purgeExpiredTrash(database);
}
