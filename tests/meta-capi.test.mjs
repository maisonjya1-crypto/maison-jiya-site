import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const capi = loadSource("lib/meta-capi.ts", { "cloudflare:workers": { env: {} } });
const config = { pixelId: "123456789012", token: "TEST_TOKEN", apiVersion: "v22.0" };

function fakeFetch(calls, status = 200) {
  return async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ events_received: 1 }), { status }); };
}

test("téléphone au format Meta et données personnelles hachées en SHA-256", async () => {
  assert.equal(capi.metaPhone("06 12 34 56 78"), "212612345678");
  assert.equal(capi.metaPhone("+212 7 00 00 00 00"), "212700000000");
  assert.equal(capi.metaPhone("123"), "");
  const data = await capi.capiUserData({ phone: "0612345678", city: "Fès", name: "Salma Benali" }, { consent: true, fbp: "fb.1.1.2", clientIp: "203.0.113.9", userAgent: "UA", at: "" });
  assert.equal(data.ph[0], await capi.sha256("212612345678"));
  assert.equal(data.ct[0], await capi.sha256("fes"));
  assert.equal(data.fn[0], await capi.sha256("salma"));
  assert.equal(data.country[0], await capi.sha256("ma"));
  assert.equal(data.fbp, "fb.1.1.2");
  assert.equal(JSON.stringify(data).includes("0612345678"), false);
});

test("rien n'est envoyé à Meta sans l'accord du client", () => {
  const request = new Request("https://maisonjiya.pages.dev/api/storefront/orders", { headers: { "cf-connecting-ip": "203.0.113.9", "user-agent": "UA" } });
  assert.equal(capi.attributionFromRequest({ consent: false, fbp: "fb.1.1.2" }, request), null);
  assert.equal(capi.attributionFromRequest(undefined, request), null);
  const ok = capi.attributionFromRequest({ consent: true, fbp: "fb.1.1.2", fbc: "<script>", url: "javascript:alert(1)" }, request);
  assert.equal(ok.fbp, "fb.1.1.2");
  assert.equal(ok.fbc, undefined);
  assert.equal(ok.url, undefined);
  assert.equal(ok.clientIp, "203.0.113.9");
});

test("Lead serveur : même event_id que le Pixel, montant en MAD", async () => {
  const database = await fixture();
  const calls = [];
  const result = await capi.sendLeadEvent(database, { orderRef: "MJ-W1", total: 250, items: [{ productCode: "MJ-1", quantity: 1, unitPrice: 250 }], customer: { phone: "0612345678", city: "Rabat", name: "Salma" }, attribution: { consent: true, at: "" } }, fakeFetch(calls), config);
  assert.equal(result.sent, true);
  assert.match(calls[0].url, /graph\.facebook\.com\/v22\.0\/123456789012\/events\?access_token=TEST_TOKEN/);
  const event = calls[0].body.data[0];
  assert.equal(event.event_name, "Lead");
  assert.equal(event.event_id, "lead-MJ-W1");
  assert.equal(event.custom_data.currency, "MAD");
  assert.deepEqual(event.custom_data.content_ids, ["MJ-1"]);
  assert.equal((await capi.sendLeadEvent(database, { orderRef: "X", total: 1, items: [], customer: {}, attribution: { consent: true, at: "" } }, fakeFetch([]), null)).reason, "not_configured");
});

test("Purchase envoyé une seule fois, seulement pour les commandes livrées avec accord", async () => {
  const database = await fixture();
  database.sqlite.exec(read("migrations/0021_meta_capi.sql"));
  const attribution = JSON.stringify({ consent: true, fbp: "fb.1.1.2", at: "2026-11-20T10:00:00Z" });
  const now = new Date();
  const recent = new Date(now.getTime() - 3600_000).toISOString();
  database.sqlite.prepare("UPDATE orders SET status = 'Livrée', updated_at = ?, marketing_attribution_json = ?, items_json = ? WHERE order_ref = 'TEST-ORDER'")
    .run(recent, attribution, JSON.stringify([{ productCode: "MJ-1", quantity: 1, lineSaleAmount: 25 }]));
  const calls = [];
  assert.deepEqual(await capi.sendDeliveredPurchases(database, fakeFetch(calls), config, now), { sent: 1 });
  const event = calls[0].body.data[0];
  assert.equal(event.event_name, "Purchase");
  assert.equal(event.event_id, "purchase-TEST-ORDER");
  assert.equal(event.custom_data.value, 25);
  assert.ok(database.sqlite.prepare("SELECT capi_purchase_sent_at AS sent FROM orders WHERE order_ref = 'TEST-ORDER'").get().sent);
  const again = [];
  assert.deepEqual(await capi.sendDeliveredPurchases(database, fakeFetch(again), config, now), { sent: 0 });
  assert.equal(again.length, 0);
});

test("Purchase non marqué comme envoyé si Meta refuse, et ignoré sans migration", async () => {
  const database = await fixture();
  assert.equal((await capi.sendDeliveredPurchases(database, fakeFetch([]), config)).skipped, "migration_pending");
  database.sqlite.exec(read("migrations/0021_meta_capi.sql"));
  database.sqlite.prepare("UPDATE orders SET status = 'Livrée', updated_at = ?, marketing_attribution_json = ? WHERE order_ref = 'TEST-ORDER'").run(new Date().toISOString(), JSON.stringify({ consent: true, at: "" }));
  await capi.sendDeliveredPurchases(database, fakeFetch([], 400), config);
  assert.equal(database.sqlite.prepare("SELECT capi_purchase_sent_at AS sent FROM orders WHERE order_ref = 'TEST-ORDER'").get().sent, null);
});

test("la boutique envoie l'accord et les cookies Meta, le serveur et la tâche planifiée sont branchés", () => {
  const client = read("app/boutique/storefront-client-v3.tsx");
  assert.match(client, /marketing: metaMarketingPayload\(metaConsent === "accepted"\),/);
  assert.match(client, /if \(!consent \|\| typeof document === "undefined"\) return \{ consent: false \};/);
  assert.match(read("app/api/storefront/orders/route.ts"), /const marketing = attributionFromRequest\(payload\.marketing, request\);/);
  assert.match(read("worker/index.ts"), /await sendDeliveredPurchases\(database\)/);
});

test("flux catalogue Meta : mêmes identifiants que le Pixel, prix en MAD, lien vers la page produit", () => {
  const { metaCatalogCsv } = loadSource("lib/meta-catalog-feed.ts");
  const csv = metaCatalogCsv({ brand: "Maison Jiya", products: [{ id: 7, kind: "product", productCode: "MJ-7", name: "Montre, acier \"vert\"", category: "Montres", salePrice: 249, comparePrice: 0, badge: "", description: "", availability: "", available: true, lowStock: false, images: ["/api/storefront/media/1", "/api/storefront/media/2"], audience: "femme" }], offers: [] });
  const [header, row] = csv.trim().split("\n");
  assert.equal(header, "id,title,description,availability,condition,price,link,image_link,additional_image_link,brand,product_type,gender,item_group_id");
  assert.match(row, /^MJ-7,"Montre, acier ""vert""",/);
  assert.match(row, /,in stock,new,249\.00 MAD,https:\/\/maisonjiya\.pages\.dev\/boutique\/produit\/montre-acier-vert-7,https:\/\/maisonjiya\.pages\.dev\/api\/storefront\/media\/1,https:\/\/maisonjiya\.pages\.dev\/api\/storefront\/media\/2,Maison Jiya,Montres,female,$/);
});
