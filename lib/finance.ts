export type FinanceOrder = {
  status: string;
  paymentStatus: string;
  saleAmount: number;
  productCost: number;
  shippingCost: number;
  fees: number;
  returnCost: number;
};

export type FinancePurchase = {
  totalCost: number;
  paymentStatus: string;
};

export type FinanceExpense = {
  amount: number;
  paymentStatus: string;
};

export type FinanceAd = {
  spend: number;
  revenue?: number;
};

export type FinanceCapital = {
  direction: string;
  amount: number;
  category?: string;
  isAutomatic?: boolean;
};

export type FinanceSummary = {
  deliveredRevenue: number;
  deliveredOrderCosts: number;
  losses: number;
  adSpend: number;
  operatingExpenses: number;
  paidOperatingExpenses: number;
  unpaidOperatingExpenses: number;
  collected: number;
  shippingCollected: number;
  feesCollected: number;
  netCollected: number;
  paidPurchases: number;
  unpaidPurchases: number;
  manualCapitalNet: number;
  reinvestAllocation: number;
  profit: number;
  cash: number;
  margin: number;
  reinvestable: number;
};

const amount = (value: number | null | undefined) => Number(value || 0);

export function orderContributionBeforeGlobalAds(order: FinanceOrder) {
  return amount(order.saleAmount)
    - amount(order.productCost)
    - amount(order.shippingCost)
    - amount(order.fees)
    - amount(order.returnCost);
}

export function calculateOperatingProfit(
  orders: FinanceOrder[],
  ads: FinanceAd[],
  expenses: FinanceExpense[],
) {
  const delivered = orders.filter((order) => order.status === "Livrée");
  const deliveredRevenue = delivered.reduce((sum, order) => sum + amount(order.saleAmount), 0);
  const deliveredOrderCosts = delivered.reduce(
    (sum, order) => sum + amount(order.productCost) + amount(order.shippingCost) + amount(order.fees),
    0,
  );
  const losses = orders.reduce((sum, order) => sum + amount(order.returnCost), 0);
  const adSpend = ads.reduce((sum, ad) => sum + amount(ad.spend), 0);
  const operatingExpenses = expenses.reduce((sum, expense) => sum + amount(expense.amount), 0);
  const profit = deliveredRevenue - deliveredOrderCosts - losses - adSpend - operatingExpenses;

  return {
    deliveredRevenue,
    deliveredOrderCosts,
    losses,
    adSpend,
    operatingExpenses,
    profit,
    margin: deliveredRevenue ? (profit / deliveredRevenue) * 100 : 0,
  };
}

export type FinanceTotalsInput = {
  deliveredRevenue: number;
  deliveredOrderCosts: number;
  losses: number;
  adSpend: number;
  operatingExpenses: number;
  collected: number;
  shippingCollected: number;
  feesCollected: number;
  paidPurchases: number;
  unpaidPurchases: number;
  paidOperatingExpenses: number;
  unpaidOperatingExpenses: number;
  manualCapitalNet: number;
  reinvestAllocation: number;
  safetyReserve?: number;
};

export function calculateBusinessFinanceFromTotals(input: FinanceTotalsInput): FinanceSummary {
  const safetyReserve = Math.max(0, amount(input.safetyReserve));
  const netCollected = amount(input.collected) - amount(input.shippingCollected) - amount(input.feesCollected);
  const profit = amount(input.deliveredRevenue)
    - amount(input.deliveredOrderCosts)
    - amount(input.losses)
    - amount(input.adSpend)
    - amount(input.operatingExpenses);
  const cash = amount(input.manualCapitalNet)
    + netCollected
    - amount(input.paidPurchases)
    - amount(input.losses)
    - amount(input.adSpend)
    - amount(input.paidOperatingExpenses);
  const protectedAvailableCash = cash
    - amount(input.unpaidPurchases)
    - amount(input.unpaidOperatingExpenses)
    - safetyReserve;
  const reinvestable = Math.max(0, Math.min(amount(input.reinvestAllocation), protectedAvailableCash));

  return {
    deliveredRevenue: amount(input.deliveredRevenue),
    deliveredOrderCosts: amount(input.deliveredOrderCosts),
    losses: amount(input.losses),
    adSpend: amount(input.adSpend),
    operatingExpenses: amount(input.operatingExpenses),
    paidOperatingExpenses: amount(input.paidOperatingExpenses),
    unpaidOperatingExpenses: amount(input.unpaidOperatingExpenses),
    collected: amount(input.collected),
    shippingCollected: amount(input.shippingCollected),
    feesCollected: amount(input.feesCollected),
    netCollected,
    paidPurchases: amount(input.paidPurchases),
    unpaidPurchases: amount(input.unpaidPurchases),
    manualCapitalNet: amount(input.manualCapitalNet),
    reinvestAllocation: amount(input.reinvestAllocation),
    profit,
    cash,
    margin: amount(input.deliveredRevenue) ? (profit / amount(input.deliveredRevenue)) * 100 : 0,
    reinvestable,
  };
}

export function calculateBusinessFinance({
  orders,
  purchases,
  expenses,
  ads,
  capital,
  safetyReserve = 500,
}: {
  orders: FinanceOrder[];
  purchases: FinancePurchase[];
  expenses: FinanceExpense[];
  ads: FinanceAd[];
  capital: FinanceCapital[];
  safetyReserve?: number;
}): FinanceSummary {
  const operating = calculateOperatingProfit(orders, ads, expenses);

  const collectedOrders = orders.filter((order) => order.paymentStatus === "Encaissé");
  const collected = collectedOrders.reduce((sum, order) => sum + amount(order.saleAmount), 0);
  const shippingCollected = collectedOrders.reduce((sum, order) => sum + amount(order.shippingCost), 0);
  const feesCollected = collectedOrders.reduce((sum, order) => sum + amount(order.fees), 0);
  const netCollected = collected - shippingCollected - feesCollected;

  const paidPurchases = purchases
    .filter((purchase) => purchase.paymentStatus === "Payé")
    .reduce((sum, purchase) => sum + amount(purchase.totalCost), 0);
  const unpaidPurchases = purchases
    .filter((purchase) => purchase.paymentStatus !== "Payé")
    .reduce((sum, purchase) => sum + amount(purchase.totalCost), 0);

  const paidOperatingExpenses = expenses
    .filter((expense) => expense.paymentStatus === "Payé")
    .reduce((sum, expense) => sum + amount(expense.amount), 0);
  const unpaidOperatingExpenses = expenses
    .filter((expense) => expense.paymentStatus !== "Payé")
    .reduce((sum, expense) => sum + amount(expense.amount), 0);

  const manualCapitalNet = capital
    .filter((entry) => !entry.isAutomatic)
    .reduce((sum, entry) => sum + (entry.direction === "Entrée" ? amount(entry.amount) : -amount(entry.amount)), 0);

  const reinvestAllocation = capital
    .filter((entry) => entry.isAutomatic && entry.category === "Réinvestissement")
    .reduce((sum, entry) => sum + amount(entry.amount), 0);

  return calculateBusinessFinanceFromTotals({
    deliveredRevenue: operating.deliveredRevenue,
    deliveredOrderCosts: operating.deliveredOrderCosts,
    losses: operating.losses,
    adSpend: operating.adSpend,
    operatingExpenses: operating.operatingExpenses,
    collected,
    shippingCollected,
    feesCollected,
    paidPurchases,
    unpaidPurchases,
    paidOperatingExpenses,
    unpaidOperatingExpenses,
    manualCapitalNet,
    reinvestAllocation,
    safetyReserve,
  });
}
