const base = (process.env.MAISON_JIYA_PRODUCTION_URL || "https://maison-jiya-site.maisonjya1.workers.dev").replace(/\/$/, "");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const boutiqueResponse = await fetchWithRetry("/boutique");
const boutiqueHtml = await boutiqueResponse.text();
if (boutiqueHtml.length < 500) throw new Error("La page boutique est anormalement vide.");
if (!/Maison Jiya|storefront-shell|Boutique/i.test(boutiqueHtml)) throw new Error("La page boutique ne contient pas le contenu attendu.");

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

console.log(`Smoke production OK · ${catalog.products.length} produit(s) · ${catalog.offers.length} offre(s) · média ${imagePath ? "OK" : "non requis"}`);
