import { businessDateKey, deliveryRecognitionDate } from "./accounting-dates";

export type MonthlyClosingOrder = {
  id: number;
  status: string;
  paymentStatus: string;
  saleAmount: number;
  productCost: number;
  shippingCost: number;
  fees: number;
  returnCost: number;
  paidAt: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

export type MonthlyClosingHistory = {
  orderId: number;
  toStatus: string;
  changedAt: string;
};

export type MonthlyClosingExpense = {
  amount: number;
  expenseDate: string;
};

export type MonthlyClosingAd = {
  spend: number;
  performanceDate: string;
};

export type MonthlyClosingInventoryCount = {
  lossValue: number;
  createdAt: string;
};

export type MonthlyClosingCapital = {
  direction: string;
  category: string;
  amount: number;
  isAutomatic: boolean;
  entryDate: string;
};

export type MonthlyClosingCarrierSettlement = {
  differenceAmount: number;
  settlementDate: string;
};

export type MonthlyFinancialSnapshot = {
  monthKey: string;
  periodStart: string;
  periodEnd: string;
  deliveredOrders: number;
  deliveredRevenue: number;
  collectedAmount: number;
  productCost: number;
  shippingCost: number;
  fees: number;
  returnCost: number;
  adSpend: number;
  operatingExpenses: number;
  inventoryLoss: number;
  carrierAdjustment: number;
  contributionMargin: number;
  netProfit: number;
  reinvestmentAllocated: number;
  manualCapitalIn: number;
  manualCapitalOut: number;
  stockValueStart: number | null;
  stockValueEnd: number;
  stockValueSource: string;
  cashEnd: number;
  cashEndSource: string;
};

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function monthBounds(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new Error("Mois de clôture invalide.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("Mois de clôture invalide.");
  const end = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  return {
    start: `${monthKey}-01`,
    end: end.toISOString().slice(0, 10),
  };
}

export function previousMonthKey(monthKey: string) {
  const { start } = monthBounds(monthKey);
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

export function isCompletedBusinessMonth(monthKey: string, todayKey: string) {
  monthBounds(monthKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) throw new Error("Date métier invalide.");
  return monthKey < todayKey.slice(0, 7);
}

function inPeriod(value: string | null | undefined, start: string, end: string) {
  if (!value) return false;
  const key = businessDateKey(value);
  return key >= start && key <= end;
}

export function buildMonthlyFinancialSnapshot({
  monthKey,
  orders,
  history,
  expenses,
  ads,
  inventoryCounts,
  capital,
  carrierSettlements,
  stockValueStart,
  stockValueEnd,
  stockValueSource,
  cashEnd,
  cashEndSource,
}: {
  monthKey: string;
  orders: MonthlyClosingOrder[];
  history: MonthlyClosingHistory[];
  expenses: MonthlyClosingExpense[];
  ads: MonthlyClosingAd[];
  inventoryCounts: MonthlyClosingInventoryCount[];
  capital: MonthlyClosingCapital[];
  carrierSettlements: MonthlyClosingCarrierSettlement[];
  stockValueStart: number | null;
  stockValueEnd: number;
  stockValueSource: string;
  cashEnd: number;
  cashEndSource: string;
}): MonthlyFinancialSnapshot {
  const { start, end } = monthBounds(monthKey);

  const delivered = orders.filter((order) => {
    if (order.status !== "Livrée") return false;
    const recognizedAt = deliveryRecognitionDate(order, history);
    return Boolean(recognizedAt) && inPeriod(recognizedAt, start, end);
  });
  const collected = orders.filter((order) => order.paymentStatus === "Encaissé" && inPeriod(order.paidAt, start, end));
  const periodExpenses = expenses.filter((expense) => inPeriod(expense.expenseDate, start, end));
  const periodAds = ads.filter((ad) => inPeriod(ad.performanceDate, start, end));
  const periodInventory = inventoryCounts.filter((count) => inPeriod(count.createdAt, start, end));
  const periodCapital = capital.filter((entry) => inPeriod(entry.entryDate, start, end));
  const periodCarrier = carrierSettlements.filter((settlement) => inPeriod(settlement.settlementDate, start, end));

  const deliveredRevenue = roundMoney(delivered.reduce((sum, order) => sum + Number(order.saleAmount || 0), 0));
  const productCost = roundMoney(delivered.reduce((sum, order) => sum + Number(order.productCost || 0), 0));
  const shippingCost = roundMoney(delivered.reduce((sum, order) => sum + Number(order.shippingCost || 0), 0));
  const fees = roundMoney(delivered.reduce((sum, order) => sum + Number(order.fees || 0), 0));
  const returnCost = roundMoney(delivered.reduce((sum, order) => sum + Number(order.returnCost || 0), 0));
  const adSpend = roundMoney(periodAds.reduce((sum, ad) => sum + Number(ad.spend || 0), 0));
  const operatingExpenses = roundMoney(periodExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0));
  const inventoryLoss = roundMoney(periodInventory.reduce((sum, count) => sum + Math.max(0, Number(count.lossValue || 0)), 0));
  const carrierAdjustment = roundMoney(periodCarrier.reduce((sum, settlement) => sum + Number(settlement.differenceAmount || 0), 0));
  const contributionMargin = roundMoney(deliveredRevenue - productCost - shippingCost - fees - returnCost);
  const netProfit = roundMoney(contributionMargin - adSpend - operatingExpenses - inventoryLoss + carrierAdjustment);
  const collectedAmount = roundMoney(collected.reduce((sum, order) => sum + Number(order.saleAmount || 0), 0));
  const reinvestmentAllocated = roundMoney(periodCapital
    .filter((entry) => entry.isAutomatic && entry.category === "Réinvestissement")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  const manualCapitalIn = roundMoney(periodCapital
    .filter((entry) => !entry.isAutomatic && entry.direction === "Entrée")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  const manualCapitalOut = roundMoney(periodCapital
    .filter((entry) => !entry.isAutomatic && entry.direction === "Sortie")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0));

  return {
    monthKey,
    periodStart: start,
    periodEnd: end,
    deliveredOrders: delivered.length,
    deliveredRevenue,
    collectedAmount,
    productCost,
    shippingCost,
    fees,
    returnCost,
    adSpend,
    operatingExpenses,
    inventoryLoss,
    carrierAdjustment,
    contributionMargin,
    netProfit,
    reinvestmentAllocated,
    manualCapitalIn,
    manualCapitalOut,
    stockValueStart: stockValueStart === null ? null : roundMoney(stockValueStart),
    stockValueEnd: roundMoney(stockValueEnd),
    stockValueSource: stockValueSource.slice(0, 160),
    cashEnd: roundMoney(cashEnd),
    cashEndSource: cashEndSource.slice(0, 160),
  };
}
