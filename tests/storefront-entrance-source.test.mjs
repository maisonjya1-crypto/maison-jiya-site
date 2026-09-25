import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/boutique/page.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/boutique/layout.tsx", import.meta.url), "utf8");
const intro = await readFile(new URL("../app/boutique/storefront-entrance.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/boutique/storefront-entrance.css", import.meta.url), "utf8");

test("la boutique charge l'animation d'entrée sans toucher au dashboard", () => {
  assert.match(page, /StorefrontEntrance/);
  assert.match(layout, /storefront-entrance\.css/);
  assert.match(intro, /sessionStorage/);
  assert.match(intro, /prefers-reduced-motion/);
  assert.match(css, /mj-entry-screen/);
  assert.match(css, /z-index: 2147483000/);
  assert.doesNotMatch(intro, /document\.documentElement/);
  assert.doesNotMatch(css, /mj-entry-lock/);
});

test("l'intro reste courte et peut être passée", () => {
  assert.match(intro, /1650/);
  assert.match(intro, /2250/);
  assert.match(intro, />Passer<\/button>/);
});
