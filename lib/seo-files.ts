import { LEGAL_PATHS, PUBLIC_SITE_URL, STOREFRONT_PATH } from "./site";

/* robots.txt et sitemap.xml : servis directement par le Worker.
   - la boutique, ses pages légales et les photos produits sont ouvertes à Google ;
   - l'API et la page de téléchargement de l'application privée restent fermées ;
   - la page d'accueil « / » (logiciel de gestion) garde son en-tête noindex. */
export function robotsTxt() {
  return [
    "User-agent: *",
    "Allow: /",
    "Allow: /api/storefront/media/",
    "Disallow: /api/",
    "Disallow: /telecharger-app",
    "",
    `Sitemap: ${PUBLIC_SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");
}

export function sitemapXml(today = new Date()) {
  const lastmod = today.toISOString().slice(0, 10);
  const entries: { path: string; changefreq: string; priority: string }[] = [
    { path: STOREFRONT_PATH, changefreq: "daily", priority: "1.0" },
    ...LEGAL_PATHS.map((path) => ({ path, changefreq: "yearly", priority: "0.3" })),
  ];
  const urls = entries.map((entry) => `  <url><loc>${PUBLIC_SITE_URL}${entry.path}</loc><lastmod>${lastmod}</lastmod><changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function seoFileResponse(pathname: string): Response | null {
  if (pathname === "/robots.txt") {
    return new Response(robotsTxt(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
  }
  if (pathname === "/sitemap.xml") {
    return new Response(sitemapXml(), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
  }
  return null;
}
