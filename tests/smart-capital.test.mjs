import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

test("le capital intelligent protège d'abord fournisseurs charges et réserve", () => {
  const { calculateSmartCapital } = loadSource("lib/smart-capital.ts");
  const result = calculateSmartCapital({
    cash: 10_000,
    netProfit: 4_000,
    unpaidPurchases: 2_000,
    unpaidOperatingExpenses: 500,
    safetyReserve: 1_000,
    theoreticalReinvestment: 2_500,
    theoreticalSalary: 1_500,
    theoreticalEmergency: 1_000,
  });

  assert.deepEqual(result, {
    realLiquidCapital: 10_000,
    supplierReserve: 2_000,
    expenseReserve: 500,
    safetyReserve: 1_000,
    protectedTotal: 3_500,
    protectionShortfall: 0,
    freeCashAfterProtection: 6_500,
    cashBackedProfit: 4_000,
    fundedEnvelopePool: 4_000,
    allocationFundingRate: 0.8,
    reinvestableNow: 2_000,
    withdrawableSalary: 1_200,
    emergencyAvailable: 800,
    unallocatedFreeCash: 2_500,
  });
});

test("aucun retrait ni réinvestissement n'est disponible si les obligations ne sont pas couvertes", () => {
  const { calculateSmartCapital } = loadSource("lib/smart-capital.ts");
  const result = calculateSmartCapital({
    cash: 2_000,
    netProfit: 5_000,
    unpaidPurchases: 2_500,
    unpaidOperatingExpenses: 500,
    safetyReserve: 500,
    theoreticalReinvestment: 2_500,
    theoreticalSalary: 1_500,
    theoreticalEmergency: 1_000,
  });

  assert.equal(result.protectedTotal, 3_500);
  assert.equal(result.protectionShortfall, 1_500);
  assert.equal(result.freeCashAfterProtection, 0);
  assert.equal(result.cashBackedProfit, 0);
  assert.equal(result.reinvestableNow, 0);
  assert.equal(result.withdrawableSalary, 0);
  assert.equal(result.emergencyAvailable, 0);
});

test("du cash libre n'est pas présenté comme bénéfice retirable si le résultat net est négatif", () => {
  const { calculateSmartCapital } = loadSource("lib/smart-capital.ts");
  const result = calculateSmartCapital({
    cash: 8_000,
    netProfit: -300,
    unpaidPurchases: 1_000,
    unpaidOperatingExpenses: 500,
    safetyReserve: 1_000,
    theoreticalReinvestment: 2_000,
    theoreticalSalary: 1_200,
    theoreticalEmergency: 800,
  });

  assert.equal(result.freeCashAfterProtection, 5_500);
  assert.equal(result.cashBackedProfit, 0);
  assert.equal(result.fundedEnvelopePool, 0);
  assert.equal(result.reinvestableNow, 0);
  assert.equal(result.withdrawableSalary, 0);
  assert.equal(result.emergencyAvailable, 0);
  assert.equal(result.unallocatedFreeCash, 5_500);
});

test("l'interface distingue affectation théorique et argent réellement disponible", async () => {
  const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /calculateSmartCapital/);
  assert.match(dashboard, /Capital liquide réel estimé/);
  assert.match(dashboard, /Bénéfice disponible en cash/);
  assert.match(dashboard, /Retirable personnel maintenant/);
  assert.match(dashboard, /Fonds d’urgence réellement couvert/);
  assert.match(dashboard, /Argent protégé/);
  assert.match(dashboard, /Manque de couverture/);
  assert.match(dashboard, /allocationFundingRate/);
});
