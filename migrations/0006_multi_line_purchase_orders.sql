-- Multi-line supplier purchase orders.
-- Existing purchases stay valid as one-line purchase orders.

DROP INDEX IF EXISTS purchases_purchase_ref_unique_idx;

ALTER TABLE purchases ADD COLUMN purchase_line_no INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS purchases_purchase_ref_idx ON purchases (purchase_ref);
CREATE UNIQUE INDEX IF NOT EXISTS purchases_purchase_ref_line_unique_idx
  ON purchases (purchase_ref, purchase_line_no)
  WHERE purchase_ref IS NOT NULL;
