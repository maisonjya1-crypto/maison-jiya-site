export type PurchasePlanPriority = "Urgent" | "À prévoir" | "Pas nécessaire";
export type PurchasePlanFunding = "Financé" | "Partiel" | "Hors budget" | "À compléter";

export type PurchasePlanRecommendation = {
  productId: number;
  productCode: string;
  productName: string;
  category: string;
  stockQuantity: number;
  alertThreshold: number;
  coverDays: number;
  soldUnits30: number;
  averageDailyDemand: number;
  daysOfCover: number | null;
  pendingInbound: number;
  targetStock: number;
  recommendedQuantity: number;
  supplierId: number | null;
  supplier: string;
  supplierLeadTimeDays: number | null;
  supplierMinimumOrderAmount?: number | null;
  unitCost: number;
  estimatedCost: number;
  lastPurchaseAt: string | null;
  status: "Rupture" | "Critique" | "À prévoir" | "OK";
};

export type PurchasePlanLine = PurchasePlanRecommendation & {
  priority: PurchasePlanPriority;
  plannedQuantity: number;
  plannedCost: number;
  funding: PurchasePlanFunding;
  budgetRemainingAfter: number;
};

export type PurchasePlanSupplierGroup = {
  supplierId: number | null;
  supplier: string;
  minimumOrderAmount: number;
  lines: PurchasePlanLine[];
  units: number;
  totalCost: number;
  meetsMinimumOrder: boolean;
};

export type PurchasePlan = {
  availableBudget: number;
  plannedSpend: number;
  remainingBudget: number;
  totalRecommendedCost: number;
  fullyFundedLines: number;
  partiallyFundedLines: number;
  unfundedLines: number;
  incompleteLines: number;
  lines: PurchasePlanLine[];
  supplierGroups: PurchasePlanSupplierGroup[];
};

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round((parsed + Number.EPSILON) * 100) / 100) : 0;
}

function quantity(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function priorityFor(row: PurchasePlanRecommendation): PurchasePlanPriority {
  if (row.status === "Rupture" || row.status === "Critique") return "Urgent";
  if (quantity(row.recommendedQuantity) > 0) return "À prévoir";
  return "Pas nécessaire";
}

function priorityRank(row: PurchasePlanRecommendation) {
  if (row.status === "Rupture") return 0;
  if (row.status === "Critique") return 1;
  if (row.status === "À prévoir") return 2;
  return 3;
}

export function buildPurchasePlan(
  recommendations: PurchasePlanRecommendation[],
  availableBudgetInput: number,
): PurchasePlan {
  const availableBudget = amount(availableBudgetInput);
  let remainingBudget = availableBudget;

  const ordered = [...recommendations].sort((left, right) =>
    priorityRank(left) - priorityRank(right)
    || (left.daysOfCover ?? Number.POSITIVE_INFINITY) - (right.daysOfCover ?? Number.POSITIVE_INFINITY)
    || Number(right.averageDailyDemand || 0) - Number(left.averageDailyDemand || 0)
    || left.productName.localeCompare(right.productName, "fr")
  );

  const lines = ordered.map((row): PurchasePlanLine => {
    const recommendedQuantity = quantity(row.recommendedQuantity);
    const unitCost = amount(row.unitCost);
    const priority = priorityFor(row);
    const supplierReady = Boolean(row.supplierId) && row.supplier.trim() !== "" && row.supplier !== "Fournisseur à renseigner";
    const totalRecommended = amount(recommendedQuantity * unitCost);

    if (recommendedQuantity === 0) {
      return { ...row, priority, recommendedQuantity, unitCost, plannedQuantity: 0, plannedCost: 0, funding: "Financé", budgetRemainingAfter: remainingBudget };
    }

    if (!supplierReady || unitCost <= 0) {
      return { ...row, priority, recommendedQuantity, unitCost, plannedQuantity: 0, plannedCost: 0, funding: "À compléter", budgetRemainingAfter: remainingBudget };
    }

    const affordableQuantity = Math.floor((remainingBudget + 1e-9) / unitCost);
    const plannedQuantity = Math.max(0, Math.min(recommendedQuantity, affordableQuantity));
    const plannedCost = amount(plannedQuantity * unitCost);
    remainingBudget = amount(Math.max(0, remainingBudget - plannedCost));

    const funding: PurchasePlanFunding = plannedQuantity === recommendedQuantity
      ? "Financé"
      : plannedQuantity > 0
        ? "Partiel"
        : "Hors budget";

    return {
      ...row,
      priority,
      recommendedQuantity,
      unitCost,
      plannedQuantity,
      plannedCost,
      funding,
      budgetRemainingAfter: remainingBudget,
    };
  });

  const actionable = lines.filter((line) => line.recommendedQuantity > 0);
  const totalRecommendedCost = amount(actionable.reduce((sum, line) => sum + line.recommendedQuantity * line.unitCost, 0));
  const plannedSpend = amount(lines.reduce((sum, line) => sum + line.plannedCost, 0));

  const groupMap = new Map<string, PurchasePlanSupplierGroup>();
  for (const line of lines.filter((item) => item.plannedQuantity > 0)) {
    const key = line.supplierId ? String(line.supplierId) : line.supplier;
    const minimumOrderAmount = amount(line.supplierMinimumOrderAmount || 0);
    const current = groupMap.get(key) || {
      supplierId: line.supplierId,
      supplier: line.supplier,
      minimumOrderAmount,
      lines: [],
      units: 0,
      totalCost: 0,
      meetsMinimumOrder: minimumOrderAmount <= 0,
    };
    current.lines.push(line);
    current.units += line.plannedQuantity;
    current.totalCost = amount(current.totalCost + line.plannedCost);
    current.minimumOrderAmount = Math.max(current.minimumOrderAmount, minimumOrderAmount);
    current.meetsMinimumOrder = current.minimumOrderAmount <= 0 || current.totalCost >= current.minimumOrderAmount;
    groupMap.set(key, current);
  }

  return {
    availableBudget,
    plannedSpend,
    remainingBudget: amount(remainingBudget),
    totalRecommendedCost,
    fullyFundedLines: actionable.filter((line) => line.funding === "Financé").length,
    partiallyFundedLines: actionable.filter((line) => line.funding === "Partiel").length,
    unfundedLines: actionable.filter((line) => line.funding === "Hors budget").length,
    incompleteLines: actionable.filter((line) => line.funding === "À compléter").length,
    lines,
    supplierGroups: [...groupMap.values()].sort((left, right) => left.supplier.localeCompare(right.supplier, "fr")),
  };
}
