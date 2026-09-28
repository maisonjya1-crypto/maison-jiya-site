import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

test("la migration transporteur interdit une même référence et une même commande deux fois", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());

  db.sqlite.exec(`
    UPDATE orders
    SET status = 'Livrée', payment_status = 'Encaissé', sale_amount = 100, shipping_cost = 10, fees = 5
    WHERE id = 1;

    INSERT INTO carrier_settlements (
      id, carrier, reference, settlement_date, expected_amount, actual_amount,
      difference_amount, order_count, status, created_by_name
    ) VALUES (
      71, 'Sendit', 'VIR-001', '2026-09-28', 85, 80, -5, 1, 'À vérifier', 'Test'
    );

    INSERT INTO carrier_settlement_orders (
      id, settlement_id, order_id, expected_amount
    ) VALUES (71, 71, 1, 85);

    INSERT INTO carrier_settlements (
      id, carrier, reference, settlement_date, expected_amount, actual_amount,
      difference_amount, order_count, status, created_by_name
    ) VALUES (
      72, 'Sendit', 'VIR-002', '2026-09-28', 85, 85, 0, 1, 'Rapproché', 'Test'
    );
  `);

  assert.throws(() => db.sqlite.prepare(`
    INSERT INTO carrier_settlement_orders (settlement_id, order_id, expected_amount)
    VALUES (72, 1, 85)
  `).run(), /UNIQUE|constraint/i);

  assert.throws(() => db.sqlite.prepare(`
    INSERT INTO carrier_settlements (
      carrier, reference, settlement_date, expected_amount, actual_amount,
      difference_amount, order_count, status, created_by_name
    ) VALUES ('sendit', 'vir-001', '2026-09-28', 85, 85, 0, 1, 'Rapproché', 'Test')
  `).run(), /UNIQUE|constraint/i);
});

test("un virement attendu 85 mais reçu 80 corrige exactement la banque à 80", () => {
  const treasury = loadSource("lib/treasury.ts");
  const finance = loadSource("lib/finance.ts");

  const treasuryResult = treasury.calculateTreasuryAccounts({
    orders: [
      { paymentStatus: "Encaissé", fulfillmentType: "Livraison", saleAmount: 100, shippingCost: 10, fees: 5, returnCost: 0 },
    ],
    purchases: [],
    expenses: [],
    ads: [],
    capital: [],
    supplierPayments: [],
    carrierSettlementAdjustment: -5,
  });
  assert.equal(treasuryResult.bank, 80);
  assert.equal(treasuryResult.total, 80);

  const financeResult = finance.calculateBusinessFinance({
    orders: [
      { status: "Livrée", paymentStatus: "Encaissé", saleAmount: 100, productCost: 20, shippingCost: 10, fees: 5, returnCost: 0 },
    ],
    purchases: [],
    supplierInvoices: [],
    carrierSettlements: [{ differenceAmount: -5 }],
    expenses: [],
    ads: [],
    capital: [],
    safetyReserve: 0,
  });
  assert.equal(financeResult.netCollected, 80);
  assert.equal(financeResult.cash, 80);
  assert.equal(financeResult.profit, 65);
});

test("la sauvegarde complète conserve un règlement transporteur et ses commandes", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const backups = loadSource("db/backups.ts");

  db.sqlite.exec(`
    UPDATE orders
    SET status = 'Livrée', payment_status = 'Encaissé', sale_amount = 100, shipping_cost = 10, fees = 5
    WHERE id = 1;

    INSERT INTO carrier_settlements (
      id, carrier, reference, settlement_date, expected_amount, actual_amount,
      difference_amount, order_count, status, note, created_by_name
    ) VALUES (
      81, 'Sendit', 'BACKUP-VIR', '2026-09-28', 85, 80, -5, 1, 'À vérifier', 'retenue à vérifier', 'Jihane'
    );

    INSERT INTO carrier_settlement_orders (
      id, settlement_id, order_id, expected_amount
    ) VALUES (81, 81, 1, 85);
  `);

  await backups.createDailyBackup(db, "Règlement transporteur", true);
  const backup = db.sqlite.prepare("SELECT id, snapshot_json FROM daily_backups ORDER BY id DESC LIMIT 1").get();
  const snapshot = JSON.parse(backup.snapshot_json);
  assert.equal(snapshot.tables.carrierSettlements.some((row) => row.reference === "BACKUP-VIR"), true);
  assert.equal(snapshot.tables.carrierSettlementOrders.some((row) => row.settlement_id === 81 && row.order_id === 1), true);

  db.sqlite.exec("DELETE FROM carrier_settlement_orders; DELETE FROM carrier_settlements;");
  await backups.restoreDailyBackup(db, backup.id);

  const settlement = db.sqlite.prepare("SELECT * FROM carrier_settlements WHERE id = 81").get();
  const line = db.sqlite.prepare("SELECT * FROM carrier_settlement_orders WHERE id = 81").get();
  assert.equal(settlement.actual_amount, 80);
  assert.equal(settlement.difference_amount, -5);
  assert.equal(line.order_id, 1);
  assert.equal(line.expected_amount, 85);
});

test("l’API recalcule le montant attendu côté serveur et verrouille l’historique rapproché", async () => {
  const route = await readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8");

  assert.match(route, /payload\.action === "addCarrierSettlement"/);
  assert.match(route, /saleAmount[^\n]*shippingCost[^\n]*fees|saleAmount[\s\S]{0,350}shippingCost[\s\S]{0,350}fees/);
  assert.match(route, /Math\.max\(0, Number\(order\.saleAmount/);
  assert.match(route, /\["À encaisser", "Encaissé"\]\.includes\(order\.paymentStatus\)/);
  assert.match(route, /carrier_settlement_orders/);
  assert.match(route, /protectMutation\("addCarrierSettlement"\)/);
  assert.match(route, /database\.batch\(statements\)/);
  assert.match(route, /Cette commande appartient déjà à un virement transporteur rapproché/);
  assert.match(route, /rattachée à un règlement transporteur/);
  assert.match(route, /ne peut pas être supprimée définitivement/);
});

test("l’interface permet le rapprochement réel et expose les écarts", async () => {
  const [dashboard, styles] = await Promise.all([
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /function CarrierSettlementsPage/);
  assert.match(dashboard, /Règlements transporteurs/);
  assert.match(dashboard, /Montant réellement reçu \(MAD\)/);
  assert.match(dashboard, /Montant attendu/);
  assert.match(dashboard, /À vérifier/);
  assert.match(dashboard, /Confirmer le virement reçu/);
  assert.match(dashboard, /déjà marqué encaissé par API/);
  assert.match(dashboard, /carrierSettlementAdjustment/);
  assert.match(styles, /carrier-settlement-order-list/);
  assert.match(styles, /carrier-settlement-result/);
});

test("export, import et Google Sheets conservent les rapprochements transporteurs", async () => {
  const [exporter, importer, sheets, sync, backups] = await Promise.all([
    readFile(new URL("../db/data-export.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/data-import.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/backup/google-sheets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/google-sheets-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/backups.ts", import.meta.url), "utf8"),
  ]);

  assert.match(exporter, /reglements_transporteurs/);
  assert.match(exporter, /reglement_commandes_transporteurs/);
  assert.match(importer, /carrier_settlements/);
  assert.match(importer, /carrier_settlement_orders/);
  assert.match(sheets, /carrier-settlements/);
  assert.match(sheets, /carrier-settlement-orders/);
  assert.match(sync, /"carrier_settlements"/);
  assert.match(sync, /"carrier_settlement_orders"/);
  assert.match(backups, /carrierSettlements/);
  assert.match(backups, /carrierSettlementOrders/);
});
