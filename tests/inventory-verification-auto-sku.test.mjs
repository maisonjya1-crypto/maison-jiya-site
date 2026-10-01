import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixture } from "./helpers/d1-fixture.mjs";

test("le stock peut être marqué à vérifier sans modifier sa quantité", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());

  const before = db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get();
  db.sqlite.prepare("UPDATE products SET stock_verification_status = 'À vérifier' WHERE id = 1").run();
  const after = db.sqlite.prepare("SELECT stock_quantity, stock_verification_status, last_inventory_at FROM products WHERE id = 1").get();

  assert.equal(after.stock_quantity, before.stock_quantity);
  assert.equal(after.stock_verification_status, "À vérifier");
  assert.equal(after.last_inventory_at, null);
});

test("la migration de confiance stock ajoute seulement les métadonnées de vérification", async () => {
  const migration = await readFile(new URL("../migrations/0015_product_stock_verification.sql", import.meta.url), "utf8");
  assert.match(migration, /ADD COLUMN stock_verification_status/);
  assert.match(migration, /ADD COLUMN last_inventory_at/);
  assert.doesNotMatch(migration, /SET\s+stock_quantity\s*=/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+products/i);
});

test("les IDs sont proposés selon la nature et restent numérotés par série", async () => {
  const helper = await readFile(new URL("../lib/product-code.ts", import.meta.url), "utf8");
  assert.match(helper, /"Montre": \{ prefix: "M"/);
  assert.match(helper, /"Bracelet": \{ prefix: "B"/);
  assert.match(helper, /"Collier": \{ prefix: "C"/);
  assert.match(helper, /"Ensemble": \{ prefix: "EN"/);
  assert.match(helper, /"Boîte": \{ prefix: "BX"/);
  assert.match(helper, /"Électronique": \{ prefix: "E"/);
  assert.match(helper, /replace\(\/\\bVAN\\s\+CLEEF\\b\/g, "VC"\)/);
  assert.match(helper, /candidate = base \+ "-" \+ String\(next\)\.padStart\(2, "0"\)/);
});

test("l’ajout produit pendant un inventaire ne force jamais un stock inconnu à rupture", async () => {
  const route = await readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8");
  assert.match(route, /inventoryQuantityConfirmed/);
  assert.match(route, /openInventory && !inventoryQuantityConfirmed \? 0 : requestedInitialQuantity/);
  assert.match(route, /verificationStatus = inventoryQuantityConfirmed/);
  assert.match(route, /"À vérifier"/);
  assert.match(route, /expected_product_count = expected_product_count \+ 1/);
  assert.match(route, /Article ajouté pendant inventaire/);
  assert.match(route, /Rupture confirmée/);
});

test("l’interface propose automatiquement l’ID et distingue stock système et stock physique", async () => {
  const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /Nature du produit/);
  assert.match(dashboard, /ID produit proposé/);
  assert.match(dashboard, /suggestProductCode/);
  assert.match(dashboard, /Quantité comptée maintenant/);
  assert.match(dashboard, /Je ne connais pas encore la quantité/);
  assert.match(dashboard, /stock système/);
  assert.match(dashboard, /À vérifier/);
  assert.match(dashboard, /Rupture confirmée/);
  assert.match(dashboard, /session\.countedProductCount >= session\.expectedProductCount/);
});
