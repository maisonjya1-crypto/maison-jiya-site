import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

function row(overrides = {}) {
  return {
    productId: 1,
    productCode: "P-1",
    productName: "Produit 1",
    category: "Montres",
    stockQuantity: 0,
    alertThreshold: 2,
    coverDays: 30,
    soldUnits30: 10,
    averageDailyDemand: 0.33,
    daysOfCover: 0,
    pendingInbound: 0,
    targetStock: 5,
    recommendedQuantity: 5,
    supplierId: 1,
    supplier: "Fournisseur A",
    supplierLeadTimeDays: 2,
    supplierMinimumOrderAmount: 40,
    unitCost: 10,
    estimatedCost: 50,
    lastPurchaseAt: "2026-09-20T10:00:00.000Z",
    status: "Rupture",
    ...overrides,
  };
}

test("le plan finance les ruptures puis les stocks critiques sans dépasser le budget", () => {
  const { buildPurchasePlan } = loadSource("lib/purchase-plan.ts");
  const plan = buildPurchasePlan([
    row(),
    row({
      productId: 2,
      productCode: "P-2",
      productName: "Produit 2",
      stockQuantity: 2,
      daysOfCover: 4,
      recommendedQuantity: 4,
      unitCost: 15,
      estimatedCost: 60,
      status: "Critique",
    }),
    row({
      productId: 3,
      productCode: "P-3",
      productName: "Produit 3",
      stockQuantity: 8,
      daysOfCover: 12,
      recommendedQuantity: 3,
      unitCost: 20,
      estimatedCost: 60,
      supplierId: 2,
      supplier: "Fournisseur B",
      supplierMinimumOrderAmount: 0,
      status: "À prévoir",
    }),
  ], 100);

  assert.equal(plan.availableBudget, 100);
  assert.equal(plan.plannedSpend, 95);
  assert.equal(plan.remainingBudget, 5);
  assert.equal(plan.lines[0].productId, 1);
  assert.equal(plan.lines[0].plannedQuantity, 5);
  assert.equal(plan.lines[0].funding, "Financé");
  assert.equal(plan.lines[1].productId, 2);
  assert.equal(plan.lines[1].plannedQuantity, 3);
  assert.equal(plan.lines[1].funding, "Partiel");
  assert.equal(plan.lines[2].plannedQuantity, 0);
  assert.equal(plan.lines[2].funding, "Hors budget");
  assert.equal(plan.plannedSpend <= plan.availableBudget, true);
});

test("un fournisseur ou coût manquant ne consomme pas le budget", () => {
  const { buildPurchasePlan } = loadSource("lib/purchase-plan.ts");
  const plan = buildPurchasePlan([
    row({ supplierId: null, supplier: "Fournisseur à renseigner", unitCost: 10 }),
    row({ productId: 2, productCode: "P-2", productName: "Produit 2", supplierId: 2, supplier: "Fournisseur B", recommendedQuantity: 2, unitCost: 20, estimatedCost: 40 }),
  ], 50);

  const incomplete = plan.lines.find(item => item.productId === 1);
  const funded = plan.lines.find(item => item.productId === 2);
  assert.equal(incomplete.funding, "À compléter");
  assert.equal(incomplete.plannedCost, 0);
  assert.equal(funded.plannedQuantity, 2);
  assert.equal(plan.remainingBudget, 10);
});

test("le plan signale un minimum fournisseur non atteint", () => {
  const { buildPurchasePlan } = loadSource("lib/purchase-plan.ts");
  const plan = buildPurchasePlan([
    row({ recommendedQuantity: 3, unitCost: 20, estimatedCost: 60, supplierMinimumOrderAmount: 100 }),
  ], 80);

  assert.equal(plan.supplierGroups.length, 1);
  assert.equal(plan.supplierGroups[0].totalCost, 60);
  assert.equal(plan.supplierGroups[0].minimumOrderAmount, 100);
  assert.equal(plan.supplierGroups[0].meetsMinimumOrder, false);
});

test("les brouillons et achats annulés ne réduisent pas le budget réinvestissable", () => {
  const { calculateBusinessFinance } = loadSource("lib/finance.ts");
  const finance = calculateBusinessFinance({
    orders: [],
    purchases: [
      { totalCost: 100, paymentStatus: "À payer", procurementStatus: "Brouillon", invoiceId: null },
      { totalCost: 80, paymentStatus: "À payer", procurementStatus: "Annulé", invoiceId: null },
      { totalCost: 40, paymentStatus: "À payer", procurementStatus: "Commandé", invoiceId: null },
    ],
    supplierInvoices: [],
    expenses: [],
    ads: [],
    capital: [
      { direction: "Entrée", amount: 500, isAutomatic: false },
      { direction: "Entrée", amount: 300, category: "Réinvestissement", isAutomatic: true },
    ],
    safetyReserve: 100,
  });

  assert.equal(finance.unpaidPurchases, 40);
  assert.equal(finance.cash, 500);
  assert.equal(finance.reinvestable, 300);
});

test("l’interface expose le budget protégé et prépare des bons multi-lignes par fournisseur", async () => {
  const [dashboard, smartStock, styles] = await Promise.all([
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/smart-stock.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /buildPurchasePlan/);
  assert.match(dashboard, /Budget achat maximum/);
  assert.match(dashboard, /Dettes fournisseurs/);
  assert.match(dashboard, /Préparer les achats/);
  assert.match(dashboard, /addPurchaseOrder/);
  assert.match(dashboard, /Réapprovisionnement intelligent/);
  assert.match(dashboard, /minimum de commande n’est pas atteint/);
  assert.match(smartStock, /supplierMinimumOrderAmount/);
  assert.match(smartStock, /minimum_order_amount/);
  assert.match(styles, /purchase-plan-supplier-grid/);
  assert.match(styles, /purchase-plan-budget-track/);
});
