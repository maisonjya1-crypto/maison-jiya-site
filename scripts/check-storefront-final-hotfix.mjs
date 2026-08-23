import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const css = await readFile(new URL("app/boutique/storefront-final-hotfix.css", root), "utf8");
const layout = await readFile(new URL("app/boutique/layout.tsx", root), "utf8");

assert.match(layout, /storefront-final-hotfix\.css/);
assert.match(css, /mj-native-nav/);
assert.match(css, /flex-direction:\s*row\s*!important/);
assert.match(css, /mj-native-hero::before/);
assert.match(css, /mj-native-hero-products::after/);
assert.match(css, /storefront-v3-wa::before/);
assert.match(css, /25d366/i);

console.log("Storefront final hotfix: nav horizontal + hero abstrait + pictogramme WhatsApp OK");
