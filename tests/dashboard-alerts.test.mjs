import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

test("les alertes détectent commandes anciennes et échéances fournisseurs", async () => {
  const { buildDashboardAlerts } = await loadSource("lib/dashboard-alerts.ts");
  const alerts = buildDashboardAlerts({
    now: new Date("2026-09-28T12:00:00Z"),
    orders: [
      { id: 1, products: "Montre A", saleAmount: 250, status: "En attente", createdAt: "2026-09-26T06:00:00Z" },
      { id: 2, products: "Pack B", saleAmount: 400, status: "En attente", createdAt: "2026-09-28T06:00:00Z" },
      { id: 3, products: "Montre C", saleAmount: 300, status: "Confirmée", createdAt: "2026-09-25T06:00:00Z" },
    ],
    supplierInvoices: [
      { id: 1, supplierName: "F1", invoiceNumber: "A", dueDate: "2026-09-20", remainingAmount: 700, paymentStatus: "À payer" },
      { id: 2, supplierName: "F2", invoiceNumber: "B", dueDate: "2026-10-03", remainingAmount: 500, paymentStatus: "Partiellement payé" },
      { id: 3, supplierName: "F3", invoiceNumber: "C", dueDate: "2026-10-20", remainingAmount: 900, paymentStatus: "À payer" },
      { id: 4, supplierName: "F4", invoiceNumber: "D", dueDate: "2026-09-10", remainingAmount: 0, paymentStatus: "Payé" },
    ],
    expenses: [],
    orderStatusHistory: [],
  });

  const stale = alerts.find((alert) => alert.id === "orders-pending-stale");
  assert.ok(stale);
  assert.equal(stale.level, "critical");
  assert.equal(stale.count, 1);
  assert.equal(stale.amount, 250);

  const overdue = alerts.find((alert) => alert.id === "supplier-invoices-overdue");
  assert.ok(overdue);
  assert.equal(overdue.level, "critical");
  assert.equal(overdue.count, 1);
  assert.equal(overdue.amount, 700);

  const dueSoon = alerts.find((alert) => alert.id === "supplier-invoices-due-soon");
  assert.ok(dueSoon);
  assert.equal(dueSoon.level, "warning");
  assert.equal(dueSoon.count, 1);
  assert.equal(dueSoon.amount, 500);
});

test("une dépense récente n'est signalée que si la base statistique est suffisante et l'écart net", async () => {
  const { buildDashboardAlerts } = await loadSource("lib/dashboard-alerts.ts");
  const alerts = buildDashboardAlerts({
    now: new Date("2026-09-28T12:00:00Z"),
    orders: [],
    supplierInvoices: [],
    orderStatusHistory: [],
    expenses: [
      { id: 1, label: "Emballage", amount: 100, expenseDate: "2026-08-10", recurringExpenseId: null },
      { id: 2, label: "Transport", amount: 120, expenseDate: "2026-08-20", recurringExpenseId: null },
      { id: 3, label: "Fournitures", amount: 90, expenseDate: "2026-09-01", recurringExpenseId: null },
      { id: 4, label: "Petit matériel", amount: 110, expenseDate: "2026-09-10", recurringExpenseId: null },
      { id: 5, label: "Divers", amount: 100, expenseDate: "2026-09-18", recurringExpenseId: null },
      { id: 6, label: "Réparation exceptionnelle", amount: 700, expenseDate: "2026-09-26", recurringExpenseId: null },
      { id: 7, label: "Loyer", amount: 2000, expenseDate: "2026-09-26", recurringExpenseId: 4 },
    ],
  });

  const unusual = alerts.find((alert) => alert.id === "unusual-expense");
  assert.ok(unusual);
  assert.equal(unusual.level, "warning");
  assert.equal(unusual.amount, 700);
  assert.match(unusual.detail, /Réparation exceptionnelle/);
  assert.doesNotMatch(unusual.detail, /Loyer/);
});

test("l'accélération commerciale utilise les dates de livraison et exclut les retours", async () => {
  const { buildDashboardAlerts } = await loadSource("lib/dashboard-alerts.ts");
  const orders = [
    { id: 1, products: "Montre A", saleAmount: 250, status: "Livrée", createdAt: "2026-08-01T10:00:00Z" },
    { id: 2, products: "Montre A", saleAmount: 250, status: "Livrée", createdAt: "2026-08-02T10:00:00Z" },
    { id: 3, products: "Montre A", saleAmount: 250, status: "Livrée", createdAt: "2026-08-03T10:00:00Z" },
    { id: 4, products: "Montre A", saleAmount: 250, status: "Livrée", createdAt: "2026-08-04T10:00:00Z" },
    { id: 5, products: "Montre A", saleAmount: 250, status: "Retour", createdAt: "2026-08-05T10:00:00Z" },
    { id: 6, products: "Montre A", saleAmount: 250, status: "Livrée", createdAt: "2026-08-06T10:00:00Z" },
  ];
  const orderStatusHistory = [
    { orderId: 1, toStatus: "Livrée", changedAt: "2026-09-18T10:00:00Z" },
    { orderId: 2, toStatus: "Livrée", changedAt: "2026-09-20T10:00:00Z" },
    { orderId: 3, toStatus: "Livrée", changedAt: "2026-09-23T10:00:00Z" },
    { orderId: 4, toStatus: "Livrée", changedAt: "2026-09-27T10:00:00Z" },
    { orderId: 5, toStatus: "Livrée", changedAt: "2026-09-24T10:00:00Z" },
    { orderId: 5, toStatus: "Retour", changedAt: "2026-09-25T10:00:00Z" },
    { orderId: 6, toStatus: "Livrée", changedAt: "2026-09-01T10:00:00Z" },
  ];

  const alerts = buildDashboardAlerts({
    now: new Date("2026-09-28T12:00:00Z"),
    orders,
    supplierInvoices: [],
    expenses: [],
    orderStatusHistory,
  });

  const momentum = alerts.find((alert) => alert.id === "sales-momentum");
  assert.ok(momentum);
  assert.equal(momentum.level, "positive");
  assert.equal(momentum.count, 4);
  assert.equal(momentum.amount, 1000);
  assert.match(momentum.title, /Montre A/);
});

test("sans seuil atteint aucune fausse alerte n'est créée", async () => {
  const { buildDashboardAlerts } = await loadSource("lib/dashboard-alerts.ts");
  const alerts = buildDashboardAlerts({
    now: new Date("2026-09-28T12:00:00Z"),
    orders: [{ id: 1, products: "Montre A", saleAmount: 250, status: "En attente", createdAt: "2026-09-28T09:00:00Z" }],
    supplierInvoices: [{ id: 1, invoiceNumber: "A", dueDate: "2026-10-20", remainingAmount: 500, paymentStatus: "À payer" }],
    expenses: [
      { id: 1, label: "A", amount: 100, expenseDate: "2026-09-26", recurringExpenseId: null },
      { id: 2, label: "B", amount: 110, expenseDate: "2026-09-25", recurringExpenseId: null },
    ],
    orderStatusHistory: [],
  });
  assert.deepEqual(alerts, []);
});

test("le centre d'alertes est visible, explicable et navigable", async () => {
  const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/private-pro.css", import.meta.url), "utf8");

  assert.match(dashboard, /buildDashboardAlerts/);
  assert.match(dashboard, /Centre d’alertes/);
  assert.match(dashboard, /Surveillance automatique/);
  assert.match(dashboard, /Règles : commande en attente/);
  assert.match(dashboard, /onClick=\{\(\) => setActive\(alert\.target\)\}/);
  assert.match(css, /smart-alerts-panel/);
  assert.match(css, /smart-alert-row\.critical/);
  assert.match(css, /smart-alert-row\.warning/);
  assert.match(css, /smart-alert-row\.positive/);
  assert.match(css, /@media\(max-width:620px\)/);
});
