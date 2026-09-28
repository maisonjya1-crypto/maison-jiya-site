import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("aucun menu d'actions privé n'utilise encore un details dans le flux", () => {
  assert.doesNotMatch(dashboard, /<details[^>]*className="[^"]*(?:order-actions|record-actions|trash-actions)/);
  assert.doesNotMatch(dashboard, /<summary[^>]*aria-label=\{\`Actions pour/);
});

test("les actions génériques passent toutes par le popover flottant", () => {
  const usages = dashboard.match(/<RecordActions/g) || [];
  assert.equal(usages.length, 9);
  assert.match(dashboard, /function RecordActions/);
  assert.match(dashboard, /record-action-menu-floating/);
  assert.match(dashboard, /createPortal\(/);
  assert.match(dashboard, /document\.querySelector\("\.app-shell"\) \|\| document\.body/);
});

test("la corbeille utilise aussi le popover flottant", () => {
  assert.match(dashboard, /function TrashActions/);
  assert.match(dashboard, /trash-action-menu-floating/);
  assert.match(dashboard, /<TrashActions/);
  assert.match(dashboard, /Restaurer/);
  assert.match(dashboard, /Supprimer définitivement/);
});

test("tous les popovers actions ferment au clic extérieur et avec Echap", () => {
  const pointerHandlers = dashboard.match(/document\.addEventListener\("pointerdown", onPointerDown\)/g) || [];
  const escapeHandlers = dashboard.match(/event\.key === "Escape"/g) || [];
  assert.ok(pointerHandlers.length >= 3, "OrderActions, RecordActions et TrashActions doivent gérer le clic extérieur.");
  assert.ok(escapeHandlers.length >= 3, "OrderActions, RecordActions et TrashActions doivent gérer Echap.");
});

test("la couche CSS flottante reste partagée desktop et mobile", () => {
  assert.match(css, /\.order-action-menu-floating\{/);
  assert.match(css, /position:fixed!important/);
  assert.match(css, /z-index:1000!important/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*\.order-action-menu-floating/);
});
