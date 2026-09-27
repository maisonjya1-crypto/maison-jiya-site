export type SupplierStatementPurchase = {
  id: number;
  supplierId: number | null;
  supplier: string;
  purchaseRef: string | null;
  purchaseLineNo: number;
  invoiceId: number | null;
  procurementStatus: string;
  totalCost: number;
  paymentStatus: string;
  paidAt: string | null;
  orderedAt: string | null;
  createdAt: string;
};

export type SupplierStatementInvoice = {
  id: number;
  supplierId: number;
  purchaseRef: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  remainingAmount: number;
  isOverdue: boolean;
};

export type SupplierStatementPayment = {
  id: number;
  invoiceId: number;
  amount: number;
  account: string;
  paidAt: string;
  reference: string;
  note: string;
};

export type SupplierStatementEntry = {
  key: string;
  date: string;
  kind: "Facture" | "Paiement" | "Achat historique" | "Règlement historique";
  reference: string;
  detail: string;
  debit: number;
  credit: number;
  balance: number;
};

export type SupplierStatement = {
  entries: SupplierStatementEntry[];
  totalBilled: number;
  totalPaid: number;
  balance: number;
  overdueAmount: number;
  openInvoiceCount: number;
  invoiceCount: number;
  paymentCount: number;
  orderCount: number;
};

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function sameSupplier(purchase: SupplierStatementPurchase, supplierId: number, supplierName: string) {
  if (purchase.supplierId) return purchase.supplierId === supplierId;
  return purchase.supplier.trim().toLocaleLowerCase("fr") === supplierName.trim().toLocaleLowerCase("fr");
}

function legacyGroupKey(purchase: SupplierStatementPurchase) {
  return purchase.purchaseRef || `legacy-${purchase.id}`;
}

export function buildSupplierStatement(
  supplierId: number,
  supplierName: string,
  purchases: SupplierStatementPurchase[],
  invoices: SupplierStatementInvoice[],
  payments: SupplierStatementPayment[],
): SupplierStatement {
  const supplierPurchases = purchases.filter((purchase) =>
    sameSupplier(purchase, supplierId, supplierName)
    && !purchase.invoiceId
    && !["Brouillon", "Annulé"].includes(purchase.procurementStatus),
  );
  const supplierInvoices = invoices.filter((invoice) => invoice.supplierId === supplierId);
  const invoiceIds = new Set(supplierInvoices.map((invoice) => invoice.id));
  const supplierPayments = payments.filter((payment) => invoiceIds.has(payment.invoiceId));
  const rawEntries: Omit<SupplierStatementEntry, "balance">[] = [];

  for (const invoice of supplierInvoices) {
    rawEntries.push({
      key: `invoice-${invoice.id}`,
      date: invoice.invoiceDate,
      kind: "Facture",
      reference: invoice.invoiceNumber,
      detail: `${invoice.purchaseRef} · échéance ${invoice.dueDate}${invoice.isOverdue && invoice.remainingAmount > 0 ? " · en retard" : ""}`,
      debit: roundMoney(invoice.totalAmount),
      credit: 0,
    });
  }

  for (const payment of supplierPayments) {
    const invoice = supplierInvoices.find((item) => item.id === payment.invoiceId);
    rawEntries.push({
      key: `payment-${payment.id}`,
      date: payment.paidAt,
      kind: "Paiement",
      reference: payment.reference || invoice?.invoiceNumber || `Paiement #${payment.id}`,
      detail: `${invoice?.invoiceNumber || "Facture"} · ${payment.account}${payment.note ? ` · ${payment.note}` : ""}`,
      debit: 0,
      credit: roundMoney(payment.amount),
    });
  }

  const legacyGroups = new Map<string, SupplierStatementPurchase[]>();
  for (const purchase of supplierPurchases) {
    const key = legacyGroupKey(purchase);
    const rows = legacyGroups.get(key) || [];
    rows.push(purchase);
    legacyGroups.set(key, rows);
  }

  for (const [key, lines] of legacyGroups) {
    const ordered = [...lines].sort((left, right) =>
      (left.orderedAt || left.createdAt).localeCompare(right.orderedAt || right.createdAt)
      || left.purchaseLineNo - right.purchaseLineNo
      || left.id - right.id,
    );
    const first = ordered[0];
    const total = roundMoney(ordered.reduce((sum, line) => sum + Number(line.totalCost || 0), 0));
    const paid = roundMoney(ordered
      .filter((line) => line.paymentStatus === "Payé")
      .reduce((sum, line) => sum + Number(line.totalCost || 0), 0));
    const reference = first.purchaseRef || `#${first.id}`;
    rawEntries.push({
      key: `legacy-purchase-${key}`,
      date: first.orderedAt || first.createdAt,
      kind: "Achat historique",
      reference,
      detail: `${ordered.length} ligne${ordered.length === 1 ? "" : "s"} · sans facture fournisseur dédiée`,
      debit: total,
      credit: 0,
    });
    if (paid > 0) {
      const paidDates = ordered.filter((line) => line.paymentStatus === "Payé").map((line) => line.paidAt || line.createdAt).sort();
      rawEntries.push({
        key: `legacy-payment-${key}`,
        date: paidDates[paidDates.length - 1] || first.createdAt,
        kind: "Règlement historique",
        reference,
        detail: "Paiement repris depuis l’ancien suivi des achats",
        debit: 0,
        credit: paid,
      });
    }
  }

  const priority: Record<SupplierStatementEntry["kind"], number> = {
    "Facture": 0,
    "Achat historique": 0,
    "Paiement": 1,
    "Règlement historique": 1,
  };
  rawEntries.sort((left, right) =>
    left.date.localeCompare(right.date)
    || priority[left.kind] - priority[right.kind]
    || left.key.localeCompare(right.key),
  );

  let runningBalance = 0;
  const entries = rawEntries.map((entry) => {
    runningBalance = roundMoney(runningBalance + entry.debit - entry.credit);
    return { ...entry, balance: runningBalance };
  });

  const totalBilled = roundMoney(entries.reduce((sum, entry) => sum + entry.debit, 0));
  const totalPaid = roundMoney(entries.reduce((sum, entry) => sum + entry.credit, 0));
  const overdueAmount = roundMoney(supplierInvoices
    .filter((invoice) => invoice.isOverdue && invoice.remainingAmount > 0)
    .reduce((sum, invoice) => sum + invoice.remainingAmount, 0));

  return {
    entries,
    totalBilled,
    totalPaid,
    balance: roundMoney(Math.max(0, totalBilled - totalPaid)),
    overdueAmount,
    openInvoiceCount: supplierInvoices.filter((invoice) => invoice.remainingAmount > 0).length,
    invoiceCount: supplierInvoices.length,
    paymentCount: supplierPayments.length,
    orderCount: new Set(supplierPurchases.map(legacyGroupKey).concat(supplierInvoices.map((invoice) => invoice.purchaseRef))).size,
  };
}
