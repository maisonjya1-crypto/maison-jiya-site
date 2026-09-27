-- Carrier settlement reconciliation.
-- Records real carrier transfers and the delivered orders included in each transfer.

CREATE TABLE carrier_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carrier TEXT NOT NULL,
  reference TEXT NOT NULL,
  settlement_date TEXT NOT NULL,
  expected_amount REAL NOT NULL DEFAULT 0,
  actual_amount REAL NOT NULL DEFAULT 0,
  difference_amount REAL NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Rapproché',
  note TEXT NOT NULL DEFAULT '',
  created_by_user_id INTEGER,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(carrier, reference)
);

CREATE INDEX carrier_settlements_date_idx
  ON carrier_settlements(settlement_date);

CREATE INDEX carrier_settlements_status_idx
  ON carrier_settlements(status);

CREATE TABLE carrier_settlement_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id INTEGER NOT NULL REFERENCES carrier_settlements(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  expected_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id)
);

CREATE INDEX carrier_settlement_orders_settlement_id_idx
  ON carrier_settlement_orders(settlement_id);
