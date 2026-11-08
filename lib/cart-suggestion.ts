import { normalizeEligibleCategories, normalizePromotionCategory, type StorefrontPromotion } from "./storefront-promotions";

// Suggestion d'un article dans le panier.
// 1) Si une promo automatique est active mais pas encore déclenchée (ex. « 2e article -50 % »),
//    on propose l'article qui la déclenche.
// 2) Sinon, on propose de compléter : un article disponible d'une autre catégorie (les plus demandés d'abord).
export type SuggestionItem = { kind: "product" | "offer"; id: number; category: string; salePrice: number; available: boolean; badge: string };
export type SuggestionLine = { kind: "product" | "offer"; category: string; quantity: number; unitPrice: number };
export type CartSuggestion<T extends SuggestionItem> = { item: T; reason: "promo" | "complete"; promotion?: StorefrontPromotion };

const keyOf = (item: Pick<SuggestionItem, "kind" | "id">) => `${item.kind === "offer" ? "o" : "p"}:${item.id}`;
const isBest = (badge: string) => /best|plus demand|top|populaire|vendu/i.test(badge || "");

function unitsNeeded(rule: StorefrontPromotion) {
  if (rule.ruleType === "buy_x_get_y_free") return Math.max(1, rule.buyQuantity) + Math.max(1, rule.freeQuantity);
  if (rule.ruleType === "second_item_percent") return Math.max(2, rule.minimumQuantity || 2);
  return Math.max(1, rule.minimumQuantity || 1);
}

export function pickCartSuggestion<T extends SuggestionItem>(
  items: T[],
  cartKeys: string[],
  lines: SuggestionLine[],
  promotions: StorefrontPromotion[],
  promotionApplied: boolean,
): CartSuggestion<T> | null {
  if (!lines.length) return null;
  const inCart = new Set(cartKeys);
  const candidates = items.filter((item) => item.available && item.kind === "product" && item.salePrice > 0 && !inCart.has(keyOf(item)));
  if (!candidates.length) return null;
  const cartCategories = new Set(lines.map((line) => normalizePromotionCategory(line.category)));
  const rank = (list: T[]) => list.slice().sort((a, b) => Number(isBest(b.badge)) - Number(isBest(a.badge))
    || Number(cartCategories.has(normalizePromotionCategory(a.category))) - Number(cartCategories.has(normalizePromotionCategory(b.category)))
    || a.salePrice - b.salePrice);

  if (!promotionApplied) {
    const rules = promotions.filter((rule) => rule.isActive).sort((a, b) => a.priority - b.priority || a.id - b.id);
    for (const rule of rules) {
      const categories = new Set(normalizeEligibleCategories(rule.eligibleCategories));
      const eligible = (category: string) => !categories.size || categories.has(normalizePromotionCategory(category));
      const units = lines.filter((line) => line.kind === "product" && line.unitPrice > 0 && eligible(line.category)).reduce((sum, line) => sum + line.quantity, 0);
      // On ne propose qu'à partir d'un premier article éligible, quand il en manque un seul.
      if (units < 1 || unitsNeeded(rule) - units !== 1) continue;
      const pick = rank(candidates.filter((item) => eligible(item.category)))[0];
      if (pick) return { item: pick, reason: "promo", promotion: rule };
    }
  }
  const pick = rank(candidates.filter((item) => !cartCategories.has(normalizePromotionCategory(item.category))))[0] || rank(candidates)[0];
  return pick ? { item: pick, reason: "complete" } : null;
}

// Jauge vers la promo : combien d'articles éligibles le client a, combien il en faut.
export function promotionProgress(lines: SuggestionLine[], promotions: StorefrontPromotion[], promotionApplied: boolean) {
  if (promotionApplied || !lines.length) return null;
  const rules = promotions.filter((rule) => rule.isActive).sort((a, b) => a.priority - b.priority || a.id - b.id);
  for (const rule of rules) {
    const categories = new Set(normalizeEligibleCategories(rule.eligibleCategories));
    const eligible = (category: string) => !categories.size || categories.has(normalizePromotionCategory(category));
    const have = lines.filter((line) => line.kind === "product" && line.unitPrice > 0 && eligible(line.category)).reduce((sum, line) => sum + line.quantity, 0);
    const need = unitsNeeded(rule);
    if (have >= 1 && have < need) return { promotion: rule, have, need, missing: need - have };
  }
  return null;
}

// « Souvent achetés ensemble » : jusqu'à deux articles disponibles d'autres catégories
// (ceux qui déclenchent une promo active passent en premier).
export function frequentlyBoughtWith<T extends SuggestionItem>(current: T, items: T[], promotions: StorefrontPromotion[], max = 2): T[] {
  const currentCategory = normalizePromotionCategory(current.category);
  const promoCategories = new Set(promotions.filter((rule) => rule.isActive).flatMap((rule) => normalizeEligibleCategories(rule.eligibleCategories)));
  const pool = items.filter((item) => item.available && item.kind === "product" && item.salePrice > 0 && keyOf(item) !== keyOf(current));
  const score = (item: T) => (normalizePromotionCategory(item.category) !== currentCategory ? 4 : 0) + (promoCategories.has(normalizePromotionCategory(item.category)) ? 2 : 0) + (isBest(item.badge) ? 1 : 0);
  const picked: T[] = [];
  for (const item of pool.slice().sort((a, b) => score(b) - score(a) || a.salePrice - b.salePrice)) {
    if (picked.some((entry) => normalizePromotionCategory(entry.category) === normalizePromotionCategory(item.category))) continue;
    picked.push(item);
    if (picked.length >= max) break;
  }
  return picked;
}
