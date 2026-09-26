import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("le registre des dépenses existe dans le schéma et l'API privée", async () => {
  const [schema, route] = await Promise.all([
    read("db/schema.ts"),
    read("app/api/data/route.ts"),
  ]);

  assert.match(schema, /export const expenses = sqliteTable/);
  assert.match(schema, /expenseDate: text\("expense_date"\)/);
  assert.match(route, /addExpense/);
  assert.match(route, /updateExpense/);
  assert.match(route, /deleteExpense/);
  assert.match(route, /expenses: expenseRows/);
});

test("les dépenses impactent résultat et trésorerie via le moteur financier central", async () => {
  const [dashboard, finance] = await Promise.all([
    read("app/dashboard-client.tsx"),
    read("lib/finance.ts"),
  ]);

  assert.match(dashboard, /calculateBusinessFinance\(\{/);
  assert.match(finance, /operatingExpenses/);
  assert.match(finance, /paidOperatingExpenses/);
  assert.match(finance, /- amount\(input\.operatingExpenses\)/);
  assert.match(finance, /- amount\(input\.paidOperatingExpenses\)/);
  assert.match(dashboard, /Dépenses ≠ achats de stock/);
  assert.doesNotMatch(dashboard, /stockQuantity.*expense\.amount/);
});

test("sauvegardes, export et Google Sheets couvrent les dépenses", async () => {
  const [backups, dataExport, sync] = await Promise.all([
    read("db/backups.ts"),
    read("db/data-export.ts"),
    read("db/google-sheets-sync.ts"),
  ]);

  assert.match(backups, /expenses\?: SnapshotRow\[\]/);
  assert.match(backups, /DELETE FROM expenses/);
  assert.match(dataExport, /depenses: "SELECT \* FROM expenses/);
  assert.match(sync, /"expenses"/);
});

test("l'assistant IA tient compte des charges d'exploitation via le moteur partagé", async () => {
  const ai = await read("app/api/ai/route.ts");

  assert.match(ai, /calculateBusinessFinanceFromTotals/);
  assert.match(ai, /operatingExpenses: Number\(expenseTotals\[0\]\?\.total/);
  assert.match(ai, /paidOperatingExpenses: Number\(paidExpenseTotals\[0\]\?\.total/);
  assert.match(ai, /unpaidOperatingExpenses: Number\(unpaidExpenseTotals\[0\]\?\.total/);
});

test("le site privé expose une page Dépenses et des formulaires dédiés", async () => {
  const dashboard = await read("app/dashboard-client.tsx");

  assert.match(dashboard, /"Dépenses"/);
  assert.match(dashboard, /function ExpensesPage/);
  assert.match(dashboard, /kind === "expense"/);
  assert.match(dashboard, /kind: "expense"/);
  assert.match(dashboard, /Nouvelle dépense/);
});
