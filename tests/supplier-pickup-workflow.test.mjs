import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

test("le mode d’achat par défaut est le retrait chez le fournisseur", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());

  db.sqlite.exec(`
    INSERT INTO suppliers (id, name) VALUES (95, 'Fournisseur Retrait');
    INSERT INTO purchases (
      id, supplier, supplier_id, purchase_ref, purchase_line_no, procurement_status,
      item, product_id, quantity, unit_cost, total_cost, payment_status
    ) VALUES (
      195, 'Fournisseur Retrait', 95, 'BC-PICKUP-DEFAULT', 1, 'Commandé',
      'Produit test', 1, 2, 10, 20, 'À payer'
    );
  `);

  const row = db.sqlite.prepare("SELECT purchase_mode FROM purchases WHERE id = 195").get();
  assert.equal(row.purchase_mode, "Retrait fournisseur");
});

test("un retrait reçu immédiatement réceptionne toutes les lignes sans créer de faux stock", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const inventory = loadSource("db/inventory-cost.ts");

  db.sqlite.exec(`
    INSERT INTO suppliers (id, name) VALUES (96, 'Grossiste Direct');
    INSERT INTO purchases (
      id, supplier, supplier_id, purchase_ref, purchase_line_no, purchase_mode, procurement_status,
      item, product_id, quantity, unit_cost, total_cost, payment_status, received_quantity
    ) VALUES
      (196, 'Grossiste Direct', 96, 'BC-PICKUP-NOW', 1, 'Retrait fournisseur', 'Commandé', 'Produit test', 1, 3, 12, 36, 'Payé', 0),
      (197, 'Grossiste Direct', 96, 'BC-PICKUP-NOW', 2, 'Retrait fournisseur', 'Commandé', 'Sacs emballage', NULL, 5, 1, 5, 'Payé', 0);
  `);

  const receipts = await inventory.receivePurchaseOrderImmediately(db, "BC-PICKUP-NOW", "2026-09-27T17:30:00.000Z");
  assert.equal(receipts.length, 2);
  assert.equal(receipts[0].stockUpdated, true);
  assert.equal(receipts[1].stockUpdated, false);

  const lines = db.sqlite.prepare("SELECT id, procurement_status, received_quantity, quantity FROM purchases WHERE purchase_ref = 'BC-PICKUP-NOW' ORDER BY id").all();
  assert.ok(lines.every((line) => line.procurement_status === "Reçu"));
  assert.ok(lines.every((line) => line.received_quantity === line.quantity));
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 3);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM stock_movements WHERE purchase_id IN (196,197)").get().n, 1);
});

test("le workflow retrait garde les frais de déplacement séparés du coût du stock", async () => {
  const [route, dashboard, schema, backups, dataImport, sheets, inventory] = await Promise.all([
    readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/backups.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/data-import.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/backup/google-sheets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/inventory-cost.ts", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /purchaseMode: text\("purchase_mode"\).*Retrait fournisseur/);
  assert.match(route, /const purchaseModes = \["Retrait fournisseur", "Livraison fournisseur"\]/);
  assert.match(route, /receivePurchaseOrderImmediately\(database, purchaseRef/);
  assert.match(route, /INSERT INTO expenses \(category, label, amount, account, payment_status, paid_at, expense_date, note\)/);
  assert.match(route, /Frais séparés du coût du stock/);
  assert.match(route, /Paiement déjà enregistré au bon/);
  assert.match(route, /paidLines === lineCount/);
  assert.match(dashboard, /useState<"Retrait fournisseur" \| "Livraison fournisseur">\("Retrait fournisseur"\)/);
  assert.match(dashboard, /Je repars avec la marchandise maintenant/);
  assert.match(dashboard, /Taxi, essence, parking/);
  assert.match(dashboard, /ne modifieront pas le coût du stock/);
  assert.match(backups, /"purchase_mode"/);
  assert.match(backups, /Retrait fournisseur/);
  assert.match(dataImport, /purchase_mode: "Retrait fournisseur"/);
  assert.match(sheets, /Mode d’achat/);
  assert.match(sheets, /purchaseMode: purchases\.purchaseMode/);
  assert.match(inventory, /receivePurchaseOrderImmediately/);
});
