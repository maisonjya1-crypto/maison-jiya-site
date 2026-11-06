import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("app/boutique/storefront-modern.css");
const intro = read("app/boutique/brand-intro.tsx");
const page = read("app/boutique/page.tsx");
const layout = read("app/boutique/layout.tsx");
const client = read("app/boutique/storefront-client-v3.tsx");

test("l'ouverture est rendue côté serveur, une fois par session, passable et coupée si l'appareil réduit les animations", () => {
  assert.doesNotMatch(intro, /^"use client"/m);
  assert.match(page, /<BrandIntro \/>/);
  assert.match(intro, /sessionStorage\.getItem\("mj-intro-seen"\)/);
  assert.match(intro, /prefers-reduced-motion: reduce/);
  assert.match(intro, /addEventListener\("click",skip\)/);
  assert.match(intro, /setTimeout\(function\(\)\{set\("off"\)\},3400\)/);
  assert.match(intro, /aria-hidden="true"/);
  for (const piece of ["Montre", "Bague", "Portefeuille", "Collier", "Bracelet"]) assert.ok(intro.includes(`label: "${piece}"`), piece);
  // L'animation se termine seule en CSS même si le script ne s'exécute pas.
  assert.match(css, /\.mj-intro \{[^}]*animation: mj-intro-exit[^}]*forwards/);
  assert.match(css, /@keyframes mj-intro-exit \{ to \{ opacity: 0; visibility: hidden;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  \.mj-intro \{ display: none; \}/);
});

test("l'en-tête utilise l'icône JY et le pied de page le logo JIYA", () => {
  assert.match(client, /import \{ JY_MARK \} from "\.\/brand-marks"/);
  assert.match(client, /<JyMark \/>\n\s*<span className="mj-wordmark">/);
  assert.match(client, /src="\/brand\/maison-jiya-logo\.svg"/);
  const marks = read("app/boutique/brand-marks.ts");
  assert.match(marks, /export const JIYA_LOGO/);
  assert.match(marks, /export const JY_MARK/);
});

test("le thème onyx et or rosé définit ses couleurs une seule fois", () => {
  for (const token of ["--onyx: #0e0c0c", "--ivory: #f3ede4", "--gold: #cfa995", "--pearl: #ece6de"]) assert.ok(css.includes(token), token);
  assert.match(css, /family=Noto\+Serif\+Display/);
  assert.match(css, /\.mj-shop\[dir="rtl"\] \{ --display: "Amiri"/);
  assert.match(css, /\.mj-dial-ring \{/);
});

test("Google : titre, description, image de partage, favicon et adresse canonique de la boutique", () => {
  assert.match(layout, /title: \{ default: title/);
  assert.match(layout, /Montres, bijoux et portefeuilles au Maroc/);
  assert.match(layout, /alternates: \{ canonical: STOREFRONT_URL \}/);
  assert.match(layout, /og-maison-jiya\.jpg/);
  assert.match(layout, /favicon-jy\.svg/);
  assert.match(layout, /index: true/);
});

test("robots.txt ouvre la boutique et ferme l'API privée", () => {
  const { robotsTxt, sitemapXml, seoFileResponse } = loadSource("lib/seo-files.ts");
  const robots = robotsTxt();
  assert.match(robots, /Allow: \/api\/storefront\/media\//);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/.+\/sitemap\.xml/);
  assert.doesNotMatch(robots, /^Disallow: \/$/m);
  const sitemap = sitemapXml(new Date("2026-11-06T10:00:00Z"));
  assert.match(sitemap, /<loc>https:\/\/[^<]+\/boutique<\/loc><lastmod>2026-11-06<\/lastmod>/);
  assert.match(sitemap, /\/boutique\/conditions-vente<\/loc>/);
  assert.equal(seoFileResponse("/robots.txt").headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(seoFileResponse("/boutique"), null);
  assert.match(read("worker/index.ts"), /const seoFile = seoFileResponse\(url\.pathname\);/);
});

test("les données structurées décrivent la boutique et ses vrais produits, sans avis inventés", () => {
  const { storefrontStructuredData } = loadSource("lib/storefront-structured-data.ts");
  const json = storefrontStructuredData({
    brand: "Maison Jiya",
    products: [
      { id: 1, kind: "product", productCode: "MJ-001", name: "Montre <script>", category: "Montres", salePrice: 250, comparePrice: 0, badge: "", description: "", availability: "available", available: true, lowStock: false, images: ["/api/storefront/media/1", "data:image/png;base64,xx"] },
      { id: 2, kind: "product", productCode: "MJ-002", name: "Gratuit", category: "Montres", salePrice: 0, comparePrice: 0, badge: "", description: "", availability: "available", available: true, lowStock: false, images: [] },
    ],
    offers: [],
  });
  assert.doesNotMatch(json, /<script>/);
  const data = JSON.parse(json);
  const store = data["@graph"].find((node) => node["@type"] === "OnlineStore");
  assert.ok(store.alternateName.includes("MaisonJiya"));
  const list = data["@graph"].find((node) => node["@type"] === "ItemList");
  assert.equal(list.itemListElement.length, 1);
  const product = list.itemListElement[0].item;
  assert.equal(product.offers.priceCurrency, "MAD");
  assert.equal(product.offers.price, "250.00");
  assert.deepEqual(product.image, ["https://maison-jiya-site.maisonjya1.workers.dev/api/storefront/media/1"]);
  assert.doesNotMatch(json, /aggregateRating|"review"/);
  assert.match(page, /type="application\/ld\+json"/);
});

test("l'accueil montre le logo JIYA dans son cadran et la vitrine photos du logiciel juste dessous", () => {
  assert.match(client, /src="\/brand\/maison-jiya-emblem\.svg"/);
  assert.doesNotMatch(client, /mj-dial-satellite/);
  const hero = client.indexOf('<section className="mj-hero">');
  const showcase = client.indexOf('renderMarketingSections("after_categories")');
  const deal = client.indexOf('<section className="mj-deal" id="promotions">');
  assert.ok(hero > 0 && hero < showcase && showcase < deal, "ordre : accueil, vitrine, promo");
  assert.match(client, /<div className="mj-tile-caption">/);
  assert.match(css, /\.mj-tile-media img \{[^}]*height: auto;[^}]*object-fit: contain/);
  assert.match(read("public/brand/maison-jiya-emblem.svg"), /prefers-reduced-motion: reduce/);
});

test("la bulle WhatsApp reste dans le coin et ne monte que si la barre panier est affichée", () => {
  assert.match(css, /\.storefront-v3-wa \{[^}]*bottom: calc\(18px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /\.storefront-v3-wa\.above-cart \{ bottom: calc\(88px/);
  assert.match(client, /storefront-v3-wa \$\{itemCount > 0 && !cartOpen && !checkoutOpen \? "above-cart" : ""\}/);
});

test("les anciens textes d'accueil trop longs sont remplacés, les textes personnalisés sont gardés", () => {
  const { heroCopy, HERO_DEFAULTS } = loadSource("lib/storefront-copy.ts");
  assert.equal(heroCopy("Les pièces que vous aimez, simplement livrées chez vous.", "fr", "title"), HERO_DEFAULTS.fr.title);
  assert.equal(heroCopy("", "ar", "text"), HERO_DEFAULTS.ar.text);
  assert.equal(heroCopy("Nouvelle collection", "fr", "title"), "Nouvelle collection");
  assert.ok(HERO_DEFAULTS.fr.title.length <= 40);
});

test("« À propos de nous » se modifie dans le logiciel en FR/AR/EN et s'affiche sur la boutique", () => {
  const cms = read("app/storefront-cms-v2-enhancement.tsx");
  const admin = read("app/api/storefront/admin/route.ts");
  const loader = read("db/storefront-public-fast.ts");
  assert.match(cms, /<legend>À propos de nous<\/legend>/);
  for (const field of ["aboutTitle", "aboutText", "aboutTitleAr", "aboutTextAr", "aboutTitleEn", "aboutTextEn"]) {
    assert.ok(cms.includes(`name="${field}"`), field);
    assert.ok(cms.includes(`${field}: form.get("${field}")`), field);
  }
  assert.match(admin, /\["storefront_about_text", text\(payload\.aboutText, 1600\)\]/);
  assert.match(admin, /'storefront_about_title', 'storefront_about_text'/);
  assert.match(loader, /aboutText: aboutCopy\(settings\.storefront_about_text_ar, "ar", "text"\)/);
  assert.match(client, /id="a-propos"/);
  assert.match(client, /aboutText\.split\(\/\\n\\s\*\\n\/\)/);
  assert.match(client, /<a href="#a-propos">\{ui\.about\}<\/a>/);
  const { aboutCopy, ABOUT_DEFAULTS } = loadSource("lib/storefront-copy.ts");
  assert.equal(aboutCopy("", "fr", "title"), ABOUT_DEFAULTS.fr.title);
  assert.equal(aboutCopy("Notre histoire", "fr", "title"), "Notre histoire");
});
