import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("le site privé charge la finition professionnelle sans toucher à la boutique", async () => {
  const [page, css] = await Promise.all([
    read("app/page.tsx"),
    read("app/private-pro.css"),
  ]);
  assert.match(page, /import "\.\/private-pro\.css"/);
  assert.match(css, /\.app-shell/);
  assert.match(css, /\.auth-shell/);
  assert.doesNotMatch(css, /\.storefront/);
  assert.doesNotMatch(css, /\.boutique/);
});

test("la navigation privée est structurée en groupes métier", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /navigationGroups/);
  assert.match(dashboard, /Opérations/);
  assert.match(dashboard, /Pilotage/);
  assert.match(dashboard, /Système/);
  assert.match(dashboard, /nav-group-label/);
});

test("le bandeau supérieur utilise des actions contextuelles et retire le faux filtre", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /sectionDescriptions/);
  assert.match(dashboard, /addActionLabels/);
  assert.match(dashboard, /Nouvelle commande/);
  assert.match(dashboard, /Nouveau produit/);
  assert.match(dashboard, /Nouvel achat/);
  assert.doesNotMatch(dashboard, /<button className="period-button">Toutes les données<\/button>/);
});

test("la navigation groupée reste compatible mobile", async () => {
  const css = await read("app/private-pro.css");
  assert.match(css, /\.nav-group,\n  \.app-shell \.nav-group-items \{\n    display:contents !important/);
  assert.match(css, /\.nav-group-label \{\n    display:none !important/);
});
