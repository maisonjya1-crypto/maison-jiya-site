import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");

test("la migration crée des blocs marketing ordonnés et activables", async () => {
  const migration = await readText("migrations/0013_storefront_marketing_sections.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS storefront_marketing_sections/);
  assert.match(migration, /placement TEXT DEFAULT 'after_categories'/);
  assert.match(migration, /is_active INTEGER DEFAULT 1/);
  assert.match(migration, /sort_order INTEGER DEFAULT 0/);
  assert.match(migration, /storefront_marketing_sections_active_order_idx/);
});

test("le CMS permet plusieurs blocs promo avec image, cible, placement et ordre", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /Blocs promo/);
  assert.match(source, /Crée autant de mises en avant que tu veux/);
  assert.match(source, /saveMarketingSection/);
  assert.match(source, /deleteMarketingSection/);
  assert.match(source, /uploadMany\("marketing"/);
  assert.match(source, /Après les catégories/);
  assert.match(source, /Avant le catalogue/);
  assert.match(source, /Avant le bloc contact/);
  assert.match(source, /Packs & offres/);
  assert.match(source, /Portefeuilles/);
});

test("l'API valide les destinations et supprime aussi l'image d'un bloc supprimé", async () => {
  const source = await readText("app/api/storefront/admin/route.ts");
  assert.match(source, /allowedTargets = new Set\(\["offers", "catalogue", "Montres", "Bijoux", "Portefeuilles"\]\)/);
  assert.match(source, /allowedPlacements = new Set\(\["after_categories", "before_catalogue", "before_contact"\]\)/);
  assert.match(source, /owner_type = 'marketing'/);
  assert.match(source, /DELETE FROM storefront_marketing_sections/);
});

test("les images marketing sont limitées à une et remplaçables", async () => {
  const source = await readText("app/api/storefront/admin/media/route.ts");
  assert.match(source, /"product", "offer", "brand", "marketing", "promotion"/);
  assert.match(source, /ownerType === "brand" \|\| ownerType === "marketing" \|\| ownerType === "promotion" \? 1 : GALLERY_LIMIT/);
  assert.match(source, /Bloc marketing introuvable/);
});

test("le catalogue public expose et affiche les blocs aux trois emplacements", async () => {
  const loader = await readText("db/storefront-public-fast.ts");
  const types = await readText("app/boutique/storefront-types.ts");
  const client = await readText("app/boutique/storefront-client-v3.tsx");

  assert.match(loader, /FROM storefront_marketing_sections/);
  assert.match(loader, /marketingSections/);
  assert.match(loader, /imageUrl: mediaByOwner\.get/);
  assert.match(loader, /marketing:/);
  assert.match(types, /export type StorefrontMarketingSection/);
  const approved = await readText("app/boutique/storefront-approved-design-enhancement.tsx");
  assert.match(approved, /exactCategoryPromos/);
  assert.match(approved, /data-placement="after_categories"/);
  assert.doesNotMatch(client, /renderMarketingSections\("after_categories"\)/);
  assert.match(client, /renderMarketingSections\("before_catalogue"\)/);
  assert.match(client, /renderMarketingSections\("before_contact"\)/);
  assert.match(client, /openMarketingTarget/);
  assert.match(client, /setCategory\(section\.target\)/);
});
