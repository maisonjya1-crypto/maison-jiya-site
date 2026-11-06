import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fnUrl = new URL("../short-link/functions/[[path]].js", import.meta.url);
const { isPublicPath, onRequest } = await import(fnUrl.href);

test("le lien court ne laisse passer que la boutique publique", () => {
  for (const path of ["/boutique", "/boutique/conditions-vente", "/api/storefront/catalog", "/api/storefront/orders", "/api/storefront/media/28", "/brand/jy-512.png", "/assets/index-abc.js", "/robots.txt", "/sitemap.xml"]) assert.equal(isPublicPath(path), true, path);
  for (const path of ["/api/data", "/api/auth", "/api/storefront/admin", "/api/storefront/admin/media", "/api/backup", "/telecharger-app", "/api/export/orders.json"]) assert.equal(isPublicPath(path), false, path);
});

test("la racine redirige vers la boutique et le logiciel n'est jamais servi", async () => {
  const env = { SHOP: { fetch: async () => new Response("shop") } };
  const root = await onRequest({ request: new Request("https://maisonjiya.pages.dev/"), env });
  assert.equal(root.status, 301);
  assert.equal(root.headers.get("location"), "https://maisonjiya.pages.dev/boutique");
  const priv = await onRequest({ request: new Request("https://maisonjiya.pages.dev/api/data"), env });
  assert.equal(priv.status, 302);
  const shop = await onRequest({ request: new Request("https://maisonjiya.pages.dev/boutique"), env });
  assert.equal(await shop.text(), "shop");
});

test("la liaison vise le Worker de production et le déploiement ne bloque jamais la mise en ligne principale", () => {
  const config = JSON.parse(readFileSync(new URL("../short-link/wrangler.json", import.meta.url), "utf8"));
  assert.equal(config.name, "maisonjiya");
  assert.equal(config.pages_build_output_dir, "public");
  assert.deepEqual(config.services, [{ binding: "SHOP", service: "maison-jiya-site" }]);
  const wf = readFileSync(new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url), "utf8");
  assert.match(wf, /pages deploy public --project-name maisonjiya/);
  assert.match(wf, /rm -f \.wrangler\/deploy\/config\.json/);
  const shortSteps = wf.slice(wf.indexOf("Create short link project"));
  assert.equal((shortSteps.match(/continue-on-error: true/g) || []).length, 3);
});

test("maisonjiya.pages.dev est l'adresse officielle pour Google et les partages", () => {
  const site = readFileSync(new URL("../lib/site.ts", import.meta.url), "utf8");
  assert.match(site, /PUBLIC_SITE_URL = "https:\/\/maisonjiya\.pages\.dev"/);
  assert.match(readFileSync(new URL("../app/boutique/layout.tsx", import.meta.url), "utf8"), /verification: \{ google: GOOGLE_SITE_VERIFICATION \}/);
});

test("le fichier de validation Google Search Console est servi en 200, sans redirection", async () => {
  const env = { SHOP: { fetch: async () => new Response("shop") } };
  const res = await onRequest({ request: new Request("https://maisonjiya.pages.dev/googleace68d1c59d11801.html"), env });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "google-site-verification: googleace68d1c59d11801.html");
});
