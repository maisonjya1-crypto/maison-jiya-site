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
  [css.includes(".storefront-reference-category-media img"), "Option C category photo styling"],
  [enhancement.includes('firstMatching(products, ["montre", "watch"])'), "watch category uses matching photo"],
  [enhancement.includes('firstMatching(products, ["bijou", "jewel", "bracelet", "collier"])'), "jewelry category uses matching photo"],
  [enhancement.includes('firstMatching(products, ["portefeuille", "wallet", "porte monnaie", "porte-monnaie"])'), "wallet category uses matching photo"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Cover interaction check failed: ${label}`);
  console.log(`✓ ${label}`);
}
