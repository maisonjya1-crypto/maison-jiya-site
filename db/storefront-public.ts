import type { StorefrontCatalog } from "../app/boutique/storefront-types";
import { normalizeMoroccanPhone } from "./phone";

type PublicProductRow = {
  id: number;
  productCode: string;
  name: string;
  category: string;
  salePrice: number;
  stockQuantity: number;
  availabilityMode: string;
  badge: string;
  isBestSeller: number;
  description: string;
};

type PublicOfferRow = {
  id: number;
  name: string;
  description: string;
  price: number;
  comparePrice: number;
  badge: string;
};

type OfferItemRow = {
  offerId: number;
  productId: number;
  quantity: number;
  stockQuantity: number;
  category: string;
};

type MediaRow = {
  id: number;
  ownerType: string;
  ownerId: number;
  kind: string;
};

type SettingRow = { key: string; value: string };
type WhatsAppNumber = { label?: string; phone?: string; isDefault?: boolean };

const excludedPublicCategories = new Set(["Électronique", "Electronique", "Boîtes", "Boites"]);

function publicCategory(category: string) {
  if (["Wallets", "Wallet", "Portefeuille", "Portefeuilles"].includes(category)) return "Portefeuilles";
  return category || "Autre";
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

function rows<T>(result: D1Result<unknown> | undefined) {
  return (result?.results || []) as T[];
}

export async function loadStorefrontCatalog(database: D1Database): Promise<StorefrontCatalog> {
  const result = await database.batch([
    database.prepare(`
      SELECT
        p.id,
        p.product_code AS productCode,
        COALESCE(NULLIF(s.public_name, ''), p.name) AS name,
        p.category,
        CASE WHEN s.public_price IS NULL OR s.public_price <= 0 THEN p.sale_price ELSE s.public_price END AS salePrice,
        p.stock_quantity AS stockQuantity,
        COALESCE(s.availability_mode, 'auto') AS availabilityMode,
        COALESCE(s.badge, '') AS badge,
        COALESCE(s.is_best_seller, 0) AS isBestSeller,
        COALESCE(s.description, '') AS description
      FROM products p
      LEFT JOIN storefront_product_settings s ON s.product_id = p.id
      WHERE COALESCE(s.is_visible, 1) = 1
        AND p.category NOT IN ('Électronique', 'Electronique', 'Boîtes', 'Boites')
      ORDER BY COALESCE(s.sort_order, 0), p.category COLLATE NOCASE, name COLLATE NOCASE
      LIMIT 500
    `),
    database.prepare(`
      SELECT id, name, description, price, compare_price AS comparePrice, badge
      FROM storefront_offers
      WHERE is_active = 1
      ORDER BY sort_order, id DESC
      LIMIT 100
    `),
    database.prepare(`
      SELECT i.offer_id AS offerId, i.product_id AS productId, i.quantity,
             p.stock_quantity AS stockQuantity, p.category AS category
      FROM storefront_offer_items i
      JOIN products p ON p.id = i.product_id
      ORDER BY i.offer_id, i.product_id
    `),
    database.prepare(`
      SELECT id, owner_type AS ownerType, owner_id AS ownerId, kind
      FROM storefront_media
      ORDER BY sort_order, id
    `),
    database.prepare(`
      SELECT key, value FROM settings
      WHERE key IN (
        'account_name', 'whatsapp_numbers', 'storefront_brand_name', 'storefront_announcement',
        'storefront_hero_title', 'storefront_hero_text', 'storefront_shipping_note',
        'storefront_meta_pixel_id', 'storefront_contact_whatsapp'
      )
    `),
  ]);

  const products = rows<PublicProductRow>(result[0]);
  const offers = rows<PublicOfferRow>(result[1]);
  const offerItems = rows<OfferItemRow>(result[2]);
  const media = rows<MediaRow>(result[3]);
  const settingsRows = rows<SettingRow>(result[4]);
  const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));

  const mediaByOwner = new Map<string, string[]>();
  let logoUrl = "/maison-jiya-logo.jpeg";
  let heroImageUrl = "";
  for (const item of media) {
    const url = `/api/storefront/media/${item.id}`;
    if (item.ownerType === "brand") {
      if (item.kind === "logo") logoUrl = url;
      if (item.kind === "hero") heroImageUrl = url;
      continue;
    }
    const key = `${item.ownerType}:${item.ownerId}`;
    const list = mediaByOwner.get(key);
    if (list) list.push(url);
    else mediaByOwner.set(key, [url]);
  }

  const itemsByOffer = new Map<number, OfferItemRow[]>();
  for (const item of offerItems) {
    const list = itemsByOffer.get(item.offerId);
    if (list) list.push(item);
    else itemsByOffer.set(item.offerId, [item]);
  }

  const businessWhatsapp = defaultWhatsApp(settings.whatsapp_numbers);
  const contactWhatsapp = normalizeMoroccanPhone(settings.storefront_contact_whatsapp || "") || businessWhatsapp;

  const publicProducts = products.map((product) => {
    const forcedOut = product.availabilityMode === "out_of_stock";
    const available = product.stockQuantity > 0 && !forcedOut;
    return {
      id: product.id,
      kind: "product" as const,
      productCode: product.productCode,
      name: product.name,
      category: publicCategory(product.category),
      salePrice: Math.max(0, Number(product.salePrice) || 0),
      comparePrice: 0,
      badge: product.badge,
      isBestSeller: Boolean(product.isBestSeller),
      description: product.description,
      availability: available ? "En stock" : "Rupture de stock",
      available,
      lowStock: available && product.stockQuantity <= 3,
      images: mediaByOwner.get(`product:${product.id}`) || [],
    };
  });

  const publicOffers = offers.flatMap((offer) => {
    const components = itemsByOffer.get(offer.id) || [];
    if (!components.length || components.some((item) => excludedPublicCategories.has(item.category))) return [];
    const available = components.every((item) => item.stockQuantity >= item.quantity);
    return [{
      id: offer.id,
      kind: "offer" as const,
      productCode: `PACK-${offer.id}`,
      name: offer.name,
      category: "Packs & offres",
      salePrice: Math.max(0, Number(offer.price) || 0),
      comparePrice: Math.max(0, Number(offer.comparePrice) || 0),
      badge: offer.badge,
      isBestSeller: false,
      description: offer.description,
      availability: available ? "En stock" : "Rupture de stock",
      available,
      lowStock: false,
      images: mediaByOwner.get(`offer:${offer.id}`) || [],
    }];
  });

  const categories = Array.from(new Set([
    ...publicProducts.map((product) => product.category),
    ...(publicOffers.length ? ["Packs & offres"] : []),
  ]));

  return {
    brand: settings.storefront_brand_name?.trim() || settings.account_name?.trim() || "Maison Jiya",
    announcement: settings.storefront_announcement?.trim() || "Paiement à la livraison partout au Maroc",
    heroTitle: settings.storefront_hero_title?.trim() || "Les pièces que vous aimez, simplement livrées chez vous.",
    heroText: settings.storefront_hero_text?.trim() || "Choisissez vos articles, validez votre commande en ligne et payez à la livraison. Notre équipe vous contacte ensuite pour confirmer.",
    shippingNote: settings.storefront_shipping_note?.trim() || "Les éventuels frais de livraison sont confirmés par notre équipe.",
    metaPixelId: settings.storefront_meta_pixel_id?.trim() || "",
    logoUrl,
    heroImageUrl,
    whatsapp: contactWhatsapp,
    contactWhatsapp,
    products: publicProducts,
    offers: publicOffers,
    categories,
  };
}
