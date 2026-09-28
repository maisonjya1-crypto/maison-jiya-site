import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const client = await readFile(new URL("../app/boutique/storefront-client-v3.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/boutique/storefront-v3.css", import.meta.url), "utf8");
const hotfix = await readFile(new URL("../app/boutique/storefront-gallery-hotfix.css", import.meta.url), "utf8");

test("les fenêtres publiques se ferment au clavier et bloquent le scroll arrière-plan", () => {
  assert.match(client, /const overlayOpen = Boolean\(selectedItem \|\| cartOpen \|\| checkoutOpen \|\| confirmation\)/);
  assert.match(client, /document\.body\.style\.overflow = "hidden"/);
  assert.match(client, /if \(event\.key !== "Escape"\) return/);
  assert.match(client, /if \(checkoutOpen && submitting\) return/);
  assert.match(client, /setConfirmation\(null\)/);
  assert.match(client, /setCheckoutOpen\(false\)/);
  assert.match(client, /setCartOpen\(false\)/);
  assert.match(client, /setSelectedItem\(null\)/);
  assert.match(client, /document\.body\.style\.overflow = previousOverflow/);
});

test("les contrôles de langue et quantité sont explicites au clavier et lecteur d'écran", () => {
  assert.match(client, /role="group" aria-label="Language \/ اللغة"/);
  assert.match(client, /aria-pressed=\{lang === "fr"\}/);
  assert.match(client, /aria-pressed=\{lang === "ar"\}/);
  assert.match(client, /aria-pressed=\{lang === "en"\}/);
  assert.match(client, /aria-label="Français"/);
  assert.match(client, /aria-label="العربية"/);
  assert.match(client, /aria-label="English"/);
  assert.match(client, /aria-label=\{\`\$\{t\.quantity\} − · \$\{line\.item\.name\}\`\}/);
  assert.match(client, /aria-label=\{\`\$\{t\.quantity\} \+ · \$\{line\.item\.name\}\`\}/);
  assert.match(client, /<b aria-live="polite">\{itemCount\}<\/b>/);
});

test("FR AR EN et RTL restent pilotés explicitement", () => {
  assert.match(client, /fr:\s*\{/);
  assert.match(client, /ar:\s*\{/);
  assert.match(client, /en:\s*\{/);
  assert.match(client, /dir=\{lang === "ar" \? "rtl" : "ltr"\}/);
  assert.match(client, /document\.documentElement\.dir = lang === "ar" \? "rtl" : "ltr"/);
});

test("le responsive protège panier checkout galerie et largeur mobile", () => {
  assert.match(css, /overflow-x:hidden/);
  assert.match(css, /storefront-v3-drawer\{[^}]*height:100dvh/);
  assert.match(css, /storefront-v3-checkout,.storefront-v3-success\{[^}]*max-height:calc\(100dvh - 32px\)/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /storefront-v3-form-row\{grid-template-columns:1fr\}/);
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /storefront-v3-grid\.promo,.storefront-v3-grid\.catalogue,.storefront-v3-grid\.packs\{grid-template-columns:1fr\}/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /storefront-v3-product-dialog\{width:100%;max-width:none;max-height:100dvh/);
  assert.match(css, /storefront-v3-product-thumbnails\{[^}]*overflow-x:auto/);
});

test("le focus clavier reste visible dans la dernière couche CSS", () => {
  assert.match(hotfix, /:where\(button,a,input,select,textarea\):focus-visible/);
  assert.match(hotfix, /outline:2px solid #6d526f!important/);
  assert.match(hotfix, /outline-offset:2px!important/);
});

test("les quatre fenêtres critiques sont de vrais dialogs modaux nommés", () => {
  assert.match(client, /storefront-v3-product-dialog" role="dialog" aria-modal="true" aria-label=\{item\.name\}/);
  assert.match(client, /storefront-v3-drawer" role="dialog" aria-modal="true" aria-label=\{t\.yourCart\}/);
  assert.match(client, /storefront-v3-checkout" role="dialog" aria-modal="true" aria-label=\{t\.orderTitle\}/);
  assert.match(client, /storefront-v3-success" role="dialog" aria-modal="true" aria-label=\{t\.orderSuccess\}/);
});
