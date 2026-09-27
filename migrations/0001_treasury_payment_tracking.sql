-- Track the physical account and actual payment moment for supplier purchases and expenses.
-- Existing rows are preserved and backfilled conservatively.

ALTER TABLE purchases ADD COLUMN account TEXT NOT NULL DEFAULT 'Banque';
ALTER TABLE purchases ADD COLUMN paid_at TEXT;
ALTER TABLE expenses ADD COLUMN paid_at TEXT;

UPDATE purchases
SET paid_at = created_at
WHERE payment_status = 'Payé'
  AND paid_at IS NULL;

UPDATE expenses
SET paid_at = expense_date || 'T12:00:00.000Z'
WHERE payment_status = 'Payé'
  AND paid_at IS NULL;
