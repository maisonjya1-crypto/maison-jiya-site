import { getRawDb } from "../../../../db";
import { getPublicDb } from "../../../../db/public-db";
import { ensureStorefrontCms } from "../../../../db/storefront-cms";
import { loadStorefrontCatalogFast } from "../../../../db/storefront-public-fast";

const freshHeaders = {
  "cache-control": "no-store, no-cache, must-revalidate",
  "content-type": "application/json; charset=utf-8",
  "pragma": "no-cache",
  "expires": "0",
  "x-content-type-options": "nosniff",
};

function looksLikeMissingSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /no such table|no such column/i.test(message);
}

async function ensureManualCatalogReady() {
  const database = await getRawDb();
  const ready = await database.prepare("SELECT value FROM settings WHERE key = 'storefront_manual_catalog_initialized_v1' LIMIT 1").first<{ value: string }>();
  if (!ready?.value) await ensureStorefrontCms(database);
}

export async function GET() {
  try {
    await ensureManualCatalogReady();
    const database = await getPublicDb();
    const catalog = await loadStorefrontCatalogFast(database);
    return Response.json(catalog, { headers: freshHeaders });
  } catch (error) {
    if (looksLikeMissingSchema(error)) {
      try {
        const database = await getRawDb();
        await ensureStorefrontCms(database);
        const catalog = await loadStorefrontCatalogFast(database);
        return Response.json(catalog, { headers: freshHeaders });
      } catch (fallbackError) {
        console.error("Maison Jiya storefront catalog fallback failed", fallbackError);
      }
    }
    console.error("Maison Jiya storefront catalog failed", error);
    return Response.json({ error: "Le catalogue est momentanément indisponible." }, {
      status: 503,
      headers: freshHeaders,
    });
  }
}
