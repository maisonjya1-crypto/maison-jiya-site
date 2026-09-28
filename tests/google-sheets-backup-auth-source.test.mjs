import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/backup/google-sheets/route.ts", import.meta.url), "utf8");

test("la sauvegarde Google Sheets accepte Authorization Bearer en priorité", () => {
  assert.match(route, /request\.headers\.get\("authorization"\)/);
  assert.match(route, /authorization\.match/);
  assert.ok(route.indexOf('request.headers.get("authorization")') < route.indexOf('url.searchParams.get("key")'));
});

test("le paramètre key reste temporairement compatible seulement avant activation du mode strict", () => {
  assert.match(route, /url\.searchParams\.get\("key"\)/);
  assert.match(route, /backup_bearer_only/);
  assert.match(route, /backupKeyFromRequest\(request, url, !bearerOnly\)/);
  assert.match(route, /allowLegacyQuery/);
});

test("la clé de sauvegarde reste vérifiée par hash et les réglages security restent exclus", () => {
  assert.match(route, /security_backup_token_hash/);
  assert.match(route, /sha256Hex\(key\)/);
  assert.match(route, /secureEqual/);
  assert.match(route, /!row\.key\.startsWith\("security_"\)/);
});


test("le tableau de bord fournit la migration Apps Script sécurisée et le verrouillage final", async () => {
  const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");
  const dataRoute = await readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8");
  assert.match(dashboard, /headers: \{ Authorization: "Bearer " \+ key \}/);
  assert.doesNotMatch(dashboard.slice(dashboard.indexOf("function googleSheetsBearerScript"), dashboard.indexOf("function parseCarrierNames")), /&key=/);
  assert.match(dashboard, /Activer le mode strict/);
  assert.match(dashboard, /updateBackupAuthMode/);
  assert.match(dataRoute, /backup_bearer_only/);
  assert.match(dataRoute, /Mode sécurisé Google Sheets activé/);
});
