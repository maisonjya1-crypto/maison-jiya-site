import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/backup/google-sheets/route.ts", import.meta.url), "utf8");

test("la sauvegarde Google Sheets accepte Authorization Bearer en priorité", () => {
  assert.match(route, /request\.headers\.get\("authorization"\)/);
  assert.match(route, /authorization\.match/);
  assert.ok(route.indexOf('request.headers.get("authorization")') < route.indexOf('url.searchParams.get("key")'));
});

test("le paramètre key reste temporairement compatible avec le classeur existant", () => {
  assert.match(route, /url\.searchParams\.get\("key"\)/);
  assert.match(route, /backupKeyFromRequest\(request, url\)/);
});

test("la clé de sauvegarde reste vérifiée par hash et les réglages security restent exclus", () => {
  assert.match(route, /security_backup_token_hash/);
  assert.match(route, /sha256Hex\(key\)/);
  assert.match(route, /secureEqual/);
  assert.match(route, /!row\.key\.startsWith\("security_"\)/);
});
