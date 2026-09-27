import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

test("la prévision 7/30/60 déduit uniquement les sorties datées connues", () => {
  const { buildCashflowForecast } = loadSource("lib/cashflow-forecast.ts");
  const forecast = buildCashflowForecast({
    asOf: "2026-09-28",
    openingCash: 1000,
    safetyReserve: 300,
    supplierInvoices: [
      { id: 1, supplierName: "Atlas", invoiceNumber: "FAC-1", dueDate: "2026-10-02", remainingAmount: 800 },
      { id: 2, supplierName: "Soldé", invoiceNumber: "FAC-2", dueDate: "2026-10-03", remainingAmount: 0 },
    ],
    expenses: [
      { id: 10, label: "Emballage", category: "Fournitures", amount: 100, paymentStatus: "À payer", expenseDate: "2026-09-27" },
      { id: 11, label: "Déjà payée", category: "Transport", amount: 999, paymentStatus: "Payé", expenseDate: "2026-09-29" },
    ],
    purchases: [
      { id: 20, purchaseRef: "BC-OLD", supplier: "Ancien fournisseur", totalCost: 250, paymentStatus: "À payer", invoiceId: null, procurementStatus: "Commandé" },
      { id: 21, purchaseRef: "BC-DRAFT", supplier: "Brouillon", totalCost: 600, paymentStatus: "À payer", invoiceId: null, procurementStatus: "Brouillon" },
      { id: 22, purchaseRef: "BC-INVOICE", supplier: "Déjà facturé", totalCost: 800, paymentStatus: "À payer", invoiceId: 1, procurementStatus: "Commandé" },
    ],
    orders: [
      { id: 30, orderRef: "CMD-1", status: "Livrée", paymentStatus: "À encaisser", saleAmount: 300, shippingCost: 30, fees: 20 },
      { id: 31, orderRef: "CMD-2", status: "En livraison", paymentStatus: "À encaisser", saleAmount: 400, shippingCost: 40, fees: 10 },
      { id: 32, orderRef: "CMD-3", status: "Livrée", paymentStatus: "Encaissé", saleAmount: 500, shippingCost: 40, fees: 10 },
    ],
    plannedPurchaseSpend: 200,
  });

  assert.equal(forecast.events[0].date, "2026-09-28");
  assert.equal(forecast.events[0].kind, "Dépense");
  assert.equal(forecast.scheduledOutflows60, 900);
  assert.equal(forecast.undatedSupplierCommitments, 250);
  assert.equal(forecast.deliveredReceivables, 250);
  assert.equal(forecast.transitReceivables, 350);
  assert.equal(forecast.horizons[0].baselineBalance, 100);
  assert.equal(forecast.horizons[0].scenarioBalance, -100);
  assert.equal(forecast.firstReserveRiskDate, "2026-10-02");
  assert.equal(forecast.firstNegativeDate, null);
  assert.equal(forecast.scenarioFirstReserveRiskDate, "2026-10-02");
  assert.equal(forecast.scenarioFirstNegativeDate, "2026-10-02");
});

test("les encaissements sans date restent hors du solde projeté", () => {
  const { buildCashflowForecast } = loadSource("lib/cashflow-forecast.ts");
  const forecast = buildCashflowForecast({
    asOf: "2026-09-28",
    openingCash: 500,
    safetyReserve: 100,
    supplierInvoices: [],
    expenses: [],
    purchases: [],
    orders: [
      { id: 1, orderRef: "CMD-LIV", status: "Livrée", paymentStatus: "À encaisser", saleAmount: 1000, shippingCost: 50, fees: 20 },
    ],
    plannedPurchaseSpend: 0,
  });

  assert.equal(forecast.deliveredReceivables, 930);
  assert.equal(forecast.horizons[0].baselineBalance, 500);
  assert.equal(forecast.horizons[1].baselineBalance, 500);
  assert.equal(forecast.horizons[2].baselineBalance, 500);
});

test("les obligations payées, annulées et brouillons sont exclues de la prévision", () => {
  const { buildCashflowForecast } = loadSource("lib/cashflow-forecast.ts");
  const forecast = buildCashflowForecast({
    asOf: "2026-09-28",
    openingCash: 500,
    safetyReserve: 100,
    supplierInvoices: [{ id: 1, supplierName: "A", invoiceNumber: "F", dueDate: "2026-10-01", remainingAmount: 0 }],
    expenses: [{ id: 1, label: "Payée", category: "Autre", amount: 50, paymentStatus: "Payé", expenseDate: "2026-10-01" }],
    purchases: [
      { id: 1, purchaseRef: "A", supplier: "A", totalCost: 100, paymentStatus: "À payer", invoiceId: null, procurementStatus: "Annulé" },
      { id: 2, purchaseRef: "B", supplier: "B", totalCost: 100, paymentStatus: "À payer", invoiceId: null, procurementStatus: "Brouillon" },
      { id: 3, purchaseRef: "C", supplier: "C", totalCost: 100, paymentStatus: "Payé", invoiceId: null, procurementStatus: "Reçu" },
    ],
    orders: [],
  });

  assert.equal(forecast.events.length, 0);
  assert.equal(forecast.undatedSupplierCommitments, 0);
  assert.equal(forecast.scheduledOutflows60, 0);
});

test("la page Trésorerie expose les horizons, les flux non datés et le scénario de réapprovisionnement", async () => {
  const [dashboard, styles] = await Promise.all([
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /buildCashflowForecast/);
  assert.match(dashboard, /active === "Trésorerie"/);
  assert.match(dashboard, /Dans \{horizon\.days\} jours/);
  assert.match(dashboard, /Sorties de trésorerie connues/);
  assert.match(dashboard, /Engagements fournisseurs/);
  assert.match(dashboard, /Argent attendu sans date/);
  assert.match(dashboard, /Les ventes futures ne sont jamais inventées/);
  assert.match(dashboard, /Si plan d’achat exécuté maintenant/);
  assert.match(styles, /cashflow-horizon-grid/);
  assert.match(styles, /cashflow-timeline/);
});
