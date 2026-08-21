import { getRawDb } from "../../../../db";
import { getPublicDb } from "../../../../db/public-db";
import { ensureStorefrontCms } from "../../../../db/storefront-cms";
import { loadStorefrontCatalogFast } from "../../../../db/storefront-public-fast";

function cacheHeaders() {
  return {
    "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  };
}

function looksLikeMissingSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /no such table|no such column/i.test(message);
}

async function buildCatalogResponse() {
  try {
    const database = await getPublicDb();
    const catalog = await loadStorefrontCatalogFast(database);
    return Response.json(catalog, { headers: cacheHeaders() });
  } catch (error) {
    if (looksLikeMissingSchema(error)) {
      try {
        const database = await getRawDb();
        await ensureStorefrontCms(database);
        const catalog = await loadStorefrontCatalogFast(database);
        return Response.json(catalog, { headers: cacheHeaders() });
      } catch (fallbackError) {
        console.error("Maison Jiya storefront catalog fallback failed", fallbackError);
      }
    }
    console.error("Maison Jiya storefront catalog failed", error);
    return Response.json({ error: "Le catalogue est momentanément indisponible." }, {
      status: 503,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
}

export async function GET(request: Request) {
  const cache = (caches as CacheStorage & { default: Cache }).default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await buildCatalogResponse();
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
