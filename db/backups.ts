type SnapshotValue = string | number | null;
type SnapshotRow = Record<string, SnapshotValue>;

type BusinessSnapshot = {
  version: 1;
  createdAt: string;
  tables: {
    customers: SnapshotRow[];
    orders: SnapshotRow[];
    products: SnapshotRow[];
    stockMovements: SnapshotRow[];
    inventoryCounts?: SnapshotRow[];
    purchases: SnapshotRow[];
    expenses?: SnapshotRow[];
    ads: SnapshotRow[];
    capital: SnapshotRow[];
    settings: SnapshotRow[];
    orderStatusHistory: SnapshotRow[];
    carrierEvents?: SnapshotRow[];
  };
};

const TABLES = {
  customers: "customers",
  orders: "orders",
  products: "products",
  stockMovements: "stock_movements",
  inventoryCounts: "inventory_counts",
  purchases: "purchases",
  expenses: "expenses",
  ads: "ad_performance",
  capital: "capital_ledger",
  settings: "settings",
  orderStatusHistory: "order_status_history",
  carrierEvents: "carrier_events",
} as const;

const RESTORE_COLUMNS: Record<keyof BusinessSnapshot["tables"], string[]> = {
  customers: ["id", "name", "phone", "city", "created_at"],
  orders: ["id", "order_ref", "customer_id", "product_id", "city", "address", "products", "quantity", "sale_amount", "product_cost", "shipping_cost", "ad_cost", "fees", "return_cost", "return_reason", "return_note", "source", "campaign", "fulfillment_type", "status", "payment_status", "carrier", "tracking_number", "carrier_dispatch_state", "carrier_authorized_at", "carrier_invoice_code", "stock_deducted", "paid_at", "deleted_at", "deleted_by_user_id", "created_at", "updated_at", "items_json", "pack_name"],
  products: ["id", "product_code", "name", "category", "purchase_price", "sale_price", "minimum_sale_price", "stock_quantity", "created_at"],
  stockMovements: ["id", "product_id", "order_id", "purchase_id", "movement_type", "quantity", "note", "created_at"],
  inventoryCounts: ["id", "count_ref", "product_id", "system_quantity", "physical_quantity", "difference", "note", "counted_by_user_id", "counted_by_name", "created_at"],
  purchases: ["id", "supplier", "item", "product_id", "quantity", "unit_cost", "total_cost", "payment_status", "received_quantity", "received_at", "created_at"],
  expenses: ["id", "category", "label", "amount", "account", "payment_status", "expense_date", "note", "created_at"],
  ads: ["id", "platform", "campaign", "external_id", "spend", "revenue", "order_count", "native_spend_cents", "native_revenue_cents", "native_currency", "source", "performance_date", "created_at"],
  capital: ["id", "direction", "category", "label", "amount", "account", "order_id", "is_automatic", "auto_key", "entry_date", "created_at"],
  settings: ["key", "value", "updated_at"],
  orderStatusHistory: ["id", "order_id", "from_status", "to_status", "changed_by_user_id", "changed_by_name", "changed_at"],
  carrierEvents: ["id", "provider", "event_type", "external_code", "external_status", "payload_hash", "message", "proof_image", "occurred_at", "order_id", "processed", "error_message", "received_at"],
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

async function buildSnapshot(database: D1Database): Promise<BusinessSnapshot> {
  const [customers, orders, products, stockMovements, inventoryCounts, purchases, expenses, ads, capital, settings, orderStatusHistory, carrierEvents] = await Promise.all([
    readRows(database, TABLES.customers),
    readRows(database, TABLES.orders),
    readRows(database, TABLES.products),
    readRows(database, TABLES.stockMovements),
    readRows(database, TABLES.inventoryCounts),
    readRows(database, TABLES.purchases),
    readRows(database, TABLES.expenses),
    readRows(database, TABLES.ads),
    readRows(database, TABLES.capital),
    readRows(database, TABLES.settings, " WHERE key NOT LIKE 'security_%' AND key <> 'backup_webhook_url'"),
    readRows(database, TABLES.orderStatusHistory),
    readRows(database, TABLES.carrierEvents),
  ]);
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    tables: { customers, orders, products, stockMovements, inventoryCounts, purchases, expenses, ads, capital, settings, orderStatusHistory, carrierEvents },
  };
}

function countRecords(snapshot: BusinessSnapshot) {
  return Object.values(snapshot.tables).reduce((total, rows) => total + (rows?.length || 0), 0);
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
    if (column === "minimum_sale_price") return row[column] ?? row.sale_price ?? 0;
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

  const snapshot = JSON.parse(row.snapshot_json) as BusinessSnapshot;
  if (!snapshot || snapshot.version !== 1 || !snapshot.tables || typeof snapshot.tables !== "object") throw new Error("Format de sauvegarde incompatible.");

  const insertionOrder: Array<keyof BusinessSnapshot["tables"]> = [
    "settings", "customers", "products", "purchases", "expenses", "ads", "capital", "orders", "stockMovements", "inventoryCounts", "orderStatusHistory", "carrierEvents",
  ];
  const inserts = insertionOrder.flatMap((tableKey) => {
    const rows = snapshot.tables[tableKey];
    // Ces deux tables n'existaient pas dans les premières sauvegardes v1.
    if (rows === undefined && (tableKey === "inventoryCounts" || tableKey === "carrierEvents")) return [];
    if (!Array.isArray(rows) || rows.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
      throw new Error("Format de sauvegarde incompatible.");
    }
    return rows
      .filter((item) => tableKey !== "settings" || (typeof item.key === "string" && !item.key.startsWith("security_") && item.key !== "backup_webhook_url"))
      .map((item) => insertStatement(database, tableKey, item));
  });

  // Un seul batch D1 : toute erreur annule aussi les suppressions précédentes.
  await database.batch([
    database.prepare("DELETE FROM stock_movements"),
    database.prepare("DELETE FROM inventory_counts"),
    database.prepare("DELETE FROM order_status_history"),
    database.prepare("DELETE FROM carrier_events"),
    database.prepare("DELETE FROM orders"),
    database.prepare("DELETE FROM customers"),
    database.prepare("DELETE FROM purchases"),
    database.prepare("DELETE FROM expenses"),
    database.prepare("DELETE FROM ad_performance"),
    database.prepare("DELETE FROM capital_ledger"),
    database.prepare("DELETE FROM products"),
    database.prepare("DELETE FROM settings WHERE key NOT LIKE 'security_%' AND key <> 'backup_webhook_url'"),
    ...inserts,
  ]);
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
    expenses: countFromResult(counts[3]),
    ads: countFromResult(counts[4]),
    capital: countFromResult(counts[5]),
    orderHistory: countFromResult(counts[6]),
    carrierEvents: countFromResult(counts[7]),
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
    database.prepare("DELETE FROM purchases"),
    database.prepare("DELETE FROM expenses"),
    database.prepare("DELETE FROM ad_performance"),
  ]);

  return summary;
}

export async function runDailyMaintenance(database: D1Database) {
  await createDailyBackup(database);
  await purgeExpiredTrash(database);
}
