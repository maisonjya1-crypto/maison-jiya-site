import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
assert.match(privatePage, /manifest:\s*["']\/maison-jiya-gestion\.webmanifest\?v=3["']/);
assert.match(privatePage, /PrivatePwa/);
assert.match(privatePage, /appleWebApp/);
assert.match(privatePage, /statusBarStyle:\s*["']black-translucent["']/);
assert.match(privatePage, /viewportFit:\s*["']cover["']/);
assert.match(privatePage, /private-ios\.css/);
assert.match(privatePage, /mobile-native\.css/);

const rootLayout = await readText("app/layout.tsx");
assert.doesNotMatch(rootLayout, /mobile-native\.css|private-ios\.css/);

const boutiqueLayout = await readText("app/boutique/layout.tsx");
assert.doesNotMatch(boutiqueLayout, /maison-jiya-gestion\.webmanifest/);

const worker = await readText("public/private-sw.js");
assert.match(worker, /addEventListener\(["']push["']/);
assert.match(worker, /addEventListener\(["']fetch["']/);
assert.doesNotMatch(worker, /caches\.open|cache\.put|caches\.match/);

const pwaClient = await readText("app/private-pwa.tsx");
assert.match(pwaClient, /navigator\.standalone|standalone/);
assert.match(pwaClient, /MacIntel/);
assert.match(pwaClient, /Installer sur iPhone/);
assert.match(pwaClient, /private-sw\.js\?v=3/);

const fluidCss = await readText("app/mobile-native.css");
assert.match(fluidCss, /pointer:\s*coarse/);
assert.match(fluidCss, /hover:\s*none/);
assert.match(fluidCss, /repeat\(auto-fit/);
assert.match(fluidCss, /clamp\(190px,\s*18vw,\s*248px\)/);

const androidActivity = await readText("android/app/src/main/java/maison/jiya/gestion/MainActivity.java");
assert.match(androidActivity, /setUseWideViewPort\(false\)/);
assert.match(androidActivity, /TEXT_AUTOSIZING/);
assert.match(androidActivity, /MaisonJiyaAndroid\/2\.3/);
assert.match(androidActivity, /orientationchange/);

const gradle = await readText("android/app/build.gradle");
assert.match(gradle, /versionCode\s+5/);
assert.match(gradle, /versionName\s+'2\.3\.0'/);

const chunkTexts = await Promise.all([1, 2, 3, 4].map((number) => readText(`app/api/download/android/apk-chunk-${number}.ts`)));
const apkBase64 = chunkTexts.map((source, index) => {
  const match = source.match(/const chunk = "([A-Za-z0-9+/=]+)";/);
  assert.ok(match, `Partie APK ${index + 1} illisible.`);
  return match[1];
}).join("");
const apkBytes = Buffer.from(apkBase64, "base64");
assert.equal(apkBytes.length, 17087, "Taille APK 2.3 incorrecte.");
assert.equal(apkBytes[0], 0x50);
assert.equal(apkBytes[1], 0x4b);
assert.equal(
  createHash("sha256").update(apkBytes).digest("hex"),
  "077d1a696da9124e7ef3982ca3502f3f6982d8da716307d2dd63cb6ee925374c",
  "Empreinte APK 2.3 incorrecte.",
);

const downloadRoute = await readText("app/api/download/android/route.ts");
assert.match(downloadRoute, /application\/vnd\.android\.package-archive/);
assert.match(downloadRoute, /Maison-Jiya-Gestion-Android-2\.3\.apk/);
const downloadPage = await readText("app/telecharger-app/page.tsx");
assert.match(downloadPage, /\/api\/download\/android/);

console.log("Private mobile app validation (Android 2.3 fluid + iPhone + APK download): OK");
