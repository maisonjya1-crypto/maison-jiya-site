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
    city TEXT NOT NULL,
    products TEXT NOT NULL,
    quantity INTEGER DEFAULT 1 NOT NULL,
    sale_amount INTEGER NOT NULL,
    product_cost INTEGER DEFAULT 0 NOT NULL,
    shipping_cost INTEGER DEFAULT 0 NOT NULL,
    ad_cost INTEGER DEFAULT 0 NOT NULL,
    fees INTEGER DEFAULT 0 NOT NULL,
    return_cost INTEGER DEFAULT 0 NOT NULL,
    source TEXT DEFAULT 'Non renseignée' NOT NULL,
    status TEXT DEFAULT 'Nouvelle' NOT NULL,
    payment_status TEXT DEFAULT 'À encaisser' NOT NULL,
    carrier TEXT DEFAULT 'Non affecté' NOT NULL,
    tracking_number TEXT DEFAULT '' NOT NULL,
    paid_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
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
    movement_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    note TEXT DEFAULT '' NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`,
  `CREATE INDEX IF NOT EXISTS stock_movements_product_id_idx ON stock_movements (product_id)`,
];

export async function getDb() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure the `DB` binding in wrangler.jsonc before using the database."
    );
  }

  if (!databaseReady) {
    databaseReady = env.DB.batch(
      schemaStatements.map((statement) => env.DB.prepare(statement)),
    ).then(() => undefined);
  }

  try {
    await databaseReady;
  } catch (error) {
    databaseReady = null;
    throw error;
  }

  return drizzle(env.DB, { schema });
}
