// Adresse publique de la boutique. Le jour où un nom de domaine est acheté
// (ex. maisonjiya.com), il suffit de changer cette valeur : balises Google,
// plan du site, partage Facebook/WhatsApp et données produits suivent.
export const PUBLIC_SITE_URL = "https://maisonjiya.pages.dev";
export const STOREFRONT_PATH = "/boutique";
export const STOREFRONT_URL = `${PUBLIC_SITE_URL}${STOREFRONT_PATH}`;
export const BRAND_NAMES = ["Maison Jiya", "Maison JIYA", "MaisonJiya", "Jiya"] as const;
export const LEGAL_PATHS = ["/boutique/mentions-legales", "/boutique/conditions-vente", "/boutique/livraison-retours", "/boutique/confidentialite"] as const;

export function absoluteUrl(path: string) {
  if (!path || path.startsWith("data:")) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${PUBLIC_SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

// Code de vérification Google Search Console (balise HTML « google-site-verification »).
// Laisser vide tant que le site n'est pas ajouté dans Search Console.
export const GOOGLE_SITE_VERIFICATION = "";
