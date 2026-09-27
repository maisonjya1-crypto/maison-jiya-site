import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

test("un encaissement transporteur ne devient encaissé que pour une commande livrée", () => {
  const payment = loadSource("lib/order-payment-lifecycle.ts");

  assert.deepEqual(payment.normalizeOrderPaymentState({
    status: "Livrée",
    requestedPaymentStatus: "À encaisser",
    previousPaymentStatus: "À encaisser",
    paidAt: null,
    refundedAt: null,
    carrierPaid: true,
    now: "2026-09-27T12:00:00.000Z",
  }), {
    paymentStatus: "Encaissé",
    paidAt: "2026-09-27T12:00:00.000Z",
    refundedAt: null,
  });

  assert.deepEqual(payment.normalizeOrderPaymentState({
    status: "Retour",
    requestedPaymentStatus: "À encaisser",
    previousPaymentStatus: "À encaisser",
    paidAt: null,
    refundedAt: null,
    carrierPaid: true,
    now: "2026-09-27T12:00:00.000Z",
  }), {
    paymentStatus: "Non encaissé",
    paidAt: null,
    refundedAt: null,
  });
});

test("un retour ou une annulation rembourse automatiquement une vente déjà encaissée", () => {
  const payment = loadSource("lib/order-payment-lifecycle.ts");
  const paidAt = "2026-09-25T10:00:00.000Z";
  const now = "2026-09-27T12:00:00.000Z";

  for (const status of ["Retour", "Annulée"]) {
    assert.deepEqual(payment.normalizeOrderPaymentState({
      status,
      requestedPaymentStatus: "Encaissé",
      previousPaymentStatus: "Encaissé",
      paidAt,
      refundedAt: null,
      now,
    }), {
      paymentStatus: "Remboursé",
      paidAt,
      refundedAt: now,
    });
  }
});

test("la synchronisation Sendit reprend une facture partiellement traitée sans doubler les écritures", async () => {
  const carriers = await readFile(new URL("../db/carriers.ts", import.meta.url), "utf8");

  assert.doesNotMatch(carriers, /alreadyProcessed/);
  assert.doesNotMatch(carriers, /SELECT id FROM orders WHERE carrier_invoice_code = \? LIMIT 1/);
  assert.match(carriers, /carrier_invoice_code AS carrierInvoiceCode/);
  assert.match(carriers, /invoiceCode === current\.carrierInvoiceCode/);
  assert.match(carriers, /slice\(0, 20\)/);
});

test("webhook et synchronisation transporteur partagent la même règle de remboursement", async () => {
  const carriers = await readFile(new URL("../db/carriers.ts", import.meta.url), "utf8");

  const uses = carriers.match(/normalizeOrderPaymentState\(\{/g) || [];
  assert.ok(uses.length >= 2);
  assert.match(carriers, /refunded_at = \?/);
  assert.match(carriers, /Remboursement transporteur/);
  assert.match(carriers, /paymentState\.paymentStatus === order\.paymentStatus/);
  assert.match(carriers, /await reconcileOrderAllocations\(order\.id\)/);
  assert.match(carriers, /if \(result\.updated > 0\) await reconcileOrderAllocations\(\)/);
});

test("la modification manuelle d’une commande applique la même règle et expose l’historique", async () => {
  const [route, dashboard] = await Promise.all([
    readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /normalizeOrderPaymentState\(\{/);
  assert.match(route, /refunded_at = \?/);
  assert.match(dashboard, /Encaissement protégé automatiquement/);
  assert.match(dashboard, /Remboursé le/);
});

test("la migration de remboursement ne détruit aucune donnée existante", async () => {
  const migration = await readFile(new URL("../migrations/0002_order_refund_tracking.sql", import.meta.url), "utf8");

  assert.match(migration, /ALTER TABLE orders ADD COLUMN refunded_at TEXT/);
  assert.match(migration, /payment_status = 'Remboursé'/);
  assert.doesNotMatch(migration, /DELETE FROM|DROP TABLE|DROP COLUMN/i);
});
