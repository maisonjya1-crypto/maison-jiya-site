import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("la production applique les migrations D1 avant le Worker", async () => {
  const [workflow, wrangler] = await Promise.all([
    read(".github/workflows/deploy-cloudflare.yml"),
    read("wrangler.jsonc"),
  ]);
  const migration = workflow.indexOf("d1 migrations apply maison-jiya-pilotage-db --remote");
  const deploy = workflow.indexOf("- name: Deploy Worker");
  assert.ok(migration >= 0 && deploy > migration);
  assert.match(wrangler, /"migrations_dir": "migrations"/);
  assert.match(wrangler, /"migrations_table": "d1_migrations"/);
});

test("le baseline D1 est idempotent et couvre le schéma courant", async () => {
  const sql = await read("migrations/0000_production_baseline.sql");
  for (const table of ["users","orders","products","purchases","expenses","stock_movements","google_sheets_sync_state","push_subscriptions","storefront_product_settings"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
  }
  assert.match(sql, /items_json TEXT DEFAULT '\[\]' NOT NULL/);
  assert.match(sql, /pack_name TEXT DEFAULT '' NOT NULL/);
  assert.match(sql, /d1_schema_baseline/);
  assert.doesNotMatch(sql, /ALTER TABLE/i);
});

test("le DDL runtime historique est isolé et gelé", async () => {
  const [index, compat, guard] = await Promise.all([
    read("db/index.ts"),
    read("db/schema-compat.ts"),
    read("scripts/check-d1-migration-discipline.mjs"),
  ]);
  assert.doesNotMatch(index, /ALTER TABLE|CREATE TABLE IF NOT EXISTS/);
  assert.match(index, /ensureLegacySchemaCompatibility/);
  assert.match(compat, /Filet de compatibilité historique/);
  assert.match(guard, /Nouveau DDL runtime interdit/);
  assert.match(guard, /drizzle\/ est figé après 0020/);
});
