import fs from "node:fs";

const css = fs.readFileSync("app/boutique/storefront-approved-cover.css", "utf8");
const layout = fs.readFileSync("app/boutique/layout.tsx", "utf8");
const svg = fs.readFileSync("public/maison-jiya-cover-approved.svg", "utf8");

const checks = [
  [layout.includes('import "./storefront-approved-cover.css"'), "approved cover CSS is imported"],
  [css.includes("/maison-jiya-cover-approved.svg"), "hero points to approved cover"],
  [svg.includes("HOMME") && svg.includes("FEMME"), "cover contains Homme and Femme sections"],
  [svg.includes("L’HEURE DE BRILLER"), "cover contains Maison Jiya slogan"],
  [svg.includes("DÉCOUVRIR LA COLLECTION"), "cover contains CTA"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Approved cover check failed: ${label}`);
  console.log(`✓ ${label}`);
}
