import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("les blocs services et catégories sont rendus par le storefront dès le HTML initial", async () => {
  const v3 = await read("app/boutique/storefront-client-v3.tsx");
  const enhancement = await read("app/boutique/storefront-approved-design-enhancement.tsx");
  assert.match(v3, /<StorefrontReferenceAfterBrand/);
  assert.match(v3, /catalog=\{catalog\}/);
  assert.match(v3, /onMarketing=\{openMarketingTarget\}/);
  assert.match(enhancement, /export function StorefrontReferenceAfterBrand/);
  assert.match(enhancement, /className="storefront-reference-services"/);
  assert.match(enhancement, /className="storefront-reference-categories"/);
  assert.match(enhancement, /className="storefront-reference-after-brand"/);
  assert.doesNotMatch(enhancement, /document\.createElement\("div"\)/);
  assert.doesNotMatch(enhancement, /insertAdjacentElement\("afterend"/);
  assert.doesNotMatch(enhancement, /catalog\?reference=\$\{Date\.now\(\)\}/);
});

test("l'introduction conserve le même design sans masquer le contenu plusieurs secondes", async () => {
  const intro = await read("app/boutique/storefront-entrance.tsx");
  const css = await read("app/boutique/storefront-entrance.css");
  assert.match(intro, /setLeaving\(true\), 650/);
  assert.match(intro, /setVisible\(false\), 1050/);
  assert.match(css, /transform: scaleX\(0\);/);
  assert.match(css, /to \{ transform: scaleX\(1\); \}/);
});

test("les images des offres sous la couverture ne sont pas prioritaires", async () => {
  const storefront = await read("app/boutique/storefront-client-v3.tsx");
  const promotions = storefront.slice(storefront.indexOf('id="promotions"'), storefront.indexOf('id="catalogue"'));
  assert.match(promotions, /SafeImage src=\{promo\.imageUrl\}/);
  assert.doesNotMatch(promotions, /priority=\{index === 0\}/);
  assert.doesNotMatch(promotions, /priority=\{index < 2\}/);
});
