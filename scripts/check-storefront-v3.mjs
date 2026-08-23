import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readText = async (path) => readFile(new URL(path, root), "utf8");

const cms = await readText("db/storefront-cms.ts");
assert.match(cms, /storefront_manual_catalog_initialized_v1/);
assert.match(cms, /SELECT id, name, sale_price, 0, 'available'/);
assert.match(cms, /stock interne sert uniquement|futurs articles du stock|publication manuelle/i);
assert.match(cms, /storefront_announcement_ar/);
assert.match(cms, /storefront_announcement_en/);
assert.match(cms, /storefront_brand_strip/);

const publicCatalog = await readText("db/storefront-public-fast.ts");
assert.match(publicCatalog, /JOIN storefront_product_settings s ON s\.product_id = p\.id/);
assert.match(publicCatalog, /WHERE s\.is_visible = 1/);
assert.match(publicCatalog, /product\.availabilityMode !== "out_of_stock"/);
assert.doesNotMatch(publicCatalog, /stockQuantity <= 3/);
assert.match(publicCatalog, /localized:/);
assert.match(publicCatalog, /brandStrip:/);

const orderRoute = await readText("app/api/storefront/orders/route.ts");
assert.match(orderRoute, /stock réel[^]*contrôlé\/déduit qu'au moment/i);
assert.doesNotMatch(orderRoute, /quantity > product\.stockQuantity/);
assert.doesNotMatch(orderRoute, /product\.stockQuantity <= 0/);
assert.match(orderRoute, /status,[^]*'En attente'/);

const publicPage = await readText("app/boutique/page.tsx");
assert.match(publicPage, /StorefrontClientV3/);
assert.match(publicPage, /StorefrontApprovedDesignEnhancement/);
assert.match(publicPage, /storefront_manual_catalog_initialized_v1/);
assert.match(publicPage, /maison-jiya-public-reference-black-v2/);
assert.match(publicPage, /storefront-approved-design storefront-reference-exact/);
assert.doesNotMatch(publicPage, /BestSellerVerticalEnhancement/);

const publicLayout = await readText("app/boutique/layout.tsx");
assert.match(publicLayout, /storefront-v3\.css/);
assert.match(publicLayout, /storefront-approved-design\.css/);
assert.match(publicLayout, /storefront-reference-exact\.css/);

const client = await readText("app/boutique/storefront-client-v3.tsx");
assert.match(client, /type Copy/);
assert.match(client, /fr:\s*\{/);
assert.match(client, /ar:\s*\{/);
assert.match(client, /en:\s*\{/);
assert.match(client, /توصيل مجاني إلى جميع أنحاء المغرب/);
assert.match(client, /Free delivery across Morocco/);
assert.match(client, /storefront-v3-marquee-track/);
assert.match(client, /storefront-v3-brand-strip-track/);
assert.match(client, /Math\.min\(20/);
assert.match(client, /document\.documentElement\.dir/);
assert.match(client, /cash on delivery|Cash on delivery/i);

const css = await readText("app/boutique/storefront-v3.css");
assert.match(css, /@keyframes v3-marquee/);
assert.match(css, /@keyframes v3-brandstrip/);
assert.match(css, /@media\(max-width:720px\)/);
assert.match(css, /100dvh/);
assert.match(css, /safe-area-inset-bottom/);

const approved = await readText("app/boutique/storefront-approved-design-enhancement.tsx");
assert.match(approved, /#catalogue/);
assert.match(approved, /#offres/);
assert.match(approved, /#contact/);
assert.match(approved, /storefront-approved-search/);
assert.match(approved, /storefront-reference-services/);
assert.match(approved, /storefront-reference-categories/);
assert.match(approved, /OFFRES DU MOMENT/);
assert.match(approved, /Catalogue/);
assert.match(approved, /الكتالوج/);
assert.match(approved, /Catalog/);

const exactCss = await readText("app/boutique/storefront-reference-exact.css");
assert.match(exactCss, /storefront-reference-exact/);
assert.match(exactCss, /background:#050505/);
assert.match(exactCss, /storefront-reference-services/);
assert.match(exactCss, /storefront-reference-category-media/);
assert.match(exactCss, /data:image\/webp;base64/);
assert.match(exactCss, /storefront-reference-hero-hit/);
assert.match(exactCss, /@media\(max-width:680px\)/);

const approvedCss = await readText("app/boutique/storefront-approved-design.css");
assert.match(approvedCss, /grid-template-areas:"search brand actions" "nav nav nav"/);
assert.match(approvedCss, /storefront-v3-brand>img/);
assert.match(approvedCss, /drop-shadow/);
assert.match(approvedCss, /storefront-v3-hero-media::after/);
assert.match(approvedCss, /storefront-approved-hero-collage/);
assert.match(approvedCss, /@media \(max-width:680px\)/);

const smoke = await readText("scripts/smoke-production.mjs");
assert.match(smoke, /maison-jiya-public-reference-black-v2/);
assert.match(smoke, /storefront-reference-exact/);
assert.match(smoke, /REQUIRE_REFERENCE_BLACK_DESIGN/);

const deployWorkflow = await readText(".github/workflows/deploy-cloudflare.yml");
assert.match(deployWorkflow, /REQUIRE_REFERENCE_BLACK_DESIGN:\s*"1"/);

const privateEnhancement = await readText("app/private-ui-v3-enhancement.tsx");
assert.match(privateEnhancement, /details\.trash-actions/);
assert.match(privateEnhancement, /details\.open = true/);
assert.match(privateEnhancement, /indépendant du stock/);

const privateCss = await readText("app/private-ui-v3.css");
assert.match(privateCss, /order-action-menu/);
assert.match(privateCss, /button\.danger/);
assert.match(privateCss, /safe-area-inset-left/);
assert.match(privateCss, /overflow-x:\s*auto/);

console.log("Storefront V3 (catalogue manuel + quantités avant confirmation + FR/AR/EN + design noir SSR + vérification de déploiement + responsive privé/public): OK");
