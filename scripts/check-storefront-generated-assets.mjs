import fs from "node:fs";

const enhancement = fs.readFileSync("app/boutique/storefront-approved-design-enhancement.tsx", "utf8");
const responsiveCss = fs.readFileSync("app/boutique/storefront-responsive-neutral.css", "utf8");
const assets = [
  "public/storefront/brand/hero-men.svg",
  "public/storefront/brand/hero-women.svg",
  "public/storefront/brand/category-watch.svg",
  "public/storefront/brand/category-jewelry.svg",
  "public/storefront/brand/category-wallet.svg",
  "public/storefront/brand/category-pack.svg",
];

const checks = [
  [!enhancement.includes("HERO_IMAGE"), "legacy generated hero data image is removed"],
  [!enhancement.includes("/storefront/montres.webp") && !enhancement.includes("data:image/webp;base64"), "corrupted WebP references are removed"],
  [!enhancement.includes("images.unsplash.com") && !enhancement.includes("pxhere.com"), "external showcase photography is removed"],
  [enhancement.includes("brandVisuals.heroMen") && enhancement.includes("brandVisuals.heroWomen"), "Maison Jiya gender hero visuals are wired"],
  [enhancement.includes("brandVisuals.watches") && enhancement.includes("brandVisuals.jewelry") && enhancement.includes("brandVisuals.wallets") && enhancement.includes("brandVisuals.packs"), "all category visuals are wired"],
  [assets.every((asset) => fs.existsSync(asset) && fs.statSync(asset).size > 500), "all local branded storefront assets exist"],
  [enhancement.includes("mj-cover-cta"), "hero CTA is wired"],
  [responsiveCss.includes(".mj-hero-stage"), "responsive hero stage is styled"],
  [responsiveCss.includes("@media(max-width:760px)"), "phone-specific layout exists"],
  [responsiveCss.includes("aspect-ratio:16/7"), "compact single-column mobile categories are enabled"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Storefront image check failed: ${label}`);
  console.log(`✓ ${label}`);
}
console.log("✓ brand-safe and all-device storefront imagery checks passed");
