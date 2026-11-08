import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

async function route() {
  const database = await fixture();
  const api = loadSource("app/api/storefront/track/route.ts", { "../../../../db": { getRawDb: async () => database } });
  const call = (body, headers = {}) => api.POST(new Request("https://maisonjiya.pages.dev/api/storefront/track", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9", ...headers }, body: JSON.stringify(body) }));
  return { database, call };
}

test("le suivi exige la référence ET le téléphone, et ne montre ni nom ni adresse", async () => {
  const { call } = await route();
  const ok = await call({ ref: "test-order", phone: "+212 6 12 34 56 78" });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.orderRef, "TEST-ORDER");
  assert.equal(body.stage, "confirmed");
  assert.equal(body.carrier, "Sendit");
  assert.equal(body.total, 25);
  assert.equal(JSON.stringify(body).includes("Adresse fictive"), false);
  assert.equal(JSON.stringify(body).includes("Client test"), false);
  const wrongPhone = await call({ ref: "TEST-ORDER", phone: "0699999999" });
  const wrongRef = await call({ ref: "NOPE-ORDER", phone: "0612345678" });
  assert.equal(wrongPhone.status, 404);
  assert.equal(wrongRef.status, 404);
  assert.deepEqual(await wrongPhone.json(), await wrongRef.json());
  assert.equal((await call({ ref: "TEST-ORDER", phone: "123" })).status, 400);
});

test("le suivi limite les recherches par adresse IP et refuse une autre origine", async () => {
  const { call } = await route();
  for (let index = 0; index < 20; index += 1) await call({ ref: `REF-${index}`, phone: "0612345678" });
  assert.equal((await call({ ref: "TEST-ORDER", phone: "0612345678" })).status, 429);
  const other = await route();
  assert.equal((await other.call({ ref: "TEST-ORDER", phone: "0612345678" }, { origin: "https://evil.example" })).status, 403);
});

test("chaque statut du logiciel correspond à une étape compréhensible", () => {
  const { trackingStage } = loadSource("lib/order-tracking.ts");
  assert.equal(trackingStage("En attente"), "received");
  assert.equal(trackingStage("Expédiée"), "shipped");
  assert.equal(trackingStage("En livraison"), "out_for_delivery");
  assert.equal(trackingStage("Livrée"), "delivered");
  assert.equal(trackingStage("Retour reçu"), "returned");
  assert.equal(trackingStage("Annulée"), "cancelled");
});

test("la page de suivi est reliée depuis la boutique, la confirmation et le lien court", async () => {
  const client = read("app/boutique/storefront-client-v3.tsx");
  assert.match(client, /href=\{`\/boutique\/suivi\?ref=\$\{encodeURIComponent\(confirmation\.orderRef\)\}`\}/);
  assert.match(client, /<a href="\/boutique\/suivi">/);
  assert.match(read("app/boutique/suivi/page.tsx"), /robots: \{ index: false, follow: true \}/);
  const { isPublicPath } = await import(new URL("../short-link/functions/[[path]].js", import.meta.url).href);
  assert.equal(isPublicPath("/api/storefront/track"), true);
  assert.equal(isPublicPath("/boutique/suivi"), true);
});
