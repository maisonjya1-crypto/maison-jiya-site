import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

const {
  calculateIndependentPromotions,
  normalizeEligibleCategories,
} = loadSource("lib/storefront-promotions.ts");

const lines = [
  { key: "p:1", kind: "product", unitPrice: 220, quantity: 1, category: "Montres" },
  { key: "p:2", kind: "product", unitPrice: 100, quantity: 1, category: "Bijoux" },
];

function rule(overrides = {}) {
  return {
    id: 1,
    name: "2e article -50 %",
    code: "PROMO:2E50",
    description: "",
    ruleType: "second_item_percent",
    percentValue: 50,
    minimumQuantity: 2,
    buyQuantity: 0,
    freeQuantity: 0,
    eligibleCategories: ["Montres", "Bijoux", "Portefeuilles"],
    isActive: true,
    priority: 10,
    ...overrides,
  };
}

test("le moteur -50 % réduit seulement l'unité éligible la moins chère", () => {
  const result = calculateIndependentPromotions(lines, [rule()]);
  assert.equal(result.applied, true);
  assert.equal(result.code, "PROMO:2E50");
  assert.equal(result.discount, 50);
  assert.equal(result.total, 270);
  assert.deepEqual(result.discountedUnits, { "p:2": 1 });
});

test("une remise de catégorie utilise uniquement son propre calcul", () => {
  const result = calculateIndependentPromotions(lines, [rule({
    id: 2,
    name: "-20 % bijoux",
    code: "PROMO:BIJOUX20",
    ruleType: "percent_items",
    percentValue: 20,
    minimumQuantity: 1,
    eligibleCategories: ["Bijoux"],
    priority: 20,
  })]);
  assert.equal(result.discount, 20);
  assert.equal(result.total, 300);
  assert.deepEqual(result.discountedUnits, { "p:2": 1 });
});

test("les promotions sont non cumulables : la première règle éligible par priorité gagne", () => {
  const result = calculateIndependentPromotions(lines, [
    rule(),
    rule({
      id: 2,
      name: "-20 % bijoux",
      code: "PROMO:BIJOUX20",
      ruleType: "percent_items",
      percentValue: 20,
      minimumQuantity: 1,
      eligibleCategories: ["Bijoux"],
      priority: 20,
    }),
  ]);
  assert.equal(result.code, "PROMO:2E50");
  assert.equal(result.discount, 50);
  assert.equal(result.total, 270);
});

test("une règle désactivée n'est jamais appliquée", () => {
  const result = calculateIndependentPromotions(lines, [rule({ isActive: false })]);
  assert.equal(result.applied, false);
  assert.equal(result.discount, 0);
  assert.equal(result.total, 320);
});

test("un pack déjà tarifé est exclu de toutes les promotions automatiques", () => {
  const result = calculateIndependentPromotions([
    { key: "o:1", kind: "offer", unitPrice: 300, quantity: 2, category: "Packs & offres" },
  ], [rule({ eligibleCategories: [] })]);
  assert.equal(result.applied, false);
  assert.equal(result.total, 600);
});

test("2 achetés + 1 offert rend gratuit le moins cher par groupe", () => {
  const result = calculateIndependentPromotions([
    { key: "p:1", kind: "product", unitPrice: 220, quantity: 1, category: "Montres" },
    { key: "p:2", kind: "product", unitPrice: 180, quantity: 1, category: "Montres" },
    { key: "p:3", kind: "product", unitPrice: 100, quantity: 1, category: "Bijoux" },
  ], [rule({
    id: 3,
    name: "2 + 1 offert",
    code: "PROMO:2PLUS1",
    ruleType: "buy_x_get_y_free",
    percentValue: 100,
    buyQuantity: 2,
    freeQuantity: 1,
    minimumQuantity: 3,
    priority: 5,
  })]);
  assert.equal(result.discount, 100);
  assert.equal(result.total, 400);
  assert.deepEqual(result.discountedUnits, { "p:3": 1 });
});

test("les catégories sont normalisées sans mélanger portefeuille et autres catégories", () => {
  assert.deepEqual(normalizeEligibleCategories('["Wallets","Montres","Bijoux"]'), ["portefeuilles", "montres", "bijoux"]);
});
