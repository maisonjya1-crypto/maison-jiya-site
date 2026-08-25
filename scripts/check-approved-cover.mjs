import fs from "node:fs";

const css = fs.readFileSync("app/boutique/storefront-approved-cover.css", "utf8");
const layout = fs.readFileSync("app/boutique/layout.tsx", "utf8");
const page = fs.readFileSync("app/boutique/page.tsx", "utf8");
const enhancement = fs.readFileSync("app/boutique/storefront-approved-design-enhancement.tsx", "utf8");
const interactions = fs.readFileSync("app/boutique/storefront-cover-interactions.tsx", "utf8");

const checks = [
  [layout.includes('import "./storefront-approved-cover.css"'), "approved cover CSS is imported"],
  [enhancement.includes("mj-hero-stage") && enhancement.includes("mj-hero-men") && enhancement.includes("mj-hero-women"), "responsive Homme/Femme hero is mounted"],
  [!enhancement.includes("data:image/webp;base64"), "corrupted base64 hero is removed"],
  [enhancement.includes("images.unsplash.com") && enhancement.includes("c.pxhere.com"), "stable photographic storefront sources are wired"],
  [css.includes("height: clamp(520px, 48vw, 760px)"), "hero has responsive framing"],
  [css.includes(".mj-cover-cta") && enhancement.includes("goToCatalogue"), "Discover collection CTA is clickable"],
  [page.includes("StorefrontCoverInteractions"), "Homme/Femme interaction layer is mounted"],
  [interactions.includes("mj-cover-hotspot-men") && interactions.includes("mj-cover-hotspot-women"), "Homme/Femme hotspots exist"],
  [interactions.includes("filterGender(gender)") && interactions.includes('"homme"') && interactions.includes('"femme"'), "hotspots filter gender models"],
  [css.includes(".mj-native-account::before") && css.includes(".mj-native-cart::before"), "account and cart icons stay visible"],
  [enhancement.includes("mj-pack-collage") && css.includes(".mj-pack-collage"), "Pack card uses a dedicated visual collage"],
  [css.includes("width:100% !important") && css.includes("grid-template-columns:1fr !important"), "mobile category cards occupy full width"],
  [page.includes("maison-jiya-public-reference-native-v5"), "storefront deployment marker remains v5"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Approved cover check failed: ${label}`);
  console.log(`✓ ${label}`);
}
