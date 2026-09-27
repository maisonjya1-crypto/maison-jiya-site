import assert from "node:assert/strict";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

test("le coût moyen pondéré est calculé sur le stock encore disponible", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const inventory = loadSource("db/inventory-cost.ts");

  db.sqlite.exec(`
    UPDATE products SET stock_quantity = 6, purchase_price = 10 WHERE id = 1;
    UPDATE orders SET product_cost = 11.25 WHERE id = 1;
    INSERT INTO purchases (
      id, supplier, item, product_id, quantity, unit_cost, total_cost, payment_status, received_quantity
    ) VALUES (
      10, 'Fournisseur test', 'Réassort TEST-1', 1, 4, 20, 80, 'Payé', 0
    );
  `);

  const result = await inventory.receivePurchaseIntoStock(db, 10, "2026-09-27T13:00:00.000Z");

  assert.equal(result.previousStock, 6);
  assert.equal(result.receivedQuantity, 4);
  assert.equal(result.previousAverageCost, 10);
  assert.equal(result.receivedUnitCost, 20);
  assert.equal(result.newAverageCost, 14);
  assert.equal(result.newStock, 10);

  const product = db.sqlite.prepare("SELECT stock_quantity, purchase_price FROM products WHERE id = 1").get();
  assert.equal(product.stock_quantity, 10);
  assert.equal(product.purchase_price, 14);

  const purchase = db.sqlite.prepare("SELECT received_quantity, received_at FROM purchases WHERE id = 10").get();
  assert.equal(purchase.received_quantity, 4);
  assert.equal(purchase.received_at, "2026-09-27T13:00:00.000Z");

  const movement = db.sqlite.prepare("SELECT movement_type, quantity, purchase_id FROM stock_movements WHERE purchase_id = 10").get();
  assert.equal(movement.movement_type, "Réception fournisseur");
  assert.equal(movement.quantity, 4);
  assert.equal(movement.purchase_id, 10);

  // Une commande historique garde le coût capturé au moment de la vente.
  assert.equal(db.sqlite.prepare("SELECT product_cost FROM orders WHERE id = 1").get().product_cost, 11.25);
});

test("un stock vide prend directement le coût du nouveau lot et une seconde réception est refusée", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const inventory = loadSource("db/inventory-cost.ts");

  db.sqlite.exec(`
    UPDATE products SET stock_quantity = 0, purchase_price = 10 WHERE id = 1;
    INSERT INTO purchases (
      id, supplier, item, product_id, quantity, unit_cost, total_cost, payment_status, received_quantity
    ) VALUES (
      11, 'Fournisseur test', 'Nouveau lot', 1, 3, 12.35, 37.05, 'Payé', 0
    );
  `);

  const result = await inventory.receivePurchaseIntoStock(db, 11, "2026-09-27T13:05:00.000Z");
  assert.equal(result.newAverageCost, 12.35);
  assert.equal(db.sqlite.prepare("SELECT purchase_price FROM products WHERE id = 1").get().purchase_price, 12.35);

  await assert.rejects(
    () => inventory.receivePurchaseIntoStock(db, 11, "2026-09-27T13:06:00.000Z"),
    /déjà été réceptionné/,
  );
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 3);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM stock_movements WHERE purchase_id = 11").get().n, 1);
});

test("le calcul pur garde les centimes", () => {
  const inventory = loadSource("db/inventory-cost.ts");
  assert.equal(inventory.weightedAverageUnitCost(5, 10.25, 3, 13.4), 11.43);
  assert.equal(inventory.weightedAverageUnitCost(0, 99, 2, 7.55), 7.55);
});
