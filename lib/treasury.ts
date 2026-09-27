export type TreasuryAccount = "Banque" | "Caisse" | "Espèces" | "Carte" | "Autre";

export type TreasuryOrder = {
  paymentStatus: string;
  fulfillmentType: string;
  saleAmount: number;
  shippingCost: number;
  fees: number;
  returnCost: number;
};

export type TreasuryPurchase = {
  totalCost: number;
  paymentStatus: string;
  account?: string | null;
};

export type TreasuryExpense = {
  amount: number;
  paymentStatus: string;
  account?: string | null;
};

export type TreasuryAd = {
  spend: number;
};

export type TreasuryCapital = {
  direction: string;
  amount: number;
  account?: string | null;
  isAutomatic?: boolean;
};

export type TreasuryAccounts = {
  bank: number;
  cash: number;
  other: number;
  total: number;
};

const amount = (value: number | null | undefined) => Number(value || 0);

export function normalizeTreasuryAccount(value: unknown): TreasuryAccount {
  const account = String(value || "").trim();
  if (account === "Caisse") return "Caisse";
  if (account === "Espèces") return "Espèces";
  if (account === "Carte") return "Carte";
  if (account === "Autre") return "Autre";
  return "Banque";
}

function bucketForAccount(account: string | null | undefined): keyof Omit<TreasuryAccounts, "total"> {
  const normalized = normalizeTreasuryAccount(account);
  if (normalized === "Caisse" || normalized === "Espèces") return "cash";
  if (normalized === "Autre") return "other";
  return "bank";
}

function add(accounts: Omit<TreasuryAccounts, "total">, bucket: keyof Omit<TreasuryAccounts, "total">, value: number) {
  accounts[bucket] += value;
}

export function calculateTreasuryAccounts({
  orders,
  purchases,
  expenses,
  ads,
  capital,
}: {
  orders: TreasuryOrder[];
  purchases: TreasuryPurchase[];
  expenses: TreasuryExpense[];
  ads: TreasuryAd[];
  capital: TreasuryCapital[];
}): TreasuryAccounts {
  const accounts = { bank: 0, cash: 0, other: 0 };

  for (const order of orders) {
    const bucket = order.fulfillmentType === "Magasin physique" ? "cash" : "bank";
    if (order.paymentStatus === "Encaissé") {
      add(accounts, bucket, amount(order.saleAmount) - amount(order.shippingCost) - amount(order.fees));
    }
    if (amount(order.returnCost) > 0) add(accounts, bucket, -amount(order.returnCost));
  }

  for (const purchase of purchases) {
    if (purchase.paymentStatus === "Payé") {
      add(accounts, bucketForAccount(purchase.account), -amount(purchase.totalCost));
    }
  }

  for (const expense of expenses) {
    if (expense.paymentStatus === "Payé") {
      add(accounts, bucketForAccount(expense.account), -amount(expense.amount));
    }
  }

  for (const ad of ads) {
    if (amount(ad.spend) > 0) add(accounts, "bank", -amount(ad.spend));
  }

  for (const entry of capital) {
    if (entry.isAutomatic) continue;
    const direction = entry.direction === "Entrée" ? 1 : entry.direction === "Sortie" ? -1 : 0;
    if (!direction) continue;
    add(accounts, bucketForAccount(entry.account), direction * amount(entry.amount));
  }

  const rounded = {
    bank: Math.round(accounts.bank * 100) / 100,
    cash: Math.round(accounts.cash * 100) / 100,
    other: Math.round(accounts.other * 100) / 100,
  };
  return {
    ...rounded,
    total: Math.round((rounded.bank + rounded.cash + rounded.other) * 100) / 100,
  };
}
