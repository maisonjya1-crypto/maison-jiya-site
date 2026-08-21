import { getPublicDb } from "../../../../../db/public-db";

function fromBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });

    const database = await getPublicDb();
    const media = await database.prepare(`
      SELECT mime_type AS mimeType, data_base64 AS dataBase64
      FROM storefront_media WHERE id = ? LIMIT 1
    `).bind(id).first<{ mimeType: string; dataBase64: string }>();
    if (!media?.dataBase64) return new Response("Not found", { status: 404 });

    const response = new Response(fromBase64(media.dataBase64), {
      headers: {
        "content-type": media.mimeType || "image/webp",
        "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
        "etag": `\"mj-media-${id}\"`,
        "x-content-type-options": "nosniff",
      },
    });

    await cache.put(request, response.clone());
    return response;
  } catch (error) {
    console.error("Maison Jiya storefront media failed", error);
    return new Response("Not found", { status: 404 });
  }
}
