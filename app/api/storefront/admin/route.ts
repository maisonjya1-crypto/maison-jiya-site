import { getAuthenticatedUser } from "../../../auth";
import { getRawDb } from "../../../../db";
import { normalizeMoroccanPhone } from "../../../../db/phone";
import { ensureStorefrontCms, getStorefrontMedia, type StorefrontOfferItemRow, type StorefrontOfferRow, type StorefrontProductSettingRow } from "../../../../db/storefront-cms";

type WhatsAppNumber = { label?: string; phone?: string; isDefault?: boolean };

const excludedPublicCategories = new Set(["Électronique", "Electronique", "Boîtes", "Boites"]);

function text(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function money(value: unknown, fallback = 0) {
  const parsed = typeof value === "string" ? Number(value.trim().replace(/\s/g, "").replace(",", ".")) : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : fallback;
}

function integer(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function boolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function defaultWhatsApp(raw: string | undefined) {
  try {
    const parsed = JSON.parse(raw || "[]") as WhatsAppNumber[];
    const preferred = parsed.find((item) => item?.isDefault && item?.phone) || parsed.find((item) => item?.phone);
    return typeof preferred?.phone === "string" ? (normalizeMoroccanPhone(preferred.phone) || "") : "";
  } catch {
    return "";
  }
}

async function requireUser(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return { error: Response.json({ error: "Connexion requise." }, { status: 401 }) } as const;
  return { user } as const;
}

async function snapshot(database: D1Database) {
  await ensureStorefrontCms(database);

  const settingsRows = (await database.prepare(`
    SELECT key, value FROM settings
    WHERE key IN (
      'storefront_brand_name', 'storefront_announcement', 'storefront_hero_title',
      'storefront_hero_text', 'storefront_shipping_note', 'storefront_meta_pixel_id',
      'storefront_contact_whatsapp', 'whatsapp_numbers'
    )
  `).all<{ key: string; value: string }>()).results;
  const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));
  const businessWhatsapp = defaultWhatsApp(settings.whatsapp_numbers);
  const configuredContact = normalizeMoroccanPhone(settings.storefront_contact_whatsapp || "") || "";

  const products = (await database.prepare(`
    SELECT
      p.id AS productId,
      p.product_code AS productCode,
      p.name AS internalName,
      p.category AS category,
      p.stock_quantity AS stockQuantity,
      p.sale_price AS internalPrice,
      COALESCE(NULLIF(s.public_name, ''), p.name) AS publicName,
      CASE WHEN s.public_price IS NULL OR s.public_price <= 0 THEN p.sale_price ELSE s.public_price END AS publicPrice,
      COALESCE(s.is_visible, 1) AS isVisible,
      COALESCE(s.availability_mode, 'auto') AS availabilityMode,
      COALESCE(s.badge, '') AS badge,
      COALESCE(s.is_best_seller, 0) AS isBestSeller,
      COALESCE(s.description, '') AS description,
      COALESCE(s.sort_order, 0) AS sortOrder
    FROM products p
    LEFT JOIN storefront_product_settings s ON s.product_id = p.id
    WHERE p.category NOT IN ('Électronique', 'Electronique', 'Boîtes', 'Boites')
    ORDER BY COALESCE(s.sort_order, 0), p.category COLLATE NOCASE, p.name COLLATE NOCASE
  `).all<StorefrontProductSettingRow>()).results;

  const offers = (await database.prepare(`
    SELECT id, name, description, price, compare_price AS comparePrice,
           badge, is_active AS isActive, sort_order AS sortOrder,
           created_at AS createdAt, updated_at AS updatedAt
    FROM storefront_offers
    ORDER BY sort_order, id DESC
  `).all<StorefrontOfferRow>()).results;

  const offerItems = (await database.prepare(`
    SELECT offer_id AS offerId, product_id AS productId, quantity
    FROM storefront_offer_items
    ORDER BY offer_id, product_id
  `).all<StorefrontOfferItemRow>()).results;

  const media = await getStorefrontMedia(database);
  const allowedProductIds = new Set(products.map((product) => product.productId));

  return {
    settings: {
      brandName: settings.storefront_brand_name || "Maison Jiya",
      announcement: settings.storefront_announcement || "Paiement à la livraison partout au Maroc",
      heroTitle: settings.storefront_hero_title || "Les pièces que vous aimez, simplement livrées chez vous.",
      heroText: settings.storefront_hero_text || "Choisissez vos articles, validez votre commande en ligne et payez à la livraison. Notre équipe vous contacte ensuite pour confirmer.",
      shippingNote: settings.storefront_shipping_note || "Les éventuels frais de livraison sont confirmés par notre équipe.",
      metaPixelId: settings.storefront_meta_pixel_id || "",
      contactWhatsapp: configuredContact || businessWhatsapp,
      defaultBusinessWhatsapp: businessWhatsapp,
      contactUsesDefault: !configuredContact,
    },
    products: products.map((product) => ({
      ...product,
      isVisible: Boolean(product.isVisible),
      isBestSeller: Boolean(product.isBestSeller),
      media: media.filter((item) => item.ownerType === "product" && item.ownerId === product.productId),
    })),
    offers: offers.map((offer) => ({
      ...offer,
      isActive: Boolean(offer.isActive),
      items: offerItems.filter((item) => item.offerId === offer.id && allowedProductIds.has(item.productId)),
      media: media.filter((item) => item.ownerType === "offer" && item.ownerId === offer.id),
    })),
    brandMedia: media.filter((item) => item.ownerType === "brand" && item.ownerId === 0),
  };
}

export async function GET(request: Request) {
  const access = await requireUser(request);
  if ("error" in access) return access.error;
  try {
    const database = await getRawDb();
    const body = await snapshot(database);
    return Response.json({ ...body, canEdit: ["admin", "editor"].includes(access.user.role) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Maison Jiya storefront admin load failed", error);
    return Response.json({ error: "Gestion de la boutique indisponible." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const access = await requireUser(request);
  if ("error" in access) return access.error;
  if (!["admin", "editor"].includes(access.user.role)) return Response.json({ error: "Votre compte est en lecture seule." }, { status: 403 });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Données invalides." }, { status: 400 });
  }

  try {
    const database = await getRawDb();
    await ensureStorefrontCms(database);
    const action = text(payload.action, 40);

    if (action === "saveGeneral") {
      const contactInput = text(payload.contactWhatsapp, 40);
      const contactWhatsapp = contactInput ? normalizeMoroccanPhone(contactInput) : null;
      if (contactInput && !contactWhatsapp) throw new Error("Le numéro WhatsApp doit être un numéro marocain valide.");
      const useDefaultWhatsapp = boolean(payload.useDefaultWhatsapp, false);
      const rows: Array<[string, string]> = [
        ["storefront_brand_name", text(payload.brandName, 80) || "Maison Jiya"],
        ["storefront_announcement", text(payload.announcement, 160)],
        ["storefront_hero_title", text(payload.heroTitle, 180)],
        ["storefront_hero_text", text(payload.heroText, 420)],
        ["storefront_shipping_note", text(payload.shippingNote, 220)],
        ["storefront_meta_pixel_id", text(payload.metaPixelId, 40).replace(/[^0-9]/g, "")],
        ["storefront_contact_whatsapp", useDefaultWhatsapp ? "" : (contactWhatsapp || "")],
      ];
      await database.batch(rows.map(([key, value]) => database.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).bind(key, value)));
    } else if (action === "saveProduct") {
      const productId = integer(payload.productId);
      if (productId <= 0) throw new Error("Produit invalide.");
      const exists = await database.prepare("SELECT id, category FROM products WHERE id = ? LIMIT 1").bind(productId).first<{ id: number; category: string }>();
      if (!exists) throw new Error("Ce produit n’existe plus.");
      if (excludedPublicCategories.has(exists.category)) throw new Error("Cette catégorie n’est pas publiée sur la boutique.");
      const availabilityMode = ["auto", "available", "out_of_stock"].includes(text(payload.availabilityMode, 30)) ? text(payload.availabilityMode, 30) : "auto";
      await database.prepare(`
        INSERT INTO storefront_product_settings (
          product_id, public_name, public_price, is_visible, availability_mode,
          badge, is_best_seller, description, sort_order, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(product_id) DO UPDATE SET
          public_name = excluded.public_name,
          public_price = excluded.public_price,
          is_visible = excluded.is_visible,
          availability_mode = excluded.availability_mode,
          badge = excluded.badge,
          is_best_seller = excluded.is_best_seller,
          description = excluded.description,
          sort_order = excluded.sort_order,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        productId,
        text(payload.publicName, 140),
        money(payload.publicPrice),
        boolean(payload.isVisible, true) ? 1 : 0,
        availabilityMode,
        text(payload.badge, 50),
        boolean(payload.isBestSeller, false) ? 1 : 0,
        text(payload.description, 600),
        integer(payload.sortOrder),
      ).run();
    } else if (action === "saveOffer") {
      const offerId = integer(payload.offerId);
      const name = text(payload.name, 140);
      const price = money(payload.price);
      if (!name || price <= 0) throw new Error("Nom et prix du pack sont obligatoires.");
      if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 30) throw new Error("Ajoutez au moins un produit au pack.");
      const grouped = new Map<number, number>();
      for (const raw of payload.items) {
        if (!raw || typeof raw !== "object") continue;
        const row = raw as Record<string, unknown>;
        const productId = integer(row.productId);
        const quantity = integer(row.quantity);
        if (productId > 0 && quantity > 0 && quantity <= 50) grouped.set(productId, (grouped.get(productId) || 0) + quantity);
      }
      if (!grouped.size) throw new Error("Ajoutez au moins un produit valide au pack.");
      const productIds = [...grouped.keys()];
      const placeholders = productIds.map(() => "?").join(",");
      const check = (await database.prepare(`
        SELECT id, category FROM products WHERE id IN (${placeholders})
      `).bind(...productIds).all<{ id: number; category: string }>()).results;
      if (check.length !== productIds.length || check.some((row) => excludedPublicCategories.has(row.category))) {
        throw new Error("Un produit choisi n’est pas autorisé sur la boutique publique.");
      }

      let id = offerId;
      if (id > 0) {
        await database.prepare(`
          UPDATE storefront_offers SET name = ?, description = ?, price = ?, compare_price = ?, badge = ?,
            is_active = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).bind(name, text(payload.description, 700), price, money(payload.comparePrice), text(payload.badge, 50), boolean(payload.isActive, true) ? 1 : 0, integer(payload.sortOrder), id).run();
      } else {
        await database.prepare(`
          INSERT INTO storefront_offers (name, description, price, compare_price, badge, is_active, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(name, text(payload.description, 700), price, money(payload.comparePrice), text(payload.badge, 50), boolean(payload.isActive, true) ? 1 : 0, integer(payload.sortOrder)).run();
        const created = await database.prepare("SELECT id FROM storefront_offers ORDER BY id DESC LIMIT 1").first<{ id: number }>();
        id = created?.id || 0;
      }
      if (!id) throw new Error("Impossible d’enregistrer ce pack.");
      await database.prepare("DELETE FROM storefront_offer_items WHERE offer_id = ?").bind(id).run();
      await database.batch([...grouped.entries()].map(([productId, quantity]) => database.prepare(`
        INSERT INTO storefront_offer_items (offer_id, product_id, quantity) VALUES (?, ?, ?)
      `).bind(id, productId, quantity)));
    } else if (action === "deleteOffer") {
      const offerId = integer(payload.offerId);
      if (offerId <= 0) throw new Error("Pack invalide.");
      await database.batch([
        database.prepare("DELETE FROM storefront_offer_items WHERE offer_id = ?").bind(offerId),
        database.prepare("DELETE FROM storefront_media WHERE owner_type = 'offer' AND owner_id = ?").bind(offerId),
        database.prepare("DELETE FROM storefront_offers WHERE id = ?").bind(offerId),
      ]);
    } else {
      return Response.json({ error: "Action inconnue." }, { status: 400 });
    }

    const body = await snapshot(database);
    return Response.json({ ok: true, ...body, canEdit: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Maison Jiya storefront admin save failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Enregistrement impossible." }, { status: 400 });
  }
}
