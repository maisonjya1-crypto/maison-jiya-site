import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("la recherche du bandeau est limitée au bloc actif", async () => {
  const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(dashboard, /Rechercher partout/);
  assert.doesNotMatch(dashboard, /Recherche générale/);
  assert.match(dashboard, /function SectionSearch/);
  assert.match(dashboard, /placeholder=\{\`Rechercher dans \$\{active\}…\`\}/);
  assert.match(dashboard, /active === "Commandes"/);
  assert.match(dashboard, /active === "Produits"/);
  assert.match(dashboard, /active === "Colis"/);
  assert.match(dashboard, /active === "Clients"/);
  assert.match(dashboard, /active === "Achats"/);
  assert.match(dashboard, /active === "Publicités"/);
  assert.match(dashboard, /active === "Capital"/);
  assert.match(dashboard, /active === "Corbeille"/);
  assert.doesNotMatch(dashboard, /setActive\(result\.page\)/);
});

test("le changement de bloc recrée une recherche vide et indépendante", async () => {
  const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /<SectionSearch key=\{active\} active=\{active\}/);
});
