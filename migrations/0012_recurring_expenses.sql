-- Recurring operating expenses for Maison Jiya.
-- The schedule is separate from the accounting ledger.
-- Each generated occurrence becomes a normal expense so treasury and closings keep one source of truth.

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  account TEXT DEFAULT 'Banque' NOT NULL,
  day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  start_date TEXT NOT NULL,
  end_date TEXT,
  note TEXT DEFAULT '' NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS recurring_expenses_active_idx ON recurring_expenses (is_active, start_date);
CREATE INDEX IF NOT EXISTS recurring_expenses_label_idx ON recurring_expenses (label);

ALTER TABLE expenses ADD COLUMN recurring_expense_id INTEGER;
ALTER TABLE expenses ADD COLUMN recurring_period TEXT;

CREATE INDEX IF NOT EXISTS expenses_recurring_expense_id_idx ON expenses (recurring_expense_id);
CREATE UNIQUE INDEX IF NOT EXISTS expenses_recurring_occurrence_unique
  ON expenses (recurring_expense_id, recurring_period)
  WHERE recurring_expense_id IS NOT NULL AND recurring_period IS NOT NULL;
