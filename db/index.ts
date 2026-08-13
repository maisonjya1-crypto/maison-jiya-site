import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let databaseReady: Promise<void> | null = null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT DEFAULT 'viewer' NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    is_active INTEGER DEFAULT 1 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    username TEXT PRIMARY KEY NOT NULL,
    attempt_count INTEGER DEFAULT 0 NOT NULL,
    window_started_at TEXT NOT NULL,
    blocked_until TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ai_usage (
    user_id INTEGER NOT NULL,
    usage_date TEXT NOT NULL,
    request_count INTEGER DEFAULT 0 NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, usage_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique ON customers (phone)`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    order_ref TEXT NOT NULL,
    customer_id INTEGER NOT NULL,
    product_id INTEGER,
    city TEXT NOT NULL,
    products TEXT NOT NULL,
    quantity INTEGER DEFAULT 1 NOT NULL,
    sale_amount INTEGER NOT NULL,
    product_cost INTEGER DEFAULT 0 NOT NULL,
    shipping_cost INTEGER DEFAULT 0 NOT NULL,
    ad_cost INTEGER DEFAULT 0 NOT NULL,
    fees INTEGER DEFAULT 0 NOT NULL,
    return_cost INTEGER DEFAULT 0 NOT NULL,
    return_reason TEXT DEFAULT '' NOT NULL,
    return_note TEXT DEFAULT '' NOT NULL,
    source TEXT DEFAULT 'Non renseignée' NOT NULL,
    status TEXT DEFAULT 'Nouvelle' NOT NULL,
    payment_status TEXT DEFAULT 'À encaisser' NOT NULL,
    carrier TEXT DEFAULT 'Non affecté' NOT NULL,
    tracking_number TEXT DEFAULT '' NOT NULL,
    stock_deducted INTEGER DEFAULT 0 NOT NULL,
    paid_at TEXT,
    deleted_at TEXT,
    deleted_by_user_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS orders_order_ref_unique ON orders (order_ref)`,
  `CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    supplier TEXT NOT NULL,
    item TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost INTEGER NOT NULL,
    total_cost INTEGER NOT NULL,
    payment_status TEXT DEFAULT 'Payé' NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ad_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    platform TEXT DEFAULT 'Meta Ads' NOT NULL,
    campaign TEXT NOT NULL,
    spend INTEGER NOT NULL,
    revenue INTEGER NOT NULL,
    order_count INTEGER NOT NULL,
    source TEXT DEFAULT 'Manuel' NOT NULL,
    performance_date TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS capital_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    direction TEXT NOT NULL,
    category TEXT NOT NULL,
    label TEXT NOT NULL,
    amount INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    product_code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    purchase_price INTEGER NOT NULL,
    sale_price INTEGER NOT NULL,
    stock_quantity INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS products_product_code_unique ON products (product_code)`,
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    product_id INTEGER NOT NULL,
    order_id INTEGER,
    movement_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    note TEXT DEFAULT '' NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )`,
  `CREATE INDEX IF NOT EXISTS stock_movements_product_id_idx ON stock_movements (product_id)`,
  `CREATE TABLE IF NOT EXISTS inventory_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    count_ref TEXT NOT NULL UNIQUE,
    product_id INTEGER NOT NULL,
    system_quantity INTEGER NOT NULL,
    physical_quantity INTEGER NOT NULL,
    difference INTEGER NOT NULL,
    note TEXT DEFAULT '' NOT NULL,
    counted_by_user_id INTEGER,
    counted_by_name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`,
  `CREATE INDEX IF NOT EXISTS inventory_counts_product_id_idx ON inventory_counts (product_id)`,
  `CREATE TRIGGER IF NOT EXISTS prevent_negative_product_stock
    BEFORE UPDATE OF stock_quantity ON products
    WHEN NEW.stock_quantity < 0
    BEGIN
      SELECT RAISE(ABORT, 'Stock insuffisant');
    END`,
  `CREATE TABLE IF NOT EXISTS order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    order_id INTEGER NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by_user_id INTEGER,
    changed_by_name TEXT NOT NULL,
    changed_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS order_status_history_order_id_idx ON order_status_history (order_id)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    user_id INTEGER,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    entity_label TEXT DEFAULT '' NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at)`,
  `CREATE TABLE IF NOT EXISTS daily_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    backup_date TEXT NOT NULL UNIQUE,
    reason TEXT DEFAULT 'Automatique' NOT NULL,
    snapshot_json TEXT NOT NULL,
    record_count INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
];

async function ensureOrderColumns(database: D1Database) {
  const info = await database.prepare("PRAGMA table_info(orders)").all<{ name: string }>();
  const columns = new Set(info.results.map((column) => column.name));
  const statements: D1PreparedStatement[] = [];
  if (!columns.has("deleted_at")) statements.push(database.prepare("ALTER TABLE orders ADD COLUMN deleted_at TEXT"));
  if (!columns.has("deleted_by_user_id")) statements.push(database.prepare("ALTER TABLE orders ADD COLUMN deleted_by_user_id INTEGER"));
  if (!columns.has("product_id")) statements.push(database.prepare("ALTER TABLE orders ADD COLUMN product_id INTEGER REFERENCES products(id)"));
  if (!columns.has("stock_deducted")) statements.push(database.prepare("ALTER TABLE orders ADD COLUMN stock_deducted INTEGER DEFAULT 0 NOT NULL"));
  if (!columns.has("return_reason")) statements.push(database.prepare("ALTER TABLE orders ADD COLUMN return_reason TEXT DEFAULT '' NOT NULL"));
  if (!columns.has("return_note")) statements.push(database.prepare("ALTER TABLE orders ADD COLUMN return_note TEXT DEFAULT '' NOT NULL"));
  if (statements.length) await database.batch(statements);
}

async function ensureStockMovementColumns(database: D1Database) {
  const info = await database.prepare("PRAGMA table_info(stock_movements)").all<{ name: string }>();
  const columns = new Set(info.results.map((column) => column.name));
  if (!columns.has("order_id")) {
    await database.prepare("ALTER TABLE stock_movements ADD COLUMN order_id INTEGER REFERENCES orders(id)").run();
  }
  await database.prepare("CREATE INDEX IF NOT EXISTS stock_movements_order_id_idx ON stock_movements (order_id)").run();
}

async function initializeDatabase(database: D1Database) {
  await database.batch(schemaStatements.map((statement) => database.prepare(statement)));
  await ensureOrderColumns(database);
  await ensureStockMovementColumns(database);
  await database.prepare(`
    INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_name, changed_at)
    SELECT orders.id, NULL, orders.status, 'État initial', COALESCE(orders.updated_at, orders.created_at)
    FROM orders
    WHERE NOT EXISTS (
      SELECT 1 FROM order_status_history WHERE order_status_history.order_id = orders.id
    )
  `).run();
}

export async function getRawDb() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure the `DB` binding in wrangler.jsonc before using the database."
    );
  }

  if (!databaseReady) databaseReady = initializeDatabase(env.DB);

  try {
    await databaseReady;
  } catch (error) {
    databaseReady = null;
    throw error;
  }

  return env.DB;
}

export async function getDb() {
  return drizzle(await getRawDb(), { schema });
}
