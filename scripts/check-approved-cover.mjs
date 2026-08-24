import fs from "node:fs";

const css = fs.readFileSync("app/boutique/storefront-approved-cover.css", "utf8");
const layout = fs.readFileSync("app/boutique/layout.tsx", "utf8");
const page = fs.readFileSync("app/boutique/page.tsx", "utf8");
const enhancement = fs.readFileSync("app/boutique/storefront-approved-design-enhancement.tsx", "utf8");
const interactions = fs.readFileSync("app/boutique/storefront-cover-interactions.tsx", "utf8");

const categoryAssets = [
  "public/storefront/montres.webp",
  "public/storefront/bijoux.webp",
  "public/storefront/portefeuilles.webp",
  "public/storefront/packs.webp",
];

const checks = [
  [layout.includes('import "./storefront-approved-cover.css"'), "approved cover CSS is imported"],
  [enhancement.includes('import hero0 from "./generated-assets/hero-0"') && enhancement.includes('import hero1 from "./generated-assets/hero-1"'), "generated hero asset is mounted"],
  [enhancement.includes("data:image/webp;base64"), "generated hero is rendered as a WebP data image"],
  [enhancement.includes("mj-generated-hero-image"), "hero image element exists"],
  [css.includes("aspect-ratio: 1672 / 941"), "hero uses the approved generated-image ratio"],
  [css.includes(".mj-cover-cta") && enhancement.includes("goToCatalogue"), "Discover collection CTA is clickable"],
  [page.includes("StorefrontCoverInteractions"), "Homme/Femme interaction layer is mounted"],
  [interactions.includes("mj-cover-hotspot-men") && interactions.includes("mj-cover-hotspot-women"), "Homme/Femme hotspots exist"],
  [interactions.includes("filterGender(gender)") && interactions.includes('"homme"') && interactions.includes('"femme"'), "hotspots filter gender models"],
  [css.includes(".mj-native-account::before") && css.includes(".mj-native-cart::before"), "account and cart icons stay visible"],
  [enhancement.includes("/storefront/montres.webp") && enhancement.includes("/storefront/bijoux.webp") && enhancement.includes("/storefront/portefeuilles.webp") && enhancement.includes("/storefront/packs.webp"), "category cards use dedicated generated assets"],
  [categoryAssets.every((asset) => fs.existsSync(asset) && fs.statSync(asset).size > 1000), "all four category image assets exist and are non-empty"],
  [page.includes("maison-jiya-public-reference-native-v5"), "storefront deployment marker remains v5"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Approved cover check failed: ${label}`);
  console.log(`✓ ${label}`);
}
