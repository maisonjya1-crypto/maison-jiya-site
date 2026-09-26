-- Maison Jiya production D1 baseline.
-- Existing production is preserved: all baseline objects are idempotent.
-- Historical column repairs remain temporarily in db/schema-compat.ts.
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT DEFAULT 'viewer' NOT NULL,
    is_owner INTEGER DEFAULT 0 NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    is_active INTEGER DEFAULT 1 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT
  );

CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions (user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
    username TEXT PRIMARY KEY NOT NULL,
    attempt_count INTEGER DEFAULT 0 NOT NULL,
    window_started_at TEXT NOT NULL,
    blocked_until TEXT
  );

CREATE TABLE IF NOT EXISTS ai_usage (
    user_id INTEGER NOT NULL,
    usage_date TEXT NOT NULL,
    request_count INTEGER DEFAULT 0 NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, usage_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

CREATE TABLE IF NOT EXISTS mutation_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    request_key TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    status TEXT DEFAULT 'processing' NOT NULL,
    message TEXT DEFAULT '' NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at TEXT
  );

CREATE INDEX IF NOT EXISTS mutation_receipts_user_id_idx ON mutation_receipts (user_id);

CREATE INDEX IF NOT EXISTS mutation_receipts_created_at_idx ON mutation_receipts (created_at);

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique ON customers (phone);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    order_ref TEXT NOT NULL,
    customer_id INTEGER NOT NULL,
    product_id INTEGER,
    city TEXT NOT NULL,
    address TEXT DEFAULT '' NOT NULL,
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
    campaign TEXT DEFAULT '' NOT NULL,
    fulfillment_type TEXT DEFAULT 'Livraison' NOT NULL,
    status TEXT DEFAULT 'Nouvelle' NOT NULL,
    payment_status TEXT DEFAULT 'À encaisser' NOT NULL,
    carrier TEXT DEFAULT 'Non affecté' NOT NULL,
    tracking_number TEXT DEFAULT '' NOT NULL,
    carrier_dispatch_state TEXT DEFAULT 'À autoriser' NOT NULL,
    carrier_authorized_at TEXT,
    carrier_invoice_code TEXT DEFAULT '' NOT NULL,
    stock_deducted INTEGER DEFAULT 0 NOT NULL,
    paid_at TEXT,
    deleted_at TEXT,
    deleted_by_user_id INTEGER,
    items_json TEXT DEFAULT '[]' NOT NULL,
    pack_name TEXT DEFAULT '' NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_ref_unique ON orders (order_ref);

CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    supplier TEXT NOT NULL,
    item TEXT NOT NULL,
    product_id INTEGER,
    quantity INTEGER NOT NULL,
    unit_cost INTEGER NOT NULL,
    total_cost INTEGER NOT NULL,
    payment_status TEXT DEFAULT 'Payé' NOT NULL,
    received_quantity INTEGER DEFAULT 0 NOT NULL,
    received_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    category TEXT NOT NULL,
    label TEXT NOT NULL,
    amount INTEGER NOT NULL,
    account TEXT DEFAULT 'Banque' NOT NULL,
    payment_status TEXT DEFAULT 'Payé' NOT NULL,
    expense_date TEXT NOT NULL,
    note TEXT DEFAULT '' NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

CREATE INDEX IF NOT EXISTS expenses_expense_date_idx ON expenses (expense_date);

CREATE INDEX IF NOT EXISTS expenses_payment_status_idx ON expenses (payment_status);

CREATE TABLE IF NOT EXISTS ad_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    platform TEXT DEFAULT 'Meta Ads' NOT NULL,
    campaign TEXT NOT NULL,
    external_id TEXT DEFAULT '' NOT NULL,
    spend INTEGER NOT NULL,
    revenue INTEGER NOT NULL,
    order_count INTEGER NOT NULL,
    native_spend_cents INTEGER DEFAULT 0 NOT NULL,
    native_revenue_cents INTEGER DEFAULT 0 NOT NULL,
    native_currency TEXT DEFAULT 'MAD' NOT NULL,
    source TEXT DEFAULT 'Manuel' NOT NULL,
    performance_date TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

CREATE TABLE IF NOT EXISTS capital_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    direction TEXT NOT NULL,
    category TEXT NOT NULL,
    label TEXT NOT NULL,
    amount INTEGER NOT NULL,
    account TEXT DEFAULT 'Banque' NOT NULL,
    order_id INTEGER,
    is_automatic INTEGER DEFAULT 0 NOT NULL,
    auto_key TEXT UNIQUE,
    entry_date TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    product_code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    purchase_price INTEGER NOT NULL,
    sale_price INTEGER NOT NULL,
    minimum_sale_price INTEGER DEFAULT 0 NOT NULL,
    stock_quantity INTEGER DEFAULT 0 NOT NULL,
    archived_at TEXT,
    archived_by_user_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS products_product_code_unique ON products (product_code);

CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    product_id INTEGER NOT NULL,
    order_id INTEGER,
    purchase_id INTEGER,
    movement_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    note TEXT DEFAULT '' NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (purchase_id) REFERENCES purchases(id)
  );

CREATE INDEX IF NOT EXISTS stock_movements_product_id_idx ON stock_movements (product_id);

CREATE TABLE IF NOT EXISTS inventory_counts (
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
  );

CREATE INDEX IF NOT EXISTS inventory_counts_product_id_idx ON inventory_counts (product_id);

CREATE TRIGGER IF NOT EXISTS prevent_negative_product_stock
    BEFORE UPDATE OF stock_quantity ON products
    WHEN NEW.stock_quantity < 0
    BEGIN
      SELECT RAISE(ABORT, 'Stock insuffisant');
    END;

CREATE TABLE IF NOT EXISTS order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    order_id INTEGER NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by_user_id INTEGER,
    changed_by_name TEXT NOT NULL,
    changed_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

CREATE INDEX IF NOT EXISTS order_status_history_order_id_idx ON order_status_history (order_id);

CREATE TABLE IF NOT EXISTS carrier_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    provider TEXT NOT NULL,
    event_type TEXT NOT NULL,
    external_code TEXT NOT NULL,
    external_status TEXT NOT NULL,
    payload_hash TEXT NOT NULL UNIQUE,
    message TEXT DEFAULT '' NOT NULL,
    proof_image TEXT DEFAULT '' NOT NULL,
    occurred_at TEXT,
    order_id INTEGER,
    processed INTEGER DEFAULT 0 NOT NULL,
    error_message TEXT DEFAULT '' NOT NULL,
    received_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

CREATE INDEX IF NOT EXISTS carrier_events_external_code_idx ON carrier_events (external_code);

CREATE INDEX IF NOT EXISTS carrier_events_order_id_idx ON carrier_events (order_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    user_id INTEGER,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    entity_label TEXT DEFAULT '' NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at);

CREATE TABLE IF NOT EXISTS daily_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    backup_date TEXT NOT NULL UNIQUE,
    reason TEXT DEFAULT 'Automatique' NOT NULL,
    snapshot_json TEXT NOT NULL,
    record_count INTEGER DEFAULT 0 NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS users_single_owner_unique ON users (is_owner) WHERE is_owner = 1;
CREATE INDEX IF NOT EXISTS stock_movements_order_id_idx ON stock_movements (order_id);
CREATE INDEX IF NOT EXISTS stock_movements_purchase_id_idx ON stock_movements (purchase_id);
CREATE UNIQUE INDEX IF NOT EXISTS capital_ledger_auto_key_unique ON capital_ledger (auto_key);
CREATE INDEX IF NOT EXISTS purchases_product_id_idx ON purchases (product_id);
CREATE INDEX IF NOT EXISTS products_archived_at_idx ON products (archived_at);

CREATE TABLE IF NOT EXISTS google_sheets_sync_state (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  current_version INTEGER DEFAULT 0 NOT NULL,
  synced_version INTEGER DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  attempt_count INTEGER DEFAULT 0 NOT NULL,
  last_event_at TEXT,
  last_attempt_at TEXT,
  last_sync_at TEXT,
  next_attempt_at TEXT,
  last_error TEXT DEFAULT '' NOT NULL,
  active_event_id TEXT DEFAULT '' NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS google_sheets_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER DEFAULT 0 NOT NULL,
  http_status INTEGER,
  first_attempt_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  last_attempt_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  synced_at TEXT,
  next_attempt_at TEXT,
  last_error TEXT DEFAULT '' NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS google_sheets_sync_log_version_idx ON google_sheets_sync_log (version);
CREATE INDEX IF NOT EXISTS google_sheets_sync_log_status_idx ON google_sheets_sync_log (status, next_attempt_at);
INSERT INTO google_sheets_sync_state (id, current_version, synced_version, status, last_event_at, next_attempt_at, updated_at)
VALUES (1, 1, 0, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS push_vapid_config (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  public_key TEXT NOT NULL,
  private_jwk TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT DEFAULT '' NOT NULL,
  auth TEXT DEFAULT '' NOT NULL,
  expiration_time TEXT,
  user_agent TEXT DEFAULT '' NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS storefront_product_settings (
  product_id INTEGER PRIMARY KEY NOT NULL,
  public_name TEXT DEFAULT '' NOT NULL,
  public_price REAL DEFAULT 0 NOT NULL,
  is_visible INTEGER DEFAULT 1 NOT NULL,
  availability_mode TEXT DEFAULT 'auto' NOT NULL,
  badge TEXT DEFAULT '' NOT NULL,
  description TEXT DEFAULT '' NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS storefront_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '' NOT NULL,
  price REAL NOT NULL,
  compare_price REAL DEFAULT 0 NOT NULL,
  badge TEXT DEFAULT '' NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS storefront_offer_items (
  offer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1 NOT NULL,
  PRIMARY KEY (offer_id, product_id)
);
CREATE TABLE IF NOT EXISTS storefront_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id INTEGER DEFAULT 0 NOT NULL,
  kind TEXT DEFAULT 'gallery' NOT NULL,
  mime_type TEXT NOT NULL,
  data_base64 TEXT NOT NULL,
  byte_size INTEGER DEFAULT 0 NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS storefront_media_owner_idx ON storefront_media (owner_type, owner_id, sort_order, id);
CREATE INDEX IF NOT EXISTS storefront_offer_items_offer_idx ON storefront_offer_items (offer_id);

CREATE TRIGGER IF NOT EXISTS multi_order_stock_guard
BEFORE UPDATE OF stock_deducted ON orders
WHEN OLD.stock_deducted = 0
  AND NEW.stock_deducted = 1
  AND NEW.product_id IS NULL
  AND json_valid(NEW.items_json)
  AND json_array_length(NEW.items_json) > 0
  AND EXISTS (
    SELECT 1
    FROM products p
    JOIN json_each(NEW.items_json) item
      ON p.id = CAST(json_extract(item.value, '$.productId') AS INTEGER)
    WHERE p.stock_quantity < CAST(json_extract(item.value, '$.quantity') AS INTEGER)
  )
BEGIN
  SELECT RAISE(ABORT, 'stock insuffisant pour une commande multi-produits');
END;

CREATE TRIGGER IF NOT EXISTS multi_order_stock_deduct
AFTER UPDATE OF stock_deducted ON orders
WHEN OLD.stock_deducted = 0
  AND NEW.stock_deducted = 1
  AND NEW.product_id IS NULL
  AND json_valid(NEW.items_json)
  AND json_array_length(NEW.items_json) > 0
BEGIN
  UPDATE products
  SET stock_quantity = stock_quantity - COALESCE((
    SELECT SUM(CAST(json_extract(item.value, '$.quantity') AS INTEGER))
    FROM json_each(NEW.items_json) AS item
    WHERE CAST(json_extract(item.value, '$.productId') AS INTEGER) = products.id
  ), 0)
  WHERE id IN (
    SELECT CAST(json_extract(item.value, '$.productId') AS INTEGER)
    FROM json_each(NEW.items_json) AS item
  );

  INSERT INTO stock_movements (product_id, order_id, movement_type, quantity, note, created_at)
  SELECT CAST(json_extract(item.value, '$.productId') AS INTEGER), NEW.id, 'Commande',
         CAST(json_extract(item.value, '$.quantity') AS INTEGER),
         'Déduction automatique · ' || NEW.order_ref, CURRENT_TIMESTAMP
  FROM json_each(NEW.items_json) AS item;
END;

CREATE TRIGGER IF NOT EXISTS multi_order_stock_restore
AFTER UPDATE OF stock_deducted ON orders
WHEN OLD.stock_deducted = 1
  AND NEW.stock_deducted = 0
  AND NEW.product_id IS NULL
  AND json_valid(NEW.items_json)
  AND json_array_length(NEW.items_json) > 0
BEGIN
  UPDATE products
  SET stock_quantity = stock_quantity + COALESCE((
    SELECT SUM(CAST(json_extract(item.value, '$.quantity') AS INTEGER))
    FROM json_each(NEW.items_json) AS item
    WHERE CAST(json_extract(item.value, '$.productId') AS INTEGER) = products.id
  ), 0)
  WHERE id IN (
    SELECT CAST(json_extract(item.value, '$.productId') AS INTEGER)
    FROM json_each(NEW.items_json) AS item
  );

  INSERT INTO stock_movements (product_id, order_id, movement_type, quantity, note, created_at)
  SELECT CAST(json_extract(item.value, '$.productId') AS INTEGER), NEW.id, 'Réintégration',
         CAST(json_extract(item.value, '$.quantity') AS INTEGER),
         'Réintégration automatique · ' || NEW.order_ref, CURRENT_TIMESTAMP
  FROM json_each(NEW.items_json) AS item;
END;

CREATE TRIGGER IF NOT EXISTS multi_order_status_stock_sync
AFTER UPDATE OF status ON orders
WHEN NEW.product_id IS NULL
  AND json_valid(NEW.items_json)
  AND json_array_length(NEW.items_json) > 0
  AND NEW.stock_deducted <> CASE
    WHEN NEW.status IN ('Confirmée', 'Expédiée', 'En livraison', 'Livrée', 'Retour') THEN 1
    ELSE 0
  END
BEGIN
  UPDATE orders
  SET stock_deducted = CASE
    WHEN NEW.status IN ('Confirmée', 'Expédiée', 'En livraison', 'Livrée', 'Retour') THEN 1
    ELSE 0
  END,
  updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS d1_schema_baseline (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  baseline TEXT NOT NULL,
  established_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO d1_schema_baseline (id, baseline, established_at)
VALUES (1, 'production-baseline-after-drizzle-0020', CURRENT_TIMESTAMP)
ON CONFLICT(id) DO NOTHING;
