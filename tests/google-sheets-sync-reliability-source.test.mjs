import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const sync = await readFile(new URL("db/google-sheets-sync.ts", root), "utf8");
const worker = await readFile(new URL("worker/index.ts", root), "utf8");
const wrangler = await readFile(new URL("wrangler.jsonc", root), "utf8");
const database = await readFile(new URL("db/index.ts", root), "utf8");
const dataRoute = await readFile(new URL("app/api/data/route.ts", root), "utf8");
const multiOrderRoute = await readFile(new URL("app/api/orders/multi/route.ts", root), "utf8");

test("D1 conserve une file transactionnelle avant tout appel Google", () => {
  assert.match(sync, /CREATE TABLE IF NOT EXISTS google_sheets_sync_state/);
  assert.match(sync, /CREATE TABLE IF NOT EXISTS google_sheets_sync_log/);
  assert.match(sync, /CREATE TRIGGER IF NOT EXISTS/);
  assert.match(sync, /AFTER \$\{operation\.toUpperCase\(\)\} ON \$\{table\}/);
  assert.match(database, /ensureGoogleSheetsSyncSchema/);
});

test("les retries gardent le même identifiant et utilisent un backoff sans abandon terminal", () => {
  assert.match(sync, /maison-jiya-google-sheets-v\$\{targetVersion\}/);
  assert.match(sync, /x-idempotency-key/);
  assert.match(sync, /event_id: eventId/);
  assert.match(sync, /retryDelaySeconds/);
  assert.match(sync, /status = 'retrying'/);
  assert.doesNotMatch(sync, /dead.?letter|MAX_ATTEMPTS|abandon/);
});

test("une version récente clôt les anciennes tentatives qu'elle contient", async () => {
  const dashboard = await readFile(new URL("app/dashboard-client.tsx", root), "utf8");
  assert.match(sync, /SET status = 'covered'/);
  assert.match(sync, /version < \? AND status IN \('processing', 'retrying'\)/);
  assert.match(dashboard, /Incluse dans une version récente/);
});

test("une réponse Google non réussie reste à synchroniser", () => {
  assert.match(sync, /redirect: "follow"/);
  assert.match(sync, /response\.status >= 300/);
  assert.match(sync, /script\.googleusercontent\.com/);
  assert.match(sync, /next_attempt_at = \?/);
  assert.match(sync, /last_error = \?/);
});

test("une URL Apps Script sans clé privée ne peut pas être déclarée synchronisée", () => {
  assert.match(sync, /security_backup_token_hash/);
  assert.match(sync, /\^\[a-f0-9\]\{64\}\$/);
  assert.match(dataRoute, /markGoogleSheetsSyncPending\(await getRawDb\(\)\)/);
});

test("le Worker tente rapidement puis le cron reprend toutes les cinq minutes", () => {
  assert.match(worker, /ctx\.waitUntil/);
  assert.match(worker, /processGoogleSheetsSyncQueue/);
  assert.match(worker, /!\["GET", "HEAD", "OPTIONS"\]/);
  assert.match(worker, /\*\/5 \* \* \* \*/);
  assert.match(wrangler, /"\*\/5 \* \* \* \*"/);
});

test("les anciens appels directs à Apps Script sont supprimés des routes métier", () => {
  assert.doesNotMatch(dataRoute, /triggerGoogleSheetsSync/);
  assert.doesNotMatch(multiOrderRoute, /syncGoogleSheets/);
  assert.doesNotMatch(multiOrderRoute, /script\.google\.com/);
});

test("le journal et la relance manuelle restent réservés au logiciel privé", () => {
  assert.match(dataRoute, /getGoogleSheetsSyncSnapshot/);
  assert.match(dataRoute, /retryGoogleSheetsSync/);
  assert.match(dataRoute, /Seul l’administrateur peut relancer/);
});
