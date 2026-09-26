import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("les inventaires physiques sont persistés et inclus dans les sauvegardes", async () => {
  const [schema, database, backups, migration] = await Promise.all([
    read("db/schema.ts"),
    read("db/index.ts"),
    read("db/backups.ts"),
    read("drizzle/0008_inventory_profitability.sql"),
  ]);
  for (const source of [schema, database, backups, migration]) {
    assert.match(source, /inventory_counts|inventoryCounts/);
    assert.match(source, /physical_quantity|physicalQuantity/);
    assert.match(source, /system_quantity|systemQuantity/);
  }
  assert.match(backups, /inventoryCounts\?: SnapshotRow\[\]/);
});

test("un comptage corrige le stock et crée un mouvement d’inventaire traçable", async () => {
  const [api, dashboard] = await Promise.all([
    read("app/api/data/route.ts"),
    read("app/dashboard-client.tsx"),
  ]);
  assert.match(api, /payload\.action === "countInventory"/);
  assert.match(api, /expectedSystemQuantity/);
  assert.match(api, /Number\.isInteger\(physicalRaw\)/);
  assert.match(api, /stock_quantity = \?/);
  assert.match(api, /INSERT INTO inventory_counts/);
  assert.match(api, /UPDATE products/);
  assert.match(api, /INSERT INTO stock_movements/);
  assert.match(api, /inventoryResults\[0\]/);
  assert.match(api, /Aucun inventaire n’a été enregistré/);
  assert.match(api, /Inventaire \+" : "Inventaire -/);
  assert.match(api, /Un ajustement d’inventaire ne peut pas être supprimé/);
  assert.match(dashboard, /expectedSystemQuantity: String\(product\.stockQuantity\)/);
  assert.match(dashboard, /Number\.isInteger\(rawQuantity\)/);
});

test("la page produits calcule le bénéfice et la marge depuis les commandes livrées", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /Bénéfice par produit/);
  assert.match(dashboard, /order\.status === "Livrée"/);
  assert.match(dashboard, /order\.productCost \+ order\.shippingCost \+ order\.adCost \+ order\.fees/);
  assert.match(dashboard, /profit \/ revenue/);
  assert.match(dashboard, /function InventoryCountModal/);
  assert.match(dashboard, /Historique des inventaires/);
});
