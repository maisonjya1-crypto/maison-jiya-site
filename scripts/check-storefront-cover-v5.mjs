import fs from "node:fs";

const page = fs.readFileSync("app/boutique/page.tsx", "utf8");
const baseCss = fs.readFileSync("app/boutique/storefront-approved-cover.css", "utf8");
const responsiveCss = fs.readFileSync("app/boutique/storefront-responsive-neutral.css", "utf8");
const enhancement = fs.readFileSync("app/boutique/storefront-approved-design-enhancement.tsx", "utf8");

if (!page.includes("maison-jiya-public-reference-native-v5")) throw new Error("storefront v5 marker missing");
if (!page.includes("StorefrontCoverInteractions")) throw new Error("cover interactions missing");
if (!baseCss.includes("mj-cover-hotspot-men") || !baseCss.includes("mj-cover-hotspot-women")) throw new Error("cover gender hotspots missing");
if (!baseCss.includes("mj-native-account::before") || !baseCss.includes("mj-native-cart::before")) throw new Error("header icon visibility fix missing");
if (!responsiveCss.includes("storefront-reference-category-media>img")) throw new Error("full-card category visuals missing");
if (!enhancement.includes("mj-hero-stage") || enhancement.includes("data:image/webp;base64")) throw new Error("stable responsive hero missing");
if (enhancement.includes("images.unsplash.com") || enhancement.includes("pxhere.com")) throw new Error("third-party product imagery remains");
if (!responsiveCss.includes("@media(max-width:390px)") || !responsiveCss.includes("@media(max-width:760px)")) throw new Error("small and standard phone layouts missing");
console.log("✓ storefront cover v5 + brand-safe all-device responsive checks passed");
