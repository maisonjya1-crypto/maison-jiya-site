import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

const { deliveryCopy, DELIVERY_DEFAULTS } = loadSource("lib/storefront-copy.ts");

test("la boutique n'annonce plus jamais la livraison gratuite, dans aucune langue", () => {
  assert.equal(deliveryCopy("Livraison gratuite partout au Maroc", "fr", "announcement"), DELIVERY_DEFAULTS.fr.announcement);
  assert.equal(deliveryCopy("توصيل مجاني إلى جميع أنحاء المغرب", "ar", "announcement"), DELIVERY_DEFAULTS.ar.announcement);
  assert.equal(deliveryCopy("Free delivery across Morocco", "en", "shippingNote"), DELIVERY_DEFAULTS.en.shippingNote);
  assert.equal(deliveryCopy("", "fr", "shippingNote"), DELIVERY_DEFAULTS.fr.shippingNote);
  assert.equal(deliveryCopy("Paiement à la livraison partout au Maroc", "fr", "announcement"), "Paiement à la livraison partout au Maroc");
  for (const lang of ["fr", "ar", "en"]) for (const text of Object.values(DELIVERY_DEFAULTS[lang])) assert.doesNotMatch(text, /gratuit|مجان|free/i);
  for (const file of ["db/storefront-public-fast.ts", "db/storefront-cms.ts", "app/boutique/storefront-client-v3.tsx"]) {
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /Livraison gratuite|توصيل مجاني|Free delivery/, file);
  }
});

test("le suivi propose le lien du transporteur quand il en existe un", () => {
  const { carrierTrackingUrl } = loadSource("lib/order-tracking.ts");
  assert.equal(carrierTrackingUrl("ForceLog"), "https://forcelog.ma/suivi-de-colis/");
  assert.equal(carrierTrackingUrl("Sendit"), "");
});
