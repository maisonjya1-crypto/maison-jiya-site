import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

test("le relevé fournisseur calcule débit, règlements et solde sans doublon", () => {
  const { buildSupplierStatement } = loadSource("lib/supplier-statement.ts");
  const statement = buildSupplierStatement(
    7,
    "Atlas",
    [
      { id: 1, supplierId: 7, supplier: "Atlas", purchaseRef: "BC-OLD-1", purchaseLineNo: 1, invoiceId: null, procurementStatus: "Reçu", totalCost: 50, paymentStatus: "À payer", paidAt: null, orderedAt: "2026-08-01", createdAt: "2026-08-01T10:00:00.000Z" },
      { id: 2, supplierId: 7, supplier: "Atlas", purchaseRef: "BC-OLD-2", purchaseLineNo: 1, invoiceId: null, procurementStatus: "Reçu", totalCost: 20, paymentStatus: "Payé", paidAt: "2026-08-20T10:00:00.000Z", orderedAt: "2026-08-10", createdAt: "2026-08-10T10:00:00.000Z" },
      { id: 3, supplierId: 7, supplier: "Atlas", purchaseRef: "BC-INV-1", purchaseLineNo: 1, invoiceId: 10, procurementStatus: "Reçu", totalCost: 100, paymentStatus: "Partiellement payé", paidAt: "2026-09-10T10:00:00.000Z", orderedAt: "2026-09-01", createdAt: "2026-09-01T10:00:00.000Z" },
      { id: 4, supplierId: 7, supplier: "Atlas", purchaseRef: "BC-DRAFT", purchaseLineNo: 1, invoiceId: null, procurementStatus: "Brouillon", totalCost: 999, paymentStatus: "À payer", paidAt: null, orderedAt: null, createdAt: "2026-09-15T10:00:00.000Z" },
      { id: 5, supplierId: 9, supplier: "Autre", purchaseRef: "BC-X", purchaseLineNo: 1, invoiceId: null, procurementStatus: "Reçu", totalCost: 500, paymentStatus: "À payer", paidAt: null, orderedAt: "2026-09-01", createdAt: "2026-09-01T10:00:00.000Z" },
    ],
    [
      { id: 10, supplierId: 7, purchaseRef: "BC-INV-1", invoiceNumber: "FAC-100", invoiceDate: "2026-09-05", dueDate: "2026-09-25", totalAmount: 100, remainingAmount: 60, isOverdue: true },
    ],
    [
      { id: 20, invoiceId: 10, amount: 40, account: "Banque", paidAt: "2026-09-10T10:00:00.000Z", reference: "VIR-40", note: "" },
    ],
  );

  assert.equal(statement.totalBilled, 170);
  assert.equal(statement.totalPaid, 60);
  assert.equal(statement.balance, 110);
  assert.equal(statement.overdueAmount, 60);
  assert.equal(statement.openInvoiceCount, 1);
  assert.equal(statement.invoiceCount, 1);
  assert.equal(statement.paymentCount, 1);
  assert.equal(statement.orderCount, 3);
  assert.deepEqual(statement.entries.map((entry) => entry.balance), [50, 70, 50, 150, 110]);
  assert.ok(statement.entries.every((entry) => !entry.reference.includes("BC-DRAFT")));
});

test("le relevé reconnaît les anciens achats sans supplier_id par nom", () => {
  const { buildSupplierStatement } = loadSource("lib/supplier-statement.ts");
  const statement = buildSupplierStatement(
    7,
    "Atlas Distribution",
    [
      { id: 30, supplierId: null, supplier: "atlas distribution", purchaseRef: "BC-LEGACY", purchaseLineNo: 1, invoiceId: null, procurementStatus: "Reçu", totalCost: 35, paymentStatus: "À payer", paidAt: null, orderedAt: "2026-07-01", createdAt: "2026-07-01T10:00:00.000Z" },
    ],
    [],
    [],
  );
  assert.equal(statement.totalBilled, 35);
  assert.equal(statement.balance, 35);
  assert.equal(statement.orderCount, 1);
});

test("l’interface fournisseurs expose le relevé, les échéances et l’export CSV", async () => {
  const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(dashboard, /buildSupplierStatement/);
  assert.match(dashboard, /SupplierStatementModal/);
  assert.match(dashboard, />Relevé</);
  assert.match(dashboard, /Exporter CSV/);
  assert.match(dashboard, /Grand livre/);
  assert.match(dashboard, /Factures ouvertes/);
  assert.match(dashboard, /Débit = dette créée · crédit = règlement/);
  assert.match(dashboard, /supplierPayments={data\.supplierPayments}/);
  assert.match(dashboard, /due: legacyDue \+ invoiceDue/);
  assert.match(dashboard, /!\["Brouillon", "Annulé"\]\.includes\(purchase\.procurementStatus\)/);
  assert.match(styles, /supplier-statement-kpis/);
  assert.match(styles, /supplier-statement-table/);
});
