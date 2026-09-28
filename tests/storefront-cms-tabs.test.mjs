import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");

test("les onglets du CMS boutique restent de vrais boutons indépendants", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /function switchTab\(next: "identity" \| "products" \| "offers"\)/);
  assert.match(source, /type="button" className=\{tab === "products"/);
  assert.match(source, /type="button" className=\{tab === "offers"/);
  assert.match(source, /aria-pressed=\{tab === "products"\}/);
  assert.match(source, /pageRef\.current\?\.scrollTo/);
});

test("le catalogue ne monte pas les 44 formulaires et galeries en une fois", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /const \[productLimit, setProductLimit\] = useState\(16\)/);
  assert.match(source, /const visibleProducts = filteredProducts\.slice\(0, productLimit\)/);
  assert.match(source, /visibleProducts\.map/);
  assert.match(source, /Afficher 16 produits de plus/);
  assert.match(source, /\{open && <form onSubmit=\{\(event\) => void submit\(event\)\}>/);
});

test("les offres existantes chargent leur éditeur uniquement à l'ouverture", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /const \[open, setOpen\] = useState\(isNew\)/);
  assert.match(source, /storefront-cms-offer-card[^]*open=\{open\}[^]*onToggle/);
});

test("les onglets restent au-dessus du contenu du CMS", async () => {
  const css = await readText("app/storefront-cms-v2.css");
  assert.match(css, /storefront-cms-v2 \.storefront-cms-tabs/);
  assert.match(css, /z-index:\s*20/);
});
