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
    purchases: SnapshotRow[];
    ads: SnapshotRow[];
    capital: SnapshotRow[];
    settings: SnapshotRow[];
    orderStatusHistory: SnapshotRow[];
  };
};

const TABLES = {
  customers: "customers",
  orders: "orders",
  products: "products",
  stockMovements: "stock_movements",
  purchases: "purchases",
  ads: "ad_performance",
  capital: "capital_ledger",
  settings: "settings",
  orderStatusHistory: "order_status_history",
} as const;

const RESTORE_COLUMNS: Record<keyof BusinessSnapshot["tables"], string[]> = {
  customers: ["id", "name", "phone", "city", "created_at"],
  orders: ["id", "order_ref", "customer_id", "city", "products", "quantity", "sale_amount", "product_cost", "shipping_cost", "ad_cost", "fees", "return_cost", "source", "status", "payment_status", "carrier", "tracking_number", "paid_at", "deleted_at", "deleted_by_user_id", "created_at", "updated_at"],
  products: ["id", "product_code", "name", "category", "purchase_price", "sale_price", "stock_quantity", "created_at"],
  stockMovements: ["id", "product_id", "movement_type", "quantity", "note", "created_at"],
  purchases: ["id", "supplier", "item", "quantity", "unit_cost", "total_cost", "payment_status", "created_at"],
  ads: ["id", "platform", "campaign", "spend", "revenue", "order_count", "source", "performance_date", "created_at"],
  capital: ["id", "direction", "category", "label", "amount", "entry_date", "created_at"],
  settings: ["key", "value", "updated_at"],
  orderStatusHistory: ["id", "order_id", "from_status", "to_status", "changed_by_user_id", "changed_by_name", "changed_at"],
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
  const [customers, orders, products, stockMovements, purchases, ads, capital, settings, orderStatusHistory] = await Promise.all([
    readRows(database, TABLES.customers),
    readRows(database, TABLES.orders),
    readRows(database, TABLES.products),
    readRows(database, TABLES.stockMovements),
    readRows(database, TABLES.purchases),
    readRows(database, TABLES.ads),
    readRows(database, TABLES.capital),
    readRows(database, TABLES.settings, " WHERE key NOT LIKE 'security_%' AND key <> 'backup_webhook_url'"),
    readRows(database, TABLES.orderStatusHistory),
  ]);
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    tables: { customers, orders, products, stockMovements, purchases, ads, capital, settings, orderStatusHistory },
  };
}

function countRecords(snapshot: BusinessSnapshot) {
  return Object.values(snapshot.tables).reduce((total, rows) => total + rows.length, 0);
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
  const values = columns.map((column) => row[column] ?? null);
  const placeholders = columns.map(() => "?").join(", ");
  return database.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`).bind(...values);
}

async function runBatches(database: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 50) {
    await database.batch(statements.slice(index, index + 50));
  }
}

export async function restoreDailyBackup(database: D1Database, backupId: number) {
  const [row] = (await database.prepare("SELECT snapshot_json FROM daily_backups WHERE id = ? LIMIT 1").bind(backupId).all<{ snapshot_json: string }>()).results;
  if (!row) throw new Error("Sauvegarde introuvable.");

  const snapshot = JSON.parse(row.snapshot_json) as BusinessSnapshot;
  if (snapshot.version !== 1 || !snapshot.tables) throw new Error("Format de sauvegarde incompatible.");

  await database.batch([
    database.prepare("DELETE FROM stock_movements"),
    database.prepare("DELETE FROM order_status_history"),
    database.prepare("DELETE FROM orders"),
    database.prepare("DELETE FROM customers"),
    database.prepare("DELETE FROM purchases"),
    database.prepare("DELETE FROM ad_performance"),
    database.prepare("DELETE FROM capital_ledger"),
    database.prepare("DELETE FROM products"),
    database.prepare("DELETE FROM settings WHERE key NOT LIKE 'security_%'"),
  ]);

  const insertionOrder: Array<keyof BusinessSnapshot["tables"]> = [
    "settings", "customers", "products", "purchases", "ads", "capital", "orders", "stockMovements", "orderStatusHistory",
  ];
  for (const tableKey of insertionOrder) {
    await runBatches(database, snapshot.tables[tableKey].map((item) => insertStatement(database, tableKey, item)));
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
      database.prepare(`DELETE FROM order_status_history WHERE order_id IN (${placeholders})`).bind(...ids),
      database.prepare(`DELETE FROM orders WHERE id IN (${placeholders})`).bind(...ids),
    ]);
    await database.prepare("DELETE FROM customers WHERE NOT EXISTS (SELECT 1 FROM orders WHERE orders.customer_id = customers.id)").run();
  }
}

export async function runDailyMaintenance(database: D1Database) {
  await createDailyBackup(database);
  await purgeExpiredTrash(database);
}
