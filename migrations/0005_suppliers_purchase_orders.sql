-- Supplier directory and purchase-order lifecycle.
-- Existing purchase rows are preserved and linked to supplier profiles by name.

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  lead_time_days INTEGER NOT NULL DEFAULT 7,
  minimum_order_amount REAL NOT NULL DEFAULT 0,
  payment_terms TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_unique_idx ON suppliers (lower(name));
CREATE INDEX IF NOT EXISTS suppliers_active_idx ON suppliers (is_active);

ALTER TABLE purchases ADD COLUMN supplier_id INTEGER;
ALTER TABLE purchases ADD COLUMN purchase_ref TEXT;
ALTER TABLE purchases ADD COLUMN procurement_status TEXT NOT NULL DEFAULT 'Commandé';
ALTER TABLE purchases ADD COLUMN ordered_at TEXT;
ALTER TABLE purchases ADD COLUMN expected_at TEXT;

INSERT OR IGNORE INTO suppliers (name, created_at)
SELECT DISTINCT trim(supplier), MIN(created_at)
FROM purchases
WHERE trim(supplier) <> ''
GROUP BY lower(trim(supplier));

UPDATE purchases
SET supplier_id = (
      SELECT suppliers.id
      FROM suppliers
      WHERE lower(suppliers.name) = lower(trim(purchases.supplier))
      LIMIT 1
    ),
    purchase_ref = COALESCE(purchase_ref, 'BC-' || printf('%06d', id)),
    procurement_status = CASE
      WHEN received_quantity >= quantity AND quantity > 0 THEN 'Reçu'
      WHEN received_quantity > 0 THEN 'Partiellement reçu'
      ELSE 'Commandé'
    END,
    ordered_at = COALESCE(ordered_at, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS purchases_purchase_ref_unique_idx ON purchases (purchase_ref);
CREATE INDEX IF NOT EXISTS purchases_supplier_id_idx ON purchases (supplier_id);
CREATE INDEX IF NOT EXISTS purchases_procurement_status_idx ON purchases (procurement_status);
