-- Supplier invoices and payment ledger linked to multi-line purchase orders.
-- One supplier invoice per purchase order reference; payments can be partial and multiple.

CREATE TABLE supplier_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  purchase_ref TEXT NOT NULL UNIQUE,
  invoice_number TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  total_amount REAL NOT NULL CHECK (total_amount >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE UNIQUE INDEX supplier_invoices_supplier_number_unique_idx
  ON supplier_invoices (supplier_id, invoice_number);
CREATE INDEX supplier_invoices_supplier_id_idx ON supplier_invoices (supplier_id);
CREATE INDEX supplier_invoices_due_date_idx ON supplier_invoices (due_date);

CREATE TABLE supplier_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  account TEXT NOT NULL DEFAULT 'Banque',
  paid_at TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX supplier_payments_invoice_id_idx ON supplier_payments (invoice_id);
CREATE INDEX supplier_payments_paid_at_idx ON supplier_payments (paid_at);
