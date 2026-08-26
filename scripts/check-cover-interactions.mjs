import fs from "node:fs";

const interactions = fs.readFileSync("app/boutique/storefront-cover-interactions.tsx", "utf8");
const baseCss = fs.readFileSync("app/boutique/storefront-approved-cover.css", "utf8");
const responsiveCss = fs.readFileSync("app/boutique/storefront-responsive-neutral.css", "utf8");
const enhancement = fs.readFileSync("app/boutique/storefront-approved-design-enhancement.tsx", "utf8");

const checks = [
  [interactions.includes("mj-cover-hotspot-men"), "Homme hotspot"],
  [interactions.includes("mj-cover-hotspot-women"), "Femme hotspot"],
  [interactions.includes("exactGenderCategory"), "exact Montres Homme/Femme category detection"],
  [baseCss.includes(".mj-native-account::before"), "visible account icon"],
  [baseCss.includes(".mj-native-cart::before"), "visible cart icon"],
  [(baseCss + responsiveCss).includes(".mj-cover-cta") && enhancement.includes("goToCatalogue"), "Discover collection CTA is functional"],
  [responsiveCss.includes(".storefront-reference-category-media>img"), "Option C category visual styling"],
  [enhancement.includes("brandVisuals.watches") && enhancement.includes("category-watch.svg"), "Montres card uses Maison Jiya thematic visual"],
  [enhancement.includes("brandVisuals.jewelry") && enhancement.includes("category-jewelry.svg"), "Bijoux card uses Maison Jiya thematic visual"],
  [enhancement.includes("brandVisuals.wallets") && enhancement.includes("category-wallet.svg"), "Portefeuilles card uses Maison Jiya thematic visual"],
  [enhancement.includes("brandVisuals.packs") && enhancement.includes("category-pack.svg"), "Packs card uses Maison Jiya thematic visual"],
  [!enhancement.includes("images.unsplash.com") && !enhancement.includes("pxhere.com") && !enhancement.includes("data:image/webp;base64"), "third-party and corrupted storefront imagery is removed"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Cover interaction check failed: ${label}`);
  console.log(`✓ ${label}`);
}
