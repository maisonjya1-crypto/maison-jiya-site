// maisonjiya.pages.dev → boutique publique Maison Jiya.
// Seules les pages publiques passent : le logiciel de gestion et son API restent
// uniquement sur l'adresse privée workers.dev.
const PUBLIC_PATHS = [
  /^\/boutique(?:\/|\.|\?|$)/,
  /^\/api\/storefront\/(?:catalog|media|orders)(?:\/|\?|$)/,
  /^\/(?:assets|brand|_vinext|_next)\//,
  /^\/(?:robots\.txt|sitemap\.xml|favicon\.ico|manifest\.webmanifest)$/,
];

export function isPublicPath(pathname) {
  if (pathname.startsWith("/api/storefront/admin")) return false;
  if (PUBLIC_PATHS.some((pattern) => pattern.test(pathname))) return true;
  // Fichiers statiques à la racine (images, polices, scripts) mais jamais l'API.
  return !pathname.startsWith("/api/") && /\/[^/]+\.(?:js|css|png|jpe?g|webp|avif|svg|ico|woff2?|txt|json)$/i.test(pathname);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (url.pathname === "/" || url.pathname === "") return Response.redirect(`${url.origin}/boutique${url.search}`, 301);
  if (!isPublicPath(url.pathname)) return Response.redirect(`${url.origin}/boutique`, 302);
  // La liaison de service garde l'adresse IP réelle du client (limites anti-abus des commandes)
  // et l'origine maisonjiya.pages.dev (contrôle d'origine des commandes).
  return env.SHOP.fetch(request);
}
