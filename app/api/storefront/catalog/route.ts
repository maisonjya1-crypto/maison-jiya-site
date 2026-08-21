import { getRawDb } from "../../../../db";
import { getPublicDb } from "../../../../db/public-db";
import { ensureStorefrontCms } from "../../../../db/storefront-cms";
import { loadStorefrontCatalog } from "../../../../db/storefront-public";

function cacheHeaders() {
  return {
    "cache-control": "public, max-age=30, s-maxage=120, stale-while-revalidate=600",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  };
}

function looksLikeMissingSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /no such table|no such column/i.test(message);
}

export async function GET() {
  try {
    const database = await getPublicDb();
    const catalog = await loadStorefrontCatalog(database);
    return Response.json(catalog, { headers: cacheHeaders() });
  } catch (error) {
    if (looksLikeMissingSchema(error)) {
      try {
        const database = await getRawDb();
        await ensureStorefrontCms(database);
        const catalog = await loadStorefrontCatalog(database);
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
