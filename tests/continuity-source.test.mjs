import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("the Apps Script URL stays on the server", async () => {
  const dashboard = await readFile(new URL("app/dashboard-client.tsx", root), "utf8");
  const route = await readFile(new URL("app/api/data/route.ts", root), "utf8");
  assert.doesNotMatch(dashboard, /fetch\(webhookUrl/);
  assert.match(route, /security_backup_webhook_url/);
  assert.match(route, /triggerGoogleSheetsSync/);
});

test("deleted orders use a 90-day trash instead of immediate deletion", async () => {
  const route = await readFile(new URL("app/api/data/route.ts", root), "utf8");
  const backups = await readFile(new URL("db/backups.ts", root), "utf8");
  assert.match(route, /deletedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(route, /restoreOrder/);
  assert.match(backups, /setUTCDate\(cutoff\.getUTCDate\(\) - 90\)/);
});

test("daily backup and status history are wired into the worker", async () => {
  const worker = await readFile(new URL("worker/index.ts", root), "utf8");
  const schema = await readFile(new URL("db/schema.ts", root), "utf8");
  assert.match(worker, /scheduled/);
  assert.match(worker, /runDailyMaintenance/);
  assert.match(schema, /order_status_history/);
  assert.match(schema, /daily_backups/);
  assert.match(schema, /audit_logs/);
});
