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


test("une vente magasin peut être anonyme sans nom, téléphone ni ville", async () => {
  const [route, dashboard] = await Promise.all([
    read("app/api/data/route.ts"),
    read("app/dashboard-client.tsx"),
  ]);
  assert.match(route, /STORE_ANONYMOUS_PHONE/);
  assert.match(route, /STORE_ANONYMOUS_NAME = "Client magasin \(anonyme\)"/);
  assert.match(route, /anonymousStoreSale = isStoreSale && !providedName && !providedPhone/);
  assert.match(route, /INSERT OR IGNORE INTO customers/);
  assert.match(route, /customers: customerRows\.filter\(\(customer\) => customer\.phone !== STORE_ANONYMOUS_PHONE\)/);
  assert.match(dashboard, /Nom de la cliente \(facultatif\)/);
  assert.match(dashboard, /Téléphone \(facultatif\)/);
  assert.match(dashboard, /Ville \(facultatif\)/);
  assert.match(dashboard, /Client magasin \(anonyme\)/);
});

test("si une identité est saisie en magasin, nom et téléphone vont ensemble", async () => {
  const route = await read("app/api/data/route.ts");
  assert.match(route, /Boolean\(providedName\) !== Boolean\(providedPhone\)/);
  assert.match(route, /renseignez le nom ET le téléphone/);
  assert.match(route, /providedPhoneRaw && !providedPhone/);
});

test("la livraison garde nom téléphone ville et adresse obligatoires", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /Nom de la cliente \*/);
  assert.match(dashboard, /Téléphone \*/);
  assert.match(dashboard, /Ville de livraison \*/);
  assert.match(dashboard, /Adresse de livraison \*/);
});

test("le placeholder interne d'une vente anonyme n'apparait pas dans les exports clients", async () => {
  const exportRoute = await read("app/api/backup/google-sheets/route.ts");
  assert.match(exportRoute, /STORE_ANONYMOUS_PHONE/);
  assert.match(exportRoute, /filter\(\(customer\) => customer\.phone !== STORE_ANONYMOUS_PHONE\)/);
  assert.match(exportRoute, /row\.phone === STORE_ANONYMOUS_PHONE \? "" : row\.phone/);
});


test("la route multi-produits accepte aussi une vente magasin anonyme", async () => {
  const route = await read("app/api/orders/multi/route.ts");
  assert.match(route, /STORE_ANONYMOUS_PHONE/);
  assert.match(route, /STORE_ANONYMOUS_NAME = "Client magasin \(anonyme\)"/);
  assert.match(route, /anonymousStoreSale = isStoreSale && !providedCustomerName && !providedPhone/);
  assert.match(route, /INSERT OR IGNORE INTO customers/);
  assert.doesNotMatch(route, /if \(!phone\) return Response\.json\(\{ error: moroccanPhoneHelp \}/);
});

test("la route multi-produits garde le téléphone obligatoire pour une livraison", async () => {
  const route = await read("app/api/orders/multi/route.ts");
  assert.match(route, /if \(!isStoreSale && !providedPhone\)/);
  assert.match(route, /Cliente, téléphone, ville et adresse sont obligatoires/);
});
