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
assert.match(publicPage, /storefront_manual_catalog_initialized_v1/);
assert.match(publicPage, /maison-jiya-modern-v6/);
assert.match(publicPage, /mj-shop-root/);

const publicLayout = await readText("app/boutique/layout.tsx");
assert.match(publicLayout, /storefront-modern\.css/);
assert.doesNotMatch(publicLayout, /storefront-reference-clean\.css/);

const client = await readText("app/boutique/storefront-client-v3.tsx");
assert.match(client, /type Copy/);
assert.match(client, /fr:\s*\{/);
assert.match(client, /ar:\s*\{/);
assert.match(client, /en:\s*\{/);
assert.match(client, /document\.documentElement\.dir/);
assert.match(client, /cash on delivery|Cash on delivery/i);
for (const anchor of ["mj-header", "mj-hero", "mj-deal", "id=\"catalogue\"", "id=\"offres\"", "id=\"contact\"", "mj-cart-bar"]) {
  assert.ok(client.includes(anchor), `ancre boutique manquante : ${anchor}`);
}
// Aucun compte à rebours inventé (Meta + loi marocaine sur la protection du consommateur).
assert.doesNotMatch(client, /countdown|compte à rebours/i);

const css = await readText("app/boutique/storefront-modern.css");
assert.match(css, /--grenat:/);
assert.match(css, /@media \(max-width: 860px\)/);
assert.match(css, /100dvh/);
assert.match(css, /safe-area-inset-bottom/);
assert.match(css, /prefers-reduced-motion/);

const smoke = await readText("scripts/smoke-production.mjs");
assert.match(smoke, /maison-jiya-modern-v6/);
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

console.log("Storefront V3 (catalogue manuel + FR/AR/EN + design moderne v6 + responsive privé/public): OK");
