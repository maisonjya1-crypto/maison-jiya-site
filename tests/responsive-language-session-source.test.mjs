import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const storefront = fs.readFileSync("app/boutique/storefront-client-v3.tsx", "utf8");
const enhancement = fs.readFileSync("app/boutique/storefront-approved-design-enhancement.tsx", "utf8");
const interactions = fs.readFileSync("app/boutique/storefront-cover-interactions.tsx", "utf8");
const dashboard = fs.readFileSync("app/dashboard-client.tsx", "utf8");
const globals = fs.readFileSync("app/globals.css", "utf8");
const responsive = fs.readFileSync("app/boutique/storefront-responsive-neutral.css", "utf8");
const adaptiveHero = fs.readFileSync("app/boutique/storefront-responsive-neutral-hotfix.css", "utf8");

test("saved storefront language and cart are restored before persistence starts", () => {
  assert.match(storefront, /const \[preferencesLoaded, setPreferencesLoaded\] = useState\(false\)/);
  assert.match(storefront, /localStorage\.getItem\("maison-jiya-language-v3"\)/);
  assert.match(storefront, /localStorage\.getItem\("maison-jiya-cart-v3"\)/);
  assert.match(storefront, /setPreferencesLoaded\(true\)/);
  assert.ok((storefront.match(/if \(!preferencesLoaded\) return;/g) || []).length >= 2);
});

test("the visible cover follows FR, Arabic and English language changes", () => {
  assert.match(enhancement, /new MutationObserver\(syncLanguage\)/);
  assert.match(enhancement, /attributeFilter: \["lang"\]/);
  assert.match(interactions, /عرض الساعات الرجالية/);
  assert.match(interactions, /View men’s watches/);
  assert.match(interactions, /new MutationObserver\(syncLabels\)/);
});

test("the private dashboard stays behind an authentication loading gate", () => {
  assert.match(dashboard, /const \[authChecking, setAuthChecking\] = useState\(true\)/);
  assert.match(dashboard, /if \(authChecking\) \{/);
  assert.match(dashboard, /auth-shell auth-loading-shell/);
  assert.match(globals, /\.auth-loading-shell \{ grid-template-columns:1fr; place-items:center; \}/);
});

test("the final mobile hero rule has one unambiguous positioning mode", () => {
  assert.doesNotMatch(responsive, /position:fixed!important;position:absolute!important/);
  assert.match(responsive, /\.mj-hero-side-title\{position:absolute!important/);
});

test("the cover adapts to viewport height, orientation and tablet shapes", () => {
  assert.match(adaptiveHero, /min\(42vw, 72svh\)/);
  assert.match(adaptiveHero, /min-width: 761px/);
  assert.match(adaptiveHero, /orientation: portrait/);
  assert.match(adaptiveHero, /orientation: landscape/);
  assert.match(adaptiveHero, /max-height: 560px/);
  assert.match(adaptiveHero, /calc\(100svh - 145px\)/);
  assert.doesNotMatch(adaptiveHero, /height:\s*480px\s*!important/);
  assert.doesNotMatch(adaptiveHero, /bottom:calc\(100%/);
});
