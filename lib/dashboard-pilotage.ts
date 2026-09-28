import { businessDateKey } from "./accounting-dates";

export type PilotageOrder = {
  id: number;
  productId?: number | null;
  products: string;
  quantity: number;
  saleAmount: number;
  status: string;
  createdAt: string;
};

export type PilotageExpense = {
  amount: number;
  expenseDate: string;
};

export type PilotageAd = {
  spend: number;
  performanceDate: string;
};

export type PilotageTopSale = {
  label: string;
  orders: number;
  revenue: number;
};

export type DashboardPilotage = {
  pendingOrders: number;
  pendingValue: number;
  confirmedOrders: number;
  confirmedValue: number;
  transitOrders: number;
  monthExpenses: number;
  monthAdSpend: number;
  topDeliveredSales: PilotageTopSale[];
};

const amount = (value: number | null | undefined) => Number(value || 0);
const monthKeyFromBusinessDate = (value: string) => businessDateKey(value).slice(0, 7);

function saleLabel(order: PilotageOrder) {
  const label = String(order.products || "").trim().replace(/\s+/g, " ");
  if (label) return label;
  if (order.productId) return `Produit #${order.productId}`;
  return "Vente sans libellé";
}

export function buildDashboardPilotage({
  orders,
  expenses,
  ads,
  now = new Date(),
}: {
  orders: PilotageOrder[];
  expenses: PilotageExpense[];
  ads: PilotageAd[];
  now?: Date;
}): DashboardPilotage {
  const currentMonth = businessDateKey(now).slice(0, 7);
  const pending = orders.filter((order) => order.status === "En attente");
  const confirmed = orders.filter((order) => order.status === "Confirmée");
  const transit = orders.filter((order) => order.status === "Expédiée" || order.status === "En livraison");
  const topSales = new Map<string, PilotageTopSale>();
  for (const order of orders) {
    if (order.status !== "Livrée") continue;
    const label = saleLabel(order);
    const current = topSales.get(label) || { label, orders: 0, revenue: 0 };
    current.orders += 1;
    current.revenue += amount(order.saleAmount);
    topSales.set(label, current);
  }

  return {
    pendingOrders: pending.length,
    pendingValue: pending.reduce((sum, order) => sum + amount(order.saleAmount), 0),
    confirmedOrders: confirmed.length,
    confirmedValue: confirmed.reduce((sum, order) => sum + amount(order.saleAmount), 0),
    transitOrders: transit.length,
    monthExpenses: expenses
      .filter((expense) => monthKeyFromBusinessDate(expense.expenseDate) === currentMonth)
      .reduce((sum, expense) => sum + amount(expense.amount), 0),
    monthAdSpend: ads
      .filter((ad) => monthKeyFromBusinessDate(ad.performanceDate) === currentMonth)
      .reduce((sum, ad) => sum + amount(ad.spend), 0),
    topDeliveredSales: [...topSales.values()]
      .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders || a.label.localeCompare(b.label, "fr"))
      .slice(0, 5)
      .map((row) => ({ ...row, revenue: Math.round((row.revenue + Number.EPSILON) * 100) / 100 })),
  };
}
