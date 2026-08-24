import fs from "node:fs";

const enhancement = fs.readFileSync("app/boutique/storefront-approved-design-enhancement.tsx", "utf8");
const css = fs.readFileSync("app/boutique/storefront-approved-cover.css", "utf8");
const assets = [
  "public/storefront/montres.webp",
  "public/storefront/bijoux.webp",
  "public/storefront/portefeuilles.webp",
  "public/storefront/packs.webp",
];

for (const asset of assets) {
  if (!fs.existsSync(asset)) throw new Error(`${asset} missing`);
  if (fs.statSync(asset).size < 1000) throw new Error(`${asset} is unexpectedly small`);
}
if (!enhancement.includes("HERO_IMAGE")) throw new Error("generated hero image is not wired");
if (!enhancement.includes("mj-cover-cta")) throw new Error("generated hero CTA is not wired");
if (!css.includes("aspect-ratio: 1672 / 941")) throw new Error("generated hero ratio is incorrect");
if (!css.includes("object-fit: cover")) throw new Error("responsive hero/category crop is missing");
console.log("✓ generated storefront assets, hero framing and CTA checks passed");
