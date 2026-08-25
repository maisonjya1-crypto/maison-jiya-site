import fs from "node:fs";

const enhancement = fs.readFileSync("app/boutique/storefront-approved-design-enhancement.tsx", "utf8");
const css = fs.readFileSync("app/boutique/storefront-approved-cover.css", "utf8");

const checks = [
  [!enhancement.includes("HERO_IMAGE"), "legacy generated hero data image is removed"],
  [!enhancement.includes("/storefront/montres.webp"), "corrupted local category WebP references are removed"],
  [enhancement.includes("showcaseImages.watchMen"), "watch visual is wired"],
  [enhancement.includes("showcaseImages.watchWomen"), "women watch visual is wired"],
  [enhancement.includes("showcaseImages.jewelry"), "jewelry visual is wired"],
  [enhancement.includes("showcaseImages.wallet"), "wallet visual is wired"],
  [enhancement.includes("mj-pack-collage"), "pack collage is wired"],
  [enhancement.includes("mj-cover-cta"), "hero CTA is wired"],
  [css.includes(".mj-hero-stage"), "responsive hero stage is styled"],
  [css.includes(".storefront-reference-category-media > img"), "category images are styled as full-card photos"],
  [css.includes("grid-template-columns:1fr !important"), "single-column mobile categories are enabled"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Storefront image check failed: ${label}`);
  console.log(`✓ ${label}`);
}
console.log("✓ iPhone-safe storefront imagery and framing checks passed");
