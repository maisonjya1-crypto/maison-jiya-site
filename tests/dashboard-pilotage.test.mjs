import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

test("le cockpit calcule uniquement des indicateurs commerciaux fiables", async () => {
  const { buildDashboardPilotage } = await loadSource("lib/dashboard-pilotage.ts");
  const result = buildDashboardPilotage({
    now: new Date("2026-09-28T12:00:00Z"),
    orders: [
      { id: 1, products: "Montre A", quantity: 1, saleAmount: 250, status: "En attente", createdAt: "2026-09-28T10:00:00Z" },
      { id: 2, products: "Pack B", quantity: 2, saleAmount: 400, status: "Confirmée", createdAt: "2026-09-28T10:00:00Z" },
      { id: 3, products: "Montre A", quantity: 1, saleAmount: 300, status: "Expédiée", createdAt: "2026-09-28T10:00:00Z" },
      { id: 4, products: "Montre A", quantity: 1, saleAmount: 250, status: "Livrée", createdAt: "2026-08-15T10:00:00Z" },
      { id: 5, products: "Montre A", quantity: 1, saleAmount: 250, status: "Livrée", createdAt: "2026-09-15T10:00:00Z" },
      { id: 6, products: "Pack B", quantity: 2, saleAmount: 600, status: "Livrée", createdAt: "2026-09-20T10:00:00Z" },
      { id: 7, products: "Pack B", quantity: 2, saleAmount: 900, status: "Retour", createdAt: "2026-09-21T10:00:00Z" },
      { id: 8, products: "Produit C", quantity: 1, saleAmount: 100, status: "Annulée", createdAt: "2026-09-22T10:00:00Z" },
    ],
    expenses: [
      { amount: 80, expenseDate: "2026-09-03" },
      { amount: 20, expenseDate: "2026-09-26" },
      { amount: 500, expenseDate: "2026-08-31" },
    ],
    ads: [
      { spend: 50, performanceDate: "2026-09-04" },
      { spend: 30, performanceDate: "2026-09-25" },
      { spend: 200, performanceDate: "2026-08-20" },
    ],
  });

  assert.equal(result.pendingOrders, 1);
  assert.equal(result.pendingValue, 250);
  assert.equal(result.confirmedOrders, 1);
  assert.equal(result.confirmedValue, 400);
  assert.equal(result.transitOrders, 1);
  assert.equal(result.monthExpenses, 100);
  assert.equal(result.monthAdSpend, 80);
  assert.deepEqual(result.topDeliveredSales, [
    { label: "Pack B", orders: 1, revenue: 600 },
    { label: "Montre A", orders: 2, revenue: 500 },
  ]);
});

test("le cockpit ne classe jamais les commandes non livrées dans les meilleures ventes", async () => {
  const { buildDashboardPilotage } = await loadSource("lib/dashboard-pilotage.ts");
  const result = buildDashboardPilotage({
    now: new Date("2026-09-28T12:00:00Z"),
    orders: [
      { id: 1, products: "Produit en attente", quantity: 1, saleAmount: 5000, status: "En attente", createdAt: "2026-09-20" },
      { id: 2, products: "Produit livré", quantity: 1, saleAmount: 100, status: "Livrée", createdAt: "2026-09-20" },
      { id: 3, products: "Produit retourné", quantity: 1, saleAmount: 9000, status: "Retour", createdAt: "2026-09-20" },
    ],
    expenses: [],
    ads: [],
  });

  assert.deepEqual(result.topDeliveredSales, [{ label: "Produit livré", orders: 1, revenue: 100 }]);
});

test("la vue d'ensemble expose le pilotage sans modifier les données", async () => {
  const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/private-pro.css", import.meta.url), "utf8");

  assert.match(dashboard, /buildDashboardPilotage/);
  assert.match(dashboard, /Pilotage du jour/);
  assert.match(dashboard, /Commandes en attente/);
  assert.match(dashboard, /Confirmées à préparer/);
  assert.match(dashboard, /Fournisseurs à payer/);
  assert.match(dashboard, /Charges à payer/);
  assert.match(dashboard, /Dépenses du mois/);
  assert.match(dashboard, /Publicité du mois/);
  assert.match(dashboard, /Top produits & offres/);
  assert.match(dashboard, /topDeliveredSales/);
  assert.match(css, /pilotage-grid/);
  assert.match(css, /@media\(max-width:620px\)/);
});
