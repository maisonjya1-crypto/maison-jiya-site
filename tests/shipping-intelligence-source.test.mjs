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
  assert.match(dashboard, /nécessitera leurs accès API/);
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
