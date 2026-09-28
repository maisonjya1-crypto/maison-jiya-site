import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

function orderForTreasury(sqlite) {
  return sqlite.prepare(`
    SELECT
      payment_status AS paymentStatus,
      fulfillment_type AS fulfillmentType,
      sale_amount AS saleAmount,
      shipping_cost AS shippingCost,
      fees,
      return_cost AS returnCost
    FROM orders
    WHERE id = 1
  `).get();
}

function orderForFinance(sqlite) {
  return sqlite.prepare(`
    SELECT
      id,
      status,
      payment_status AS paymentStatus,
      sale_amount AS saleAmount,
      product_cost AS productCost,
      shipping_cost AS shippingCost,
      fees,
      return_cost AS returnCost,
      paid_at AS paidAt,
      refunded_at AS refundedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM orders
    WHERE id = 1
  `).get();
}

test("parcours complet commande → stock → livraison → encaissement → retour → remboursement → trésorerie", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());

  const payment = loadSource("lib/order-payment-lifecycle.ts");
  const treasury = loadSource("lib/treasury.ts");
  const finance = loadSource("lib/finance.ts");
  const dailyClosing = loadSource("db/daily-closing.ts");
  const monthly = loadSource("lib/monthly-closing.ts");

  db.sqlite.exec(`
    DELETE FROM ad_performance;
    DELETE FROM expenses;
    DELETE FROM purchases;
    DELETE FROM capital_ledger;
    DELETE FROM order_status_history;
    DELETE FROM stock_movements;

    UPDATE products
    SET stock_quantity = 3,
        purchase_price = 90,
        sale_price = 250
    WHERE id = 1;

    UPDATE orders
    SET status = 'En attente',
        payment_status = 'À encaisser',
        fulfillment_type = 'Livraison',
        quantity = 1,
        sale_amount = 250,
        product_cost = 90,
        shipping_cost = 40,
        fees = 10,
        return_cost = 0,
        stock_deducted = 0,
        paid_at = NULL,
        refunded_at = NULL,
        created_at = '2020-01-05T12:00:00.000Z',
        updated_at = '2020-01-05T12:00:00.000Z'
    WHERE id = 1;
  `);

  // Confirmation : une seule unité quitte le stock et un mouvement est tracé.
  db.sqlite.exec(`
    UPDATE products SET stock_quantity = stock_quantity - 1 WHERE id = 1;
    UPDATE orders
    SET status = 'Confirmée',
        stock_deducted = 1,
        updated_at = '2020-01-06T12:00:00.000Z'
    WHERE id = 1;
    INSERT INTO stock_movements (product_id, order_id, movement_type, quantity, note, created_at)
    VALUES (1, 1, 'Commande', 1, 'Déduction automatique · TEST-ORDER', '2020-01-06T12:00:00.000Z');
    INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_name, changed_at)
    VALUES (1, 'En attente', 'Confirmée', 'Test QA', '2020-01-06T12:00:00.000Z');
  `);

  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 2);
  assert.equal(db.sqlite.prepare("SELECT stock_deducted FROM orders WHERE id = 1").get().stock_deducted, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM stock_movements WHERE order_id = 1 AND movement_type = 'Commande'").get().n, 1);

  // Livraison + paiement transporteur : la même règle métier produit l'encaissement.
  const paid = payment.normalizeOrderPaymentState({
    status: "Livrée",
    requestedPaymentStatus: "À encaisser",
    previousPaymentStatus: "À encaisser",
    paidAt: null,
    refundedAt: null,
    carrierPaid: true,
    now: "2020-01-10T12:00:00.000Z",
  });

  assert.deepEqual(paid, {
    paymentStatus: "Encaissé",
    paidAt: "2020-01-10T12:00:00.000Z",
    refundedAt: null,
  });

  db.sqlite.prepare(`
    UPDATE orders
    SET status = 'Livrée',
        payment_status = ?,
        paid_at = ?,
        refunded_at = ?,
        updated_at = '2020-01-10T12:00:00.000Z'
    WHERE id = 1
  `).run(paid.paymentStatus, paid.paidAt, paid.refundedAt);

  db.sqlite.prepare(`
    INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_name, changed_at)
    VALUES (1, 'Confirmée', 'Livrée', 'Test QA', '2020-01-10T12:00:00.000Z')
  `).run();

  const treasuryAfterPayment = treasury.calculateTreasuryAccounts({
    orders: [orderForTreasury(db.sqlite)],
    purchases: [],
    expenses: [],
    ads: [],
    capital: [],
  });
  assert.deepEqual(treasuryAfterPayment, { bank: 200, cash: 0, other: 0, total: 200 });

  const deliveryClosing = await dailyClosing.buildDailyClosingPreview(db, "2020-01-10");
  assert.equal(deliveryClosing.collectedOrders, 1);
  assert.equal(deliveryClosing.collectedAmount, 200);
  assert.equal(deliveryClosing.refundedOrders, 0);
  assert.equal(deliveryClosing.expectedBank, 200);

  // Retour après encaissement : remboursement automatique, date de paiement conservée.
  const refunded = payment.normalizeOrderPaymentState({
    status: "Retour",
    requestedPaymentStatus: "Encaissé",
    previousPaymentStatus: "Encaissé",
    paidAt: paid.paidAt,
    refundedAt: null,
    now: "2020-02-05T12:00:00.000Z",
  });

  assert.deepEqual(refunded, {
    paymentStatus: "Remboursé",
    paidAt: "2020-01-10T12:00:00.000Z",
    refundedAt: "2020-02-05T12:00:00.000Z",
  });

  db.sqlite.prepare(`
    UPDATE orders
    SET status = 'Retour',
        payment_status = ?,
        return_cost = 25,
        paid_at = ?,
        refunded_at = ?,
        updated_at = '2020-02-05T12:00:00.000Z'
    WHERE id = 1
  `).run(refunded.paymentStatus, refunded.paidAt, refunded.refundedAt);

  db.sqlite.prepare(`
    INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_name, changed_at)
    VALUES (1, 'Livrée', 'Retour', 'Test QA', '2020-02-05T12:00:00.000Z')
  `).run();

  // Un retour reste volontairement hors stock jusqu'à une réintégration contrôlée.
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 2);
  assert.equal(db.sqlite.prepare("SELECT stock_deducted FROM orders WHERE id = 1").get().stock_deducted, 1);

  // Encaissement 200 puis remboursement 200 : il ne reste que le coût de retour de 25 MAD.
  const treasuryAfterRefund = treasury.calculateTreasuryAccounts({
    orders: [orderForTreasury(db.sqlite)],
    purchases: [],
    expenses: [],
    ads: [],
    capital: [],
  });
  assert.deepEqual(treasuryAfterRefund, { bank: -25, cash: 0, other: 0, total: -25 });

  const refundClosing = await dailyClosing.buildDailyClosingPreview(db, "2020-02-05");
  assert.equal(refundClosing.collectedOrders, 0);
  assert.equal(refundClosing.refundedOrders, 1);
  assert.equal(refundClosing.refundedAmount, 200);
  assert.equal(refundClosing.expectedBank, -25);

  const order = orderForFinance(db.sqlite);
  const history = db.sqlite.prepare(`
    SELECT order_id AS orderId, to_status AS toStatus, changed_at AS changedAt
    FROM order_status_history
    WHERE order_id = 1
  `).all();

  const base = {
    orders: [order],
    history,
    expenses: [],
    ads: [],
    inventoryCounts: [],
    capital: [],
    carrierSettlements: [],
    stockValueStart: null,
    stockValueEnd: null,
    stockValueSource: "",
    cashEnd: 0,
    cashEndSource: "",
  };

  const january = monthly.buildMonthlyFinancialSnapshot({ monthKey: "2020-01", ...base });
  assert.equal(january.deliveredOrders, 1);
  assert.equal(january.deliveredRevenue, 250);
  assert.equal(january.collectedAmount, 250);
  assert.equal(january.productCost, 90);
  assert.equal(january.shippingCost, 40);
  assert.equal(january.fees, 10);
  assert.equal(january.returnCost, 0);
  assert.equal(january.netProfit, 110);

  const february = monthly.buildMonthlyFinancialSnapshot({ monthKey: "2020-02", ...base });
  assert.equal(february.deliveredOrders, 0);
  assert.equal(february.deliveredRevenue, -250);
  assert.equal(february.collectedAmount, -250);
  assert.equal(february.productCost, 0);
  assert.equal(february.shippingCost, 0);
  assert.equal(february.fees, 0);
  assert.equal(february.returnCost, 25);
  assert.equal(february.netProfit, -275);

  // Les deux mois retombent exactement sur la situation économique actuelle de la commande.
  const currentProfit = finance.calculateOperatingProfit([order], [], []);
  assert.equal(currentProfit.profit, -165);
  assert.equal(january.netProfit + february.netProfit, currentProfit.profit);
});

test("l'API conserve le retour dans les statuts qui gardent le stock engagé", async () => {
  const route = await readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8");

  assert.match(route, /stockCommittedStatuses = new Set\(\["Confirmée", "Expédiée", "En livraison", "Livrée", "Retour"\]\)/);
  assert.match(route, /normalizeOrderPaymentState\(\{/);
  assert.match(route, /existingOrder\.stockDeducted && !commitsStock\(nextStatus\)/);
  assert.match(route, /Réintégration automatique/);
});
