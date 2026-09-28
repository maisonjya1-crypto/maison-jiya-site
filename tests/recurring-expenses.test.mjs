import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("les charges récurrentes ont un schéma additif et une protection anti-doublon", async () => {
  const migration = await read("migrations/0012_recurring_expenses.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS recurring_expenses/i);
  assert.match(migration, /day_of_month INTEGER NOT NULL/i);
  assert.match(migration, /ALTER TABLE expenses ADD COLUMN recurring_expense_id/i);
  assert.match(migration, /ALTER TABLE expenses ADD COLUMN recurring_period/i);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS expenses_recurring_occurrence_unique/i);
});

test("le moteur prépare les échéances sans les marquer payées", async () => {
  const source = await read("db/recurring-expenses.ts");
  assert.match(source, /horizonDays = 60/);
  assert.match(source, /INSERT OR IGNORE INTO expenses/);
  assert.match(source, /'À payer', NULL/);
  assert.match(source, /recurringOccurrenceDate/);
  assert.match(source, /Math\.min\(safeDay, lastDay\)/);
  assert.match(source, /removeFutureRecurringOccurrences/);
});

test("API et interface permettent créer modifier suspendre et réactiver", async () => {
  const [route, ui] = await Promise.all([
    read("app/api/data/route.ts"),
    read("app/dashboard-client.tsx"),
  ]);
  for (const action of ["addRecurringExpense", "updateRecurringExpense", "toggleRecurringExpense"]) {
    assert.match(route, new RegExp(action));
    assert.match(ui, new RegExp(action));
  }
  assert.match(route, /ensureRecurringExpenseOccurrences/);
  assert.match(route, /Cette dépense vient d’une charge récurrente/);
  assert.match(ui, /Charges récurrentes/);
  assert.match(ui, /60 jours à l’avance/);
});

test("les charges récurrentes suivent sauvegarde export import et Google Sheets", async () => {
  const [backup, exportSource, importSource, sheets] = await Promise.all([
    read("db/backups.ts"),
    read("db/data-export.ts"),
    read("db/data-import.ts"),
    read("db/google-sheets-sync.ts"),
  ]);
  assert.match(backup, /recurringExpenses/);
  assert.match(backup, /recurring_expenses/);
  assert.match(exportSource, /charges_recurrentes/);
  assert.match(importSource, /charges_recurrentes/);
  assert.match(importSource, /recurring_expense_id/);
  assert.match(sheets, /"recurring_expenses"/);
});
