import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("la remise à zéro conserve produits, quantités, mouvements et inventaires", async () => {
  const backups = await readFile(new URL("../db/backups.ts", import.meta.url), "utf8");
  const start = backups.indexOf("export async function resetBusinessValuesPreservingStock");
  const end = backups.indexOf("export async function runDailyMaintenance", start);
  assert.ok(start >= 0 && end > start, "fonction de remise à zéro introuvable");
  const reset = backups.slice(start, end);

  assert.match(reset, /createDailyBackup\(database, "Avant remise à zéro des valeurs", true\)/);
  assert.match(reset, /UPDATE stock_movements SET order_id = NULL/);
  assert.match(reset, /DELETE FROM orders/);
  assert.match(reset, /DELETE FROM customers/);
  assert.match(reset, /DELETE FROM purchases/);
  assert.match(reset, /DELETE FROM ad_performance/);
  assert.match(reset, /DELETE FROM capital_ledger/);
  assert.match(reset, /DELETE FROM order_status_history/);
  assert.match(reset, /DELETE FROM carrier_events/);

  assert.doesNotMatch(reset, /DELETE FROM products/);
  assert.doesNotMatch(reset, /UPDATE products/);
  assert.doesNotMatch(reset, /DELETE FROM stock_movements/);
  assert.doesNotMatch(reset, /DELETE FROM inventory_counts/);
  assert.doesNotMatch(reset, /UPDATE inventory_counts/);
});

test("la remise à zéro est réservée au compte principal avec confirmation forte", async () => {
  const [route, dashboard] = await Promise.all([
    readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
  ]);

  const routeStart = route.indexOf('payload.action === "resetBusinessValues"');
  const routeEnd = route.indexOf('payload.action === "createBackupNow"', routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, "action resetBusinessValues introuvable");
  const action = route.slice(routeStart, routeEnd);

  assert.match(action, /!access\.isOwner/);
  assert.match(action, /REINITIALISER/);
  assert.match(action, /resetBusinessValuesPreservingStock/);
  assert.match(action, /markGoogleSheetsSyncPending/);

  assert.match(dashboard, /Remettre les valeurs à zéro/);
  assert.match(dashboard, /Tapez REINITIALISER pour confirmer/);
  assert.match(dashboard, /Produits, quantités, mouvements de stock et inventaires seront conservés/);
});
