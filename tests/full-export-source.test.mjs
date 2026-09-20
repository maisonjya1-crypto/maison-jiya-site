import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const route = await readFile(new URL("app/api/export/route.ts", root), "utf8");
const exporter = await readFile(new URL("db/data-export.ts", root), "utf8");
const dashboard = await readFile(new URL("app/dashboard-client.tsx", root), "utf8");

test("l’export complet exige une session administrateur et interdit le cache", () => {
  assert.match(route, /getAuthenticatedUser/);
  assert.match(route, /user\.role !== "admin"/);
  assert.match(route, /private, no-store/);
});

test("JSON et archive CSV couvrent les données métier et la boutique", () => {
  assert.match(exporter, /database\.batch/);
  for (const table of ["orders", "customers", "products", "stock_movements", "purchases", "capital_ledger", "storefront_offers", "storefront_media"]) {
    assert.match(exporter, new RegExp(table));
  }
  assert.match(route, /format === "json"/);
  assert.match(route, /format === "csv"/);
  assert.match(exporter, /buildCsvZip/);
  assert.match(exporter, /0x06054b50/);
});

test("les secrets, mots de passe et sessions ne sont jamais exportés", () => {
  assert.match(exporter, /key NOT LIKE 'security_%'/);
  assert.doesNotMatch(exporter, /password_hash|password_salt|user_sessions|token_hash/);
});

test("les deux exports sont accessibles depuis les sauvegardes privées", () => {
  assert.match(dashboard, /\/api\/export\?format=json/);
  assert.match(dashboard, /\/api\/export\?format=csv/);
});
