-- Physical-stock confidence without altering existing stock quantities.
ALTER TABLE products ADD COLUMN stock_verification_status TEXT NOT NULL DEFAULT 'À vérifier';
ALTER TABLE products ADD COLUMN last_inventory_at TEXT;

-- Preserve the last known physical verification when historical counts exist.
UPDATE products
SET
  stock_verification_status = CASE
    WHEN (
      SELECT physical_quantity
      FROM inventory_counts
      WHERE inventory_counts.product_id = products.id
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) = 0 THEN 'Rupture confirmée'
    ELSE 'Compté'
  END,
  last_inventory_at = (
    SELECT created_at
    FROM inventory_counts
    WHERE inventory_counts.product_id = products.id
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  )
WHERE EXISTS (
  SELECT 1 FROM inventory_counts WHERE inventory_counts.product_id = products.id
);
