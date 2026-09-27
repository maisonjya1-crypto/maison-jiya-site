-- Daily treasury reconciliation for Maison Jiya.
-- This table records immutable business snapshots plus the physical balances entered by a user.
-- No existing business row is changed.

CREATE TABLE IF NOT EXISTS daily_closings (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  close_date TEXT NOT NULL UNIQUE,
  expected_bank REAL DEFAULT 0 NOT NULL,
  actual_bank REAL DEFAULT 0 NOT NULL,
  bank_variance REAL DEFAULT 0 NOT NULL,
  expected_cash REAL DEFAULT 0 NOT NULL,
  actual_cash REAL DEFAULT 0 NOT NULL,
  cash_variance REAL DEFAULT 0 NOT NULL,
  expected_other REAL DEFAULT 0 NOT NULL,
  actual_other REAL DEFAULT 0 NOT NULL,
  other_variance REAL DEFAULT 0 NOT NULL,
  expected_total REAL DEFAULT 0 NOT NULL,
  actual_total REAL DEFAULT 0 NOT NULL,
  total_variance REAL DEFAULT 0 NOT NULL,
  carrier_money REAL DEFAULT 0 NOT NULL,
  receivables REAL DEFAULT 0 NOT NULL,
  unpaid_purchases REAL DEFAULT 0 NOT NULL,
  unpaid_expenses REAL DEFAULT 0 NOT NULL,
  collected_orders INTEGER DEFAULT 0 NOT NULL,
  collected_amount REAL DEFAULT 0 NOT NULL,
  refunded_orders INTEGER DEFAULT 0 NOT NULL,
  refunded_amount REAL DEFAULT 0 NOT NULL,
  paid_purchases_count INTEGER DEFAULT 0 NOT NULL,
  paid_purchases_amount REAL DEFAULT 0 NOT NULL,
  paid_expenses_count INTEGER DEFAULT 0 NOT NULL,
  paid_expenses_amount REAL DEFAULT 0 NOT NULL,
  ad_spend REAL DEFAULT 0 NOT NULL,
  note TEXT DEFAULT '' NOT NULL,
  closed_by_user_id INTEGER,
  closed_by_name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS daily_closings_date_idx ON daily_closings (close_date);
