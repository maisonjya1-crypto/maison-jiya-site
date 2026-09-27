import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

test("une réception partielle met à jour le stock, le coût moyen et le statut du bon", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const receiving = loadSource("db/inventory-cost.ts");

  db.sqlite.exec(`
    UPDATE products SET stock_quantity = 5, purchase_price = 10 WHERE id = 1;
    INSERT INTO suppliers (id, name, city, lead_time_days) VALUES (10, 'Fournisseur Test', 'Casablanca', 5);
    INSERT INTO purchases (
      id, supplier, supplier_id, purchase_ref, procurement_status, ordered_at, expected_at,
      item, product_id, quantity, unit_cost, total_cost, account, payment_status, received_quantity
    ) VALUES (
      50, 'Fournisseur Test', 10, 'BC-TEST-50', 'Commandé', '2026-09-27T10:00:00.000Z', '2026-10-02',
      'Réassort', 1, 10, 20, 200, 'Banque', 'À payer', 0
    );
  `);

  const first = await receiving.receivePurchaseIntoStock(db, 50, 4, "2026-09-27T12:00:00.000Z");
  assert.equal(first.receivedQuantity, 4);
  assert.equal(first.totalReceivedQuantity, 4);
  assert.equal(first.remainingQuantity, 6);
  assert.equal(first.procurementStatus, "Partiellement reçu");
  assert.equal(first.newStock, 9);
  assert.equal(first.newAverageCost, 14.44);

  let purchase = db.sqlite.prepare("SELECT received_quantity, procurement_status FROM purchases WHERE id = 50").get();
  assert.equal(purchase.received_quantity, 4);
  assert.equal(purchase.procurement_status, "Partiellement reçu");

  const second = await receiving.receivePurchaseIntoStock(db, 50, 6, "2026-09-27T13:00:00.000Z");
  assert.equal(second.totalReceivedQuantity, 10);
  assert.equal(second.remainingQuantity, 0);
  assert.equal(second.procurementStatus, "Reçu");
  assert.equal(second.newStock, 15);

  purchase = db.sqlite.prepare("SELECT received_quantity, procurement_status FROM purchases WHERE id = 50").get();
  assert.equal(purchase.received_quantity, 10);
  assert.equal(purchase.procurement_status, "Reçu");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM stock_movements WHERE purchase_id = 50").get().n, 2);
});

test("un brouillon ou un bon annulé ne peut pas alimenter le stock", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const receiving = loadSource("db/inventory-cost.ts");

  db.sqlite.exec(`
    INSERT INTO suppliers (id, name) VALUES (20, 'Fournisseur Brouillon');
    INSERT INTO purchases (
      id, supplier, supplier_id, purchase_ref, procurement_status, item, product_id, quantity, unit_cost, total_cost, payment_status, received_quantity
    ) VALUES
      (60, 'Fournisseur Brouillon', 20, 'BC-DRAFT', 'Brouillon', 'Draft', 1, 2, 10, 20, 'À payer', 0),
      (61, 'Fournisseur Brouillon', 20, 'BC-CANCEL', 'Annulé', 'Cancel', 1, 2, 10, 20, 'À payer', 0);
  `);

  await assert.rejects(() => receiving.receivePurchaseIntoStock(db, 60, 1), /pas été enregistrée/);
  await assert.rejects(() => receiving.receivePurchaseIntoStock(db, 61, 1), /pas été enregistrée/);
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 0);
});

test("la migration crée les profils fournisseurs et rattache les anciens achats", async () => {
  const { memoryD1, loadSource } = await import("./helpers/d1-fixture.mjs");
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const db = memoryD1();
  db.sqlite.exec(`
    CREATE TABLE products (id INTEGER PRIMARY KEY, product_code TEXT, name TEXT, category TEXT, purchase_price REAL, sale_price REAL, minimum_sale_price REAL DEFAULT 0, stock_quantity INTEGER DEFAULT 0, stock_alert_threshold INTEGER DEFAULT 5, reorder_cover_days INTEGER DEFAULT 30, archived_at TEXT, archived_by_user_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier TEXT NOT NULL,
      item TEXT NOT NULL,
      product_id INTEGER,
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      account TEXT NOT NULL DEFAULT 'Banque',
      payment_status TEXT NOT NULL DEFAULT 'Payé',
      paid_at TEXT,
      received_quantity INTEGER NOT NULL DEFAULT 0,
      received_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO purchases (id, supplier, item, quantity, unit_cost, total_cost, received_quantity, created_at)
    VALUES (1, 'Atlas Supply', 'Lot', 4, 10, 40, 4, '2026-09-20T10:00:00.000Z');
  `);
  const migration = readFileSync(resolve(import.meta.dirname, "../migrations/0005_suppliers_purchase_orders.sql"), "utf8");
  db.sqlite.exec(migration);
  const supplier = db.sqlite.prepare("SELECT id, name FROM suppliers").get();
  const purchase = db.sqlite.prepare("SELECT supplier_id, purchase_ref, procurement_status, ordered_at FROM purchases WHERE id = 1").get();
  assert.equal(supplier.name, "Atlas Supply");
  assert.equal(purchase.supplier_id, supplier.id);
  assert.equal(purchase.purchase_ref, "BC-000001");
  assert.equal(purchase.procurement_status, "Reçu");
  assert.equal(purchase.ordered_at, "2026-09-20T10:00:00.000Z");
});

test("API, interface, export et sync Sheets connaissent les fournisseurs et bons de commande", async () => {
  const [route, dashboard, backups, dataExport, dataImport, sheets, sync] = await Promise.all([
    readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/backups.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/data-export.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/data-import.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/backup/google-sheets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/google-sheets-sync.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /payload\.action === "addSupplier"/);
  assert.match(route, /payload\.action === "updateSupplier"/);
  assert.match(route, /payload\.action === "toggleSupplier"/);
  assert.match(route, /buildPurchaseReference/);
  assert.match(dashboard, /Répertoire fournisseurs/);
  assert.match(dashboard, /Bons de commande fournisseurs/);
  assert.match(dashboard, /Partiellement reçu/);
  assert.match(backups, /suppliers/);
  assert.match(backups, /purchase_ref/);
  assert.match(dataExport, /fournisseurs: "SELECT \* FROM suppliers/);
  assert.match(dataImport, /fournisseurs:/);
  assert.match(sheets, /dataset === "suppliers"/);
  assert.match(sheets, /Référence bon/);
  assert.match(sync, /"suppliers"/);
});
