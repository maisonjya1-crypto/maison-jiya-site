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
assert.match(boutiqueLayout, /storefront-responsive\.css/);

const worker = await readText("public/private-sw.js");
assert.match(worker, /addEventListener\(["']push["']/);
assert.match(worker, /addEventListener\(["']fetch["']/);
assert.doesNotMatch(worker, /caches\.open|cache\.put|caches\.match/);

const pwaClient = await readText("app/private-pwa.tsx");
assert.match(pwaClient, /navigator\.standalone|standalone/);
assert.match(pwaClient, /MacIntel/);
assert.match(pwaClient, /Installer sur iPhone/);
assert.match(pwaClient, /private-sw\.js\?v=3/);
assert.match(pwaClient, /MaisonJiyaAndroid\\\//);
assert.match(pwaClient, /MaisonJiyaNative/);
assert.match(pwaClient, /requestNotificationPermission/);
assert.match(pwaClient, /openNotificationSettings/);
assert.match(pwaClient, /notifyNewOrder/);
assert.match(pwaClient, /Mise à jour Android 2\.5 requise/);
assert.match(pwaClient, /Activer les notifications/);
assert.match(pwaClient, /PANEL_VISIBLE_MS\s*=\s*30_000/);
assert.match(pwaClient, /APP_REFRESH_MS\s*=\s*1_000/);
assert.match(pwaClient, /setInterval\([^]*APP_REFRESH_MS/);
assert.match(pwaClient, /window\.location\.reload\(\)/);
assert.match(pwaClient, /data-mj-app-settings-host|mjAppSettingsHost/);
assert.match(pwaClient, /Application & notifications/);
assert.match(pwaClient, /Ouvrir le panneau/);
assert.match(pwaClient, /Télécharger Android/);
assert.match(pwaClient, /syncExistingSubscription/);
assert.match(pwaClient, /Panneau maintenu ouvert/);

const pwaCss = await readText("app/private-pwa.css");
assert.match(pwaCss, /private-pwa-temporary\s*\{/);
assert.match(pwaCss, /position:\s*fixed/);
assert.match(pwaCss, /app-notification-settings/);
assert.match(pwaCss, /private-pwa-pill\s*\{\s*display:\s*none/i);

const fluidCss = await readText("app/mobile-native.css");
assert.match(fluidCss, /pointer:\s*coarse/);
assert.match(fluidCss, /hover:\s*none/);
assert.match(fluidCss, /repeat\(auto-fit/);
assert.match(fluidCss, /clamp\(190px,\s*18vw,\s*248px\)/);
assert.match(fluidCss, /z-index:\s*4000\s*!important/);
assert.match(fluidCss, /100dvh/);
assert.match(fluidCss, /safe-area-inset-bottom/);
assert.match(fluidCss, /-webkit-overflow-scrolling:\s*touch/);
assert.match(fluidCss, /modal-actions[\s\S]*flex-wrap:\s*wrap/);

const storefrontResponsive = await readText("app/boutique/storefront-responsive.css");
assert.match(storefrontResponsive, /100dvh/);
assert.match(storefrontResponsive, /safe-area-inset-bottom/);
assert.match(storefrontResponsive, /pointer:\s*coarse/);
assert.match(storefrontResponsive, /font-size:\s*16px\s*!important/);
assert.match(storefrontResponsive, /storefront-product-grid[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
assert.match(storefrontResponsive, /max-width:\s*380px/);
assert.match(storefrontResponsive, /storefront-overlay[\s\S]*touch-action:\s*pan-y/);

const androidActivity = await readText("android/app/src/main/java/maison/jiya/gestion/MainActivity.java");
assert.match(androidActivity, /setUseWideViewPort\(false\)/);
assert.match(androidActivity, /TEXT_AUTOSIZING/);
assert.match(androidActivity, /MaisonJiyaAndroid\/2\.5/);
assert.match(androidActivity, /addJavascriptInterface\(new NativeBridge\(\),\s*["']MaisonJiyaNative["']\)/);
assert.match(androidActivity, /@JavascriptInterface[\s\S]*requestNotificationPermission/);
assert.match(androidActivity, /@JavascriptInterface[\s\S]*notifyNewOrder/);
assert.match(androidActivity, /NotificationChannel/);
assert.match(androidActivity, /POST_NOTIFICATIONS/);
assert.match(androidActivity, /ACTION_APP_NOTIFICATION_SETTINGS/);
assert.match(androidActivity, /orientationchange/);
assert.match(androidActivity, /Connexion momentanément indisponible/);
assert.match(androidActivity, /scheduleRetry\(\)/);
assert.match(androidActivity, /onPageCommitVisible/);
assert.match(androidActivity, /ACCESS_NETWORK_STATE|isNetworkConnected/);
assert.match(androidActivity, /registerNetworkCallback/);
assert.match(androidActivity, /NET_CAPABILITY_VALIDATED/);
assert.match(androidActivity, /hasCommittedPage/);
assert.doesNotMatch(androidActivity, /retryAttempts\s*>=\s*5/);

const androidManifest = await readText("android/app/src/main/AndroidManifest.xml");
assert.match(androidManifest, /ACCESS_NETWORK_STATE/);
assert.match(androidManifest, /POST_NOTIFICATIONS/);

const gradle = await readText("android/app/build.gradle");
assert.match(gradle, /versionCode\s+7/);
assert.match(gradle, /versionName\s+'2\.5\.0'/);

// Le téléchargement public reste sur le dernier APK signé 2.3 jusqu'à publication d'un nouveau paquet signé et vérifié.
const chunkTexts = await Promise.all([1, 2, 3, 4].map((number) => readText(`app/api/download/android/apk-chunk-${number}.ts`)));
const chunkValues = chunkTexts.map((source, index) => {
  const pieces = [...source.matchAll(/"([A-Za-z0-9+/=]{100,})"/g)].map((match) => match[1]);
  assert.ok(pieces.length > 0, `Partie APK ${index + 1} illisible.`);
  return pieces.join("");
});
chunkValues[3] = chunkValues[3].replace("HdlckIA", `HdlckIA${"A".repeat(24)}`);
const apkBase64 = chunkValues.join("");
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
const downloadPage = await readText("app/telecharger-app/page.tsx");
assert.match(downloadPage, /\/api\/download\/android/);

console.log("Responsive validation (private iPhone/Android/tablet + public storefront + Android 2.5): OK");
