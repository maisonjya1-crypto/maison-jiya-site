import { businessDateKey } from "../lib/accounting-dates";
import { calculateTreasuryAccounts } from "../lib/treasury";
import {
  buildMonthlyFinancialSnapshot,
  isCompletedBusinessMonth,
  previousMonthKey,
  type MonthlyClosingAd,
  type MonthlyClosingCapital,
  type MonthlyClosingCarrierSettlement,
  type MonthlyClosingExpense,
  type MonthlyClosingHistory,
  type MonthlyClosingInventoryCount,
  type MonthlyClosingOrder,
} from "../lib/monthly-closing";

type SourceOrder = MonthlyClosingOrder & { fulfillmentType: string; refundedAt: string | null };
type SourceExpense = MonthlyClosingExpense & { paymentStatus: string; account: string | null; paidAt: string | null };
type SourceCapital = MonthlyClosingCapital & { account: string | null };

type TreasuryPurchaseRow = {
  totalCost: number;
  paymentStatus: string;
  account: string | null;
  invoiceId: number | null;
  paidAt: string | null;
};

type TreasurySupplierPaymentRow = {
  amount: number;
  account: string | null;
  paidAt: string;
};

type InventorySessionValueRow = {
  sessionRef: string;
  valueAfter: number;
  completedAt: string | null;
};

type DailyClosingValueRow = {
  closeDate: string;
  actualTotal: number;
};

type PreviousMonthlyClosingRow = {
  monthKey: string;
  stockValueEnd: number | null;
};

export type MonthlyClosingSaveInput = {
  monthKey: string;
  note: string;
  userId: number;
  userName: string;
};

async function monthlySourceRows(database: D1Database) {
  const [
    orders,
    history,
    expenses,
    ads,
    inventoryCounts,
    capital,
    carrierSettlements,
    purchases,
    supplierPayments,
  ] = await Promise.all([
    database.prepare(`
      SELECT
        id,
        status,
        payment_status AS paymentStatus,
        fulfillment_type AS fulfillmentType,
        sale_amount AS saleAmount,
        product_cost AS productCost,
        shipping_cost AS shippingCost,
        fees,
        return_cost AS returnCost,
        paid_at AS paidAt,
        refunded_at AS refundedAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM orders
      WHERE deleted_at IS NULL
    `).all<SourceOrder>(),
    database.prepare(`
      SELECT order_id AS orderId, to_status AS toStatus, changed_at AS changedAt
      FROM order_status_history
    `).all<MonthlyClosingHistory>(),
    database.prepare(`
      SELECT amount, expense_date AS expenseDate, payment_status AS paymentStatus, account, paid_at AS paidAt
      FROM expenses
    `).all<SourceExpense>(),
    database.prepare(`
      SELECT spend, performance_date AS performanceDate
      FROM ad_performance
    `).all<MonthlyClosingAd>(),
    database.prepare(`
      SELECT loss_value AS lossValue, created_at AS createdAt
      FROM inventory_counts
    `).all<MonthlyClosingInventoryCount>(),
    database.prepare(`
      SELECT direction, category, amount, is_automatic AS isAutomatic, entry_date AS entryDate, account
      FROM capital_ledger
    `).all<SourceCapital>(),
    database.prepare(`
      SELECT difference_amount AS differenceAmount, settlement_date AS settlementDate
      FROM carrier_settlements
    `).all<MonthlyClosingCarrierSettlement>(),
    database.prepare(`
      SELECT
        total_cost AS totalCost,
        payment_status AS paymentStatus,
        account,
        CASE
          WHEN purchase_ref IS NOT NULL AND EXISTS (
            SELECT 1 FROM supplier_invoices WHERE supplier_invoices.purchase_ref = purchases.purchase_ref
          )
          THEN 1 ELSE NULL
        END AS invoiceId,
        paid_at AS paidAt
      FROM purchases
    `).all<TreasuryPurchaseRow>(),
    database.prepare(`
      SELECT amount, account, paid_at AS paidAt
      FROM supplier_payments
    `).all<TreasurySupplierPaymentRow>(),
  ]);

  return {
    orders: orders.results,
    history: history.results,
    expenses: expenses.results,
    ads: ads.results,
    inventoryCounts: inventoryCounts.results,
    capital: capital.results,
    carrierSettlements: carrierSettlements.results,
    purchases: purchases.results,
    supplierPayments: supplierPayments.results,
  };
}

export async function buildMonthlyClosingPreview(database: D1Database, monthKey: string) {
  const rows = await monthlySourceRows(database);
  const bounds = (() => {
    const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
    if (!match) throw new Error("Mois de clôture invalide.");
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) throw new Error("Mois de clôture invalide.");
    return {
      start: `${monthKey}-01`,
      end: new Date(Date.UTC(year, month, 0, 12, 0, 0)).toISOString().slice(0, 10),
    };
  })();

  const [latestInventory, latestDailyClosing, previousMonthlyClosing] = await Promise.all([
    database.prepare(`
      SELECT session_ref AS sessionRef, value_after AS valueAfter, completed_at AS completedAt
      FROM inventory_sessions
      WHERE status = 'Clôturé'
        AND completed_at IS NOT NULL
        AND substr(completed_at, 1, 10) BETWEEN ? AND ?
      ORDER BY datetime(completed_at) DESC, id DESC
      LIMIT 1
    `).bind(bounds.start, bounds.end).first<InventorySessionValueRow>(),
    database.prepare(`
      SELECT close_date AS closeDate, actual_total AS actualTotal
      FROM daily_closings
      WHERE close_date = ?
      LIMIT 1
    `).bind(bounds.end).first<DailyClosingValueRow>(),
    database.prepare(`
      SELECT month_key AS monthKey, stock_value_end AS stockValueEnd
      FROM monthly_closings
      WHERE month_key = ?
      LIMIT 1
    `).bind(previousMonthKey(monthKey)).first<PreviousMonthlyClosingRow>(),
  ]);

  const stockValueEnd = latestInventory ? Number(latestInventory.valueAfter || 0) : null;
  const stockValueSource = latestInventory
    ? `Inventaire ${latestInventory.sessionRef} · ${String(latestInventory.completedAt || "").slice(0, 10)}`
    : "Aucun inventaire clôturé pendant ce mois";

  const historicalTreasury = calculateTreasuryAccounts({
    orders: rows.orders
      .filter((order) => businessDateKey(order.createdAt) <= bounds.end)
      .map((order) => {
        const refundedBeforeEnd = Boolean(order.refundedAt) && businessDateKey(order.refundedAt as string) <= bounds.end;
        return {
          ...order,
          paymentStatus: refundedBeforeEnd
            ? "Remboursé"
            : order.paidAt && businessDateKey(order.paidAt) <= bounds.end
              ? "Encaissé"
              : "Non encaissé",
          returnCost: refundedBeforeEnd ? order.returnCost : 0,
        };
      }),
    purchases: rows.purchases.map((purchase) => ({
      ...purchase,
      paymentStatus: purchase.paidAt && businessDateKey(purchase.paidAt) <= bounds.end ? "Payé" : "À payer",
    })),
    supplierPayments: rows.supplierPayments.filter((payment) => businessDateKey(payment.paidAt) <= bounds.end),
    expenses: rows.expenses.map((expense) => ({
      ...expense,
      paymentStatus: expense.paidAt && businessDateKey(expense.paidAt) <= bounds.end ? "Payé" : "À payer",
    })),
    ads: rows.ads.filter((ad) => businessDateKey(ad.performanceDate) <= bounds.end),
    capital: rows.capital.filter((entry) => businessDateKey(entry.entryDate) <= bounds.end),
    carrierSettlementAdjustment: rows.carrierSettlements
      .filter((settlement) => businessDateKey(settlement.settlementDate) <= bounds.end)
      .reduce((sum, settlement) => sum + Number(settlement.differenceAmount || 0), 0),
  });
  const cashEnd = latestDailyClosing ? Number(latestDailyClosing.actualTotal || 0) : historicalTreasury.total;
  const cashEndSource = latestDailyClosing
    ? `Clôture quotidienne ${latestDailyClosing.closeDate}`
    : `Trésorerie reconstruite avec les flux datés jusqu’au ${bounds.end}`;

  return buildMonthlyFinancialSnapshot({
    monthKey,
    orders: rows.orders,
    history: rows.history,
    expenses: rows.expenses,
    ads: rows.ads,
    inventoryCounts: rows.inventoryCounts,
    capital: rows.capital,
    carrierSettlements: rows.carrierSettlements,
    stockValueStart: previousMonthlyClosing?.stockValueEnd === null || previousMonthlyClosing?.stockValueEnd === undefined ? null : Number(previousMonthlyClosing.stockValueEnd),
    stockValueEnd,
    stockValueSource,
    cashEnd,
    cashEndSource,
  });
}

export async function saveMonthlyClosing(database: D1Database, input: MonthlyClosingSaveInput) {
  const today = businessDateKey(new Date());
  if (!isCompletedBusinessMonth(input.monthKey, today)) {
    throw new Error("Un mois peut être clôturé définitivement uniquement après sa fin.");
  }

  const existing = await database.prepare(
    "SELECT id FROM monthly_closings WHERE month_key = ? LIMIT 1",
  ).bind(input.monthKey).first<{ id: number }>();
  if (existing) throw new Error("Ce mois est déjà clôturé. La photo mensuelle est immuable.");

  const snapshot = await buildMonthlyClosingPreview(database, input.monthKey);
  const now = new Date().toISOString();

  await database.prepare(`
    INSERT INTO monthly_closings (
      month_key, period_start, period_end,
      delivered_orders, delivered_revenue, collected_amount,
      product_cost, shipping_cost, fees, return_cost,
      ad_spend, operating_expenses, inventory_loss, carrier_adjustment,
      contribution_margin, net_profit,
      reinvestment_allocated, manual_capital_in, manual_capital_out,
      stock_value_start, stock_value_end, stock_value_source,
      cash_end, cash_end_source,
      note, closed_by_user_id, closed_by_name, created_at
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?
    )
  `).bind(
    snapshot.monthKey, snapshot.periodStart, snapshot.periodEnd,
    snapshot.deliveredOrders, snapshot.deliveredRevenue, snapshot.collectedAmount,
    snapshot.productCost, snapshot.shippingCost, snapshot.fees, snapshot.returnCost,
    snapshot.adSpend, snapshot.operatingExpenses, snapshot.inventoryLoss, snapshot.carrierAdjustment,
    snapshot.contributionMargin, snapshot.netProfit,
    snapshot.reinvestmentAllocated, snapshot.manualCapitalIn, snapshot.manualCapitalOut,
    snapshot.stockValueStart, snapshot.stockValueEnd, snapshot.stockValueSource,
    snapshot.cashEnd, snapshot.cashEndSource,
    input.note.slice(0, 500), input.userId, input.userName.slice(0, 120), now,
  ).run();

  return snapshot;
}
