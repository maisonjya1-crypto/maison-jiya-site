import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("le Meta Pixel et ses événements attendent un consentement explicite", async () => {
  const client = await read("app/boutique/storefront-client-v3.tsx");
  assert.match(client, /META_CONSENT_KEY/);
  assert.match(client, /function pixelConsentGranted/);
  assert.match(client, /if \(!pixelConsentGranted\(\)\) return;/);
  assert.match(client, /if \(!pixelId \|\| !pixelConsentGranted\(\)\) return false;/);
  assert.match(client, /if \(metaConsent !== "accepted"\) return;/);
  assert.match(client, /chooseMetaConsent\("refused"\)/);
  assert.match(client, /chooseMetaConsent\("accepted"\)/);
  assert.match(client, /Cookies publicitaires/);
});
test("l'envoi d'une commande informe le client sans imposer les cookies publicitaires", async () => {
  const client = await read("app/boutique/storefront-client-v3.tsx");
  assert.match(client, /name="privacyAcknowledged" type="checkbox" required/);
  assert.match(client, /privacyAcknowledged: form\.get\("privacyAcknowledged"\) === "yes"/);
  assert.match(client, /href="\/boutique\/confidentialite"/);
  assert.match(client, /href="\/boutique\/conditions-vente"/);
  assert.match(client, /href="\/boutique\/livraison-retours"/);
});
test("les informations légales sont accessibles sans formulaire de connexion", async () => {
  const layout = await read("app/boutique/layout.tsx");
  assert.match(layout, /legal\.css/);
  for(const slug of ["mentions-legales","confidentialite","livraison-retours","conditions-vente"]) {
    const source = await read("app/boutique/" + slug + "/page.tsx");
    assert.match(source, /LegalPage/);
    assert.doesNotMatch(source, /getAuthenticatedUser/);
  }
});
test("le site ne prétend pas représenter des marques tierces non vérifiées", async () => {
  const client = await read("app/boutique/storefront-client-v3.tsx");
  assert.doesNotMatch(client, /ROLEX|Rolex|Cartier|Patek/, "aucune marque tierce écrite en dur dans la boutique");
  assert.doesNotMatch(client, /Satisfaction garantie/);
  assert.doesNotMatch(client, /officialStore\}/, "pas de mention « boutique officielle » affichée");
});
