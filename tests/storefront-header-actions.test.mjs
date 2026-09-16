import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../app/boutique/layout.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/boutique/storefront-header-actions-clarity.css", import.meta.url), "utf8");

test("la zone contact et panier du header utilise une capsule blanche dédiée", () => {
  assert.match(layout, /storefront-header-actions-clarity\.css/);
  assert.match(css, /\.mj-native-actions::after/);
  assert.match(css, /background:\s*#fff\s*!important/);
  assert.match(css, /border-radius:\s*999px\s*!important/);
});

test("le contact reste identifiable en vert et le panier utilise un chariot classique", () => {
  assert.match(css, /%2325D366/);
  assert.match(css, /\.mj-native-account::before/);
  assert.match(css, /\.mj-native-cart::before/);
  assert.match(css, /stroke='%23111111'/);
  assert.match(css, /circle cx='8\.2'/);
  assert.match(css, /circle cx='17\.5'/);
});
