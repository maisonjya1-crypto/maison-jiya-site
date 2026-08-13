import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("les motifs de retour sont stockés et restaurables", async () => {
  const [schema, database, backups, migration] = await Promise.all([
    read("db/schema.ts"),
    read("db/index.ts"),
    read("db/backups.ts"),
    read("drizzle/0007_return_reasons_print_slip.sql"),
  ]);
  for (const source of [schema, database, backups, migration]) {
    assert.match(source, /return_reason|returnReason/);
    assert.match(source, /return_note|returnNote/);
  }
});

test("un retour exige un motif et conserve la règle de stock", async () => {
  const api = await read("app/api/data/route.ts");
  assert.match(api, /Choisissez le motif du retour/);
  assert.match(api, /Précisez le motif du retour/);
  assert.match(api, /stockCommittedStatuses = new Set\(\["Confirmée", "Expédiée", "En livraison", "Livrée", "Retour"\]\)/);
});

test("le bordereau est disponible depuis les commandes et les colis", async () => {
  const [dashboard, styles] = await Promise.all([
    read("app/dashboard-client.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(dashboard, /function PrintOrderSheet/);
  assert.match(dashboard, /Imprimer le bordereau/);
  assert.match(dashboard, /window\.print\(\)/);
  assert.match(dashboard, /name="returnReason"/);
  assert.match(styles, /@media print/);
  assert.match(styles, /@page order-slip \{ size:A5 portrait/);
});

test("Google Sheets exporte aussi les motifs de retour", async () => {
  const exportRoute = await read("app/api/backup/google-sheets/route.ts");
  assert.match(exportRoute, /Motif du retour/);
  assert.match(exportRoute, /Détail du retour/);
});
