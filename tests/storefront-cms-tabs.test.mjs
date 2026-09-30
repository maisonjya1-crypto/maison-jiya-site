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
  assert.match(source, /if \(body\.media\) replaceMediaLocally\(tempId, \{ \.\.\.body\.media, previewUrl: activePreview \}\)/);
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


test("la PWA ne redémarre pas si le polling voit la version changer pendant un upload photo local", async () => {
  const cms = await readText("app/storefront-cms-v2-enhancement.tsx");
  const pwa = await readText("app/private-pwa.tsx");
  assert.match(cms, /maison-jiya-local-mutation-start/);
  assert.match(cms, /maison-jiya-local-mutation-end/);
  assert.match(cms, /setLocalMutationActive\(true\)/);
  assert.match(cms, /setLocalMutationActive\(false\)/);
  assert.match(pwa, /const localMutationDepth = useRef\(0\)/);
  assert.match(pwa, /localMutationDepth\.current > 0/);
  assert.match(pwa, /lastDataVersion\.current = currentVersion;\s*return;/);
});


test("les changements live ne peuvent plus redémarrer complètement la PWA", async () => {
  const pwa = await readText("app/private-pwa.tsx");
  const dashboard = await readText("app/dashboard-client.tsx");
  const cms = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.doesNotMatch(pwa, /window\.location\.reload\(\)/);
  assert.match(pwa, /maison-jiya-live-refresh/);
  assert.match(dashboard, /window\.addEventListener\("maison-jiya-live-refresh"/);
  assert.match(dashboard, /loadData\(true\)/);
  assert.match(cms, /window\.addEventListener\("maison-jiya-live-refresh"/);
  assert.match(cms, /load\(true\)/);
});

test("la compression photo mobile réduit la mémoire avant le canvas quand les dimensions sont lisibles", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /async function readEncodedImageDimensions/);
  assert.match(source, /resizeWidth:\s*targetWidth/);
  assert.match(source, /resizeHeight:\s*targetHeight/);
  assert.match(source, /resizeQuality:\s*"high"/);
  assert.match(source, /loadImageForCanvas\(file, limits\.maxSide\)/);
  assert.match(source, /canvas\.width = 1/);
  assert.match(source, /canvas\.height = 1/);
});


test("la photo choisie apparaît immédiatement et reste visible pendant/après l’upload", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  const styles = await readText("app/storefront-cms-v2.css");
  assert.match(source, /previewUrl\?: string/);
  assert.match(source, /URL\.createObjectURL\(raw\)/);
  assert.match(source, /pending:\s*true/);
  assert.match(source, /replaceMediaLocally\(tempId, \{ \.\.\.body\.media, previewUrl: activePreview \}\)/);
  assert.match(source, /mediaSrc\(item\)/);
  assert.match(styles, /storefront-cms-photo-pending/);
});

test("le CMS mobile utilise un seul scroller plein écran et permet le geste vertical dans les cartes", async () => {
  const styles = await readText("app/storefront-cms-v2.css");
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(styles, /storefront-cms-page\.storefront-cms-v2[\s\S]*position:\s*fixed/);
  assert.match(styles, /height:\s*100dvh/);
  assert.match(styles, /overflow-y:\s*scroll/);
  assert.match(styles, /touch-action:\s*pan-y pinch-zoom/);
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  assert.match(source, /document\.documentElement\.style\.overflow = "hidden"/);
});

test("le catalogue public permet de créer un nouveau produit à stock 0 et sur commande", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /Ajouter un produit hors stock/);
  assert.match(source, /action:\s*"addProduct"/);
  assert.match(source, /initialQuantity:\s*0/);
  assert.match(source, /availabilityMode:\s*"available"/);
  assert.match(source, /badge:\s*"Sur commande"/);
  assert.match(source, /stock interne est créé à 0/);
  assert.match(source, /const effectiveOut = product\.availabilityMode === "out_of_stock"/);
});


test("le CMS mobile reste au-dessus de la barre de navigation privée", async () => {
  const styles = await readText("app/storefront-cms-v2.css");
  assert.match(styles, /storefront-cms-page\.storefront-cms-v2[\s\S]*z-index:\s*5000\s*!important/);
  assert.match(styles, /storefront-cms-page\.storefront-cms-v2[\s\S]*isolation:\s*isolate/);
});


test("les onglets du CMS mobile défilent avec la page", async () => {
  const styles = await readText("app/storefront-cms-v2.css");
  assert.match(styles, /storefront-cms-v2 \.storefront-cms-tabs[\s\S]*position:\s*static\s*!important/);
  assert.match(styles, /storefront-cms-v2 \.storefront-cms-tabs[\s\S]*top:\s*auto\s*!important/);
});


test("les onglets boutique ne peuvent plus redevenir sticky", async () => {
  const baseStyles = await readText("app/storefront-cms.css");
  const v2Styles = await readText("app/storefront-cms-v2.css");
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");

  const baseBlock = baseStyles.match(/\.storefront-cms-tabs\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.doesNotMatch(baseBlock, /position:\s*sticky/);
  assert.match(baseBlock, /position:\s*static/);
  assert.match(baseBlock, /top:\s*auto/);

  const v2Block = v2Styles.match(/\.storefront-cms-v2 \.storefront-cms-tabs\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.doesNotMatch(v2Block, /position:\s*sticky/);
  assert.match(v2Block, /position:\s*static/);
  assert.match(source, /style=\{\{ position: "static", top: "auto" \}\}/);
});
