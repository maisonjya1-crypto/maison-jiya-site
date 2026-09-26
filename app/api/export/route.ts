import { getRawDb } from "../../../db";
import { buildCsvZip, buildPortableDataExport } from "../../../db/data-export";
import { ensureStorefrontCms } from "../../../db/storefront-cms";
import { getAuthenticatedUser } from "../../auth";

function filenameDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
    if (!user.isOwner) return Response.json({ error: "Seul le propriétaire principal peut exporter toutes les données." }, { status: 403 });

    const database = await getRawDb();
    await ensureStorefrontCms(database);
    const data = await buildPortableDataExport(database);
    const format = new URL(request.url).searchParams.get("format") || "json";
    const commonHeaders = {
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    };

    if (format === "json") {
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          ...commonHeaders,
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="maison-jiya-export-${filenameDate()}.json"`,
        },
      });
    }
    if (format === "csv") {
      return new Response(buildCsvZip(data), {
        headers: {
          ...commonHeaders,
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="maison-jiya-csv-${filenameDate()}.zip"`,
        },
      });
    }
    return Response.json({ error: "Format d’export inconnu." }, { status: 400, headers: commonHeaders });
  } catch (error) {
    console.error("Maison Jiya full export failed", error instanceof Error ? error.message : String(error));
    return Response.json({ error: "L’export complet est momentanément indisponible." }, { status: 500 });
  }
}
