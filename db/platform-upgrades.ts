export type PlatformUpgradeResult = {
  identityRestored: boolean;
};

async function orderColumns(database: D1Database) {
  const result = await database.prepare("PRAGMA table_info(orders)").all<{ name: string }>();
  return new Set(result.results.map((column) => column.name));
}

async function ensureMultiProductColumns(database: D1Database) {
  const columns = await orderColumns(database);
  if (!columns.has("items_json")) {
    await database.prepare("ALTER TABLE orders ADD COLUMN items_json TEXT DEFAULT '[]' NOT NULL").run();
  }
  if (!columns.has("pack_name")) {
    await database.prepare("ALTER TABLE orders ADD COLUMN pack_name TEXT DEFAULT '' NOT NULL").run();
  }
}

async function ensureMultiProductStockTriggers(database: D1Database) {
  await database.prepare(`
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
    END
  `).run();

  await database.prepare(`
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
      SELECT
        CAST(json_extract(item.value, '$.productId') AS INTEGER),
        NEW.id,
        'Commande',
        CAST(json_extract(item.value, '$.quantity') AS INTEGER),
        'Déduction automatique · ' || NEW.order_ref,
        CURRENT_TIMESTAMP
      FROM json_each(NEW.items_json) AS item;
    END
  `).run();

  await database.prepare(`
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
      SELECT
        CAST(json_extract(item.value, '$.productId') AS INTEGER),
        NEW.id,
        'Réintégration',
        CAST(json_extract(item.value, '$.quantity') AS INTEGER),
        'Réintégration automatique · ' || NEW.order_ref,
        CURRENT_TIMESTAMP
      FROM json_each(NEW.items_json) AS item;
    END
  `).run();

  await database.prepare(`
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
    END
  `).run();
}

async function ensureSettings(database: D1Database) {
  await database.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('whatsapp_numbers', '[]', CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO NOTHING
  `).run();

  const marker = await database.prepare("SELECT value FROM settings WHERE key = 'account_identity_restored_v1' LIMIT 1").first<{ value: string }>();
  if (marker?.value === "true") return false;

  await database.batch([
    database.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('account_name', 'Maison Jiya', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `),
    database.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('account_email', 'maisonjya1@gmail.com', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `),
    database.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('account_identity_restored_v1', 'true', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `),
  ]);
  return true;
}

export async function ensurePlatformUpgrades(database: D1Database): Promise<PlatformUpgradeResult> {
  await ensureMultiProductColumns(database);
  await ensureMultiProductStockTriggers(database);
  const identityRestored = await ensureSettings(database);
  return { identityRestored };
}
