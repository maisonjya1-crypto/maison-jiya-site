import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("une vente magasin est encaissée sans colis ni frais de livraison", async () => {
  const [route, schema, dashboard] = await Promise.all([
    read("app/api/data/route.ts"),
    read("db/schema.ts"),
    read("app/dashboard-client.tsx"),
  ]);
  assert.match(schema, /fulfillmentType: text\("fulfillment_type"\).*default\("Livraison"\)/);
  assert.match(route, /selectedFulfillmentType === "Magasin physique"/);
  assert.match(route, /selectedPaymentStatus = isStoreSale \? "Encaissé"/);
  assert.match(route, /selectedShippingCost = isStoreSale \? 0/);
  assert.match(route, /selectedDispatchState = isStoreSale \? "Non requis"/);
  assert.match(dashboard, /Vente encaissée sur place/);
  assert.match(dashboard, /0 MAD de livraison/);
});

test("les ventes magasin ne sont jamais envoyées aux transporteurs", async () => {
  const [route, carriers, dashboard] = await Promise.all([
    read("app/api/data/route.ts"),
    read("db/carriers.ts"),
    read("app/dashboard-client.tsx"),
  ]);
  assert.match(route, /aucun colis ne doit être créé/);
  assert.match(carriers, /order\.fulfillmentType === "Magasin physique"/);
  assert.match(dashboard, /deliveryOrders = useMemo\(\(\) => orders\.filter/);
  assert.match(dashboard, /Les ventes magasin restent hors de cette page/);
});

test("Google Sheets distingue les ventes magasin et exclut celles-ci de Colis", async () => {
  const [exportRoute, backups] = await Promise.all([
    read("app/api/backup/google-sheets/route.ts"),
    read("db/backups.ts"),
  ]);
  assert.match(exportRoute, /"Mode de vente"/);
  assert.match(exportRoute, /row\.fulfillmentType !== "Magasin physique"/);
  assert.match(backups, /"fulfillment_type"/);
  assert.match(backups, /row\[column\] \?\? "Livraison"/);
});
