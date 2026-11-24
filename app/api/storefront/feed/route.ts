import { getPublicDb } from "../../../../db/public-db";
import { loadStorefrontCatalogFast } from "../../../../db/storefront-public-fast";
import { metaCatalogCsv } from "../../../../lib/meta-catalog-feed";

export const dynamic = "force-dynamic";

// Adresse à donner à Meta Commerce Manager : https://maisonjiya.pages.dev/api/storefront/feed
export async function GET() {
  try {
    const catalog = await loadStorefrontCatalogFast(await getPublicDb());
    return new Response(metaCatalogCsv(catalog), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "inline; filename=\"maison-jiya-catalogue.csv\"",
        "cache-control": "public, max-age=900",
      },
    });
  } catch (error) {
    console.error("Maison Jiya catalog feed failed", error);
    return new Response("Flux momentanément indisponible.", { status: 503 });
  }
}
