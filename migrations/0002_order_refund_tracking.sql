-- Preserve the payment lifecycle when a previously collected order is returned or cancelled.
-- No business row is deleted or recalculated.

ALTER TABLE orders ADD COLUMN refunded_at TEXT;

UPDATE orders
SET refunded_at = COALESCE(updated_at, paid_at, created_at)
WHERE payment_status = 'Remboursé'
  AND refunded_at IS NULL;
