import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

test("une facture fournisseur suit les paiements partiels et synchronise tout le bon", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const invoices = loadSource("db/supplier-invoices.ts");

  db.sqlite.exec(`
    INSERT INTO suppliers (id, name) VALUES (80, 'Atlas Factures');
    INSERT INTO purchases (
      id, supplier, supplier_id, purchase_ref, purchase_line_no, procurement_status,
      item, product_id, quantity, unit_cost, total_cost, account, payment_status, received_quantity
    ) VALUES
      (180, 'Atlas Factures', 80, 'BC-INV-001', 1, 'Commandé', 'Montre', 1, 3, 20, 60, 'Banque', 'À payer', 0),
      (181, 'Atlas Factures', 80, 'BC-INV-001', 2, 'Commandé', 'Boîte', NULL, 4, 10, 40, 'Banque', 'À payer', 0);
    INSERT INTO supplier_invoices (
      id, supplier_id, purchase_ref, invoice_number, invoice_date, due_date, total_amount
    ) VALUES (90, 80, 'BC-INV-001', 'FAC-2026-001', '2026-09-20', '2026-09-30', 100);
  `);

  let state = await invoices.getSupplierInvoicePaymentState(db, 90);
  assert.equal(state.totalAmount, 100);
  assert.equal(state.paidAmount, 0);
  assert.equal(state.remainingAmount, 100);
  assert.equal(state.paymentStatus, "À payer");

  db.sqlite.exec(`
    INSERT INTO supplier_payments (invoice_id, amount, account, paid_at, reference)
    VALUES (90, 40, 'Banque', '2026-09-27T12:00:00.000Z', 'VIR-40');
  `);
  state = await invoices.syncPurchaseOrderPaymentState(db, 90);
  assert.equal(state.paidAmount, 40);
  assert.equal(state.remainingAmount, 60);
  assert.equal(state.paymentStatus, "Partiellement payé");

  let lines = db.sqlite.prepare("SELECT payment_status, paid_at FROM purchases WHERE purchase_ref = 'BC-INV-001' ORDER BY id").all();
  assert.equal(lines.length, 2);
  assert.ok(lines.every((row) => row.payment_status === "Partiellement payé"));
  assert.ok(lines.every((row) => row.paid_at === "2026-09-27T12:00:00.000Z"));

  db.sqlite.exec(`
    INSERT INTO supplier_payments (invoice_id, amount, account, paid_at, reference)
    VALUES (90, 60, 'Caisse', '2026-09-28T12:00:00.000Z', 'ESP-60');
  `);
  state = await invoices.syncPurchaseOrderPaymentState(db, 90);
  assert.equal(state.paidAmount, 100);
  assert.equal(state.remainingAmount, 0);
  assert.equal(state.paymentStatus, "Payé");
  lines = db.sqlite.prepare("SELECT payment_status FROM purchases WHERE purchase_ref = 'BC-INV-001'").all();
  assert.ok(lines.every((row) => row.payment_status === "Payé"));
});

test("les échéances détectent uniquement les factures encore dues", () => {
  const invoices = loadSource("db/supplier-invoices.ts");
  const today = new Date("2026-09-27T12:00:00.000Z");
  assert.equal(invoices.supplierInvoiceIsOverdue("2026-09-26", 20, today), true);
  assert.equal(invoices.supplierInvoiceIsOverdue("2026-09-27", 20, today), false);
  assert.equal(invoices.supplierInvoiceIsOverdue("2026-09-20", 0, today), false);
});

test("la finance ne double compte pas un bon déjà géré par une facture", () => {
  const finance = loadSource("lib/finance.ts");
  const result = finance.calculateBusinessFinance({
    orders: [],
    purchases: [{ totalCost: 100, paymentStatus: "Partiellement payé", invoiceId: 90 }],
    supplierInvoices: [{ totalAmount: 100, paidAmount: 40, remainingAmount: 60 }],
    expenses: [],
    ads: [],
    capital: [],
    safetyReserve: 0,
  });

  assert.equal(result.paidPurchases, 40);
  assert.equal(result.unpaidPurchases, 60);
  assert.equal(result.cash, -40);
});

test("la trésorerie déduit chaque règlement réel et non le total de la facture", () => {
  const treasury = loadSource("lib/treasury.ts");
  const result = treasury.calculateTreasuryAccounts({
    orders: [],
    purchases: [{ totalCost: 100, paymentStatus: "Payé", account: "Banque", invoiceId: 90 }],
    supplierPayments: [
      { amount: 25, account: "Banque" },
      { amount: 15, account: "Caisse" },
    ],
    expenses: [],
    ads: [],
    capital: [],
  });

  assert.equal(result.bank, -25);
  assert.equal(result.cash, -15);
  assert.equal(result.total, -40);
});

test("API, sauvegardes, Google Sheets et interface couvrent le cycle fournisseur", async () => {
  const [route, schema, dashboard, backups, dataExport, dataImport, sheets, sync, closing] = await Promise.all([
    readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/backups.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/data-export.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/data-import.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/backup/google-sheets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/google-sheets-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/daily-closing.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /supplierInvoices/);
  assert.match(schema, /supplierPayments/);
  assert.match(route, /payload\.action === "addSupplierInvoice"/);
  assert.match(route, /payload\.action === "addSupplierPayment"/);
  assert.match(route, /payload\.action === "deleteSupplierPayment"/);
  assert.match(route, /Le reste à payer est de/);
  assert.match(route, /syncPurchaseOrderPaymentState/);
  assert.match(dashboard, /Factures fournisseurs/);
  assert.match(dashboard, /Facture ≠ paiement/);
  assert.match(dashboard, /Enregistrer un paiement/);
  assert.match(dashboard, /Partiellement payé/);
  assert.match(backups, /supplierInvoices/);
  assert.match(backups, /supplierPayments/);
  assert.match(dataExport, /factures_fournisseurs/);
  assert.match(dataExport, /paiements_fournisseurs/);
  assert.match(dataImport, /factures_fournisseurs/);
  assert.match(dataImport, /paiements_fournisseurs/);
  assert.match(sheets, /dataset === "supplier-invoices"/);
  assert.match(sheets, /dataset === "supplier-payments"/);
  assert.match(sync, /"supplier_invoices"/);
  assert.match(sync, /"supplier_payments"/);
  assert.match(closing, /supplierPayments/);
  assert.match(closing, /supplierInvoices/);
});
