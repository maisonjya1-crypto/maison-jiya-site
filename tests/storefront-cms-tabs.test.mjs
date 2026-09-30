import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");

test("les onglets du CMS boutique restent de vrais boutons indépendants", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /function switchTab\(next: "identity" \| "products" \| "offers" \| "marketing"\)/);
  assert.match(source, /type="button" className=\{tab === "products"/);
  assert.match(source, /type="button" className=\{tab === "offers"/);
  assert.match(source, /type="button" className=\{tab === "marketing"/);
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

test("le lien boutique depuis le logiciel force une navigation fraîche dans la PWA", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /href="\/boutique\?source=gestion&pwa=v4"/);
  assert.match(source, /target="_blank"/);
});

test("les onglets restent au-dessus du contenu du CMS", async () => {
  const css = await readText("app/storefront-cms-v2.css");
  assert.match(css, /storefront-cms-v2 \.storefront-cms-tabs/);
  assert.match(css, /z-index:\s*20/);
});


test("l’upload photo mobile accepte le sélecteur natif et possède un fallback iPhone/Safari", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /accept="image\/\*"/);
  assert.match(source, /typeof createImageBitmap === "function"/);
  assert.match(source, /URL\.createObjectURL\(file\)/);
  assert.match(source, /new Image\(\)/);
  assert.match(source, /image\/jpeg/);
  assert.match(source, /event\.currentTarget\.value = ""/);
  assert.doesNotMatch(source, /file\.type\.match\(\/\^image\\\/\(jpeg\|png\|webp\)\$\//);
});


test("le CMS mobile ajoute une photo sans recharger tout l’écran et garde le produit ouvert", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  const css = await readText("app/storefront-cms-v2.css");
  const route = await readText("app/api/storefront/admin/media/route.ts");
  assert.match(source, /function addMediaLocally/);
  assert.match(source, /if \(body\.media\) addMediaLocally\(body\.media\)/);
  assert.doesNotMatch(source.slice(source.indexOf("async function uploadMany"), source.indexOf("const categories")), /await load\(\)/);
  assert.match(source, /<ProductEditor key=\{product\.productId\}/);
  assert.match(source, /storefront-cms-upload-progress/);
  assert.match(source, /targetBytes: 300_000/);
  assert.match(route, /Response\.json\(\{ ok: true, media, liveVersion:/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /storefront-cms-v2 \.storefront-cms-tabs[^}]*flex-wrap:\s*wrap/s);
});


test("un ajout photo local ne provoque plus le rechargement complet de la PWA", async () => {
  const cms = await readText("app/storefront-cms-v2-enhancement.tsx");
  const pwa = await readText("app/private-pwa.tsx");
  const media = await readText("app/api/storefront/admin/media/route.ts");
  assert.match(cms, /maison-jiya-local-live-version/);
  assert.match(cms, /acknowledgeLocalLiveVersion\(body\.liveVersion\)/);
  assert.match(pwa, /localLiveVersion/);
  assert.match(pwa, /window\.addEventListener\("maison-jiya-local-live-version"/);
  assert.match(pwa, /currentVersion <= localLiveVersion\.current/);
  assert.match(media, /liveVersion: Number\(syncState\?\.version \|\| 0\)/);
});
