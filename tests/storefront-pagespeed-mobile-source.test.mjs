import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("le catalogue SSR est partagé avec l'habillage au lieu de le télécharger deux fois", async () => {
  const page = await read("app/boutique/page.tsx");
  const enhancement = await read("app/boutique/storefront-approved-design-enhancement.tsx");
  assert.match(page, /StorefrontApprovedDesignEnhancement initialCatalog=\{initialCatalog\}/);
  assert.match(enhancement, /useState<StorefrontCatalog \| null>\(initialCatalog\)/);
  assert.match(enhancement, /if \(initialCatalog\) return;/);
  assert.doesNotMatch(enhancement, /catalog\?reference=\$\{Date\.now\(\)\}/);
});

test("l'introduction conserve le même design sans masquer le contenu plusieurs secondes", async () => {
  const intro = await read("app/boutique/storefront-entrance.tsx");
  const css = await read("app/boutique/storefront-entrance.css");
  assert.match(intro, /setLeaving\(true\), 650/);
  assert.match(intro, /setVisible\(false\), 1050/);
  assert.match(css, /transform: scaleX\(0\);/);
  assert.match(css, /to \{ transform: scaleX\(1\); \}/);
  assert.doesNotMatch(css, /to \{ width: min\(270px, 56vw\); \}/);
});

test("les images des offres situées sous la couverture ne sont plus chargées en priorité", async () => {
  const storefront = await read("app/boutique/storefront-client-v3.tsx");
  const promotions = storefront.slice(storefront.indexOf('id="promotions"'), storefront.indexOf("id=\"catalogue\""));
  assert.match(promotions, /SafeImage src=\{promo\.imageUrl\}/);
  assert.doesNotMatch(promotions, /priority=\{index === 0\}/);
  assert.doesNotMatch(promotions, /priority=\{index < 2\}/);
  assert.match(storefront, /SafeImage src=\{catalog\.heroImageUrl\}[^>]*priority/);
});
