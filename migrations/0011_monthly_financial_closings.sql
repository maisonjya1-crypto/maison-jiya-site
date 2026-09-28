-- Immutable monthly financial closing snapshots for Maison Jiya.
-- A month can be closed only once after it has ended.
-- No existing business row is changed.

CREATE TABLE IF NOT EXISTS monthly_closings (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  month_key TEXT NOT NULL UNIQUE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  delivered_orders INTEGER DEFAULT 0 NOT NULL,
  delivered_revenue REAL DEFAULT 0 NOT NULL,
  collected_amount REAL DEFAULT 0 NOT NULL,
  product_cost REAL DEFAULT 0 NOT NULL,
  shipping_cost REAL DEFAULT 0 NOT NULL,
  fees REAL DEFAULT 0 NOT NULL,
  return_cost REAL DEFAULT 0 NOT NULL,
  ad_spend REAL DEFAULT 0 NOT NULL,
  operating_expenses REAL DEFAULT 0 NOT NULL,
  inventory_loss REAL DEFAULT 0 NOT NULL,
  carrier_adjustment REAL DEFAULT 0 NOT NULL,
  contribution_margin REAL DEFAULT 0 NOT NULL,
  net_profit REAL DEFAULT 0 NOT NULL,
  reinvestment_allocated REAL DEFAULT 0 NOT NULL,
  manual_capital_in REAL DEFAULT 0 NOT NULL,
  manual_capital_out REAL DEFAULT 0 NOT NULL,
  stock_value_start REAL,
  stock_value_end REAL DEFAULT 0 NOT NULL,
  stock_value_source TEXT DEFAULT '' NOT NULL,
  cash_end REAL DEFAULT 0 NOT NULL,
  cash_end_source TEXT DEFAULT '' NOT NULL,
  note TEXT DEFAULT '' NOT NULL,
  closed_by_user_id INTEGER,
  closed_by_name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS monthly_closings_month_idx ON monthly_closings (month_key);
CREATE INDEX IF NOT EXISTS monthly_closings_created_at_idx ON monthly_closings (created_at);
