export type AccountingOrder = {
  id: number;
  status: string;
  createdAt: string;
  updatedAt?: string | null;
  paidAt?: string | null;
};

export type AccountingStatusEvent = {
  orderId: number;
  toStatus: string;
  changedAt: string;
};

function parseDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return new Date(`${trimmed}T12:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed.replace(" ", "T")}Z`);
  }
  return new Date(trimmed);
}

export function businessDateKey(value: string | Date) {
  const date = value instanceof Date ? value : parseDate(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value.slice(0, 10) : "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function latestStatusDate(orderId: number, status: string, history: AccountingStatusEvent[]) {
  return history
    .filter((event) => event.orderId === orderId && event.toStatus === status)
    .map((event) => event.changedAt)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null;
}

export function deliveryRecognitionDate(order: AccountingOrder, history: AccountingStatusEvent[]) {
  if (order.status !== "Livrée") return null;
  return latestStatusDate(order.id, "Livrée", history) || order.updatedAt || order.createdAt;
}

export function paymentRecognitionDate(order: AccountingOrder) {
  return order.paidAt || null;
}

export function isBusinessDateBetween(value: string, startKey: string, endKey: string) {
  const key = businessDateKey(value);
  return key >= startKey && key <= endKey;
}
