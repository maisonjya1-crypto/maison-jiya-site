import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

test("le compte de résultat mensuel utilise les bonnes dates et calcule le bénéfice net", () => {
  const { buildMonthlyFinancialSnapshot } = loadSource("lib/monthly-closing.ts");
  const snapshot = buildMonthlyFinancialSnapshot({
    monthKey: "2020-01",
    orders: [
      { id: 1, status: "Livrée", paymentStatus: "Encaissé", saleAmount: 500, productCost: 100, shippingCost: 40, fees: 10, returnCost: 20, paidAt: "2020-01-20T12:00:00.000Z", createdAt: "2020-01-05T12:00:00.000Z", updatedAt: "2020-01-10T12:00:00.000Z" },
      { id: 2, status: "Livrée", paymentStatus: "Encaissé", saleAmount: 300, productCost: 80, shippingCost: 30, fees: 5, returnCost: 0, paidAt: "2020-02-03T12:00:00.000Z", createdAt: "2020-01-30T12:00:00.000Z", updatedAt: "2020-02-02T12:00:00.000Z" },
    ],
    history: [
      { orderId: 1, toStatus: "Livrée", changedAt: "2020-01-10T12:00:00.000Z" },
      { orderId: 2, toStatus: "Livrée", changedAt: "2020-02-02T12:00:00.000Z" },
    ],
    expenses: [{ amount: 50, expenseDate: "2020-01-12" }, { amount: 999, expenseDate: "2020-02-01" }],
    ads: [{ spend: 60, performanceDate: "2020-01-15" }],
    inventoryCounts: [{ lossValue: 25, createdAt: "2020-01-25T12:00:00.000Z" }],
    capital: [
      { direction: "Affectation", category: "Réinvestissement", amount: 70, isAutomatic: true, entryDate: "2020-01-20" },
      { direction: "Entrée", category: "Apport", amount: 100, isAutomatic: false, entryDate: "2020-01-03" },
      { direction: "Sortie", category: "Retrait", amount: 30, isAutomatic: false, entryDate: "2020-01-28" },
    ],
    carrierSettlements: [{ differenceAmount: -15, settlementDate: "2020-01-22" }],
    stockValueStart: 200,
    stockValueEnd: 400,
    stockValueSource: "Inventaire test",
    cashEnd: 700,
    cashEndSource: "Clôture quotidienne 2020-01-31",
  });

  assert.equal(snapshot.deliveredOrders, 1);
  assert.equal(snapshot.deliveredRevenue, 500);
  assert.equal(snapshot.collectedAmount, 500);
  assert.equal(snapshot.productCost, 100);
  assert.equal(snapshot.shippingCost, 40);
  assert.equal(snapshot.fees, 10);
  assert.equal(snapshot.returnCost, 20);
  assert.equal(snapshot.contributionMargin, 330);
  assert.equal(snapshot.adSpend, 60);
  assert.equal(snapshot.operatingExpenses, 50);
  assert.equal(snapshot.inventoryLoss, 25);
  assert.equal(snapshot.carrierAdjustment, -15);
  assert.equal(snapshot.netProfit, 180);
  assert.equal(snapshot.reinvestmentAllocated, 70);
  assert.equal(snapshot.manualCapitalIn, 100);
  assert.equal(snapshot.manualCapitalOut, 30);
  assert.equal(snapshot.stockValueStart, 200);
  assert.equal(snapshot.stockValueEnd, 400);
  assert.equal(snapshot.cashEnd, 700);
});

test("une clôture mensuelle enregistrée reste immuable après modification d’anciennes données", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const monthly = loadSource("db/monthly-closing.ts");

  db.sqlite.exec(`
    DELETE FROM ad_performance;
    DELETE FROM order_status_history;

    UPDATE orders
    SET status = 'Livrée',
        payment_status = 'Encaissé',
        sale_amount = 500,
        product_cost = 100,
        shipping_cost = 40,
        fees = 10,
        return_cost = 20,
        paid_at = '2020-01-20T12:00:00.000Z',
        created_at = '2020-01-05T12:00:00.000Z',
        updated_at = '2020-01-10T12:00:00.000Z'
    WHERE id = 1;

    INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_name, changed_at)
    VALUES (1, 'En livraison', 'Livrée', 'Test', '2020-01-10T12:00:00.000Z');

    INSERT INTO expenses (category, label, amount, account, payment_status, expense_date)
    VALUES ('Divers', 'Charge janvier', 50, 'Banque', 'Payé', '2020-01-12');

    INSERT INTO ad_performance (campaign, spend, revenue, order_count, source, performance_date)
    VALUES ('Janvier', 60, 0, 0, 'Manuel', '2020-01-15');

    INSERT INTO inventory_counts (
      count_ref, product_id, system_quantity, physical_quantity, difference,
      reason, unit_cost, value_before, value_after, loss_value, note, counted_by_name, created_at
    ) VALUES ('COUNT-JAN', 1, 10, 8, -2, 'Perte', 10, 100, 80, 20, '', 'Test', '2020-01-25T12:00:00.000Z');

    INSERT INTO inventory_sessions (
      session_ref, status, expected_product_count, counted_product_count,
      total_system_units, total_physical_units, total_adjustment_units,
      value_before, value_after, loss_value, started_by_name, started_at, completed_at
    ) VALUES ('INV-JAN', 'Clôturé', 1, 1, 10, 8, 2, 500, 400, 20, 'Test', '2020-01-25T10:00:00.000Z', '2020-01-31T18:00:00.000Z');

    INSERT INTO daily_closings (close_date, actual_total, closed_by_name)
    VALUES ('2020-01-31', 700, 'Test');

    INSERT INTO monthly_closings (
      month_key, period_start, period_end, stock_value_end, stock_value_source,
      cash_end, cash_end_source, closed_by_name
    ) VALUES ('2019-12', '2019-12-01', '2019-12-31', 250, 'Clôture précédente', 600, 'Clôture précédente', 'Test');
  `);

  const saved = await monthly.saveMonthlyClosing(db, {
    monthKey: "2020-01",
    note: "Mois validé",
    userId: 1,
    userName: "Jihane",
  });

  assert.equal(saved.deliveredRevenue, 500);
  assert.equal(saved.stockValueStart, 250);
  assert.equal(saved.stockValueEnd, 400);
  assert.match(saved.stockValueSource, /INV-JAN/);
  assert.equal(saved.cashEnd, 700);
  assert.match(saved.cashEndSource, /2020-01-31/);

  const officialBefore = db.sqlite.prepare("SELECT delivered_revenue, net_profit, stock_value_end, cash_end, note FROM monthly_closings WHERE month_key = '2020-01'").get();
  db.sqlite.prepare("UPDATE orders SET sale_amount = 9999, product_cost = 1 WHERE id = 1").run();
  const recalculated = await monthly.buildMonthlyClosingPreview(db, "2020-01");
  assert.notEqual(recalculated.deliveredRevenue, officialBefore.delivered_revenue);

  const officialAfter = db.sqlite.prepare("SELECT delivered_revenue, net_profit, stock_value_end, cash_end, note FROM monthly_closings WHERE month_key = '2020-01'").get();
  assert.deepEqual(officialAfter, officialBefore);
  assert.equal(officialAfter.note, "Mois validé");

  await assert.rejects(
    () => monthly.saveMonthlyClosing(db, { monthKey: "2020-01", note: "", userId: 1, userName: "Jihane" }),
    /déjà clôturé|immuable/i,
  );
});

test("un mois en cours ou futur ne peut pas être clôturé définitivement", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const monthly = loadSource("db/monthly-closing.ts");

  await assert.rejects(
    () => monthly.saveMonthlyClosing(db, { monthKey: "2999-01", note: "", userId: 1, userName: "Jihane" }),
    /uniquement après sa fin/i,
  );
});

test("la migration mensuelle est additive et impose une seule photo par mois", async () => {
  const migration = await readFile(new URL("../migrations/0011_monthly_financial_closings.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS monthly_closings/);
  assert.match(migration, /month_key TEXT NOT NULL UNIQUE/);
  assert.match(migration, /net_profit REAL/);
  assert.match(migration, /stock_value_start REAL/);
  assert.doesNotMatch(migration, /DELETE FROM|DROP TABLE|DROP COLUMN/i);
});

test("l’API, l’interface, les sauvegardes, l’import et Google Sheets couvrent la clôture mensuelle", async () => {
  const [route, dashboard, backups, exporter, importer, sync, sheets] = await Promise.all([
    readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/backups.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/data-export.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/data-import.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/google-sheets-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/backup/google-sheets/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /protectMutation\("saveMonthlyClosing"\)/);
  assert.match(route, /saveMonthlyClosing\(await getRawDb\(\)/);
  assert.match(route, /monthlyClosings: monthlyClosingRows/);
  assert.match(dashboard, /Compte de résultat officiel/);
  assert.match(dashboard, /Clôturer définitivement le mois/);
  assert.match(dashboard, /Photo financière verrouillée/);
  assert.match(backups, /monthlyClosings/);
  assert.match(backups, /monthly_closings/);
  assert.match(exporter, /clotures_mensuelles/);
  assert.match(importer, /clotures_mensuelles/);
  assert.match(sync, /"monthly_closings"/);
  assert.match(sheets, /"monthly-closings"/);
  assert.match(sheets, /Bénéfice net \(MAD\)/);
});
