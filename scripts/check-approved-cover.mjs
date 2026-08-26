import fs from "node:fs";

const baseCss = fs.readFileSync("app/boutique/storefront-approved-cover.css", "utf8");
const responsiveCss = fs.readFileSync("app/boutique/storefront-responsive-neutral.css", "utf8");
const layout = fs.readFileSync("app/boutique/layout.tsx", "utf8");
const page = fs.readFileSync("app/boutique/page.tsx", "utf8");
const enhancement = fs.readFileSync("app/boutique/storefront-approved-design-enhancement.tsx", "utf8");
const interactions = fs.readFileSync("app/boutique/storefront-cover-interactions.tsx", "utf8");
const assets = [
  "public/storefront/brand/hero-men.svg",
  "public/storefront/brand/hero-women.svg",
  "public/storefront/brand/category-watch.svg",
  "public/storefront/brand/category-jewelry.svg",
  "public/storefront/brand/category-wallet.svg",
  "public/storefront/brand/category-pack.svg",
];

const checks = [
  [layout.includes('import "./storefront-approved-cover.css"') && layout.includes('import "./storefront-responsive-neutral.css"'), "cover and final responsive CSS are imported"],
  [enhancement.includes("mj-hero-stage") && enhancement.includes("mj-hero-men") && enhancement.includes("mj-hero-women"), "responsive Homme/Femme hero is mounted"],
  [!enhancement.includes("data:image/webp;base64") && !enhancement.includes("images.unsplash.com") && !enhancement.includes("pxhere.com"), "corrupted and third-party image sources are removed"],
  [enhancement.includes("/storefront/brand/hero-men.svg") && enhancement.includes("/storefront/brand/hero-women.svg"), "Maison Jiya hero visuals are wired"],
  [assets.every((asset) => fs.existsSync(asset) && fs.statSync(asset).size > 500), "all Maison Jiya storefront SVG assets exist"],
  [responsiveCss.includes("height:clamp(430px,112vw,510px)") && responsiveCss.includes("@media(max-width:760px)"), "dedicated mobile hero framing exists"],
  [(baseCss + responsiveCss).includes(".mj-cover-cta") && enhancement.includes("goToCatalogue"), "Discover collection CTA is clickable"],
  [page.includes("StorefrontCoverInteractions"), "Homme/Femme interaction layer is mounted"],
  [interactions.includes("mj-cover-hotspot-men") && interactions.includes("mj-cover-hotspot-women"), "Homme/Femme hotspots exist"],
  [interactions.includes("filterGender(gender)") && interactions.includes('"homme"') && interactions.includes('"femme"'), "hotspots filter gender models"],
  [baseCss.includes(".mj-native-account::before") && baseCss.includes(".mj-native-cart::before"), "account and cart icons stay visible"],
  [enhancement.includes("brandVisuals.packs") && enhancement.includes("category-pack.svg"), "Pack card uses a dedicated Maison Jiya visual"],
  [responsiveCss.includes("aspect-ratio:16/7") && responsiveCss.includes("grid-template-columns:1fr"), "mobile category cards are compact and full width"],
  [page.includes("maison-jiya-public-reference-native-v5"), "storefront deployment marker remains v5"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Approved cover check failed: ${label}`);
  console.log(`✓ ${label}`);
}
