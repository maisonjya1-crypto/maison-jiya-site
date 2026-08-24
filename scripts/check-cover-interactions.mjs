import fs from "node:fs";

const interactions = fs.readFileSync("app/boutique/storefront-cover-interactions.tsx", "utf8");
const css = fs.readFileSync("app/boutique/storefront-approved-cover.css", "utf8");
const enhancement = fs.readFileSync("app/boutique/storefront-approved-design-enhancement.tsx", "utf8");

const checks = [
  [interactions.includes("mj-cover-hotspot-men"), "Homme hotspot"],
  [interactions.includes("mj-cover-hotspot-women"), "Femme hotspot"],
  [interactions.includes("exactGenderCategory"), "exact Montres Homme/Femme category detection"],
  [css.includes(".mj-native-account::before"), "visible account icon"],
  [css.includes(".mj-native-cart::before"), "visible cart icon"],
  [css.includes(".mj-cover-cta") && enhancement.includes("goToCatalogue"), "Discover collection CTA is functional"],
  [css.includes(".storefront-reference-category-media img"), "Option C category photo styling"],
  [enhancement.includes('watches: "/storefront/montres.webp"'), "Montres card uses dedicated thematic photo"],
  [enhancement.includes('jewelry: "/storefront/bijoux.webp"'), "Bijoux card uses dedicated thematic photo"],
  [enhancement.includes('wallets: "/storefront/portefeuilles.webp"'), "Portefeuilles card uses dedicated thematic photo"],
  [enhancement.includes('packs: "/storefront/packs.webp"'), "Packs card uses dedicated generated pack photo"],
  [!enhancement.includes("catalog.offers?.[0] || firstMatching(products, [\"pack\", \"coffret\"] )"), "Packs card no longer depends on a real stock/offer image"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Cover interaction check failed: ${label}`);
  console.log(`✓ ${label}`);
}
