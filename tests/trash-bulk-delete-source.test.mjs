import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("la corbeille permet de sélectionner plusieurs commandes", async () => {
  const source = await read("app/dashboard-client.tsx");
  const start = source.indexOf("function TrashPage");
  const end = source.indexOf("function OrdersPage", start);
  const block = source.slice(start, end);
  assert.match(block, /selectedIds/);
  assert.match(block, /Tout sélectionner/);
  assert.match(block, /Supprimer la sélection/);
  assert.match(block, /type="checkbox"/);
  assert.match(block, /deleteOrdersPermanentlyBulk/);
});

test("la suppression individuelle de la corbeille utilise aussi le chemin groupé optimisé", async () => {
  const source = await read("app/dashboard-client.tsx");
  const start = source.indexOf("function TrashPage");
  const end = source.indexOf("function OrdersPage", start);
  const block = source.slice(start, end);
  assert.match(block, /await deleteIds\(\[order\.id\]/);
  assert.doesNotMatch(block, /submit\("deleteOrderPermanently"/);
});

test("la suppression groupée crée une seule sauvegarde avant tout le lot", async () => {
  const route = await read("app/api/data/route.ts");
  const start = route.indexOf('payload.action === "deleteOrdersPermanentlyBulk"');
  const end = route.indexOf('payload.action === "updateCustomer"', start);
  assert.ok(start >= 0 && end > start);
  const block = route.slice(start, end);
  const backupCalls = block.match(/createDailyBackup\(/g) || [];
  assert.equal(backupCalls.length, 1);
  assert.match(block, /Avant suppression groupée/);
  assert.match(block, /database\.batch\(statements\)/);
});

test("la suppression groupée refuse les commandes de règlement transporteur avant mutation", async () => {
  const route = await read("app/api/data/route.ts");
  const start = route.indexOf('payload.action === "deleteOrdersPermanentlyBulk"');
  const end = route.indexOf('payload.action === "updateCustomer"', start);
  const block = route.slice(start, end);
  assert.match(block, /carrier_settlement_orders/);
  assert.match(block, /ne peut pas être supprimée définitivement/);
  assert.ok(block.indexOf("carrier_settlement_orders") < block.indexOf("createDailyBackup"));
});

test("la suppression groupée conserve la sécurité stock des anciennes lignes", async () => {
  const route = await read("app/api/data/route.ts");
  const start = route.indexOf('payload.action === "deleteOrdersPermanentlyBulk"');
  const end = route.indexOf('payload.action === "updateCustomer"', start);
  const block = route.slice(start, end);
  assert.match(block, /if \(order\.stockDeducted && order\.productId\)/);
  assert.match(block, /stock_quantity = stock_quantity \+ \?/);
  assert.match(block, /Réintégration avant suppression définitive/);
});

test("les commandes et clients orphelins sont nettoyés en lot", async () => {
  const route = await read("app/api/data/route.ts");
  const start = route.indexOf('payload.action === "deleteOrdersPermanentlyBulk"');
  const end = route.indexOf('payload.action === "updateCustomer"', start);
  const block = route.slice(start, end);
  assert.match(block, /DELETE FROM orders WHERE deleted_at IS NOT NULL AND id IN/);
  assert.match(block, /DELETE FROM customers/);
  assert.match(block, /NOT EXISTS \(SELECT 1 FROM orders WHERE orders\.customer_id = customers\.id\)/);
});

test("la sélection de corbeille reste adaptée au mobile", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /trash-selection-bar/);
  assert.match(css, /trash-row-selector/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*trash-selection-bar/);
});
