import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const storefront = fs.readFileSync("app/boutique/storefront-client-v3.tsx", "utf8");
const dashboard = fs.readFileSync("app/dashboard-client.tsx", "utf8");
const globals = fs.readFileSync("app/globals.css", "utf8");

test("saved storefront language and cart are restored before persistence starts", () => {
  assert.match(storefront, /const \[preferencesLoaded, setPreferencesLoaded\] = useState\(false\)/);
  assert.match(storefront, /localStorage\.getItem\("maison-jiya-language-v3"\)/);
  assert.match(storefront, /localStorage\.getItem\("maison-jiya-cart-v3"\)/);
  assert.match(storefront, /setPreferencesLoaded\(true\)/);
  assert.ok((storefront.match(/if \(!preferencesLoaded\) return;/g) || []).length >= 2);
});
test("the private dashboard stays behind an authentication loading gate", () => {
  assert.match(dashboard, /const \[authChecking, setAuthChecking\] = useState\(true\)/);
  assert.match(dashboard, /if \(authChecking\) \{/);
  assert.match(dashboard, /auth-shell auth-loading-shell/);
  assert.match(globals, /\.auth-loading-shell \{ grid-template-columns:1fr; place-items:center; \}/);
});
