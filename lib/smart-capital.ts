export type SmartCapitalInput = {
  cash: number;
  netProfit: number;
  unpaidPurchases: number;
  unpaidOperatingExpenses: number;
  safetyReserve: number;
  theoreticalReinvestment: number;
  theoreticalSalary: number;
  theoreticalEmergency: number;
};

export type SmartCapitalSummary = {
  realLiquidCapital: number;
  supplierReserve: number;
  expenseReserve: number;
  safetyReserve: number;
  protectedTotal: number;
  protectionShortfall: number;
  freeCashAfterProtection: number;
  cashBackedProfit: number;
  fundedEnvelopePool: number;
  allocationFundingRate: number;
  reinvestableNow: number;
  withdrawableSalary: number;
  emergencyAvailable: number;
  unallocatedFreeCash: number;
};

const money = (value: number | null | undefined) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function calculateSmartCapital(input: SmartCapitalInput): SmartCapitalSummary {
  const cash = money(input.cash);
  const supplierReserve = Math.max(0, money(input.unpaidPurchases));
  const expenseReserve = Math.max(0, money(input.unpaidOperatingExpenses));
  const safetyReserve = Math.max(0, money(input.safetyReserve));
  const protectedTotal = money(supplierReserve + expenseReserve + safetyReserve);
  const protectionShortfall = money(Math.max(0, protectedTotal - cash));
  const freeCashAfterProtection = money(Math.max(0, cash - protectedTotal));

  // Les enveloppes "Réinvestissement / Salaire / Urgence" viennent de la marge
  // des commandes encaissées. Elles ne doivent jamais être considérées comme
  // réellement disponibles au-delà du bénéfice net positif et du cash libre.
  const positiveProfit = Math.max(0, money(input.netProfit));
  const cashBackedProfit = money(Math.min(positiveProfit, freeCashAfterProtection));

  const theoreticalReinvestment = Math.max(0, money(input.theoreticalReinvestment));
  const theoreticalSalary = Math.max(0, money(input.theoreticalSalary));
  const theoreticalEmergency = Math.max(0, money(input.theoreticalEmergency));
  const theoreticalEnvelopeTotal = money(
    theoreticalReinvestment + theoreticalSalary + theoreticalEmergency,
  );

  const fundedEnvelopePool = money(Math.min(cashBackedProfit, theoreticalEnvelopeTotal));
  const allocationFundingRate = theoreticalEnvelopeTotal > 0
    ? Math.min(1, fundedEnvelopePool / theoreticalEnvelopeTotal)
    : 0;

  const reinvestableNow = money(theoreticalReinvestment * allocationFundingRate);
  const withdrawableSalary = money(theoreticalSalary * allocationFundingRate);
  const emergencyAvailable = money(
    Math.max(0, fundedEnvelopePool - reinvestableNow - withdrawableSalary),
  );
  const unallocatedFreeCash = money(Math.max(0, freeCashAfterProtection - fundedEnvelopePool));

  return {
    realLiquidCapital: cash,
    supplierReserve,
    expenseReserve,
    safetyReserve,
    protectedTotal,
    protectionShortfall,
    freeCashAfterProtection,
    cashBackedProfit,
    fundedEnvelopePool,
    allocationFundingRate,
    reinvestableNow,
    withdrawableSalary,
    emergencyAvailable,
    unallocatedFreeCash,
  };
}
