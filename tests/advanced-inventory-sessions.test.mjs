import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

test("la migration inventaire crée les sessions, la valorisation et l’unicité produit/session", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());

  const session = db.sqlite.prepare(`
    INSERT INTO inventory_sessions (
      session_ref, status, expected_product_count, started_by_name
    ) VALUES ('INV-TEST-001', 'En cours', 1, 'Test')
    RETURNING id
  `).get();

  db.sqlite.prepare(`
    INSERT INTO inventory_counts (
      count_ref, session_id, product_id, system_quantity, physical_quantity, difference,
      reason, unit_cost, value_before, value_after, loss_value,
      counted_by_name
    ) VALUES ('COUNT-1', ?, 1, 5, 3, -2, 'Perte', 10, 50, 30, 20, 'Test')
  `).run(session.id);

  const row = db.sqlite.prepare("SELECT * FROM inventory_counts WHERE count_ref = 'COUNT-1'").get();
  assert.equal(row.reason, "Perte");
  assert.equal(row.loss_value, 20);
  assert.equal(row.value_before, 50);
  assert.equal(row.value_after, 30);

  assert.throws(() => db.sqlite.prepare(`
    INSERT INTO inventory_counts (
      count_ref, session_id, product_id, system_quantity, physical_quantity, difference, counted_by_name
    ) VALUES ('COUNT-2', ?, 1, 3, 3, 0, 'Test')
  `).run(session.id), /UNIQUE|constraint/i);
});

test("une sauvegarde complète conserve une session et ses comptages détaillés", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const backups = loadSource("db/backups.ts");

  db.sqlite.exec(`
    INSERT INTO inventory_sessions (
      id, session_ref, status, expected_product_count, counted_product_count,
      total_system_units, total_physical_units, total_adjustment_units,
      value_before, value_after, loss_value, started_by_name, completed_at
    ) VALUES (50, 'INV-BACKUP', 'Clôturé', 1, 1, 4, 3, 1, 40, 30, 10, 'Jihane', '2026-09-28T10:00:00.000Z');

    INSERT INTO inventory_counts (
      id, count_ref, session_id, product_id, system_quantity, physical_quantity, difference,
      reason, unit_cost, value_before, value_after, loss_value,
      counted_by_name
    ) VALUES (50, 'INV-BACKUP-TEST', 50, 1, 4, 3, -1, 'Casse', 10, 40, 30, 10, 'Jihane');
  `);

  await backups.createDailyBackup(db, "Inventaire avancé", true);
  const backup = db.sqlite.prepare("SELECT id, snapshot_json FROM daily_backups ORDER BY id DESC LIMIT 1").get();
  const snapshot = JSON.parse(backup.snapshot_json);
  assert.equal(snapshot.tables.inventorySessions.length, 1);
  assert.equal(snapshot.tables.inventoryCounts.some((row) => row.reason === "Casse" && row.session_id === 50), true);

  db.sqlite.exec("DELETE FROM inventory_counts WHERE id = 50; DELETE FROM inventory_sessions WHERE id = 50;");
  await backups.restoreDailyBackup(db, backup.id);

  const restoredSession = db.sqlite.prepare("SELECT * FROM inventory_sessions WHERE id = 50").get();
  const restoredCount = db.sqlite.prepare("SELECT * FROM inventory_counts WHERE id = 50").get();
  assert.equal(restoredSession.loss_value, 10);
  assert.equal(restoredCount.reason, "Casse");
  assert.equal(restoredCount.session_id, 50);
});

test("le workflow avancé impose un motif, protège le catalogue et refuse une clôture incomplète", async () => {
  const route = await readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8");
  assert.match(route, /payload\.action === "startInventorySession"/);
  assert.match(route, /payload\.action === "countInventorySessionProduct"/);
  assert.match(route, /payload\.action === "finalizeInventorySession"/);
  assert.match(route, /Choisissez un motif pour expliquer l’écart d’inventaire/);
  assert.match(route, /Ce produit a déjà été compté dans cette session/);
  assert.match(route, /Inventaire incomplet/);
  assert.match(route, /inventoryCatalogLockMessage/);
  assert.match(route, /value_before/);
  assert.match(route, /loss_value/);
  assert.match(route, /SELECT id FROM inventory_counts WHERE count_ref = \? LIMIT 1/);
  assert.match(route, /persistedCount/);
  assert.doesNotMatch(route, /inventoryResults\[0\].*changes/s);
});

test("l’interface inventaire expose progression, recherche, pertes, écarts fréquents et historique", async () => {
  const [dashboard, styles, exporter, importer, sheets, sync] = await Promise.all([
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/data-export.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/data-import.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/backup/google-sheets/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/google-sheets-sync.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /function InventoryPage/);
  assert.match(dashboard, /Démarrer l’inventaire/);
  assert.match(dashboard, /Produits jamais comptés/);
  assert.match(dashboard, /Écarts fréquents/);
  assert.match(dashboard, /Pertes inventaire/);
  assert.match(dashboard, /Clôturer l’inventaire/);
  assert.match(dashboard, /SKU, nom ou catégorie/);
  assert.match(dashboard, /Sélectionner les visibles/);
  assert.match(dashboard, /Compter la sélection/);
  assert.match(dashboard, /inventory-product-select/);
  assert.match(dashboard, /onSaved={handleCountSaved}/);
  assert.match(dashboard, /key={selectedProduct\.id}/);
  assert.match(dashboard, /class ApiResponseFormatError/);
  assert.match(dashboard, /recoverCommittedInventoryCount/);
  assert.match(dashboard, /refreshBody\.inventoryCounts\.some/);
  assert.match(dashboard, /readApiJson/);
  assert.match(styles, /inventory-session-progress/);
  assert.match(styles, /inventory-product-grid/);
  assert.match(styles, /inventory-session-toolbar-actions/);
  assert.match(styles, /inventory-product-grid article\.selected/);
  assert.match(exporter, /sessions_inventaire/);
  assert.match(importer, /sessions_inventaire/);
  assert.match(sheets, /inventory-sessions/);
  assert.match(sheets, /inventory-counts/);
  assert.match(sync, /"inventory_sessions"/);
});
