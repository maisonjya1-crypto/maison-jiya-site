import assert from "node:assert/strict";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

test("la clôture calcule les comptes, obligations et flux du jour sans modifier les données métier", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const closing = loadSource("db/daily-closing.ts");

  db.sqlite.exec(`
    DELETE FROM ad_performance;
    UPDATE orders
    SET status = 'Livrée',
        payment_status = 'Encaissé',
        fulfillment_type = 'Livraison',
        sale_amount = 500,
        shipping_cost = 40,
        fees = 10,
        return_cost = 0,
        paid_at = '2026-09-27T10:00:00.000Z'
    WHERE id = 1;

    INSERT INTO orders (
      id, order_ref, customer_id, product_id, city, address, products, quantity,
      sale_amount, product_cost, shipping_cost, fees, return_cost,
      fulfillment_type, status, payment_status, carrier
    ) VALUES
      (2, 'CARRIER-WAIT', 1, 1, 'Casablanca', 'Adresse', 'Produit test', 1, 200, 10, 20, 5, 0, 'Livraison', 'Livrée', 'À encaisser', 'Sendit'),
      (3, 'RECEIVABLE', 1, 1, 'Casablanca', 'Adresse', 'Produit test', 1, 300, 10, 25, 5, 0, 'Livraison', 'Expédiée', 'À encaisser', 'Sendit'),
      (4, 'REFUNDED', 1, 1, 'Casablanca', 'Adresse', 'Produit test', 1, 150, 10, 20, 5, 10, 'Livraison', 'Retour', 'Remboursé', 'Sendit');

    UPDATE orders
    SET paid_at = '2026-09-27T08:00:00.000Z',
        refunded_at = '2026-09-27T11:00:00.000Z'
    WHERE id = 4;

    INSERT INTO purchases (id, supplier, item, product_id, quantity, unit_cost, total_cost, account, payment_status, paid_at)
    VALUES
      (20, 'Four A', 'Lot payé', 1, 1, 100, 100, 'Caisse', 'Payé', '2026-09-27T09:00:00.000Z'),
      (21, 'Four B', 'Lot dû', 1, 1, 90, 90, 'Banque', 'À payer', NULL);

    INSERT INTO expenses (id, category, label, amount, account, payment_status, paid_at, expense_date)
    VALUES
      (20, 'Divers', 'Charge payée', 20, 'Banque', 'Payé', '2026-09-27T09:30:00.000Z', '2026-09-27'),
      (21, 'Divers', 'Charge due', 30, 'Banque', 'À payer', NULL, '2026-09-27');

    INSERT INTO ad_performance (id, campaign, spend, revenue, order_count, source, performance_date)
    VALUES (20, 'Campagne jour', 60, 0, 0, 'Manuel', '2026-09-27');

    INSERT INTO capital_ledger (id, direction, category, label, amount, account, is_automatic, entry_date)
    VALUES
      (20, 'Entrée', 'Apport', 'Apport banque', 50, 'Banque', 0, '2026-09-27'),
      (21, 'Entrée', 'Apport', 'Fond caisse', 200, 'Caisse', 0, '2026-09-27');
  `);

  const beforeOrders = db.sqlite.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
  const preview = await closing.buildDailyClosingPreview(db, "2026-09-27");

  assert.deepEqual(preview, {
    closeDate: "2026-09-27",
    expectedBank: 410,
    expectedCash: 100,
    expectedOther: 0,
    expectedTotal: 510,
    carrierMoney: 175,
    receivables: 270,
    unpaidPurchases: 90,
    unpaidExpenses: 30,
    collectedOrders: 2,
    collectedAmount: 575,
    refundedOrders: 1,
    refundedAmount: 125,
    paidPurchasesCount: 1,
    paidPurchasesAmount: 100,
    paidExpensesCount: 1,
    paidExpensesAmount: 20,
    adSpend: 60,
  });
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM orders").get().n, beforeOrders);
});

test("une clôture est unique par jour et une correction met à jour l’écart sans créer de doublon", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const closing = loadSource("db/daily-closing.ts");

  db.sqlite.exec(`
    DELETE FROM ad_performance;
    UPDATE orders SET payment_status = 'Non encaissé', paid_at = NULL WHERE id = 1;
    INSERT INTO capital_ledger (direction, category, label, amount, account, is_automatic, entry_date)
    VALUES
      ('Entrée', 'Apport', 'Banque initiale', 1000, 'Banque', 0, '2026-09-27'),
      ('Entrée', 'Apport', 'Caisse initiale', 300, 'Caisse', 0, '2026-09-27');
  `);

  const first = await closing.saveDailyClosing(db, {
    bank: 1000,
    cash: 300,
    other: 0,
    note: "Première clôture",
    userId: 1,
    userName: "Jihane",
  }, "2026-09-27");

  assert.equal(first.totalVariance, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM daily_closings").get().n, 1);

  const second = await closing.saveDailyClosing(db, {
    bank: 990,
    cash: 300,
    other: 0,
    note: "10 MAD à vérifier",
    userId: 1,
    userName: "Jihane",
  }, "2026-09-27");

  assert.equal(second.bankVariance, -10);
  assert.equal(second.totalVariance, -10);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM daily_closings").get().n, 1);
  const row = db.sqlite.prepare("SELECT note, actual_bank, total_variance, closed_by_name FROM daily_closings").get();
  assert.equal(row.note, "10 MAD à vérifier");
  assert.equal(row.actual_bank, 990);
  assert.equal(row.total_variance, -10);
  assert.equal(row.closed_by_name, "Jihane");
});

test("la migration de clôture est additive et non destructive", async () => {
  const { readFile } = await import("node:fs/promises");
  const migration = await readFile(new URL("../migrations/0003_daily_closings.sql", import.meta.url), "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS daily_closings/);
  assert.match(migration, /close_date TEXT NOT NULL UNIQUE/);
  assert.match(migration, /expected_total REAL/);
  assert.match(migration, /actual_total REAL/);
  assert.doesNotMatch(migration, /DELETE FROM|DROP TABLE|DROP COLUMN/i);
});

test("l’API et l’interface exposent une vraie clôture idempotente", async () => {
  const { readFile } = await import("node:fs/promises");
  const [route, dashboard] = await Promise.all([
    readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /protectMutation\("saveDailyClosing"\)/);
  assert.match(route, /saveDailyClosing\(await getRawDb\(\)/);
  assert.match(route, /dailyClosingPreview/);
  assert.match(dashboard, /active === "Clôture"/);
  assert.match(dashboard, /Rapprochement réel/);
  assert.match(dashboard, /Clôtures enregistrées/);
  assert.match(dashboard, /name="actualBank"/);
  assert.match(dashboard, /name="actualCash"/);
  assert.match(dashboard, /name="actualOther"/);
});
