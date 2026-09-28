import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("le menu actions commande est rendu hors du conteneur scrollable", () => {
  assert.match(dashboard, /import \{ createPortal \} from "react-dom"/);
  assert.match(dashboard, /document\.querySelector\("\.app-shell"\) \|\| document\.body/);
  assert.match(dashboard, /className="order-action-menu order-action-menu-floating"/);
  assert.match(dashboard, /aria-haspopup="menu"/);
  assert.match(dashboard, /aria-expanded=\{open\}/);
});

test("le popover se positionne par rapport au bouton et reste dans le viewport", () => {
  assert.match(dashboard, /getBoundingClientRect\(\)/);
  assert.match(dashboard, /window\.innerWidth - menuWidth - 12/);
  assert.match(dashboard, /window\.innerHeight - measuredHeight - 12/);
  assert.match(dashboard, /window\.addEventListener\("scroll", updatePosition, true\)/);
  assert.match(dashboard, /window\.addEventListener\("resize", updatePosition\)/);
});

test("le menu se ferme au clic extérieur et avec Echap", () => {
  assert.match(dashboard, /document\.addEventListener\("pointerdown", onPointerDown\)/);
  assert.match(dashboard, /if \(event\.key === "Escape"\)/);
  assert.match(dashboard, /triggerRef\.current\?\.focus\(\)/);
});

test("le CSS force le menu flottant hors du flux du tableau", () => {
  assert.match(css, /\.order-action-menu-floating\{/);
  assert.match(css, /position:fixed!important/);
  assert.match(css, /z-index:1000!important/);
  assert.match(css, /right:auto!important/);
  assert.match(css, /bottom:auto!important/);
  assert.match(css, /max-height:min\(320px,calc\(100vh - 24px\)\)/);
});

test("le menu garde un comportement adapté sur mobile", () => {
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /\.order-action-menu-floating\{[\s\S]*bottom:18px!important/);
  assert.match(css, /left:14px!important/);
  assert.match(css, /right:14px!important/);
});
