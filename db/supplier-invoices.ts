export type SupplierInvoicePaymentState = {
  invoiceId: number;
  purchaseRef: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: "À payer" | "Partiellement payé" | "Payé";
  lastPaidAt: string | null;
};

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function supplierInvoicePaymentStatus(totalAmount: number, paidAmount: number) {
  const total = Math.max(0, roundMoney(totalAmount));
  const paid = Math.max(0, roundMoney(paidAmount));
  if (total > 0 && paid + 0.005 >= total) return "Payé" as const;
  if (paid > 0) return "Partiellement payé" as const;
  return "À payer" as const;
}

export function supplierInvoiceIsOverdue(dueDate: string, remainingAmount: number, today = new Date()) {
  if (!dueDate || remainingAmount <= 0) return false;
  const todayKey = today.toISOString().slice(0, 10);
  return dueDate < todayKey;
}

export async function getSupplierInvoicePaymentState(
  database: D1Database,
  invoiceId: number,
): Promise<SupplierInvoicePaymentState> {
  const invoice = await database.prepare(`
    SELECT id, purchase_ref AS purchaseRef, total_amount AS totalAmount
    FROM supplier_invoices
    WHERE id = ?
    LIMIT 1
  `).bind(invoiceId).first<{ id: number; purchaseRef: string; totalAmount: number }>();
  if (!invoice) throw new Error("Facture fournisseur introuvable.");

  const payment = await database.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) AS paidAmount,
      MAX(paid_at) AS lastPaidAt
    FROM supplier_payments
    WHERE invoice_id = ?
  `).bind(invoiceId).first<{ paidAmount: number; lastPaidAt: string | null }>();

  const totalAmount = roundMoney(invoice.totalAmount);
  const paidAmount = roundMoney(payment?.paidAmount || 0);
  const remainingAmount = roundMoney(Math.max(0, totalAmount - paidAmount));
  return {
    invoiceId: invoice.id,
    purchaseRef: invoice.purchaseRef,
    totalAmount,
    paidAmount,
    remainingAmount,
    paymentStatus: supplierInvoicePaymentStatus(totalAmount, paidAmount),
    lastPaidAt: payment?.lastPaidAt || null,
  };
}

export async function syncPurchaseOrderPaymentState(database: D1Database, invoiceId: number) {
  const state = await getSupplierInvoicePaymentState(database, invoiceId);
  await database.prepare(`
    UPDATE purchases
    SET payment_status = ?,
        paid_at = ?
    WHERE purchase_ref = ?
  `).bind(
    state.paymentStatus,
    state.paidAmount > 0 ? state.lastPaidAt : null,
    state.purchaseRef,
  ).run();
  return state;
}
