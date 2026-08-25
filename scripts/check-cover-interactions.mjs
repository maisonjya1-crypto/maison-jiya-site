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
  [css.includes(".storefront-reference-category-media > img"), "Option C category photo styling"],
  [enhancement.includes("showcaseImages.watchMen"), "Montres card uses thematic watch photo"],
  [enhancement.includes("showcaseImages.jewelry"), "Bijoux card uses thematic jewelry photo"],
  [enhancement.includes("showcaseImages.wallet"), "Portefeuilles card uses thematic wallet photo"],
  [enhancement.includes("mj-pack-collage"), "Packs card uses thematic collage instead of real stock pack"],
  [!enhancement.includes("/storefront/montres.webp") && !enhancement.includes("data:image/webp;base64"), "corrupted local storefront image references are removed"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Cover interaction check failed: ${label}`);
  console.log(`✓ ${label}`);
}
