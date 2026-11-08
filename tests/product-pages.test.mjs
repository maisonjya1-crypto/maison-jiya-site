import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const { productSlug, productPath, parseProductSlug, slugifyName } = loadSource("lib/product-slug.ts");
const { pickCartSuggestion } = loadSource("lib/cart-suggestion.ts");

test("chaque produit et pack a une adresse lisible et stable", () => {
  assert.equal(slugifyName("Montre Acier — Cadran Vert Émeraude"), "montre-acier-cadran-vert-emeraude");
  assert.equal(productSlug({ kind: "product", id: 12, name: "Montre Acier Vert" }), "montre-acier-vert-12");
  assert.equal(productPath({ kind: "offer", id: 3, name: "Pack Duo" }), "/boutique/produit/pack-duo-pack-3");
  assert.equal(slugifyName("ساعة"), "article");
  assert.deepEqual(parseProductSlug("montre-acier-vert-12"), { kind: "product", id: 12 });
  assert.deepEqual(parseProductSlug("ancien-nom-pack-3"), { kind: "offer", id: 3 });
  assert.deepEqual(parseProductSlug("12"), { kind: "product", id: 12 });
  assert.equal(parseProductSlug("montre"), null);
  assert.equal(parseProductSlug("x-0"), null);
});

test("la page produit a son titre, sa description, son image de partage et ses données Google", () => {
  const page = read("app/boutique/produit/[slug]/page.tsx");
  assert.match(page, /export async function generateMetadata/);
  assert.match(page, /alternates: \{ canonical: url \}/);
  assert.match(page, /productStructuredData\(item, catalog\)/);
  assert.match(page, /robots: \{ index: false, follow: true \}/);
  const { productStructuredData } = loadSource("lib/storefront-structured-data.ts");
  const data = JSON.parse(productStructuredData({ id: 5, kind: "product", productCode: "MJ-5", name: "Bracelet <b>", category: "Bijoux", salePrice: 149, comparePrice: 0, badge: "", description: "", availability: "", available: true, lowStock: false, images: ["/api/storefront/media/9"] }, null));
  const product = data["@graph"][0];
  assert.equal(product.url, "https://maisonjiya.pages.dev/boutique/produit/bracelet-b-5");
  assert.equal(product.offers.price, "149.00");
  assert.equal(data["@graph"][1]["@type"], "BreadcrumbList");
});

test("la boutique relie chaque carte à sa page et la fenêtre rapide propose la page et le partage", () => {
  const client = read("app/boutique/storefront-client-v3.tsx");
  assert.match(client, /<a className="storefront-v3-product-title-button" href=\{productPath\(item\)\}/);
  assert.match(client, /\{variant === "dialog" && <a href=\{productPath\(item\)\}>\{p\.pageLink\}<\/a>\}/);
  assert.match(client, /navigator\.share/);
  assert.match(client, /const isProductPage = Boolean\(productKey\);/);
  assert.match(client, /<ProductDetail key=\{itemKey\(pageItem\)\} item=\{pageItem\}[^>]*variant="page" \/>/);
  assert.match(client, /pageCopy\[lang\]\.missing/);
});

test("le panier propose l'article qui déclenche la promo, sinon un article d'une autre catégorie", () => {
  const items = [
    { kind: "product", id: 1, category: "Montres", salePrice: 300, available: true, badge: "" },
    { kind: "product", id: 2, category: "Bijoux", salePrice: 120, available: true, badge: "" },
    { kind: "product", id: 3, category: "Bijoux", salePrice: 90, available: true, badge: "Best seller" },
    { kind: "product", id: 4, category: "Portefeuilles", salePrice: 150, available: false, badge: "Best seller" },
    { kind: "offer", id: 9, category: "Packs", salePrice: 400, available: true, badge: "" },
  ];
  const promo = { id: 1, name: "2e -50", code: "", description: "", ruleType: "second_item_percent", percentValue: 50, minimumQuantity: 2, buyQuantity: 0, freeQuantity: 0, eligibleCategories: ["Montres", "Bijoux"], isActive: true, priority: 1 };
  const lines = [{ kind: "product", category: "Montres", quantity: 1, unitPrice: 300 }];
  const withPromo = pickCartSuggestion(items, ["p:1"], lines, [promo], false);
  assert.equal(withPromo.reason, "promo");
  assert.equal(withPromo.item.id, 3);
  const applied = pickCartSuggestion(items, ["p:1"], lines, [promo], true);
  assert.equal(applied.reason, "complete");
  assert.notEqual(applied.item.category, "Montres");
  assert.equal(pickCartSuggestion(items, [], [], [promo], false), null);
  const everything = pickCartSuggestion(items, ["p:1", "p:2", "p:3"], lines, [], false);
  assert.equal(everything, null);
});

test("le plan du site liste les pages produits", () => {
  const worker = read("worker/index.ts");
  assert.match(worker, /return \[\.\.\.catalog\.offers, \.\.\.catalog\.products\]\.map\(productPath\);/);
});
