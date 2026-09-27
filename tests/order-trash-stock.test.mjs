import assert from "node:assert/strict";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

test("mettre une commande confirmée à la corbeille libère le stock puis sa restauration le réserve à nouveau", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const trash = loadSource("db/order-trash.ts");

  db.sqlite.exec(`
    UPDATE products SET stock_quantity = 4 WHERE id = 1;
    UPDATE orders
    SET quantity = 1, status = 'Confirmée', stock_deducted = 1, deleted_at = NULL
    WHERE id = 1;
  `);

  const deleted = await trash.moveOrderToTrash(db, 1, 1, "2026-09-27T14:00:00.000Z");
  assert.equal(deleted.stockRestored, true);
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 5);
  let order = db.sqlite.prepare("SELECT deleted_at, stock_deducted FROM orders WHERE id = 1").get();
  assert.equal(order.deleted_at, "2026-09-27T14:00:00.000Z");
  assert.equal(order.stock_deducted, 0);

  const restored = await trash.restoreOrderFromTrash(db, 1, "2026-09-27T14:05:00.000Z");
  assert.equal(restored.stockDeducted, true);
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 4);
  order = db.sqlite.prepare("SELECT deleted_at, stock_deducted FROM orders WHERE id = 1").get();
  assert.equal(order.deleted_at, null);
  assert.equal(order.stock_deducted, 1);

  const movements = db.sqlite.prepare("SELECT movement_type FROM stock_movements WHERE order_id = 1 ORDER BY id").all();
  assert.equal(movements.at(-2).movement_type, "Réintégration");
  assert.equal(movements.at(-1).movement_type, "Commande");
});

test("une commande en attente ne déplace jamais le stock via la corbeille", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const trash = loadSource("db/order-trash.ts");

  db.sqlite.exec(`
    UPDATE products SET stock_quantity = 8 WHERE id = 1;
    UPDATE orders SET status = 'En attente', stock_deducted = 0, deleted_at = NULL WHERE id = 1;
  `);

  await trash.moveOrderToTrash(db, 1, 1);
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 8);
  await trash.restoreOrderFromTrash(db, 1);
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 8);
  assert.equal(db.sqlite.prepare("SELECT stock_deducted FROM orders WHERE id = 1").get().stock_deducted, 0);
});

test("les commandes multi-produits suivent la même règle grâce aux garde-fous D1", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const trash = loadSource("db/order-trash.ts");

  db.sqlite.exec(`
    INSERT INTO products (id, product_code, name, category, purchase_price, sale_price, stock_quantity)
    VALUES (2, 'TEST-2', 'Produit test 2', 'Bijoux', 20, 40, 5);
    UPDATE products SET stock_quantity = 4 WHERE id = 1;
    INSERT INTO orders (
      id, order_ref, customer_id, product_id, city, address, products, quantity,
      sale_amount, product_cost, status, stock_deducted, items_json
    ) VALUES (
      2, 'TEST-MULTI', 1, NULL, 'Casablanca', 'Adresse', 'Pack test', 3,
      105, 50, 'Confirmée', 1,
      '[{"productId":1,"quantity":1},{"productId":2,"quantity":2}]'
    );
  `);

  await trash.moveOrderToTrash(db, 2, 1);
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 5);
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 2").get().stock_quantity, 7);

  await trash.restoreOrderFromTrash(db, 2);
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 4);
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 2").get().stock_quantity, 5);
  assert.equal(db.sqlite.prepare("SELECT stock_deducted FROM orders WHERE id = 2").get().stock_deducted, 1);
});

test("une restauration est bloquée si le stock a été utilisé pendant que la commande était dans la corbeille", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const trash = loadSource("db/order-trash.ts");

  db.sqlite.exec(`
    UPDATE products SET stock_quantity = 0 WHERE id = 1;
    UPDATE orders SET quantity = 1, status = 'Confirmée', stock_deducted = 0, deleted_at = '2026-09-27T14:00:00.000Z' WHERE id = 1;
  `);

  await assert.rejects(() => trash.restoreOrderFromTrash(db, 1), /Stock insuffisant/);
  const order = db.sqlite.prepare("SELECT deleted_at, stock_deducted FROM orders WHERE id = 1").get();
  assert.notEqual(order.deleted_at, null);
  assert.equal(order.stock_deducted, 0);
});

test("une ancienne commande déjà dans la corbeille libère son stock avant suppression définitive", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const trash = loadSource("db/order-trash.ts");

  db.sqlite.exec(`
    UPDATE products SET stock_quantity = 3 WHERE id = 1;
    UPDATE orders SET quantity = 2, status = 'Confirmée', stock_deducted = 1, deleted_at = '2026-09-20T10:00:00.000Z' WHERE id = 1;
  `);

  const released = await trash.releaseTrashedOrderStock(db, 1);
  assert.equal(released.stockRestored, true);
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 5);
  assert.equal(db.sqlite.prepare("SELECT stock_deducted FROM orders WHERE id = 1").get().stock_deducted, 0);
});

test("l’API utilise les transitions stock sûres pour supprimer, restaurer et effacer définitivement", async () => {
  const route = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8")
  );
  assert.match(route, /moveOrderToTrash\(await getRawDb\(\), id, user\.id\)/);
  assert.match(route, /restoreOrderFromTrash\(await getRawDb\(\), id\)/);
  assert.match(route, /releaseTrashedOrderStock\(database, id\)/);
  assert.match(route, /Avant suppression/);
});
