import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [pwa, live] = await Promise.all([
  readFile(new URL("../app/private-pwa.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/platform/live/route.ts", import.meta.url), "utf8"),
]);

test("l’application installée n’interroge plus le snapshot complet chaque seconde", () => {
  assert.match(pwa, /const APP_REFRESH_MS = 15_000/);
  assert.match(pwa, /fetch\("\/api\/platform\/live"/);
  assert.doesNotMatch(pwa, /fetch\(\`\/api\/data\?live=/);
  assert.match(pwa, /document\.visibilityState !== "visible"/);
  assert.match(pwa, /lastDataVersion/);
});

test("le endpoint live reste léger, privé et non mis en cache", () => {
  assert.match(live, /getAuthenticatedUser/);
  assert.match(live, /Connexion requise/);
  assert.match(live, /cache-control": "private, no-store, max-age=0"/);
  assert.match(live, /current_version AS version/);
  assert.match(live, /LIMIT 25/);
  assert.doesNotMatch(live, /snapshot\(/);
  assert.doesNotMatch(live, /createDailyBackup/);
  assert.doesNotMatch(live, /reconcileOrderAllocations/);
});

test("les notifications Android continuent d’utiliser les nouvelles commandes légères", () => {
  assert.match(pwa, /notifyNewOrder/);
  assert.match(pwa, /previousIds/);
  assert.match(pwa, /order\.orderRef/);
  assert.match(pwa, /order\.customerName/);
  assert.match(pwa, /order\.products/);
});
