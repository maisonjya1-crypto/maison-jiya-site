import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const fastCatalog = await readFile(new URL("db/storefront-public-fast.ts", root), "utf8");
const client = await readFile(new URL("app/boutique/storefront-client-v3.tsx", root), "utf8");
const styles = await readFile(new URL("app/boutique/storefront-v3.css", root), "utf8");

test("le catalogue public rapide expose toutes les photos galerie des produits et offres", () => {
  assert.match(fastCatalog, /OR m\.kind = 'gallery'/);
  assert.doesNotMatch(fastCatalog, /SELECT m2\.id[\s\S]*LIMIT 1/);
  assert.match(fastCatalog, /new Map<string, string\[\]>/);
  assert.match(fastCatalog, /mediaByOwner\.get\(`product:\$\{product\.id\}`\) \|\| \[\]/);
  assert.match(fastCatalog, /mediaByOwner\.get\(`offer:\$\{offer\.id\}`\) \|\| \[\]/);
  assert.match(fastCatalog, /\.slice\(0, 6\)/);
  assert.match(fastCatalog, /images,/);
});

test("tous les types de cartes ouvrent la même galerie publique", () => {
  assert.match(client, /function ProductCard\(\{ item, lang, t, add, open/);
  assert.match(client, /function ProductGalleryModal/);
  assert.match(client, /selectedItem/);
  assert.match(client, /open=\{openItem\}/);
  assert.match(client, /item\.images\.length > 1/);
  assert.match(client, /storefront-v3-product-thumbnails/);
  assert.match(client, /onTouchStart/);
  assert.match(client, /onTouchEnd/);
  assert.match(client, /ArrowLeft/);
  assert.match(client, /ArrowRight/);
  assert.match(client, /Escape/);
});

test("la galerie conserve l'ajout panier et reste responsive", () => {
  assert.match(client, /storefront-v3-product-dialog-add/);
  assert.match(client, /onClick=\{\(\) => add\(item\)\}/);
  assert.match(styles, /storefront-v3-product-dialog/);
  assert.match(styles, /storefront-v3-gallery-arrow/);
  assert.match(styles, /storefront-v3-product-thumbnails/);
  assert.match(styles, /@media\(max-width:760px\)/);
});
