export type CashflowForecastInvoice = {
  id: number;
  supplierName: string | null;
  invoiceNumber: string;
  dueDate: string;
  remainingAmount: number;
};

export type CashflowForecastExpense = {
  id: number;
  label: string;
  category: string;
  amount: number;
  paymentStatus: string;
  expenseDate: string;
};

export type CashflowForecastPurchase = {
  id: number;
  purchaseRef: string | null;
  supplier: string;
  totalCost: number;
  paymentStatus: string;
  invoiceId: number | null;
  procurementStatus: string;
};

export type CashflowForecastOrder = {
  id: number;
  orderRef: string;
  status: string;
  paymentStatus: string;
  saleAmount: number;
  shippingCost: number;
  fees: number;
};

export type CashflowEvent = {
  key: string;
  date: string;
  kind: "Facture fournisseur" | "Dépense" | "Achat proposé";
  label: string;
  detail: string;
  amount: number;
  direction: "Sortie";
  scenario: boolean;
  balanceAfter: number;
  scenarioBalanceAfter: number;
};

export type CashflowHorizon = {
  days: 7 | 30 | 60;
  date: string;
  scheduledOutflows: number;
  baselineBalance: number;
  scenarioBalance: number;
  reserveGap: number;
  scenarioReserveGap: number;
};

export type CashflowForecast = {
  asOf: string;
  openingCash: number;
  safetyReserve: number;
  plannedPurchaseSpend: number;
  scheduledOutflows60: number;
  undatedSupplierCommitments: number;
  deliveredReceivables: number;
  transitReceivables: number;
  events: CashflowEvent[];
  horizons: CashflowHorizon[];
  firstReserveRiskDate: string | null;
  firstNegativeDate: string | null;
  scenarioFirstReserveRiskDate: string | null;
  scenarioFirstNegativeDate: string | null;
};

const roundMoney = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function dateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value || "") ? value.slice(0, 10) : "";
}

function addDays(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function effectiveDueDate(value: string, asOf: string) {
  const key = dateKey(value);
  if (!key) return asOf;
  return key < asOf ? asOf : key;
}

function orderNet(order: CashflowForecastOrder) {
  return roundMoney(Math.max(0, Number(order.saleAmount || 0) - Number(order.shippingCost || 0) - Number(order.fees || 0)));
}

export function buildCashflowForecast({
  asOf,
  openingCash,
  safetyReserve,
  supplierInvoices,
  expenses,
  purchases,
  orders,
  plannedPurchaseSpend = 0,
}: {
  asOf: string;
  openingCash: number;
  safetyReserve: number;
  supplierInvoices: CashflowForecastInvoice[];
  expenses: CashflowForecastExpense[];
  purchases: CashflowForecastPurchase[];
  orders: CashflowForecastOrder[];
  plannedPurchaseSpend?: number;
}): CashflowForecast {
  const today = dateKey(asOf);
  if (!today) throw new Error("Date de prévision invalide.");

  const opening = roundMoney(openingCash);
  const reserve = roundMoney(Math.max(0, safetyReserve));
  const planned = roundMoney(Math.max(0, plannedPurchaseSpend));
  const rawEvents: Omit<CashflowEvent, "balanceAfter" | "scenarioBalanceAfter">[] = [];

  for (const invoice of supplierInvoices) {
    const remaining = roundMoney(Math.max(0, invoice.remainingAmount));
    if (remaining <= 0) continue;
    rawEvents.push({
      key: `invoice-${invoice.id}`,
      date: effectiveDueDate(invoice.dueDate, today),
      kind: "Facture fournisseur",
      label: invoice.supplierName || "Fournisseur",
      detail: `${invoice.invoiceNumber} · échéance ${dateKey(invoice.dueDate) || "non renseignée"}`,
      amount: remaining,
      direction: "Sortie",
      scenario: false,
    });
  }

  for (const expense of expenses) {
    if (expense.paymentStatus === "Payé") continue;
    const amount = roundMoney(Math.max(0, expense.amount));
    if (amount <= 0) continue;
    rawEvents.push({
      key: `expense-${expense.id}`,
      date: effectiveDueDate(expense.expenseDate, today),
      kind: "Dépense",
      label: expense.label,
      detail: expense.category,
      amount,
      direction: "Sortie",
      scenario: false,
    });
  }

  if (planned > 0) {
    rawEvents.push({
      key: "planned-purchases",
      date: today,
      kind: "Achat proposé",
      label: "Plan d’achat intelligent",
      detail: "Scénario : exécution immédiate des bons finançables",
      amount: planned,
      direction: "Sortie",
      scenario: true,
    });
  }

  rawEvents.sort((left, right) =>
    left.date.localeCompare(right.date)
    || Number(left.scenario) - Number(right.scenario)
    || left.key.localeCompare(right.key),
  );

  let baseline = opening;
  let scenario = opening;
  let firstReserveRiskDate: string | null = baseline < reserve ? today : null;
  let firstNegativeDate: string | null = baseline < 0 ? today : null;
  let scenarioFirstReserveRiskDate: string | null = scenario < reserve ? today : null;
  let scenarioFirstNegativeDate: string | null = scenario < 0 ? today : null;

  const events: CashflowEvent[] = rawEvents.map((event) => {
    if (!event.scenario) baseline = roundMoney(baseline - event.amount);
    scenario = roundMoney(scenario - event.amount);
    if (!event.scenario && !firstReserveRiskDate && baseline < reserve) firstReserveRiskDate = event.date;
    if (!event.scenario && !firstNegativeDate && baseline < 0) firstNegativeDate = event.date;
    if (!scenarioFirstReserveRiskDate && scenario < reserve) scenarioFirstReserveRiskDate = event.date;
    if (!scenarioFirstNegativeDate && scenario < 0) scenarioFirstNegativeDate = event.date;
    return { ...event, balanceAfter: baseline, scenarioBalanceAfter: scenario };
  });

  const horizons = ([7, 30, 60] as const).map((days): CashflowHorizon => {
    const end = addDays(today, days);
    const scheduledOutflows = roundMoney(events
      .filter((event) => !event.scenario && event.date <= end)
      .reduce((sum, event) => sum + event.amount, 0));
    const baselineBalance = roundMoney(opening - scheduledOutflows);
    const scenarioBalance = roundMoney(baselineBalance - planned);
    return {
      days,
      date: end,
      scheduledOutflows,
      baselineBalance,
      scenarioBalance,
      reserveGap: roundMoney(baselineBalance - reserve),
      scenarioReserveGap: roundMoney(scenarioBalance - reserve),
    };
  });

  const undatedSupplierCommitments = roundMoney(purchases
    .filter((purchase) =>
      !purchase.invoiceId
      && !["Brouillon", "Annulé"].includes(purchase.procurementStatus)
      && purchase.paymentStatus !== "Payé",
    )
    .reduce((sum, purchase) => sum + Math.max(0, Number(purchase.totalCost || 0)), 0));

  const deliveredReceivables = roundMoney(orders
    .filter((order) => order.status === "Livrée" && order.paymentStatus === "À encaisser")
    .reduce((sum, order) => sum + orderNet(order), 0));

  const transitReceivables = roundMoney(orders
    .filter((order) => ["Confirmée", "Expédiée", "En livraison"].includes(order.status) && order.paymentStatus === "À encaisser")
    .reduce((sum, order) => sum + orderNet(order), 0));

  return {
    asOf: today,
    openingCash: opening,
    safetyReserve: reserve,
    plannedPurchaseSpend: planned,
    scheduledOutflows60: horizons[2].scheduledOutflows,
    undatedSupplierCommitments,
    deliveredReceivables,
    transitReceivables,
    events,
    horizons,
    firstReserveRiskDate,
    firstNegativeDate,
    scenarioFirstReserveRiskDate,
    scenarioFirstNegativeDate,
  };
}
