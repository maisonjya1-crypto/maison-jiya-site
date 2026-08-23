import fs from "node:fs";

const page = fs.readFileSync("app/boutique/page.tsx", "utf8");
const css = fs.readFileSync("app/boutique/storefront-approved-cover.css", "utf8");

if (!page.includes("maison-jiya-public-reference-native-v5")) throw new Error("storefront v5 marker missing");
if (!page.includes("StorefrontCoverInteractions")) throw new Error("cover interactions missing");
if (!css.includes("mj-cover-hotspot-men") || !css.includes("mj-cover-hotspot-women")) throw new Error("cover gender hotspots missing");
if (!css.includes("mj-native-account::before") || !css.includes("mj-native-cart::before")) throw new Error("header icon visibility fix missing");
if (!css.includes("storefront-reference-category-media img")) throw new Error("Option C category images missing");
console.log("✓ storefront cover v5 checks passed");
