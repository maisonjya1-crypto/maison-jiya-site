import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

test("la trésorerie par compte retombe exactement sur le total physique", () => {
  const treasury = loadSource("lib/treasury.ts");
  const result = treasury.calculateTreasuryAccounts({
    orders: [
      { paymentStatus: "Encaissé", fulfillmentType: "Magasin physique", saleAmount: 300, shippingCost: 0, fees: 5, returnCost: 10 },
      { paymentStatus: "Encaissé", fulfillmentType: "Livraison", saleAmount: 500, shippingCost: 40, fees: 15, returnCost: 0 },
      { paymentStatus: "À encaisser", fulfillmentType: "Livraison", saleAmount: 200, shippingCost: 25, fees: 5, returnCost: 12 },
    ],
    purchases: [
      { paymentStatus: "Payé", totalCost: 100, account: "Caisse" },
      { paymentStatus: "Payé", totalCost: 50, account: "Carte" },
      { paymentStatus: "À payer", totalCost: 999, account: "Banque" },
    ],
    expenses: [
      { paymentStatus: "Payé", amount: 20, account: "Espèces" },
      { paymentStatus: "Payé", amount: 30, account: "Autre" },
      { paymentStatus: "À payer", amount: 700, account: "Banque" },
    ],
    ads: [{ spend: 60 }],
    capital: [
      { direction: "Entrée", amount: 80, account: "Banque", isAutomatic: false },
      { direction: "Sortie", amount: 10, account: "Caisse", isAutomatic: false },
      { direction: "Affectation", amount: 500, account: "Réinvestissement", isAutomatic: true },
    ],
  });

  assert.deepEqual(result, {
    bank: 403,
    cash: 155,
    other: -30,
    total: 528,
  });
});

test("les comptes sont normalisés sans inventer de nouvelle catégorie physique", () => {
  const treasury = loadSource("lib/treasury.ts");
  assert.equal(treasury.normalizeTreasuryAccount("Banque"), "Banque");
  assert.equal(treasury.normalizeTreasuryAccount("Caisse"), "Caisse");
  assert.equal(treasury.normalizeTreasuryAccount("Espèces"), "Espèces");
  assert.equal(treasury.normalizeTreasuryAccount("Carte"), "Carte");
  assert.equal(treasury.normalizeTreasuryAccount("Autre"), "Autre");
  assert.equal(treasury.normalizeTreasuryAccount("Réinvestissement"), "Banque");
});

test("la migration ajoute le compte fournisseur et les dates de paiement sans toucher au baseline", async () => {
  const { readFile } = await import("node:fs/promises");
  const migration = await readFile(new URL("../migrations/0001_treasury_payment_tracking.sql", import.meta.url), "utf8");
  const baseline = await readFile(new URL("../migrations/0000_production_baseline.sql", import.meta.url), "utf8");

  assert.match(migration, /ALTER TABLE purchases ADD COLUMN account TEXT NOT NULL DEFAULT 'Banque'/);
  assert.match(migration, /ALTER TABLE purchases ADD COLUMN paid_at TEXT/);
  assert.match(migration, /ALTER TABLE expenses ADD COLUMN paid_at TEXT/);
  assert.match(migration, /UPDATE purchases[\s\S]*payment_status = 'Payé'/);
  assert.match(migration, /UPDATE expenses[\s\S]*payment_status = 'Payé'/);
  assert.doesNotMatch(baseline, /ALTER TABLE/i);
});

test("l’API enregistre compte et date quand un achat ou une dépense passe à Payé", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8");

  assert.match(route, /account = treasuryAccount\(payload\.account\)/);
  assert.match(route, /paidAt = nextPaymentStatus === "Payé"/);
  assert.match(route, /purchases\.paidAt/);
  assert.match(route, /expenses\.paidAt/);
  assert.match(route, /account, paymentStatus: nextPaymentStatus, paidAt/);
  assert.match(route, /amount <= 0/);
});

test("les rapports utilisent un moteur unique de trésorerie au lieu de soustraire toutes les charges de la banque", async () => {
  const { readFile } = await import("node:fs/promises");
  const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /calculateTreasuryAccounts\(\{/);
  assert.match(dashboard, /Caisse \/ espèces/);
  assert.match(dashboard, /Banque \/ carte/);
  assert.match(dashboard, /Autres comptes/);
  assert.doesNotMatch(dashboard, /const bank = deliveryReceipts \+ manualCapital - paidPurchases - paidExpenses - adSpend/);
  assert.match(dashboard, /purchase\.paidAt \|\| purchase\.createdAt/);
  assert.match(dashboard, /expense\.paidAt \|\| expense\.expenseDate/);
});

test("les formulaires de trésorerie permettent de choisir le compte physique", async () => {
  const { readFile } = await import("node:fs/promises");
  const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /Compte de paiement/);
  assert.match(dashboard, /Compte concerné/);
  assert.match(dashboard, /Date de paiement \(si payé\)/);
  assert.match(dashboard, /Date de paiement \(si payée\)/);
  assert.match(dashboard, /allocationPolicy\.salary/);
  assert.match(dashboard, /allocationPolicy\.emergency/);
});
