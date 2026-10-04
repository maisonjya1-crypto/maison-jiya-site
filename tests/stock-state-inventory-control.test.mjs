import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("l'état réel du stock reste limité aux trois états demandés", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /function realStockState\(product: Product\): "En stock" \| "Sur commande" \| "Stock à vérifier"/);
  assert.match(dashboard, /product\.stockVerificationStatus === "À vérifier"/);
  assert.match(dashboard, /return product\.stockQuantity > 0 \? "En stock" : "Sur commande"/);
  assert.match(dashboard, /const options = \["En stock", "Sur commande", "Stock à vérifier"\] as const/);
});

test("marquer Stock à vérifier ne modifie jamais la quantité système", async () => {
  const route = await read("app/api/data/route.ts");
  const start = route.indexOf('payload.action === "markProductStockUnverified"');
  const end = route.indexOf('payload.action === "countInventory"', start);
  assert.ok(start >= 0 && end > start);
  const block = route.slice(start, end);
  assert.match(block, /stockVerificationStatus: "À vérifier"/);
  assert.doesNotMatch(block, /stockQuantity:/);
  assert.doesNotMatch(block, /stock_quantity\s*=/);
  assert.match(block, /La quantité système/);
});

test("un état En stock ou Sur commande passe par le comptage physique", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  const start = dashboard.indexOf("function RealStockStateControl");
  const end = dashboard.indexOf("function StockLevel", start);
  const block = dashboard.slice(start, end);
  assert.match(block, /if \(next === "Stock à vérifier"\)/);
  assert.match(block, /onMarkUnverified\(product\)/);
  assert.match(block, /onCount\(product\)/);
  assert.match(block, /Confirmer cet état par un comptage physique/);
});

test("l'inventaire de contrôle affiche logiciel compté écart et corriger", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /title="Inventaire de contrôle"/);
  assert.match(dashboard, /<th>Stock logiciel<\/th><th>Stock compté<\/th><th>Écart<\/th>/);
  assert.match(dashboard, /latestInventoryByProduct/);
  assert.match(dashboard, /Corriger \/ compter/);
  assert.match(dashboard, /<span>Stock logiciel<\/span>/);
  assert.match(dashboard, /<span>Stock compté<\/span>/);
});

test("l'interface garde un affichage mobile utilisable", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /real-stock-state/);
  assert.match(css, /inventory-control-panel/);
  assert.match(css, /touch-action:manipulation/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*real-stock-state/);
});
