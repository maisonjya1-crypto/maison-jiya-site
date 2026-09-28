import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");

test("la boutique publique reste manuelle et ne rend plus de cartes sans vraie photo", async () => {
  const publicCatalog = await readText("db/storefront-public-fast.ts");
  assert.match(publicCatalog, /WHERE s\.is_visible = 1/);
  assert.match(publicCatalog, /if \(!images\.length \|\| !product\.name\.trim\(\) \|\| salePrice <= 0\) return \[\];/);
  assert.match(publicCatalog, /if \(!images\.length \|\| !offer\.name\.trim\(\) \|\| salePrice <= 0\) return \[\];/);
  assert.match(publicCatalog, /\.slice\(0, 6\)/);

  const cms = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(cms, /Afficher ce produit sur le site public/);
  assert.match(cms, /photo manquante : masqué du site/);
  assert.match(cms, /Ordre d’affichage/);
});

test("la barre promotionnelle est pilotable sans modifier le stock", async () => {
  const admin = await readText("app/api/storefront/admin/route.ts");
  const publicCatalog = await readText("db/storefront-public-fast.ts");
  const client = await readText("app/boutique/storefront-client-v3.tsx");
  const cms = await readText("app/storefront-cms-v2-enhancement.tsx");

  for (const key of [
    "storefront_promo_enabled",
    "storefront_promo_badge",
    "storefront_promo_title",
    "storefront_promo_text",
    "storefront_promo_cta_label",
    "storefront_promo_offer_id",
  ]) {
    assert.match(admin, new RegExp(key));
    assert.match(publicCatalog, new RegExp(key));
  }
  assert.match(cms, /Barre promotionnelle/);
  assert.match(cms, /1\+1=3/);
  assert.match(cms, /-20 %/);
  assert.match(client, /storefront-v3-promotion-bar/);
  assert.match(client, /promotionTarget/);
});

test("le Meta Pixel suit le tunnel et Purchase une seule fois après création serveur de la commande", async () => {
  const client = await readText("app/boutique/storefront-client-v3.tsx");
  assert.match(client, /"PageView"/);
  assert.match(client, /"ViewContent"/);
  assert.match(client, /"AddToCart"/);
  assert.match(client, /"InitiateCheckout"/);
  assert.match(client, /track\("Purchase"/);
  assert.match(client, /maison-jiya-meta-purchase:/);
  assert.match(client, /content_ids:/);
  assert.match(client, /contents:/);
  assert.match(client, /currency: "MAD"/);
  assert.match(client, /order_id: orderRef/);

  const submitStart = client.indexOf("async function submitOrder");
  const submitEnd = client.indexOf("const brand =", submitStart);
  const submitOrder = client.slice(submitStart, submitEnd);
  const responseCheck = submitOrder.indexOf("if (!response.ok) throw");
  const purchaseCheck = submitOrder.indexOf("trackPurchaseOnce(orderRef");
  assert.ok(responseCheck >= 0 && purchaseCheck > responseCheck, "Purchase doit être envoyé seulement après une réponse serveur réussie.");
});

test("le site privé explique clairement l'état et le sens du suivi Meta", async () => {
  const cms = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(cms, /Pixel configuré/);
  assert.match(cms, /Pixel non configuré/);
  assert.match(cms, /Purchase correspond à une commande COD enregistrée/);
});
