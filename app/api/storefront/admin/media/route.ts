import { getAuthenticatedUser } from "../../../../auth";
import { getRawDb } from "../../../../../db";
import { ensureStorefrontCms } from "../../../../../db/storefront-cms";

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
    if (!["product", "offer", "brand"].includes(ownerType)) throw new Error("Destination d’image invalide.");
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
    }

    if (ownerType === "brand" && !["logo", "hero"].includes(kind)) throw new Error("Type d’image de marque invalide.");
    if (ownerType !== "brand" && kind !== "gallery") throw new Error("Utilisez la galerie pour les produits et packs.");

    const count = await database.prepare("SELECT COUNT(*) AS count FROM storefront_media WHERE owner_type = ? AND owner_id = ? AND kind = ?")
      .bind(ownerType, ownerId, kind).first<{ count: number }>();
    const limit = ownerType === "brand" ? 1 : 6;
    if (Number(count?.count || 0) >= limit) {
      if (ownerType === "brand") {
        await database.prepare("DELETE FROM storefront_media WHERE owner_type = ? AND owner_id = ? AND kind = ?").bind(ownerType, ownerId, kind).run();
      } else {
        throw new Error("Maximum 6 photos par produit ou pack.");
      }
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = toBase64(bytes);
    const order = await database.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM storefront_media WHERE owner_type = ? AND owner_id = ? AND kind = ?")
      .bind(ownerType, ownerId, kind).first<{ nextOrder: number }>();
    await database.prepare(`
      INSERT INTO storefront_media (owner_type, owner_id, kind, mime_type, data_base64, byte_size, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(ownerType, ownerId, kind, file.type, base64, bytes.length, Number(order?.nextOrder || 0)).run();

    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Maison Jiya storefront media upload failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Upload impossible." }, { status: 400 });
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
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
