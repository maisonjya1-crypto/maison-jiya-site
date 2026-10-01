export type SecondItemPromoLine = {
  key: string;
  unitPrice: number;
  quantity: number;
  eligible: boolean;
};

export type SecondItemPromoResult = {
  applied: boolean;
  subtotal: number;
  discount: number;
  total: number;
  discountedKey: string | null;
  discountedUnitPrice: number;
  eligibleUnitCount: number;
};

export const SECOND_ITEM_PROMO_CODE = "PROMO:2E50";
export const SECOND_ITEM_PROMO_LABEL = "Offre 2e article -50 %";

const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function isSecondItemPromoCategory(category: string) {
  const normalized = String(category || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr");

  return normalized === "montres"
    || normalized === "bijoux"
    || normalized === "portefeuilles"
    || normalized === "wallets";
}

export function calculateSecondItemHalfOff(lines: SecondItemPromoLine[]): SecondItemPromoResult {
  const safeLines = lines.map((line) => ({
    ...line,
    unitPrice: Math.max(0, Number(line.unitPrice) || 0),
    quantity: Math.max(0, Math.floor(Number(line.quantity) || 0)),
  }));

  const subtotal = roundMoney(safeLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const eligibleUnits: Array<{ key: string; unitPrice: number }> = [];

  for (const line of safeLines) {
    if (!line.eligible || line.unitPrice <= 0) continue;
    for (let index = 0; index < line.quantity; index += 1) {
      eligibleUnits.push({ key: line.key, unitPrice: line.unitPrice });
    }
  }

  if (eligibleUnits.length < 2) {
    return {
      applied: false,
      subtotal,
      discount: 0,
      total: subtotal,
      discountedKey: null,
      discountedUnitPrice: 0,
      eligibleUnitCount: eligibleUnits.length,
    };
  }

  const discountedUnit = eligibleUnits.reduce((cheapest, unit) => unit.unitPrice < cheapest.unitPrice ? unit : cheapest, eligibleUnits[0]);
  const discount = roundMoney(discountedUnit.unitPrice * 0.5);

  return {
    applied: discount > 0,
    subtotal,
    discount,
    total: roundMoney(subtotal - discount),
    discountedKey: discountedUnit.key,
    discountedUnitPrice: discountedUnit.unitPrice,
    eligibleUnitCount: eligibleUnits.length,
  };
}
