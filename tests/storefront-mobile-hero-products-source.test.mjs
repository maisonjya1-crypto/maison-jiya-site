import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("app/boutique/page.tsx", "utf8");
const layout = fs.readFileSync("app/boutique/layout.tsx", "utf8");
const mobileProducts = fs.readFileSync("app/boutique/storefront-mobile-hero-products.tsx", "utf8");
const mobileCss = fs.readFileSync("app/boutique/storefront-mobile-hero-products.css", "utf8");
const menSvg = fs.readFileSync("public/storefront/brand/hero-men-mobile.svg", "utf8");
const womenSvg = fs.readFileSync("public/storefront/brand/hero-women-mobile.svg", "utf8");

test("mobile hero uses dedicated portrait product compositions", () => {
  assert.match(page, /StorefrontMobileHeroProducts/);
  assert.match(layout, /storefront-mobile-hero-products\.css/);
  assert.match(mobileProducts, /hero-men-mobile\.svg/);
  assert.match(mobileProducts, /hero-women-mobile\.svg/);
  assert.match(mobileProducts, /max-width: 760px/);
  assert.match(mobileCss, /data-mobile-hero-product='true'/);
  assert.match(mobileCss, /height: 100%/);
  assert.match(mobileCss, /object-fit: cover/);
  assert.doesNotMatch(menSvg, />Maison Jiya</);
  assert.doesNotMatch(womenSvg, />Maison Jiya</);
  assert.match(menSvg, /portefeuille|wallet|JIYA/i);
  assert.match(womenSvg, /pochette|bijoux|JIYA/i);
});
