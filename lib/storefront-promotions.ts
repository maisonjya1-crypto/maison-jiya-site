export type StorefrontPromotionRuleType =
  | "second_item_percent"
  | "percent_items"
  | "buy_x_get_y_free";

export type StorefrontPromotion = {
  id: number;
  name: string;
  code: string;
  description: string;
  ruleType: StorefrontPromotionRuleType;
  percentValue: number;
  minimumQuantity: number;
  buyQuantity: number;
  freeQuantity: number;
  eligibleCategories: string[];
  isActive: boolean;
  priority: number;
  displayEnabled?: boolean;
  badge?: string;
  ctaLabel?: string;
  imageUrl?: string;
};

export type PromotionCartLine = {
  key: string;
  kind: "product" | "offer";
  unitPrice: number;
  quantity: number;
  category: string;
};

export type AppliedPromotion = {
  applied: boolean;
  subtotal: number;
  discount: number;
  total: number;
  promotionId: number | null;
  code: string;
  name: string;
  ruleType: StorefrontPromotionRuleType | null;
  discountedUnits: Record<string, number>;
};

type Unit = { key: string; unitPrice: number };

const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function normalizePromotionCategory(category: string) {
  const normalized = String(category || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr");
  if (["wallet", "wallets", "portefeuille", "portefeuilles"].includes(normalized)) return "portefeuilles";
  if (["montre", "montres"].includes(normalized)) return "montres";
  if (["bijou", "bijoux"].includes(normalized)) return "bijoux";
  return normalized;
}

export function normalizeEligibleCategories(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return value.split(",").map((item) => item.trim()).filter(Boolean);
          }
        })()
      : [];
  return Array.from(new Set(source
    .filter((item): item is string => typeof item === "string")
    .map(normalizePromotionCategory)
    .filter(Boolean)));
}

function safeRule(rule: StorefrontPromotion): StorefrontPromotion {
  return {
    ...rule,
    id: Math.max(0, Math.floor(Number(rule.id) || 0)),
    name: String(rule.name || "").trim(),
    code: String(rule.code || "").trim(),
    description: String(rule.description || "").trim(),
    percentValue: Math.max(0, Math.min(100, Number(rule.percentValue) || 0)),
    minimumQuantity: Math.max(1, Math.floor(Number(rule.minimumQuantity) || 1)),
    buyQuantity: Math.max(0, Math.floor(Number(rule.buyQuantity) || 0)),
    freeQuantity: Math.max(0, Math.floor(Number(rule.freeQuantity) || 0)),
    eligibleCategories: normalizeEligibleCategories(rule.eligibleCategories),
    isActive: Boolean(rule.isActive),
    priority: Math.floor(Number(rule.priority) || 100),
  };
}

function safeLines(lines: PromotionCartLine[]) {
  return lines.map((line) => ({
    ...line,
    unitPrice: Math.max(0, Number(line.unitPrice) || 0),
    quantity: Math.max(0, Math.floor(Number(line.quantity) || 0)),
    category: normalizePromotionCategory(line.category),
  }));
}

function eligibleUnits(rule: StorefrontPromotion, lines: ReturnType<typeof safeLines>) {
  const categories = new Set(normalizeEligibleCategories(rule.eligibleCategories));
  const units: Unit[] = [];
  for (const line of lines) {
    // Packs/offres à prix fixe sont déjà remisés et ne reçoivent jamais une promo automatique.
    if (line.kind !== "product" || line.unitPrice <= 0 || line.quantity <= 0) continue;
    if (categories.size && !categories.has(line.category)) continue;
    for (let index = 0; index < line.quantity; index += 1) {
      units.push({ key: line.key, unitPrice: line.unitPrice });
    }
  }
  return units;
}

function addDiscountedUnit(target: Record<string, number>, key: string) {
  target[key] = (target[key] || 0) + 1;
}

function candidateForRule(ruleInput: StorefrontPromotion, lines: ReturnType<typeof safeLines>, subtotal: number): AppliedPromotion {
  const rule = safeRule(ruleInput);
  const empty: AppliedPromotion = {
    applied: false,
    subtotal,
    discount: 0,
    total: subtotal,
    promotionId: null,
    code: "",
    name: "",
    ruleType: null,
    discountedUnits: {},
  };
  if (!rule.isActive || !rule.name || !rule.code) return empty;

  const units = eligibleUnits(rule, lines);
  const discountedUnits: Record<string, number> = {};
  let discount = 0;

  if (rule.ruleType === "second_item_percent") {
    const minimum = Math.max(2, rule.minimumQuantity);
    if (units.length < minimum || rule.percentValue <= 0) return empty;
    const cheapest = [...units].sort((left, right) => left.unitPrice - right.unitPrice)[0];
    if (!cheapest) return empty;
    discount = cheapest.unitPrice * (rule.percentValue / 100);
    addDiscountedUnit(discountedUnits, cheapest.key);
  } else if (rule.ruleType === "percent_items") {
    if (units.length < rule.minimumQuantity || rule.percentValue <= 0) return empty;
    discount = units.reduce((sum, unit) => sum + unit.unitPrice * (rule.percentValue / 100), 0);
    for (const unit of units) addDiscountedUnit(discountedUnits, unit.key);
  } else if (rule.ruleType === "buy_x_get_y_free") {
    const buy = Math.max(1, rule.buyQuantity);
    const free = Math.max(1, rule.freeQuantity);
    const groupSize = buy + free;
    if (units.length < groupSize) return empty;
    const freeCount = Math.floor(units.length / groupSize) * free;
    const cheapestUnits = [...units].sort((left, right) => left.unitPrice - right.unitPrice).slice(0, freeCount);
    if (!cheapestUnits.length) return empty;
    discount = cheapestUnits.reduce((sum, unit) => sum + unit.unitPrice, 0);
    for (const unit of cheapestUnits) addDiscountedUnit(discountedUnits, unit.key);
  } else {
    return empty;
  }

  discount = roundMoney(Math.min(subtotal, Math.max(0, discount)));
  if (discount <= 0) return empty;

  return {
    applied: true,
    subtotal,
    discount,
    total: roundMoney(subtotal - discount),
    promotionId: rule.id,
    code: rule.code,
    name: rule.name,
    ruleType: rule.ruleType,
    discountedUnits,
  };
}

/**
 * Automatic storefront promotions are intentionally non-cumulative.
 * Each rule is evaluated by its own calculator, in priority order.
 * The first qualifying active rule wins; another rule is never partially mixed into it.
 */
export function calculateIndependentPromotions(
  linesInput: PromotionCartLine[],
  promotionsInput: StorefrontPromotion[],
): AppliedPromotion {
  const lines = safeLines(linesInput);
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const promotions = promotionsInput
    .map(safeRule)
    .filter((rule) => rule.isActive)
    .sort((left, right) => left.priority - right.priority || left.id - right.id);

  for (const rule of promotions) {
    const candidate = candidateForRule(rule, lines, subtotal);
    if (candidate.applied) return candidate;
  }

  return {
    applied: false,
    subtotal,
    discount: 0,
    total: subtotal,
    promotionId: null,
    code: "",
    name: "",
    ruleType: null,
    discountedUnits: {},
  };
}

export function promotionRuleLabel(rule: Pick<StorefrontPromotion, "ruleType" | "percentValue" | "buyQuantity" | "freeQuantity">) {
  if (rule.ruleType === "second_item_percent") return `2e article -${Math.round(rule.percentValue)} %`;
  if (rule.ruleType === "percent_items") return `-${Math.round(rule.percentValue)} % sur la sélection`;
  return `${Math.max(1, rule.buyQuantity)} acheté(s) + ${Math.max(1, rule.freeQuantity)} offert(s)`;
}
