import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("le dashboard et l'assistant IA utilisent le même moteur financier", async () => {
  const [dashboard, ai, finance] = await Promise.all([
    read("app/dashboard-client.tsx"),
    read("app/api/ai/route.ts"),
    read("lib/finance.ts"),
  ]);

  assert.match(dashboard, /calculateBusinessFinance\(\{/);
  assert.match(ai, /calculateBusinessFinanceFromTotals\(\{/);
  assert.match(finance, /export function calculateBusinessFinanceFromTotals/);
  assert.match(finance, /profit = amount\(input\.deliveredRevenue\)/);
  assert.match(finance, /- amount\(input\.adSpend\)/);
  assert.match(finance, /- amount\(input\.operatingExpenses\)/);
  assert.match(finance, /cash = amount\(input\.manualCapitalNet\)/);
});

test("la marge commande ne retire plus deux fois la publicité Meta", async () => {
  const [dashboard, allocations, finance] = await Promise.all([
    read("app/dashboard-client.tsx"),
    read("db/allocations.ts"),
    read("lib/finance.ts"),
  ]);

  assert.match(finance, /orderContributionBeforeGlobalAds/);
  assert.doesNotMatch(finance, /order\.adCost/);
  assert.doesNotMatch(allocations, /order\.ad_cost/);
  assert.match(allocations, /marge commande/);
  assert.match(dashboard, /Marge par commande avant dépenses globales/);
  assert.match(dashboard, /La dépense Meta réelle et les charges d’exploitation sont déduites au niveau global|La dépense Meta réelle et les charges d’exploitation sont déduites au niveau global/i);
});

test("les rapports reconnaissent les ventes à la date de livraison", async () => {
  const [dashboard, dates] = await Promise.all([
    read("app/dashboard-client.tsx"),
    read("lib/accounting-dates.ts"),
  ]);

  assert.match(dashboard, /deliveryRecognitionDate\(order, data\.orderStatusHistory\)/);
  assert.match(dashboard, /businessDateKey\(recognizedAt\)/);
  assert.doesNotMatch(dashboard, /completed\.filter\(\(order\) => order\.createdAt\.slice\(0, 10\) === today\)/);
  assert.match(dates, /latestStatusDate\(order\.id, "Livrée", history\)/);
  assert.match(dates, /timeZone: "Africa\/Casablanca"/);
});

test("les cartes de période déduisent Meta et les charges de la même période", async () => {
  const dashboard = await read("app/dashboard-client.tsx");

  assert.match(dashboard, /calculateOperatingProfit\(periodOrders, periodAds, periodExpenses\)/);
  assert.match(dashboard, /Meta \{money\(period\.adSpend\)\}/);
  assert.match(dashboard, /charges \{money\(period\.operatingExpenses\)\}/);
});

test("l'export Google Sheets expose les dépenses et une marge commande cohérente", async () => {
  const route = await read("app/api/backup/google-sheets/route.ts");

  assert.match(route, /"expenses"/);
  assert.match(route, /dataset === "expenses"/);
  assert.match(route, /orderContributionBeforeGlobalAds\(row\)/);
  assert.match(route, /Marge commande avant dépenses globales/);
  assert.doesNotMatch(route, /"Gain exact \(MAD\)"/);
});
