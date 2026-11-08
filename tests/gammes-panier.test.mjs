import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const extras = loadSource("lib/storefront-extras.ts");
const cart = loadSource("lib/cart-suggestion.ts");
const promo = { id: 1, name: "2e -50", code: "", description: "", ruleType: "second_item_percent", percentValue: 50, minimumQuantity: 2, buyQuantity: 0, freeQuantity: 0, eligibleCategories: ["Montres", "Bijoux"], isActive: true, priority: 1 };

test("gammes : Homme, Femme, Unisexe (un article unisexe apparaît dans les deux)", () => {
  assert.equal(extras.normalizeAudience("Hommes"), "homme");
  assert.equal(extras.normalizeAudience("Women"), "femme");
  assert.equal(extras.normalizeAudience("mixte"), "unisexe");
  assert.equal(extras.normalizeAudience("autre"), "");
  assert.equal(extras.matchesAudience("unisexe", "homme"), true);
  assert.equal(extras.matchesAudience("unisexe", "femme"), true);
  assert.equal(extras.matchesAudience("femme", "homme"), false);
  assert.equal(extras.matchesAudience("", "homme"), false);
  assert.equal(extras.matchesAudience("", ""), true);
});

test("coffret : un par article, seulement si activé avec un prix, coût jamais exposé au client", () => {
  const box = extras.giftBoxFromSettings({ storefront_giftbox_enabled: "1", storefront_giftbox_price: "30", storefront_giftbox_cost: "8" });
  assert.equal(box.enabled, true);
  assert.deepEqual(extras.giftBoxTotal(box, 3, true), { count: 3, amount: 90 });
  assert.deepEqual(extras.giftBoxTotal(box, 3, false), { count: 0, amount: 0 });
  assert.equal(extras.giftBoxFromSettings({ storefront_giftbox_enabled: "1", storefront_giftbox_price: "0" }).enabled, false);
  const loader = read("db/storefront-public-fast.ts");
  assert.match(loader, /giftBox: \(\(\) => \{ const box = giftBoxFromSettings\(settings\); return \{ enabled: box\.enabled, label: box\.label, price: box\.price, text: box\.text \}; \}\)\(\)/);
});

test("le serveur recalcule le coffret depuis les réglages et l'inscrit sur la commande", () => {
  const route = read("app/api/storefront/orders/route.ts");
  assert.match(route, /const giftBox = giftBoxFromSettings\(giftBoxSettings\);/);
  assert.match(route, /giftBoxTotal\(giftBox, cart\.reduce\(\(sum, item\) => sum \+ item\.quantity, 0\), payload\.giftBox === true\)/);
  assert.match(route, /\+ giftBox\.cost \* giftBoxLine\.count/);
  assert.match(route, /const giftBoxLabel = giftBoxLine\.count \? ` \+ \$\{giftBox\.label\} ×\$\{giftBoxLine\.count\}` : "";/);
});

test("jauge promo : « plus qu'un article » tant que la promo n'est pas atteinte", () => {
  const one = cart.promotionProgress([{ kind: "product", category: "Montres", quantity: 1, unitPrice: 200 }], [promo], false);
  assert.deepEqual({ have: one.have, need: one.need, missing: one.missing }, { have: 1, need: 2, missing: 1 });
  assert.equal(cart.promotionProgress([{ kind: "product", category: "Montres", quantity: 2, unitPrice: 200 }], [promo], true), null);
  assert.equal(cart.promotionProgress([{ kind: "product", category: "Portefeuilles", quantity: 1, unitPrice: 200 }], [promo], false), null);
});

test("souvent achetés ensemble : deux articles d'autres catégories, disponibles", () => {
  const items = [
    { kind: "product", id: 1, category: "Montres", salePrice: 250, available: true, badge: "" },
    { kind: "product", id: 2, category: "Montres", salePrice: 200, available: true, badge: "" },
    { kind: "product", id: 3, category: "Bijoux", salePrice: 90, available: true, badge: "" },
    { kind: "product", id: 4, category: "Bijoux", salePrice: 80, available: true, badge: "" },
    { kind: "product", id: 5, category: "Portefeuilles", salePrice: 150, available: true, badge: "" },
    { kind: "product", id: 6, category: "Portefeuilles", salePrice: 60, available: false, badge: "" },
  ];
  const picks = cart.frequentlyBoughtWith(items[0], items, [promo]);
  assert.equal(picks.length, 2);
  assert.deepEqual(picks.map((item) => item.id), [4, 5]);
});

test("la gamme se règle dans le logiciel et la migration ajoute la colonne", async () => {
  const database = await fixture();
  await loadSource("db/storefront-cms.ts").ensureStorefrontCms(database);
  database.sqlite.exec(read("migrations/0020_storefront_audience.sql"));
  database.sqlite.exec("UPDATE storefront_product_settings SET audience = 'femme' WHERE product_id = 1");
  assert.equal(database.sqlite.prepare("SELECT audience FROM storefront_product_settings WHERE product_id = 1").get().audience, "femme");
  const cms = read("app/storefront-cms-v2-enhancement.tsx");
  assert.match(cms, /<select name="audience"/);
  assert.match(cms, /<legend>Option coffret cadeau<\/legend>/);
  assert.match(read("app/api/storefront/admin/route.ts"), /UPDATE storefront_product_settings SET audience = \? WHERE product_id = \?/);
  const client = read("app/boutique/storefront-client-v3.tsx");
  assert.match(client, /className="mj-gender-tile"/);
  assert.match(client, /className="mj-giftbox-option"/);
  assert.match(client, /className="mj-promo-progress"/);
  assert.match(client, /className="mj-section mj-bundle"/);
  assert.match(client, /giftBox: giftBoxLine\.count > 0,/);
});
