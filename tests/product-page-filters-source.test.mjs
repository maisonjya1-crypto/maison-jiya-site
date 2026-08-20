import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("les trois longues sections produits sont repliables indépendamment", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /<details className="panel product-disclosure product-profit-panel">/);
  assert.match(dashboard, /<details className="panel product-disclosure product-catalog-panel">/);
  assert.match(dashboard, /<details className="panel product-disclosure stock-history">/);
  assert.match(dashboard, /Bénéfice par produit/);
  assert.match(dashboard, /Catalogue & stock/);
  assert.match(dashboard, /Derniers mouvements/);
});

test("la rentabilité et le catalogue ont une recherche par nom ou ID et un filtre catégorie", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /function ProductFilterBar/);
  assert.match(dashboard, /placeholder="Nom ou ID du produit…"/);
  assert.match(dashboard, /Toutes les catégories/);
  assert.match(dashboard, /product\.name} \${product\.productCode/);
  assert.match(dashboard, /product\.category === category/);
  assert.match(dashboard, /filteredProfitability\.map/);
  assert.match(dashboard, /filteredProducts\.map/);
  assert.equal((dashboard.match(/<ProductFilterBar/g) || []).length, 2);
});

test("les contrôles restent utilisables sur mobile", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.product-disclosure-summary/);
  assert.match(css, /\.product-filter-bar/);
  assert.match(css, /\.product-filter-bar\{grid-template-columns:1fr/);
  assert.match(css, /\.product-search-field input,.product-category-filter select\{min-height:46px/);
});
