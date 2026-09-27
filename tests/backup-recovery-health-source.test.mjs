import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("la sauvegarde quotidienne est contrôlée sans restaurer la production", async () => {
  const [backups, worker] = await Promise.all([
    read("db/backups.ts"),
    read("worker/index.ts"),
  ]);
  assert.match(backups, /verifyLatestBackup/);
  assert.match(backups, /Le JSON de sauvegarde est illisible/);
  assert.match(backups, /Nombre d’enregistrements incohérent/);
  assert.match(backups, /backup_health_status/);
  assert.match(backups, /await verifyLatestBackup\(database\)/);
  assert.match(worker, /runDailyMaintenance/);
});

test("le contrôle manuel reste non destructif et réservé au propriétaire", async () => {
  const [route, dashboard] = await Promise.all([
    read("app/api/data/route.ts"),
    read("app/dashboard-client.tsx"),
  ]);
  const start = route.indexOf('payload.action === "verifyBackupNow"');
  const end = route.indexOf('payload.action === "restoreBackup"', start);
  const block = route.slice(start, end);
  assert.match(block, /access\.isOwner/);
  assert.match(block, /verifyLatestBackup/);
  assert.doesNotMatch(block, /restoreDailyBackup/);
  assert.match(dashboard, /Vérifier la dernière sauvegarde/);
  assert.match(dashboard, /Contrôle non destructif|Dernier contrôle non destructif/);
});

test("la stratégie distingue D1, copie hors D1 et restauration isolée", async () => {
  const [dashboard, docs, integrityTests] = await Promise.all([
    read("app/dashboard-client.tsx"),
    read("docs/disaster-recovery.md"),
    read("tests/data-integrity.test.mjs"),
  ]);
  assert.match(dashboard, /Copie D1 restaurable/);
  assert.match(dashboard, /Copie indépendante hors D1/);
  assert.match(dashboard, /Chemin de restauration testé en CI/);
  assert.match(docs, /Google Sheets constitue la copie opérationnelle indépendante de D1/);
  assert.match(docs, /réimportation automatique[^\n]*n’est pas encore automatisée/);
  assert.match(integrityTests, /annule toutes les suppressions et insertions/);
  assert.match(integrityTests, /FOREIGN KEY constraint failed/);
});
