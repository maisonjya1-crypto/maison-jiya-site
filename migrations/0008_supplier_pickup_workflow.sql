-- Supplier purchase acquisition mode.
-- Maison Jiya mainly collects purchases directly from suppliers.

ALTER TABLE purchases
  ADD COLUMN purchase_mode TEXT NOT NULL DEFAULT 'Retrait fournisseur';

CREATE INDEX IF NOT EXISTS purchases_purchase_mode_idx
  ON purchases (purchase_mode);
