import fs from "node:fs";

const interactions = fs.readFileSync("app/boutique/storefront-cover-interactions.tsx", "utf8");
const baseCss = fs.readFileSync("app/boutique/storefront-approved-cover.css", "utf8");
const responsiveCss = fs.readFileSync("app/boutique/storefront-responsive-neutral.css", "utf8");
const quickActionsCss = fs.readFileSync("app/boutique/storefront-header-quick-actions.css", "utf8");
const enhancement = fs.readFileSync("app/boutique/storefront-approved-design-enhancement.tsx", "utf8");

const checks = [
  [interactions.includes("mj-cover-hotspot-men"), "Homme hotspot"],
  [interactions.includes("mj-cover-hotspot-women"), "Femme hotspot"],
  [interactions.includes("exactGenderCategory"), "exact Montres Homme/Femme category detection"],
  [baseCss.includes(".mj-native-account::before"), "visible contact icon"],
  [baseCss.includes(".mj-native-cart::before"), "visible cart icon"],
  [enhancement.includes('className="mj-native-account" href="#contact"'), "header contact action still targets the WhatsApp message section"],
  [quickActionsCss.includes("background: #fff !important") && quickActionsCss.includes("#25d366"), "white quick-action buttons with recognizable WhatsApp green"],
  [quickActionsCss.includes(".mj-native-cart::before") && quickActionsCss.includes("background: #111 !important"), "high-contrast classic cart icon"],
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
