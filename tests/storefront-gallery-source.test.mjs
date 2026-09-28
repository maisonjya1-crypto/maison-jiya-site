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
  assert.doesNotMatch(styles, /storefront-v3-product-gallery-main\{aspect-ratio:1\/1\.08\}/);
  assert.match(styles, /storefront-v3-product-gallery-main\{[^}]*aspect-ratio:auto/);
  assert.match(styles, /storefront-v3-product-gallery-main>img\{[^}]*width:100%[^}]*height:auto/);
});


test("le correctif final garde le titre lisible et sépare Voir du bouton panier", async () => {
  const layout = await readFile(new URL("../app/boutique/layout.tsx", import.meta.url), "utf8");
  const hotfix = await readFile(new URL("../app/boutique/storefront-gallery-hotfix.css", import.meta.url), "utf8");

  assert.match(layout, /import "\.\/storefront-gallery-hotfix\.css";/);
  assert.ok(
    layout.indexOf('import "./storefront-gallery-hotfix.css";') > layout.indexOf('import "./storefront-entrance.css";'),
    "Le correctif galerie doit être chargé en dernier."
  );
  assert.match(hotfix, /storefront-v3-product-title-button/);
  assert.match(hotfix, /background:transparent!important/);
  assert.match(hotfix, /storefront-v3-view-product/);
  assert.match(hotfix, /background:#fff!important/);
  assert.match(hotfix, /color:#111!important/);
  assert.match(hotfix, /storefront-v3-add-product/);
  assert.match(hotfix, /background:#111!important/);
  assert.match(hotfix, /color:#fff!important/);
  assert.match(hotfix, /@media\(max-width:760px\)/);
  assert.match(hotfix, /storefront-v3-product-gallery-main/);
  assert.match(hotfix, /aspect-ratio:auto!important/);
  assert.match(hotfix, /height:auto!important/);
  assert.match(hotfix, /storefront-v3-product-gallery-main>img/);
  assert.match(hotfix, /width:100%!important/);
  assert.match(hotfix, /@media \(display-mode: standalone\) and \(max-width:760px\)/);
  assert.match(hotfix, /safe-area-inset-top/);
  assert.match(hotfix, /storefront-v3-overlay/);
  assert.match(hotfix, /max-height:calc\(100dvh - env\(safe-area-inset-top,0px\) - env\(safe-area-inset-bottom,0px\)\)!important/);
});
