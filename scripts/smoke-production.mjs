const base = (process.env.MAISON_JIYA_PRODUCTION_URL || "https://maison-jiya-site.maisonjya1.workers.dev").replace(/\/$/, "");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const requiredStorefrontMarker = "maison-jiya-public-reference-native-v4";

async function fetchWithRetry(path, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const separator = path.includes("?") ? "&" : "?";
      const url = `${base}${path}${separator}smoke=${Date.now()}`;
      const response = await fetch(url, {
        redirect: "follow",
        cache: "no-store",
        ...options,
        headers: { "cache-control": "no-cache", ...(options.headers || {}) },
      });
      if (!response.ok) throw new Error(`${path} répond ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 8) await delay(2000);
    }
  }
  throw lastError;
}

function pngDimensions(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) throw new Error("Icône Android invalide : ce n'est pas un PNG.");
  const view = new DataView(arrayBuffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const privateResponse = await fetchWithRetry("/");
const privateHtml = await privateResponse.text();
if (privateHtml.length < 500) throw new Error("Le site privé est anormalement vide.");
if (!privateHtml.includes("maison-jiya-gestion.webmanifest")) throw new Error("Le manifeste Android n'est pas déclaré dans le HTML privé.");

const manifestResponse = await fetchWithRetry("/maison-jiya-gestion.webmanifest");
const manifest = await manifestResponse.json();
if (manifest?.name !== "Maison Jiya Gestion" || manifest?.display !== "standalone") {
  throw new Error("Le manifeste Android n'est pas configuré en vraie application standalone.");
}

for (const [path, expectedSize] of [["/jiya-gestion-192.png", 192], ["/jiya-gestion-512.png", 512], ["/jiya-gestion-512-maskable.png", 512]]) {
  const iconResponse = await fetchWithRetry(path);
  if (!(iconResponse.headers.get("content-type") || "").startsWith("image/png")) throw new Error(`${path} n'est pas servi en PNG.`);
  const dimensions = pngDimensions(await iconResponse.arrayBuffer());
  if (dimensions.width !== expectedSize || dimensions.height !== expectedSize) {
    throw new Error(`${path} a des dimensions ${dimensions.width}x${dimensions.height} au lieu de ${expectedSize}x${expectedSize}.`);
  }
}

const downloadPageResponse = await fetchWithRetry("/telecharger-app");
const downloadPageHtml = await downloadPageResponse.text();
if (!downloadPageHtml.includes("Maison Jiya Gestion") || !downloadPageHtml.includes("/api/download/android")) {
  throw new Error("La page publique de téléchargement Android n'est pas prête.");
}

const apkResponse = await fetchWithRetry("/api/download/android");
const apkContentType = apkResponse.headers.get("content-type") || "";
const apkDisposition = apkResponse.headers.get("content-disposition") || "";
if (!apkContentType.includes("application/vnd.android.package-archive")) throw new Error(`Type APK inattendu : ${apkContentType}`);
if (!apkDisposition.includes("Maison-Jiya-Gestion-Android-2.3.apk")) throw new Error("Nom du fichier APK de téléchargement incorrect.");
const apkBytes = new Uint8Array(await apkResponse.arrayBuffer());
if (apkBytes.byteLength !== 17087) throw new Error(`L'APK public a une taille inattendue : ${apkBytes.byteLength}.`);
if (apkBytes[0] !== 0x50 || apkBytes[1] !== 0x4b) throw new Error("L'APK public n'est pas une archive Android valide.");

const boutiqueResponse = await fetchWithRetry("/boutique");
const boutiqueHtml = await boutiqueResponse.text();
if (boutiqueHtml.length < 500) throw new Error("La page boutique est anormalement vide.");
if (!/Maison Jiya|storefront-shell|Boutique/i.test(boutiqueHtml)) throw new Error("La page boutique ne contient pas le contenu attendu.");
if (boutiqueHtml.includes("maison-jiya-gestion.webmanifest")) throw new Error("Le manifeste de l'application privée ne doit pas être injecté dans la boutique publique.");
if (process.env.REQUIRE_REFERENCE_BLACK_DESIGN === "1" && !boutiqueHtml.includes(requiredStorefrontMarker)) {
  throw new Error(`La production sert encore une ancienne boutique : marqueur ${requiredStorefrontMarker} absent.`);
}
if (process.env.REQUIRE_REFERENCE_BLACK_DESIGN === "1" && !boutiqueHtml.includes("storefront-reference-clean")) {
  throw new Error("La couche publique propre n'est pas rendue côté serveur dans la production.");
}

const catalogResponse = await fetchWithRetry("/api/storefront/catalog");
const catalog = await catalogResponse.json();
if (!catalog || typeof catalog !== "object") throw new Error("Le catalogue public n'est pas un objet JSON valide.");
if (!Array.isArray(catalog.products) || !Array.isArray(catalog.offers) || !Array.isArray(catalog.categories)) {
  throw new Error("Le catalogue public ne contient pas les collections attendues.");
}

const rawCatalog = JSON.stringify(catalog);
for (const forbidden of ["purchasePrice", "purchase_price", "unitCost", "productCost", "password_hash", "password_salt"]) {
  if (rawCatalog.includes(forbidden)) throw new Error(`Donnée privée exposée dans le catalogue : ${forbidden}`);
}

const imagePath = catalog.logoUrl?.startsWith("/api/storefront/media/")
  ? catalog.logoUrl
  : [...catalog.offers, ...catalog.products].find((item) => Array.isArray(item.images) && item.images[0])?.images?.[0];

if (imagePath?.startsWith("/api/storefront/media/")) {
  const imageResponse = await fetchWithRetry(imagePath);
  const contentType = imageResponse.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) throw new Error(`Le média public renvoie ${contentType || "un type inconnu"}.`);
  const bytes = await imageResponse.arrayBuffer();
  if (bytes.byteLength < 100) throw new Error("Le média public est vide ou corrompu.");
}

console.log(`Smoke production OK · téléchargement Android 2.3 OK · ${catalog.products.length} produit(s) · ${catalog.offers.length} offre(s) · média ${imagePath ? "OK" : "non requis"}${process.env.REQUIRE_REFERENCE_BLACK_DESIGN === "1" ? " · référence native v4 confirmée" : ""}`);
