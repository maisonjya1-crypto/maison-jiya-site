import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");

test("la préparation photo mobile conserve les dimensions réellement décodées", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.doesNotMatch(source, /readEncodedImageDimensions/);
  assert.doesNotMatch(source, /resizeWidth:/);
  assert.match(source, /image\.naturalWidth/);
  assert.match(source, /image\.naturalHeight/);
  assert.match(source, /context\.drawImage\(image\.source, 0, 0, width, height\)/);
});

test("un upload ne peut plus rester bloqué indéfiniment en mode Envoi", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /async function fetchWithTimeout/);
  assert.match(source, /25_000/);
  assert.match(source, /L’envoi a pris trop de temps/);
  assert.match(source, /setUploadingLabel\(""/);
  assert.match(source, /pending: false/);
  assert.match(source, /void load\(true\)/);
});

test("la suppression photo répond au toucher et se resynchronise en cas d'échec", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.doesNotMatch(source, /window\.confirm\("Supprimer cette photo/);
  assert.match(source, /removeMediaLocally\(id\)/);
  assert.match(source, /15_000/);
  assert.match(source, /storefront-cms-photo-delete/);
  assert.match(source, /event\.stopPropagation\(\)/);
});

test("les contrôles photo iPhone restent cliquables et les aperçus gardent leur ratio", async () => {
  const v2 = await readText("app/storefront-cms-v2.css");
  const base = await readText("app/storefront-cms.css");
  assert.match(v2, /storefront-cms-upload input[\s\S]*pointer-events: auto !important/);
  assert.match(v2, /storefront-cms-photo-delete[\s\S]*touch-action:manipulation/);
  assert.match(v2, /storefront-cms-gallery-grid figure[\s\S]*aspect-ratio:auto!important/);
  assert.match(v2, /storefront-cms-gallery-grid figure > img[\s\S]*height:auto!important/);
  assert.match(base, /storefront-cms-gallery-grid img \{[^}]*height: auto/);
});

test("une relance du même upload ne crée pas un doublon côté serveur", async () => {
  const route = await readText("app/api/storefront/admin/media/route.ts");
  assert.match(route, /data_base64 = \?/);
  assert.match(route, /duplicate: true/);
  assert.ok(
    route.indexOf("data_base64 = ?") < route.indexOf("SELECT COUNT(*) AS count"),
    "La déduplication doit être vérifiée avant la limite de galerie."
  );
});
