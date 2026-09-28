import { businessDateKey, deliveryRecognitionDate, type AccountingStatusEvent } from "./accounting-dates";

export type AlertLevel = "critical" | "warning" | "info" | "positive";

export type DashboardAlert = {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  target: "Commandes" | "Factures fournisseurs" | "Dépenses" | "Rapports";
  count?: number;
  amount?: number;
};

export type AlertOrder = {
  id: number;
  products: string;
  saleAmount: number;
  status: string;
  createdAt: string;
  updatedAt?: string | null;
};

export type AlertSupplierInvoice = {
  id: number;
  supplierName?: string | null;
  invoiceNumber: string;
  dueDate: string;
  remainingAmount: number;
  paymentStatus: string;
};

export type AlertExpense = {
  id: number;
  label: string;
  amount: number;
  expenseDate: string;
  recurringExpenseId?: number | null;
};

const amount = (value: number | null | undefined) => Number(value || 0);
const DAY_MS = 86_400_000;

function dateKeyToUtcMs(key: string) {
  const parsed = Date.parse(`${key}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysBetween(leftKey: string, rightKey: string) {
  return Math.round((dateKeyToUtcMs(rightKey) - dateKeyToUtcMs(leftKey)) / DAY_MS);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function orderLabel(order: AlertOrder) {
  const label = String(order.products || "").trim().replace(/\s+/g, " ");
  return label || `Commande #${order.id}`;
}

export function buildDashboardAlerts({
  orders,
  supplierInvoices,
  expenses,
  orderStatusHistory,
  now = new Date(),
}: {
  orders: AlertOrder[];
  supplierInvoices: AlertSupplierInvoice[];
  expenses: AlertExpense[];
  orderStatusHistory: AccountingStatusEvent[];
  now?: Date;
}): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  const nowMs = now.getTime();
  const todayKey = businessDateKey(now);

  const stalePending = orders
    .filter((order) => order.status === "En attente")
    .map((order) => ({
      order,
      ageHours: Math.max(0, (nowMs - new Date(order.createdAt).getTime()) / 3_600_000),
    }))
    .filter((row) => Number.isFinite(row.ageHours) && row.ageHours >= 24)
    .sort((a, b) => b.ageHours - a.ageHours);

  if (stalePending.length) {
    const oldestHours = Math.floor(stalePending[0].ageHours);
    const total = stalePending.reduce((sum, row) => sum + amount(row.order.saleAmount), 0);
    alerts.push({
      id: "orders-pending-stale",
      level: oldestHours >= 48 ? "critical" : "warning",
      title: `${stalePending.length} commande${stalePending.length > 1 ? "s" : ""} en attente depuis plus de 24 h`,
      detail: `La plus ancienne attend depuis environ ${oldestHours} h. Vérifier la confirmation cliente.`,
      target: "Commandes",
      count: stalePending.length,
      amount: total,
    });
  }

  const unpaidInvoices = supplierInvoices.filter(
    (invoice) => invoice.paymentStatus !== "Payé" && amount(invoice.remainingAmount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(invoice.dueDate),
  );
  const overdue = unpaidInvoices.filter((invoice) => invoice.dueDate < todayKey);
  if (overdue.length) {
    const total = overdue.reduce((sum, invoice) => sum + amount(invoice.remainingAmount), 0);
    const oldest = [...overdue].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    alerts.push({
      id: "supplier-invoices-overdue",
      level: "critical",
      title: `${overdue.length} facture${overdue.length > 1 ? "s" : ""} fournisseur en retard`,
      detail: `Échéance la plus ancienne : ${oldest.dueDate}. Montant restant à régler : ${Math.round(total * 100) / 100} MAD.`,
      target: "Factures fournisseurs",
      count: overdue.length,
      amount: total,
    });
  }

  const dueSoon = unpaidInvoices
    .map((invoice) => ({ invoice, days: daysBetween(todayKey, invoice.dueDate) }))
    .filter((row) => row.days >= 0 && row.days <= 7)
    .sort((a, b) => a.days - b.days);
  if (dueSoon.length) {
    const total = dueSoon.reduce((sum, row) => sum + amount(row.invoice.remainingAmount), 0);
    alerts.push({
      id: "supplier-invoices-due-soon",
      level: "warning",
      title: `${dueSoon.length} facture${dueSoon.length > 1 ? "s" : ""} fournisseur due${dueSoon.length > 1 ? "s" : ""} sous 7 jours`,
      detail: `Prochaine échéance dans ${dueSoon[0].days} jour${dueSoon[0].days > 1 ? "s" : ""}. À prévoir : ${Math.round(total * 100) / 100} MAD.`,
      target: "Factures fournisseurs",
      count: dueSoon.length,
      amount: total,
    });
  }

  const sixtyDaysAgo = dateKeyToUtcMs(todayKey) - 60 * DAY_MS;
  const sevenDaysAgo = dateKeyToUtcMs(todayKey) - 7 * DAY_MS;
  const manualRecentExpenses = expenses.filter((expense) => {
    if (expense.recurringExpenseId) return false;
    const keyMs = dateKeyToUtcMs(businessDateKey(expense.expenseDate));
    return keyMs >= sixtyDaysAgo && keyMs <= dateKeyToUtcMs(todayKey) && amount(expense.amount) > 0;
  });
  const baselineAmounts = manualRecentExpenses.map((expense) => amount(expense.amount));
  const baselineMedian = median(baselineAmounts);
  if (baselineAmounts.length >= 5 && baselineMedian > 0) {
    const threshold = Math.max(300, baselineMedian * 2.5);
    const unusual = manualRecentExpenses
      .filter((expense) => {
        const keyMs = dateKeyToUtcMs(businessDateKey(expense.expenseDate));
        return keyMs >= sevenDaysAgo && amount(expense.amount) >= threshold;
      })
      .sort((a, b) => amount(b.amount) - amount(a.amount));

    if (unusual.length) {
      const highest = unusual[0];
      alerts.push({
        id: "unusual-expense",
        level: "warning",
        title: "Dépense récente nettement supérieure à l’habitude",
        detail: `${highest.label || "Dépense"} : ${Math.round(amount(highest.amount) * 100) / 100} MAD, contre une médiane récente de ${Math.round(baselineMedian * 100) / 100} MAD.`,
        target: "Dépenses",
        count: unusual.length,
        amount: amount(highest.amount),
      });
    }
  }

  const deliveryEvents = new Map<number, string>();
  for (const order of orders) {
    if (order.status !== "Livrée") continue;
    const date = deliveryRecognitionDate(order, orderStatusHistory);
    if (date) deliveryEvents.set(order.id, businessDateKey(date));
  }

  const todayMs = dateKeyToUtcMs(todayKey);
  const recentStart = todayMs - 13 * DAY_MS;
  const previousStart = todayMs - 27 * DAY_MS;
  const previousEnd = todayMs - 14 * DAY_MS;
  const momentum = new Map<string, { recent: number; previous: number; recentRevenue: number }>();

  for (const order of orders) {
    if (order.status !== "Livrée") continue;
    const deliveryKey = deliveryEvents.get(order.id);
    if (!deliveryKey) continue;
    const deliveredMs = dateKeyToUtcMs(deliveryKey);
    const label = orderLabel(order);
    const row = momentum.get(label) || { recent: 0, previous: 0, recentRevenue: 0 };
    if (deliveredMs >= recentStart && deliveredMs <= todayMs) {
      row.recent += 1;
      row.recentRevenue += amount(order.saleAmount);
    } else if (deliveredMs >= previousStart && deliveredMs <= previousEnd) {
      row.previous += 1;
    }
    momentum.set(label, row);
  }

  const rising = [...momentum.entries()]
    .filter(([, row]) => row.recent >= 3 && row.recent >= Math.max(3, row.previous * 2))
    .sort(([, a], [, b]) => b.recent - a.recent || b.recentRevenue - a.recentRevenue)[0];

  if (rising) {
    const [label, row] = rising;
    const comparison = row.previous
      ? `${row.previous} sur les 14 jours précédents`
      : "aucune sur les 14 jours précédents";
    alerts.push({
      id: "sales-momentum",
      level: "positive",
      title: `${label} accélère sur les ventes livrées`,
      detail: `${row.recent} livraisons sur les 14 derniers jours, contre ${comparison}. CA livré récent : ${Math.round(row.recentRevenue * 100) / 100} MAD.`,
      target: "Rapports",
      count: row.recent,
      amount: row.recentRevenue,
    });
  }

  const priority: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
  return alerts.sort((a, b) => priority[a.level] - priority[b.level] || a.title.localeCompare(b.title, "fr"));
}
