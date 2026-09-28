import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

test("les décisions prioritaires transforment les alertes critiques en actions concrètes", async () => {
  const { buildDashboardDecisions } = await loadSource("lib/dashboard-decisions.ts");

  const decisions = buildDashboardDecisions({
    alerts: [
      { id: "orders-pending-stale", level: "critical", title: "x", detail: "x", target: "Commandes", count: 3, amount: 900 },
      { id: "supplier-invoices-overdue", level: "critical", title: "x", detail: "x", target: "Factures fournisseurs", count: 2, amount: 1200 },
      { id: "supplier-invoices-due-soon", level: "warning", title: "x", detail: "x", target: "Factures fournisseurs", count: 1, amount: 500 },
    ],
    pilotage: {
      pendingOrders: 3,
      pendingValue: 900,
      confirmedOrders: 2,
      confirmedValue: 600,
      transitOrders: 1,
      monthExpenses: 100,
      monthAdSpend: 50,
      topDeliveredSales: [],
    },
  });

  assert.equal(decisions[0].priority, "P1");
  assert.equal(decisions[1].priority, "P1");
  assert.ok(decisions.some((decision) => decision.id === "decision-stale-orders" && decision.amount === 900));
  assert.ok(decisions.some((decision) => decision.id === "decision-overdue-invoices" && decision.amount === 1200));
  assert.ok(decisions.some((decision) => decision.id === "decision-due-soon" && decision.amount === 500));
  assert.equal(decisions.length, 5);
});

test("une commande récente est proposée seulement s'il n'y a pas déjà l'alerte >24h", async () => {
  const { buildDashboardDecisions } = await loadSource("lib/dashboard-decisions.ts");

  const fresh = buildDashboardDecisions({
    alerts: [],
    pilotage: {
      pendingOrders: 4,
      pendingValue: 1000,
      confirmedOrders: 0,
      confirmedValue: 0,
      transitOrders: 0,
      monthExpenses: 0,
      monthAdSpend: 0,
      topDeliveredSales: [],
    },
  });
  assert.ok(fresh.some((decision) => decision.id === "decision-fresh-pending-orders"));

  const stale = buildDashboardDecisions({
    alerts: [{ id: "orders-pending-stale", level: "warning", title: "x", detail: "x", target: "Commandes", count: 2, amount: 500 }],
    pilotage: {
      pendingOrders: 4,
      pendingValue: 1000,
      confirmedOrders: 0,
      confirmedValue: 0,
      transitOrders: 0,
      monthExpenses: 0,
      monthAdSpend: 0,
      topDeliveredSales: [],
    },
  });

  assert.ok(stale.some((decision) => decision.id === "decision-stale-orders"));
  assert.ok(!stale.some((decision) => decision.id === "decision-fresh-pending-orders"));
});

test("les opportunités commerciales ne passent jamais devant les priorités opérationnelles", async () => {
  const { buildDashboardDecisions } = await loadSource("lib/dashboard-decisions.ts");

  const decisions = buildDashboardDecisions({
    alerts: [
      { id: "sales-momentum", level: "positive", title: "x", detail: "x", target: "Rapports", count: 5, amount: 1500 },
      { id: "unusual-expense", level: "warning", title: "x", detail: "x", target: "Dépenses", count: 1, amount: 700 },
    ],
    pilotage: {
      pendingOrders: 0,
      pendingValue: 0,
      confirmedOrders: 1,
      confirmedValue: 250,
      transitOrders: 1,
      monthExpenses: 0,
      monthAdSpend: 0,
      topDeliveredSales: [],
    },
  });

  assert.equal(decisions.at(-1)?.priority, "OPPORTUNITÉ");
  assert.ok(decisions.findIndex((decision) => decision.priority === "P2") < decisions.findIndex((decision) => decision.priority === "OPPORTUNITÉ"));
});

test("le centre de décisions reste court et sans exécution automatique", async () => {
  const { buildDashboardDecisions } = await loadSource("lib/dashboard-decisions.ts");

  const decisions = buildDashboardDecisions({
    alerts: [
      { id: "orders-pending-stale", level: "critical", title: "x", detail: "x", target: "Commandes", count: 2, amount: 500 },
      { id: "supplier-invoices-overdue", level: "critical", title: "x", detail: "x", target: "Factures fournisseurs", count: 2, amount: 1000 },
      { id: "supplier-invoices-due-soon", level: "warning", title: "x", detail: "x", target: "Factures fournisseurs", count: 2, amount: 800 },
      { id: "unusual-expense", level: "warning", title: "x", detail: "x", target: "Dépenses", count: 1, amount: 600 },
      { id: "sales-momentum", level: "positive", title: "x", detail: "x", target: "Rapports", count: 4, amount: 1000 },
    ],
    pilotage: {
      pendingOrders: 2,
      pendingValue: 500,
      confirmedOrders: 3,
      confirmedValue: 900,
      transitOrders: 4,
      monthExpenses: 0,
      monthAdSpend: 0,
      topDeliveredSales: [],
    },
  });

  assert.equal(decisions.length, 5);
  assert.ok(decisions.every((decision) => decision.target));
});

test("l'interface affiche les décisions comme raccourcis de navigation uniquement", async () => {
  const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/private-pro.css", import.meta.url), "utf8");

  assert.match(dashboard, /buildDashboardDecisions/);
  assert.match(dashboard, /Décisions du jour/);
  assert.match(dashboard, /Rien n’est exécuté automatiquement/);
  assert.match(dashboard, /onClick=\{\(\) => setActive\(decision\.target\)\}/);
  assert.match(dashboard, /Vérifiez toujours le détail du module avant d’enregistrer une action/);
  assert.match(css, /decision-center-list/);
  assert.match(css, /decision-card\.urgent/);
  assert.match(css, /decision-card\.opportunity/);
  assert.match(css, /@media\(max-width:720px\)/);
});
