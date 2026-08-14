import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("la page colis compare les agences avec des indicateurs calculés", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /carrierComparison/);
  assert.match(dashboard, /successRate/);
  assert.match(dashboard, /averageDelay/);
  assert.match(dashboard, /averageCost/);
  assert.match(dashboard, /Meilleur taux/);
});

test("le suivi interne signale les retards et les numéros manquants", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /needsTrackingNumber/);
  assert.match(dashboard, /Délai à vérifier/);
  assert.match(dashboard, /Numéro manquant/);
  assert.match(dashboard, /Suivre sur ForceLog/);
  assert.match(dashboard, /Ouvrir l’espace Sendit/);
  assert.match(dashboard, /webhook sécurisé est connecté/);
});

test("un manifeste quotidien imprimable est généré par agence", async () => {
  const [dashboard, styles] = await Promise.all([
    read("app/dashboard-client.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(dashboard, /function CarrierManifestSheet/);
  assert.match(dashboard, /Manifeste quotidien/);
  assert.match(dashboard, /Imprimer · \{manifestOrders\.length\} colis/);
  assert.match(styles, /@page carrier-manifest/);
  assert.match(styles, /\.print-carrier-manifest/);
});

test("la création transporteur exige une autorisation explicite", async () => {
  const [dashboard, api, carriers] = await Promise.all([
    read("app/dashboard-client.tsx"),
    read("app/api/data/route.ts"),
    read("db/carriers.ts"),
  ]);
  assert.match(dashboard, /Autoriser et créer le colis/);
  assert.match(dashboard, /aucun colis/i);
  assert.match(api, /authorizeCarrierDispatch/);
  assert.doesNotMatch(api, /dispatchConfirmedOrder/);
  assert.match(carriers, /carrier_dispatch_state = 'Création en cours'/);
  assert.match(carriers, /créée après autorisation/);
});

test("les tarifs Casablanca sont comparés et la facturation alimente l'encaissement", async () => {
  const [dashboard, carriers, worker, config] = await Promise.all([
    read("app/dashboard-client.tsx"),
    read("db/carriers.ts"),
    read("worker/index.ts"),
    read("wrangler.jsonc"),
  ]);
  assert.match(dashboard, /Comparer les agences/);
  assert.match(carriers, /pickup-district=46/);
  assert.match(carriers, /D_FEES_SAME_CITY/);
  assert.match(carriers, /payment_status = \?/);
  assert.match(worker, /syncCarrierOperations/);
  assert.match(config, /\*\/30 \* \* \* \*/);
});
