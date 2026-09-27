-- Advanced physical inventory sessions.
-- Keeps legacy one-product counts compatible while adding full inventory sessions and valuation.

CREATE TABLE inventory_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_ref TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'En cours',
  note TEXT NOT NULL DEFAULT '',
  expected_product_count INTEGER NOT NULL DEFAULT 0,
  counted_product_count INTEGER NOT NULL DEFAULT 0,
  total_system_units INTEGER NOT NULL DEFAULT 0,
  total_physical_units INTEGER NOT NULL DEFAULT 0,
  total_adjustment_units INTEGER NOT NULL DEFAULT 0,
  value_before REAL NOT NULL DEFAULT 0,
  value_after REAL NOT NULL DEFAULT 0,
  loss_value REAL NOT NULL DEFAULT 0,
  started_by_user_id INTEGER,
  started_by_name TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX inventory_sessions_status_idx ON inventory_sessions(status);
CREATE INDEX inventory_sessions_started_at_idx ON inventory_sessions(started_at);

ALTER TABLE inventory_counts ADD COLUMN session_id INTEGER REFERENCES inventory_sessions(id);
ALTER TABLE inventory_counts ADD COLUMN reason TEXT NOT NULL DEFAULT 'Aucun écart';
ALTER TABLE inventory_counts ADD COLUMN unit_cost REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_counts ADD COLUMN value_before REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_counts ADD COLUMN value_after REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_counts ADD COLUMN loss_value REAL NOT NULL DEFAULT 0;

CREATE INDEX inventory_counts_session_id_idx ON inventory_counts(session_id);
