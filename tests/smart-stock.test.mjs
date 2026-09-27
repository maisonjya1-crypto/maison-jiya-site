import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

test("le réapprovisionnement utilise la demande 30 jours, le seuil et les achats en attente", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const smartStock = loadSource("db/smart-stock.ts");

  db.sqlite.exec(`
    UPDATE products
    SET stock_quantity = 2,
        stock_alert_threshold = 5,
        reorder_cover_days = 30,
        purchase_price = 10
    WHERE id = 1;

    INSERT INTO stock_movements (product_id, movement_type, quantity, note, created_at)
    VALUES
      (1, 'Commande', 7, 'demande récente', datetime('now', '-10 days')),
      (1, 'Commande', 5, 'demande récente', datetime('now', '-4 days')),
      (1, 'Commande', 99, 'trop ancienne', datetime('now', '-45 days')),
      (1, 'Inventaire -', 50, 'perte qui ne doit pas devenir demande', datetime('now', '-2 days'));

    INSERT INTO suppliers (id, name, lead_time_days, minimum_order_amount)
    VALUES (20, 'Fournisseur actuel', 3, 120);

    INSERT INTO purchases (id, supplier, supplier_id, item, product_id, quantity, unit_cost, total_cost, account, payment_status, received_quantity, created_at)
    VALUES
      (30, 'Fournisseur historique', NULL, 'Ancien achat', 1, 10, 9, 90, 'Banque', 'Payé', 10, datetime('now', '-60 days')),
      (31, 'Fournisseur actuel', 20, 'Réassort', 1, 3, 8, 24, 'Banque', 'À payer', 0, datetime('now', '-1 day'));
  `);

  const rows = await smartStock.buildSmartStockRecommendations(db);
  const row = rows.find(item => item.productId === 1);

  assert.ok(row);
  assert.equal(row.soldUnits30, 12);
  assert.equal(row.averageDailyDemand, 0.4);
  assert.equal(row.daysOfCover, 5);
  assert.equal(row.alertThreshold, 5);
  assert.equal(row.targetStock, 17);
  assert.equal(row.pendingInbound, 3);
  assert.equal(row.recommendedQuantity, 12);
  assert.equal(row.supplier, "Fournisseur actuel");
  assert.equal(row.supplierLeadTimeDays, 3);
  assert.equal(row.supplierMinimumOrderAmount, 120);
  assert.equal(row.unitCost, 8);
  assert.equal(row.estimatedCost, 96);
  assert.equal(row.status, "Critique");
});

test("une réintégration annule la demande correspondante et une commande déjà prévue évite le surachat", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const smartStock = loadSource("db/smart-stock.ts");

  db.sqlite.exec(`
    UPDATE products
    SET stock_quantity = 4,
        stock_alert_threshold = 5,
        reorder_cover_days = 30
    WHERE id = 1;

    INSERT INTO stock_movements (product_id, movement_type, quantity, note, created_at)
    VALUES
      (1, 'Commande', 10, 'sortie', datetime('now', '-5 days')),
      (1, 'Réintégration', 4, 'annulation', datetime('now', '-4 days'));

    INSERT INTO purchases (id, supplier, item, product_id, quantity, unit_cost, total_cost, account, payment_status, received_quantity, created_at)
    VALUES (40, 'Fournisseur A', 'En attente', 1, 8, 10, 80, 'Banque', 'À payer', 0, datetime('now', '-1 day'));
  `);

  const [row] = await smartStock.buildSmartStockRecommendations(db);

  assert.equal(row.soldUnits30, 6);
  assert.equal(row.targetStock, 11);
  assert.equal(row.pendingInbound, 8);
  assert.equal(row.recommendedQuantity, 0);
  assert.equal(row.status, "Critique");
});

test("un produit sans historique fournisseur reste identifiable sans inventer de fournisseur", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const smartStock = loadSource("db/smart-stock.ts");

  db.sqlite.exec(`
    UPDATE products
    SET stock_quantity = 0,
        stock_alert_threshold = 4,
        reorder_cover_days = 20,
        purchase_price = 12
    WHERE id = 1;
  `);

  const [row] = await smartStock.buildSmartStockRecommendations(db);

  assert.equal(row.status, "Rupture");
  assert.equal(row.supplier, "Fournisseur à renseigner");
  assert.equal(row.recommendedQuantity, 4);
  assert.equal(row.estimatedCost, 48);
});

test("la migration de stock intelligent est additive et conserve les produits existants", async () => {
  const migration = await readFile(new URL("../migrations/0004_smart_stock_reordering.sql", import.meta.url), "utf8");

  assert.match(migration, /ALTER TABLE products ADD COLUMN stock_alert_threshold/);
  assert.match(migration, /ALTER TABLE products ADD COLUMN reorder_cover_days/);
  assert.doesNotMatch(migration, /DELETE FROM|DROP TABLE|DROP COLUMN/i);
});

test("l’API, les sauvegardes et l’interface conservent les paramètres de réapprovisionnement", async () => {
  const [route, backups, dataImport, sheets, dashboard] = await Promise.all([
    readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/backups.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/data-import.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/backup/google-sheets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /buildSmartStockRecommendations/);
  assert.match(route, /stock_alert_threshold = \?/);
  assert.match(route, /reorder_cover_days = \?/);
  assert.match(backups, /"stock_alert_threshold", "reorder_cover_days"/);
  assert.match(dataImport, /stock_alert_threshold: 5/);
  assert.match(dataImport, /reorder_cover_days: 30/);
  assert.match(sheets, /Seuil alerte stock/);
  assert.match(sheets, /Couverture cible \(jours\)/);
  assert.match(dashboard, /Réapprovisionnement/);
  assert.match(dashboard, /Préparer les achats/);
  assert.match(dashboard, /name="stockAlertThreshold"/);
  assert.match(dashboard, /name="reorderCoverDays"/);
});
