import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readText = async (path) => readFile(new URL(path, root), "utf8");
const readBytes = async (path) => readFile(new URL(path, root));

function pngDimensions(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(buffer.subarray(0, 8).compare(signature), 0, "Le fichier doit être un PNG valide.");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

const manifest = JSON.parse(await readText("public/maison-jiya-gestion.webmanifest"));
assert.equal(manifest.name, "Maison Jiya Gestion");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.scope, "/");
assert.ok(String(manifest.start_url).startsWith("/"));

const icons = new Map(manifest.icons.map((icon) => [icon.src, icon]));
for (const [src, size, purpose] of [
  ["/jiya-gestion-192.png", 192, "any"],
  ["/jiya-gestion-512.png", 512, "any"],
  ["/jiya-gestion-512-maskable.png", 512, "maskable"],
]) {
  const icon = icons.get(src);
  assert.ok(icon, `Icône manquante dans le manifeste : ${src}`);
  assert.equal(icon.type, "image/png");
  assert.ok(String(icon.purpose).includes(purpose));
  const bytes = await readBytes(`public${src}`);
  const dimensions = pngDimensions(bytes);
  assert.deepEqual(dimensions, { width: size, height: size }, `Dimensions incorrectes pour ${src}`);
}

const privatePage = await readText("app/page.tsx");
assert.match(privatePage, /manifest:\s*["']\/maison-jiya-gestion\.webmanifest\?v=2["']/);
assert.match(privatePage, /PrivatePwa/);

const boutiqueLayout = await readText("app/boutique/layout.tsx");
assert.doesNotMatch(boutiqueLayout, /maison-jiya-gestion\.webmanifest/);

const worker = await readText("public/private-sw.js");
assert.match(worker, /addEventListener\(["']push["']/);
assert.match(worker, /addEventListener\(["']fetch["']/);
assert.doesNotMatch(worker, /caches\.open|cache\.put|caches\.match/);

console.log("Private Android PWA validation: OK");
