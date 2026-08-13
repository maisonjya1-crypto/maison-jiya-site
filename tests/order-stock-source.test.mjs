import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("orders select a catalog product instead of accepting a free-text product", async () => {
  const dashboard = await readFile(new URL("app/dashboard-client.tsx", root), "utf8");
  const route = await readFile(new URL("app/api/data/route.ts", root), "utf8");
  assert.match(dashboard, /name="productId"/);
  assert.doesNotMatch(dashboard, /name="products" required/);
  assert.match(route, /Le produit sélectionné n’existe plus dans le catalogue/);
  assert.match(route, /selectedProduct\.purchasePrice \* quantity/);
});

test("stock is deducted once when an order reaches a committed status", async () => {
  const route = await readFile(new URL("app/api/data/route.ts", root), "utf8");
  const database = await readFile(new URL("db/index.ts", root), "utf8");
  assert.match(route, /stockCommittedStatuses/);
  assert.match(route, /!existingOrder\.stockDeducted && commitsStock\(nextStatus\)/);
  assert.match(route, /SET stock_quantity = stock_quantity - \?/);
  assert.match(route, /movement_type, quantity, note, created_at/);
  assert.match(database, /prevent_negative_product_stock/);
  assert.match(database, /RAISE\(ABORT, 'Stock insuffisant'\)/);
});

test("cancelling an order or moving it back to pending restores its units", async () => {
  const route = await readFile(new URL("app/api/data/route.ts", root), "utf8");
  assert.match(route, /existingOrder\.stockDeducted && !commitsStock\(nextStatus\)/);
  assert.match(route, /SET stock_quantity = stock_quantity \+ \?/);
  assert.match(route, /'Réintégration'/);
});
