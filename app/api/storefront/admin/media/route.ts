import { getAuthenticatedUser } from "../../../../auth";
import { getRawDb } from "../../../../../db";
import { ensureStorefrontCms } from "../../../../../db/storefront-cms";

const GALLERY_LIMIT = 6;

function integer(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(typeof value === "string" ? value : "");
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const user = await getAuthenticatedUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (!["admin", "editor"].includes(user.role)) return Response.json({ error: "Votre compte est en lecture seule." }, { status: 403 });

  try {
    const form = await request.formData();
    const ownerType = String(form.get("ownerType") || "");
    const ownerId = integer(form.get("ownerId"));
    const kind = String(form.get("kind") || "gallery");
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choisissez une image.");
    if (!["product", "offer", "brand", "marketing", "promotion"].includes(ownerType)) throw new Error("Destination d’image invalide.");
    if (!["gallery", "logo", "hero"].includes(kind)) throw new Error("Type d’image invalide.");
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) throw new Error("Utilisez une image JPG, PNG ou WebP.");
    if (file.size <= 0 || file.size > 1_250_000) throw new Error("L’image doit faire moins de 1,25 Mo après compression.");

    const database = await getRawDb();
    await ensureStorefrontCms(database);

    if (ownerType === "product") {
      const product = await database.prepare("SELECT id FROM products WHERE id = ? LIMIT 1").bind(ownerId).first<{ id: number }>();
      if (!product) throw new Error("Produit introuvable.");
    } else if (ownerType === "offer") {
      const offer = await database.prepare("SELECT id FROM storefront_offers WHERE id = ? LIMIT 1").bind(ownerId).first<{ id: number }>();
      if (!offer) throw new Error("Pack introuvable.");
    } else if (ownerType === "marketing") {
      const section = await database.prepare("SELECT id FROM storefront_marketing_sections WHERE id = ? LIMIT 1").bind(ownerId).first<{ id: number }>();
      if (!section) throw new Error("Bloc marketing introuvable.");
    } else if (ownerType === "promotion") {
      const promotion = await database.prepare("SELECT id FROM storefront_promotions WHERE id = ? LIMIT 1").bind(ownerId).first<{ id: number }>();
      if (!promotion) throw new Error("Promotion introuvable.");
    }

    if (ownerType === "brand" && !["logo", "hero"].includes(kind)) throw new Error("Type d’image de marque invalide.");
    if (ownerType !== "brand" && kind !== "gallery") throw new Error("Utilisez la galerie pour les produits, packs, promotions et blocs marketing.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = toBase64(bytes);

    // Idempotence mobile : si le téléphone coupe la réponse après l'écriture,
    // un nouvel essai avec la même image ne crée pas de doublon.
    const existing = await database.prepare(`
      SELECT id, owner_type AS ownerType, owner_id AS ownerId, kind,
             mime_type AS mimeType, sort_order AS sortOrder, created_at AS createdAt
      FROM storefront_media
      WHERE owner_type = ? AND owner_id = ? AND kind = ? AND data_base64 = ?
      ORDER BY id DESC
      LIMIT 1
    `).bind(ownerType, ownerId, kind, base64).first<{
      id: number;
      ownerType: string;
      ownerId: number;
      kind: string;
      mimeType: string;
      sortOrder: number;
      createdAt: string;
    }>();

    if (existing) {
      const syncState = await database.prepare("SELECT current_version AS version FROM google_sheets_sync_state WHERE id = 1")
        .first<{ version: number }>();
      return Response.json({ ok: true, media: existing, liveVersion: Number(syncState?.version || 0), duplicate: true }, { headers: { "cache-control": "no-store" } });
    }

    const count = await database.prepare("SELECT COUNT(*) AS count FROM storefront_media WHERE owner_type = ? AND owner_id = ? AND kind = ?")
      .bind(ownerType, ownerId, kind).first<{ count: number }>();
    const limit = ownerType === "brand" || ownerType === "marketing" || ownerType === "promotion" ? 1 : GALLERY_LIMIT;
    if (Number(count?.count || 0) >= limit) {
      if (ownerType === "brand" || ownerType === "marketing" || ownerType === "promotion") {
        await database.prepare("DELETE FROM storefront_media WHERE owner_type = ? AND owner_id = ? AND kind = ?").bind(ownerType, ownerId, kind).run();
      } else {
        throw new Error(`Maximum ${GALLERY_LIMIT} photos par produit ou pack.`);
      }
    }

    const order = await database.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM storefront_media WHERE owner_type = ? AND owner_id = ? AND kind = ?")
      .bind(ownerType, ownerId, kind).first<{ nextOrder: number }>();
    const sortOrder = Number(order?.nextOrder || 0);
    await database.prepare(`
      INSERT INTO storefront_media (owner_type, owner_id, kind, mime_type, data_base64, byte_size, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(ownerType, ownerId, kind, file.type, base64, bytes.length, sortOrder).run();

    const media = await database.prepare(`
      SELECT id, owner_type AS ownerType, owner_id AS ownerId, kind,
             mime_type AS mimeType, sort_order AS sortOrder, created_at AS createdAt
      FROM storefront_media
      WHERE owner_type = ? AND owner_id = ? AND kind = ? AND sort_order = ?
      ORDER BY id DESC
      LIMIT 1
    `).bind(ownerType, ownerId, kind, sortOrder).first<{
      id: number;
      ownerType: string;
      ownerId: number;
      kind: string;
      mimeType: string;
      sortOrder: number;
      createdAt: string;
    }>();

    const syncState = await database.prepare("SELECT current_version AS version FROM google_sheets_sync_state WHERE id = 1")
      .first<{ version: number }>();

    return Response.json({ ok: true, media, liveVersion: Number(syncState?.version || 0) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Maison Jiya storefront media upload failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Upload impossible." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const user = await getAuthenticatedUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (!["admin", "editor"].includes(user.role)) return Response.json({ error: "Votre compte est en lecture seule." }, { status: 403 });

  try {
    const body = await request.json() as {
      ownerType?: string;
      ownerId?: number;
      kind?: string;
      orderedIds?: number[];
    };
    const ownerType = String(body.ownerType || "");
    const ownerId = Math.round(Number(body.ownerId || 0));
    const kind = String(body.kind || "gallery");
    const orderedIds = Array.isArray(body.orderedIds)
      ? body.orderedIds.map((value) => Math.round(Number(value))).filter((value) => Number.isInteger(value) && value > 0)
      : [];

    if (!["product", "offer"].includes(ownerType)) throw new Error("Réorganisation non autorisée pour ce type d’image.");
    if (!Number.isInteger(ownerId) || ownerId <= 0) throw new Error("Destination invalide.");
    if (kind !== "gallery") throw new Error("Seules les galeries produit et pack peuvent être réorganisées.");
    if (!orderedIds.length || orderedIds.length > GALLERY_LIMIT) throw new Error("Ordre des photos invalide.");
    if (new Set(orderedIds).size !== orderedIds.length) throw new Error("Une photo est présente plusieurs fois dans l’ordre demandé.");

    const database = await getRawDb();
    await ensureStorefrontCms(database);

    const placeholders = orderedIds.map(() => "?").join(",");
    const rows = (await database.prepare(`
      SELECT id
      FROM storefront_media
      WHERE owner_type = ? AND owner_id = ? AND kind = ?
        AND id IN (${placeholders})
      ORDER BY id
    `).bind(ownerType, ownerId, kind, ...orderedIds).all<{ id: number }>()).results;

    if (rows.length !== orderedIds.length) throw new Error("Une photo ne correspond plus à cette galerie.");

    const total = await database.prepare(
      "SELECT COUNT(*) AS count FROM storefront_media WHERE owner_type = ? AND owner_id = ? AND kind = ?"
    ).bind(ownerType, ownerId, kind).first<{ count: number }>();
    if (Number(total?.count || 0) !== orderedIds.length) throw new Error("La galerie a changé. Recharge puis réessaie.");

    await database.batch(orderedIds.map((id, index) =>
      database.prepare("UPDATE storefront_media SET sort_order = ? WHERE id = ? AND owner_type = ? AND owner_id = ? AND kind = ?")
        .bind(index, id, ownerType, ownerId, kind)
    ));

    const syncState = await database.prepare("SELECT current_version AS version FROM google_sheets_sync_state WHERE id = 1")
      .first<{ version: number }>();
    return Response.json({ ok: true, orderedIds, liveVersion: Number(syncState?.version || 0) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Maison Jiya storefront media reorder failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Réorganisation impossible." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const user = await getAuthenticatedUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (!["admin", "editor"].includes(user.role)) return Response.json({ error: "Votre compte est en lecture seule." }, { status: 403 });

  const id = Number(new URL(request.url).searchParams.get("id") || 0);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Image invalide." }, { status: 400 });
  const database = await getRawDb();
  await ensureStorefrontCms(database);
  await database.prepare("DELETE FROM storefront_media WHERE id = ?").bind(id).run();
  const syncState = await database.prepare("SELECT current_version AS version FROM google_sheets_sync_state WHERE id = 1")
    .first<{ version: number }>();
  return Response.json({ ok: true, liveVersion: Number(syncState?.version || 0) }, { headers: { "cache-control": "no-store" } });
}
