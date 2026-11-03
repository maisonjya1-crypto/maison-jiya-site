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

test("la navigation privée est structurée en 7 rubriques métier avec onglets", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /menuGroups/);
  assert.match(dashboard, /Au quotidien/);
  assert.match(dashboard, /Gestion/);
  assert.match(dashboard, /Système/);
  assert.match(dashboard, /nav-group-label/);
  assert.match(dashboard, /section-tabs/);
});

test("le bandeau supérieur utilise des actions contextuelles et retire le faux filtre", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /sectionDescriptions/);
  assert.match(dashboard, /addActionLabels/);
  assert.match(dashboard, /Nouvelle commande/);
  assert.match(dashboard, /Nouveau produit/);
  assert.match(dashboard, /Nouveau bon de commande/);
  assert.match(dashboard, /Nouveau fournisseur/);
  assert.doesNotMatch(dashboard, /<button className="period-button">Toutes les données<\/button>/);
});

test("la navigation groupée reste compatible mobile", async () => {
  const css = await read("app/private-pro.css");
  assert.match(css, /\.nav-group,\n  \.app-shell \.nav-group-items \{\n    display:contents !important/);
  assert.match(css, /\.nav-group-label \{\n    display:none !important/);
});

test("chaque page du logiciel reste accessible depuis une rubrique du menu", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  const pages = JSON.parse(dashboard.match(/const navigation = (\[[^\]]+\]);/)[1]);
  const sectionsBlock = dashboard.slice(dashboard.indexOf("const menuSections = ["), dashboard.indexOf("const menuGroups = ["));
  const grouped = [...sectionsBlock.matchAll(/pages: (\[[^\]]+\])/g)].flatMap((match) => JSON.parse(match[1]));
  assert.deepEqual([...grouped].sort(), [...pages].sort(), "toutes les pages, une seule fois chacune");
});

test("l'accueil montre d'abord commandes à confirmer, colis en route et bénéfice du mois", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /className="today-grid"/);
  assert.match(dashboard, /Commandes à confirmer/);
  assert.match(dashboard, /Colis en route/);
  assert.match(dashboard, /Bénéfice du mois/);
  // Même calcul de bénéfice pour l'accueil et la page Rapports.
  assert.equal((dashboard.match(/periodProfit\(data, /g) || []).length, 2);
  assert.doesNotMatch(dashboard, /\[31, 38, 34, 43, 49/, "plus de courbe décorative inventée");
});
