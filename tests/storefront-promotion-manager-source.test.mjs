import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("la migration crée le gestionnaire et reprend l'offre -50 actuelle", async () => {
  const sql = await read("migrations/0016_storefront_independent_promotions.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS storefront_promotions/);
  assert.match(sql, /PROMO:2E50/);
  assert.match(sql, /second_item_percent/);
  assert.match(sql, /eligible_categories/);
  assert.match(sql, /priority/);
});

test("le CMS permet de créer, activer, désactiver et prioriser chaque promotion séparément", async () => {
  const source = await read("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /type CmsPromotion/);
  assert.match(source, /function PromotionEditor/);
  assert.match(source, /action: "savePromotion"/);
  assert.match(source, /action: "deletePromotion"/);
  assert.match(source, /Activer cette promotion/);
  assert.match(source, /Priorité/);
  assert.match(source, /Chaque offre a sa propre règle/);
  assert.match(source, /non cumulables/);
});

test("l'API admin enregistre une règle sans réutiliser les champs d'un autre calcul", async () => {
  const route = await read("app/api/storefront/admin/route.ts");
  assert.match(route, /action === "savePromotion"/);
  assert.match(route, /second_item_percent/);
  assert.match(route, /percent_items/);
  assert.match(route, /buy_x_get_y_free/);
  assert.match(route, /eligible_categories = \?/);
  assert.match(route, /action === "deletePromotion"/);
});

test("le panier et le serveur utilisent le même moteur de promotions indépendantes", async () => {
  const [client, server] = await Promise.all([
    read("app/boutique/storefront-client-v3.tsx"),
    read("app/api/storefront/orders/route.ts"),
  ]);
  assert.match(client, /calculateIndependentPromotions/);
  assert.match(server, /calculateIndependentPromotions/);
  assert.doesNotMatch(client, /calculateSecondItemHalfOff/);
  assert.doesNotMatch(server, /calculateSecondItemHalfOff/);
  assert.match(server, /getStorefrontPromotions\(database, true\)/);
});

test("les packs à prix fixe restent exclus des promotions automatiques", async () => {
  const engine = await read("lib/storefront-promotions.ts");
  assert.match(engine, /line\.kind !== "product"/);
  assert.match(engine, /Packs\/offres à prix fixe/);
});

test("la notification privée reconnaît toute promotion et plus seulement le -50", async () => {
  const source = await read("app/promo-order-notification.tsx");
  assert.match(source, /campaign\.includes\("PROMO:"\)/);
  assert.doesNotMatch(source, /campaign\.includes\("PROMO:2E50"\)/);
  assert.match(source, /Nouvelle commande avec l’offre/);
});
