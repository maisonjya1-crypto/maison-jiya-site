import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("les produits sont archivés sans suppression destructive", async () => {
  const [route, schema, runtime, backups, dashboard] = await Promise.all([
    read("app/api/data/route.ts"), read("db/schema.ts"), read("db/index.ts"), read("db/backups.ts"), read("app/dashboard-client.tsx"),
  ]);
  assert.match(schema, /archivedAt: text\("archived_at"\)/);
  assert.match(schema, /products_archived_at_idx/);
  assert.match(runtime, /ALTER TABLE products ADD COLUMN archived_at TEXT/);
  assert.match(backups, /"archived_at", "archived_by_user_id"/);
  assert.match(route, /payload\.action === "archiveProduct" \|\| payload\.action === "deleteProduct"/);
  assert.match(route, /SET archived_at = \?, archived_by_user_id = \?/);
  assert.match(route, /stock_quantity = 0/);
  assert.match(route, /received_quantity < quantity/);
  assert.match(route, /UPDATE storefront_product_settings SET is_visible = 0/);
  assert.match(route, /UPDATE storefront_offers SET is_active = 0/);
  const archiveBlock = route.slice(route.indexOf('payload.action === "archiveProduct"'), route.indexOf('payload.action === "addStockMovement"'));
  assert.doesNotMatch(archiveBlock, /db\.delete\(products\)/);
  assert.match(route, /payload\.action === "restoreProduct"/);
  assert.match(dashboard, /Archives \(\$\{archivedProducts\.length\}\)/);
  assert.match(dashboard, /Restaurer dans le catalogue/);
});

test("un produit archivé est exclu des nouvelles opérations et de la boutique", async () => {
  const [route, multi, publicOrders, publicCatalog, fastCatalog, cms, admin] = await Promise.all([
    read("app/api/data/route.ts"), read("app/api/orders/multi/route.ts"), read("app/api/storefront/orders/route.ts"),
    read("db/storefront-public.ts"), read("db/storefront-public-fast.ts"), read("db/storefront-cms.ts"), read("app/api/storefront/admin/route.ts"),
  ]);
  assert.match(route, /where\(isNull\(products\.archivedAt\)\)/);
  assert.match(route, /Restaurez-le avant de le mettre à jour par import/);
  assert.match(multi, /archived_at IS NULL/);
  assert.match(publicOrders, /p\.archived_at IS NULL/);
  assert.match(publicCatalog, /p\.archived_at IS NULL/);
  assert.match(fastCatalog, /p\.archived_at IS NULL/);
  assert.match(publicCatalog, /item\.archivedAt/);
  assert.match(fastCatalog, /item\.archivedAt/);
  assert.match(cms, /archived_at IS NULL/);
  assert.match(admin, /archived_at IS NULL/);
});

test("la restauration ne republie pas silencieusement la boutique ou les packs", async () => {
  const route = await read("app/api/data/route.ts");
  const start = route.indexOf('payload.action === "restoreProduct"');
  const end = route.indexOf('payload.action === "addStockMovement"', start);
  const block = route.slice(start, end);
  assert.match(block, /archivedAt: null, archivedByUserId: null/);
  assert.match(block, /boutique et les packs restent désactivés/);
  assert.doesNotMatch(block, /is_visible = 1/);
  assert.doesNotMatch(block, /is_active = 1/);
});
