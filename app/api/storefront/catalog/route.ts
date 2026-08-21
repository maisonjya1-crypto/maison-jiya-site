import { getRawDb } from "../../../../db";
import { ensurePlatformUpgrades } from "../../../../db/platform-upgrades";
import { ensureStorefrontCms } from "../../../../db/storefront-cms";

type PublicProductRow = {
  id: number;
  productCode: string;
  name: string;
  category: string;
  salePrice: number;
  stockQuantity: number;
  availabilityMode: string;
  badge: string;
  description: string;
  sortOrder: number;
};
type PublicOfferRow = { id: number; name: string; description: string; price: number; comparePrice: number; badge: string; sortOrder: number };
type OfferItemRow = { offerId: number; productId: number; quantity: number; stockQuantity: number };
type MediaRow = { id: number; ownerType: string; ownerId: number; kind: string; sortOrder: number };
type WhatsAppNumber = { label?: string; phone?: string; isDefault?: boolean };

function cacheHeaders() {
  return {
    "cache-control": "public, max-age=20, s-maxage=30, stale-while-revalidate=90",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  };
}

export async function GET() {
  try {
    const database = await getRawDb();
    await ensurePlatformUpgrades(database);
    await ensureStorefrontCms(database);

    const products = (await database.prepare(`
      SELECT
        p.id,
        p.product_code AS productCode,
        COALESCE(NULLIF(s.public_name, ''), p.name) AS name,
        p.category,
        CASE WHEN s.public_price IS NULL OR s.public_price <= 0 THEN p.sale_price ELSE s.public_price END AS salePrice,
        p.stock_quantity AS stockQuantity,
        COALESCE(s.availability_mode, 'auto') AS availabilityMode,
        COALESCE(s.badge, '') AS badge,
        COALESCE(s.description, '') AS description,
        COALESCE(s.sort_order, 0) AS sortOrder
      FROM products p
      LEFT JOIN storefront_product_settings s ON s.product_id = p.id
      WHERE COALESCE(s.is_visible, 1) = 1
      ORDER BY COALESCE(s.sort_order, 0), p.category COLLATE NOCASE, name COLLATE NOCASE
      LIMIT 500
    `).all<PublicProductRow>()).results;

    const offers = (await database.prepare(`
      SELECT id, name, description, price, compare_price AS comparePrice, badge, sort_order AS sortOrder
      FROM storefront_offers
      WHERE is_active = 1
      ORDER BY sort_order, id DESC
      LIMIT 100
    `).all<PublicOfferRow>()).results;
    const offerItems = (await database.prepare(`
      SELECT i.offer_id AS offerId, i.product_id AS productId, i.quantity, p.stock_quantity AS stockQuantity
      FROM storefront_offer_items i
      JOIN products p ON p.id = i.product_id
      ORDER BY i.offer_id, i.product_id
    `).all<OfferItemRow>()).results;
    const media = (await database.prepare(`
      SELECT id, owner_type AS ownerType, owner_id AS ownerId, kind, sort_order AS sortOrder
      FROM storefront_media
      ORDER BY sort_order, id
    `).all<MediaRow>()).results;

    const settingsRows = (await database.prepare(`
      SELECT key, value FROM settings
      WHERE key IN (
        'account_name', 'whatsapp_numbers', 'storefront_brand_name', 'storefront_announcement',
        'storefront_hero_title', 'storefront_hero_text', 'storefront_shipping_note', 'storefront_meta_pixel_id'
      )
    `).all<{ key: string; value: string }>()).results;
    const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));

    let whatsapp = "";
    try {
      const parsed = JSON.parse(settings.whatsapp_numbers || "[]") as WhatsAppNumber[];
      const preferred = parsed.find((item) => item?.isDefault && item?.phone) || parsed.find((item) => item?.phone);
      whatsapp = typeof preferred?.phone === "string" ? preferred.phone.replace(/\D/g, "") : "";
    } catch { whatsapp = ""; }

    const publicProducts = products.map((product) => {
      const forcedOut = product.availabilityMode === "out_of_stock";
      const available = product.stockQuantity > 0 && !forcedOut;
      const images = media.filter((item) => item.ownerType === "product" && item.ownerId === product.id).map((item) => `/api/storefront/media/${item.id}`);
      return {
        id: product.id,
        kind: "product" as const,
        productCode: product.productCode,
        name: product.name,
        category: product.category || "Autre",
        salePrice: Math.max(0, Number(product.salePrice) || 0),
        comparePrice: 0,
        badge: product.badge,
        description: product.description,
        availability: available ? "En stock" : "Rupture de stock",
        available,
        lowStock: available && product.stockQuantity <= 3,
        images,
      };
    });

    const publicOffers = offers.map((offer) => {
      const components = offerItems.filter((item) => item.offerId === offer.id);
      const available = components.length > 0 && components.every((item) => item.stockQuantity >= item.quantity);
      const images = media.filter((item) => item.ownerType === "offer" && item.ownerId === offer.id).map((item) => `/api/storefront/media/${item.id}`);
      return {
        id: offer.id,
        kind: "offer" as const,
        productCode: `PACK-${offer.id}`,
        name: offer.name,
        category: "Packs & offres",
        salePrice: Math.max(0, Number(offer.price) || 0),
        comparePrice: Math.max(0, Number(offer.comparePrice) || 0),
        badge: offer.badge,
        description: offer.description,
        availability: available ? "En stock" : "Rupture de stock",
        available,
        lowStock: false,
        images,
      };
    });

    const logo = media.find((item) => item.ownerType === "brand" && item.kind === "logo");
    const heroImage = media.find((item) => item.ownerType === "brand" && item.kind === "hero");
    const categories = Array.from(new Set([...publicProducts.map((product) => product.category), ...(publicOffers.length ? ["Packs & offres"] : [])]));

    return Response.json({
      brand: settings.storefront_brand_name?.trim() || settings.account_name?.trim() || "Maison Jiya",
      announcement: settings.storefront_announcement?.trim() || "Paiement à la livraison partout au Maroc",
      heroTitle: settings.storefront_hero_title?.trim() || "Les pièces que vous aimez, simplement livrées chez vous.",
      heroText: settings.storefront_hero_text?.trim() || "Choisissez vos articles, validez votre commande en ligne et payez à la livraison. Notre équipe vous contacte ensuite pour confirmer.",
      shippingNote: settings.storefront_shipping_note?.trim() || "Les éventuels frais de livraison sont confirmés par notre équipe.",
      metaPixelId: settings.storefront_meta_pixel_id?.trim() || "",
      logoUrl: logo ? `/api/storefront/media/${logo.id}` : "/maison-jiya-logo.jpeg",
      heroImageUrl: heroImage ? `/api/storefront/media/${heroImage.id}` : "",
      whatsapp,
      products: publicProducts,
      offers: publicOffers,
      categories,
    }, { headers: cacheHeaders() });
  } catch (error) {
    console.error("Maison Jiya storefront catalog failed", error);
    return Response.json({ error: "Le catalogue est momentanément indisponible." }, {
      status: 503,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
}
