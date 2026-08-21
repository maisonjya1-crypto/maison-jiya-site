import { getRawDb } from "../../../../../db";
import { ensureStorefrontCms } from "../../../../../db/storefront-cms";

function fromBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
    const database = await getRawDb();
    await ensureStorefrontCms(database);
    const media = await database.prepare(`
      SELECT mime_type AS mimeType, data_base64 AS dataBase64
      FROM storefront_media WHERE id = ? LIMIT 1
    `).bind(id).first<{ mimeType: string; dataBase64: string }>();
    if (!media?.dataBase64) return new Response("Not found", { status: 404 });
    return new Response(fromBase64(media.dataBase64), {
      headers: {
        "content-type": media.mimeType || "image/webp",
        "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Maison Jiya storefront media failed", error);
    return new Response("Not found", { status: 404 });
  }
}
