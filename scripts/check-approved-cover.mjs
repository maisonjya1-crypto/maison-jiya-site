import fs from "node:fs";

const css = fs.readFileSync("app/boutique/storefront-approved-cover.css", "utf8");
const layout = fs.readFileSync("app/boutique/layout.tsx", "utf8");
const page = fs.readFileSync("app/boutique/page.tsx", "utf8");
const interactions = fs.readFileSync("app/boutique/storefront-cover-interactions.tsx", "utf8");
const svg = fs.readFileSync("public/maison-jiya-cover-approved.svg", "utf8");

const checks = [
  [layout.includes('import "./storefront-approved-cover.css"'), "approved cover CSS is imported"],
  [css.includes("/maison-jiya-cover-approved.svg"), "hero points to approved cover"],
  [svg.includes("HOMME") && svg.includes("FEMME"), "cover contains Homme and Femme sections"],
  [svg.includes("L’HEURE DE BRILLER"), "cover contains Maison Jiya slogan"],
  [svg.includes("DÉCOUVRIR LA COLLECTION"), "cover contains CTA"],
  [page.includes("StorefrontCoverInteractions"), "Homme/Femme interaction layer is mounted"],
  [interactions.includes("mj-cover-hotspot-men") && interactions.includes("mj-cover-hotspot-women"), "Homme/Femme hotspots exist"],
  [interactions.includes('filterGender("homme")') && interactions.includes('filterGender("femme")'), "hotspots filter gender models"],
  [css.includes(".mj-native-account::before") && css.includes(".mj-native-cart::before"), "account and cart icons are visible SVG masks"],
  [css.includes(".storefront-reference-category-media img") && css.includes("object-fit: cover"), "Option C category photography layout is enabled"],
  [page.includes("maison-jiya-public-reference-native-v5"), "storefront deployment marker advanced to v5"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Approved cover check failed: ${label}`);
  console.log(`✓ ${label}`);
}
