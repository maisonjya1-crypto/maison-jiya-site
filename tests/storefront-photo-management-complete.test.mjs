import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("le CMS permet de choisir explicitement la photo principale", async () => {
  const source = await read("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /function makePrincipal\(itemId: number\)/);
  assert.match(source, /☆ Principale/);
  assert.match(source, /const next = \[itemId, \.\.\.persisted/);
  assert.match(source, /void reorderMedia\(ownerType, ownerId, next\)/);
});

test("les photos peuvent être réorganisées par glisser-déposer avec boutons tactiles de secours", async () => {
  const source = await read("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /draggable=\{canReorder && item\.id > 0\}/);
  assert.match(source, /onDragStart/);
  assert.match(source, /onDrop/);
  assert.match(source, /dropOn\(item\.id\)/);
  assert.match(source, /Déplacer cette photo vers la gauche/);
  assert.match(source, /Déplacer cette photo vers la droite/);
});

test("l'ordre photo est persisté côté serveur et pas seulement visuellement", async () => {
  const route = await read("app/api/storefront/admin/media/route.ts");
  const client = await read("app/storefront-cms-v2-enhancement.tsx");
  assert.match(route, /export async function PUT\(request: Request\)/);
  assert.match(route, /orderedIds/);
  assert.match(route, /UPDATE storefront_media SET sort_order = \?/);
  assert.match(route, /Une photo ne correspond plus à cette galerie/);
  assert.match(client, /method: "PUT"/);
  assert.match(client, /body: JSON\.stringify\(\{ ownerType, ownerId, kind: "gallery", orderedIds \}\)/);
});

test("un upload affiche 35 %, 70 %, puis Terminé", async () => {
  const source = await read("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /progress: 35/);
  assert.match(source, /statusLabel: "35 % · prête"/);
  assert.match(source, /progress: 70/);
  assert.match(source, /statusLabel: "70 % · envoi"/);
  assert.match(source, /progress: 100/);
  assert.match(source, /statusLabel: "Terminé"/);
  assert.match(source, /storefront-cms-photo-progress/);
});

test("un upload produit ou pack en échec reste réessayable sans créer un doublon", async () => {
  const source = await read("app/storefront-cms-v2-enhancement.tsx");
  const route = await read("app/api/storefront/admin/media/route.ts");
  assert.match(source, /retryUploadsRef/);
  assert.match(source, /async function retryMedia\(id: number\)/);
  assert.match(source, />Réessayer<\/button>/);
  assert.match(source, /discardFailedMedia/);
  assert.match(route, /data_base64 = \?/);
  assert.match(route, /duplicate: true/);
});

test("les contrôles de réorganisation restent utilisables sur mobile", async () => {
  const css = await read("app/storefront-cms-v2.css");
  assert.match(css, /storefront-cms-photo-actions/);
  assert.match(css, /touch-action:manipulation/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*storefront-cms-photo-actions/);
  assert.match(css, /storefront-cms-photo-failure/);
});
