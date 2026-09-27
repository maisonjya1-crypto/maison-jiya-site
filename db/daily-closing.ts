import { businessDateKey } from "../lib/accounting-dates";
import { calculateTreasuryAccounts } from "../lib/treasury";

type ClosingOrder = {
  id: number;
  paymentStatus: string;
  fulfillmentType: string;
  status: string;
  saleAmount: number;
  shippingCost: number;
  fees: number;
  returnCost: number;
  paidAt: string | null;
  refundedAt: string | null;
};

type ClosingPurchase = {
  totalCost: number;
  paymentStatus: string;
  account: string | null;
  paidAt: string | null;
};

type ClosingExpense = {
  amount: number;
  paymentStatus: string;
  account: string | null;
  paidAt: string | null;
};

type ClosingAd = {
  spend: number;
  performanceDate: string;
};

type ClosingCapital = {
  direction: string;
  amount: number;
  account: string | null;
  isAutomatic: boolean;
};

export type DailyClosingPreview = {
  closeDate: string;
  expectedBank: number;
  expectedCash: number;
  expectedOther: number;
  expectedTotal: number;
  carrierMoney: number;
  receivables: number;
  unpaidPurchases: number;
  unpaidExpenses: number;
  collectedOrders: number;
  collectedAmount: number;
  refundedOrders: number;
  refundedAmount: number;
  paidPurchasesCount: number;
  paidPurchasesAmount: number;
  paidExpensesCount: number;
  paidExpensesAmount: number;
  adSpend: number;
};

export type DailyClosingActuals = {
  bank: number;
  cash: number;
  other: number;
  note: string;
  userId: number;
  userName: string;
};

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function sameBusinessDate(value: string | null, dateKey: string) {
  return Boolean(value) && businessDateKey(value as string) === dateKey;
}

function orderCashAmount(order: Pick<ClosingOrder, "saleAmount" | "shippingCost" | "fees">) {
  return roundMoney(Math.max(0, Number(order.saleAmount || 0) - Number(order.shippingCost || 0) - Number(order.fees || 0)));
}

async function closingSourceRows(database: D1Database) {
  const [orders, purchases, expenses, ads, capital] = await Promise.all([
    database.prepare(`
      SELECT
        id,
        payment_status AS paymentStatus,
        fulfillment_type AS fulfillmentType,
        status,
        sale_amount AS saleAmount,
        shipping_cost AS shippingCost,
        fees,
        return_cost AS returnCost,
        paid_at AS paidAt,
        refunded_at AS refundedAt
      FROM orders
      WHERE deleted_at IS NULL
    `).all<ClosingOrder>(),
    database.prepare(`
      SELECT
        total_cost AS totalCost,
        payment_status AS paymentStatus,
        account,
        paid_at AS paidAt
      FROM purchases
    `).all<ClosingPurchase>(),
    database.prepare(`
      SELECT
        amount,
        payment_status AS paymentStatus,
        account,
        paid_at AS paidAt
      FROM expenses
    `).all<ClosingExpense>(),
    database.prepare(`
      SELECT spend, performance_date AS performanceDate
      FROM ad_performance
    `).all<ClosingAd>(),
    database.prepare(`
      SELECT direction, amount, account, is_automatic AS isAutomatic
      FROM capital_ledger
    `).all<ClosingCapital>(),
  ]);

  return {
    orders: orders.results,
    purchases: purchases.results,
    expenses: expenses.results,
    ads: ads.results,
    capital: capital.results,
  };
}

export async function buildDailyClosingPreview(database: D1Database, closeDate = businessDateKey(new Date())): Promise<DailyClosingPreview> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closeDate)) throw new Error("Date de clôture invalide.");

  const rows = await closingSourceRows(database);
  const treasury = calculateTreasuryAccounts({
    orders: rows.orders,
    purchases: rows.purchases,
    expenses: rows.expenses,
    ads: rows.ads,
    capital: rows.capital,
  });

  const carrierOrders = rows.orders.filter((order) => order.status === "Livrée" && order.paymentStatus === "À encaisser");
  const receivableOrders = rows.orders.filter((order) =>
    ["Confirmée", "Expédiée", "En livraison"].includes(order.status)
    && order.paymentStatus === "À encaisser"
  );
  const collected = rows.orders.filter((order) => sameBusinessDate(order.paidAt, closeDate));
  const refunded = rows.orders.filter((order) => sameBusinessDate(order.refundedAt, closeDate));
  const paidPurchases = rows.purchases.filter((purchase) => purchase.paymentStatus === "Payé" && sameBusinessDate(purchase.paidAt, closeDate));
  const paidExpenses = rows.expenses.filter((expense) => expense.paymentStatus === "Payé" && sameBusinessDate(expense.paidAt, closeDate));
  const dayAds = rows.ads.filter((ad) => businessDateKey(ad.performanceDate) === closeDate);

  return {
    closeDate,
    expectedBank: roundMoney(treasury.bank),
    expectedCash: roundMoney(treasury.cash),
    expectedOther: roundMoney(treasury.other),
    expectedTotal: roundMoney(treasury.total),
    carrierMoney: roundMoney(carrierOrders.reduce((sum, order) => sum + orderCashAmount(order), 0)),
    receivables: roundMoney(receivableOrders.reduce((sum, order) => sum + orderCashAmount(order), 0)),
    unpaidPurchases: roundMoney(rows.purchases.filter((purchase) => purchase.paymentStatus !== "Payé").reduce((sum, purchase) => sum + Number(purchase.totalCost || 0), 0)),
    unpaidExpenses: roundMoney(rows.expenses.filter((expense) => expense.paymentStatus !== "Payé").reduce((sum, expense) => sum + Number(expense.amount || 0), 0)),
    collectedOrders: collected.length,
    collectedAmount: roundMoney(collected.reduce((sum, order) => sum + orderCashAmount(order), 0)),
    refundedOrders: refunded.length,
    refundedAmount: roundMoney(refunded.reduce((sum, order) => sum + orderCashAmount(order), 0)),
    paidPurchasesCount: paidPurchases.length,
    paidPurchasesAmount: roundMoney(paidPurchases.reduce((sum, purchase) => sum + Number(purchase.totalCost || 0), 0)),
    paidExpensesCount: paidExpenses.length,
    paidExpensesAmount: roundMoney(paidExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)),
    adSpend: roundMoney(dayAds.reduce((sum, ad) => sum + Number(ad.spend || 0), 0)),
  };
}

export async function saveDailyClosing(database: D1Database, actuals: DailyClosingActuals, closeDate = businessDateKey(new Date())) {
  const preview = await buildDailyClosingPreview(database, closeDate);
  const actualBank = roundMoney(actuals.bank);
  const actualCash = roundMoney(actuals.cash);
  const actualOther = roundMoney(actuals.other);
  const actualTotal = roundMoney(actualBank + actualCash + actualOther);
  const bankVariance = roundMoney(actualBank - preview.expectedBank);
  const cashVariance = roundMoney(actualCash - preview.expectedCash);
  const otherVariance = roundMoney(actualOther - preview.expectedOther);
  const totalVariance = roundMoney(actualTotal - preview.expectedTotal);
  const now = new Date().toISOString();

  await database.prepare(`
    INSERT INTO daily_closings (
      close_date,
      expected_bank, actual_bank, bank_variance,
      expected_cash, actual_cash, cash_variance,
      expected_other, actual_other, other_variance,
      expected_total, actual_total, total_variance,
      carrier_money, receivables, unpaid_purchases, unpaid_expenses,
      collected_orders, collected_amount,
      refunded_orders, refunded_amount,
      paid_purchases_count, paid_purchases_amount,
      paid_expenses_count, paid_expenses_amount,
      ad_spend, note, closed_by_user_id, closed_by_name, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(close_date) DO UPDATE SET
      expected_bank = excluded.expected_bank,
      actual_bank = excluded.actual_bank,
      bank_variance = excluded.bank_variance,
      expected_cash = excluded.expected_cash,
      actual_cash = excluded.actual_cash,
      cash_variance = excluded.cash_variance,
      expected_other = excluded.expected_other,
      actual_other = excluded.actual_other,
      other_variance = excluded.other_variance,
      expected_total = excluded.expected_total,
      actual_total = excluded.actual_total,
      total_variance = excluded.total_variance,
      carrier_money = excluded.carrier_money,
      receivables = excluded.receivables,
      unpaid_purchases = excluded.unpaid_purchases,
      unpaid_expenses = excluded.unpaid_expenses,
      collected_orders = excluded.collected_orders,
      collected_amount = excluded.collected_amount,
      refunded_orders = excluded.refunded_orders,
      refunded_amount = excluded.refunded_amount,
      paid_purchases_count = excluded.paid_purchases_count,
      paid_purchases_amount = excluded.paid_purchases_amount,
      paid_expenses_count = excluded.paid_expenses_count,
      paid_expenses_amount = excluded.paid_expenses_amount,
      ad_spend = excluded.ad_spend,
      note = excluded.note,
      closed_by_user_id = excluded.closed_by_user_id,
      closed_by_name = excluded.closed_by_name,
      updated_at = excluded.updated_at
  `).bind(
    preview.closeDate,
    preview.expectedBank, actualBank, bankVariance,
    preview.expectedCash, actualCash, cashVariance,
    preview.expectedOther, actualOther, otherVariance,
    preview.expectedTotal, actualTotal, totalVariance,
    preview.carrierMoney, preview.receivables, preview.unpaidPurchases, preview.unpaidExpenses,
    preview.collectedOrders, preview.collectedAmount,
    preview.refundedOrders, preview.refundedAmount,
    preview.paidPurchasesCount, preview.paidPurchasesAmount,
    preview.paidExpensesCount, preview.paidExpensesAmount,
    preview.adSpend, actuals.note.slice(0, 500), actuals.userId, actuals.userName.slice(0, 120), now, now,
  ).run();

  return {
    ...preview,
    actualBank,
    actualCash,
    actualOther,
    actualTotal,
    bankVariance,
    cashVariance,
    otherVariance,
    totalVariance,
  };
}
