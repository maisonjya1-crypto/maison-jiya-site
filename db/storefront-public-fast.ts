import type { StorefrontCatalog } from "../app/boutique/storefront-types";
import { normalizeMoroccanPhone } from "./phone";

type PublicProductRow = {
  id: number;
  productCode: string;
  name: string;
  category: string;
  salePrice: number;
  availabilityMode: string;
  badge: string;
  description: string;
};
type PublicOfferRow = { id: number; name: string; description: string; price: number; comparePrice: number; badge: string };
type OfferItemRow = {
  offerId: number;
  productId: number;
  category: string;
  availabilityMode: string;
};
type MediaRow = { id: number; ownerType: string; ownerId: number; kind: string };
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

function brandStrip(raw: string | undefined) {
  const values = (raw || "")
    .split(/[|,\n]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 30);
  return values.length ? values : ["MAISON JIYA", "MONTRES", "BIJOUX", "PORTEFEUILLES", "PACKS"];
}

export async function loadStorefrontCatalogFast(database: D1Database): Promise<StorefrontCatalog> {
  const result = await database.batch([
    database.prepare(`
      SELECT
        p.id,
        p.product_code AS productCode,
        COALESCE(NULLIF(s.public_name, ''), p.name) AS name,
        p.category,
        CASE WHEN s.public_price IS NULL OR s.public_price <= 0 THEN p.sale_price ELSE s.public_price END AS salePrice,
        COALESCE(s.availability_mode, 'available') AS availabilityMode,
        COALESCE(s.badge, '') AS badge,
        COALESCE(s.description, '') AS description
      FROM products p
      JOIN storefront_product_settings s ON s.product_id = p.id
      WHERE s.is_visible = 1
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
      SELECT i.offer_id AS offerId, i.product_id AS productId,
             p.category AS category,
             COALESCE(s.availability_mode, 'available') AS availabilityMode
      FROM storefront_offer_items i
      JOIN products p ON p.id = i.product_id
      LEFT JOIN storefront_product_settings s ON s.product_id = p.id
      ORDER BY i.offer_id, i.product_id
    `),
    database.prepare(`
      SELECT m.id, m.owner_type AS ownerType, m.owner_id AS ownerId, m.kind
      FROM storefront_media m
      WHERE m.owner_type = 'brand'
         OR (
           m.kind = 'gallery'
           AND m.id = (
             SELECT m2.id
             FROM storefront_media m2
             WHERE m2.owner_type = m.owner_type
               AND m2.owner_id = m.owner_id
               AND m2.kind = m.kind
             ORDER BY m2.sort_order, m2.id
             LIMIT 1
           )
         )
      ORDER BY m.owner_type, m.owner_id, m.sort_order, m.id
    `),
    database.prepare(`
      SELECT key, value FROM settings
      WHERE key IN (
        'account_name', 'whatsapp_numbers', 'storefront_brand_name', 'storefront_announcement',
        'storefront_hero_title', 'storefront_hero_text', 'storefront_shipping_note',
        'storefront_meta_pixel_id', 'storefront_contact_whatsapp', 'storefront_brand_strip',
        'storefront_announcement_ar', 'storefront_announcement_en',
        'storefront_hero_title_ar', 'storefront_hero_title_en',
        'storefront_hero_text_ar', 'storefront_hero_text_en',
        'storefront_shipping_note_ar', 'storefront_shipping_note_en'
      )
    `),
  ]);

  const products = rows<PublicProductRow>(result[0]);
  const offers = rows<PublicOfferRow>(result[1]);
  const offerItems = rows<OfferItemRow>(result[2]);
  const media = rows<MediaRow>(result[3]);
  const settingsRows = rows<SettingRow>(result[4]);
  const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));

  const mediaByOwner = new Map<string, string>();
  let logoUrl = "/maison-jiya-logo.jpeg";
  let heroImageUrl = "";
  for (const item of media) {
    const url = `/api/storefront/media/${item.id}`;
    if (item.ownerType === "brand") {
      if (item.kind === "logo") logoUrl = url;
      if (item.kind === "hero") heroImageUrl = url;
      continue;
    }
    mediaByOwner.set(`${item.ownerType}:${item.ownerId}`, url);
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
    const available = product.availabilityMode !== "out_of_stock";
    const firstImage = mediaByOwner.get(`product:${product.id}`);
    return {
      id: product.id,
      kind: "product" as const,
      productCode: product.productCode,
      name: product.name,
      category: publicCategory(product.category),
      salePrice: Math.max(0, Number(product.salePrice) || 0),
      comparePrice: 0,
      badge: product.badge,
      description: product.description,
      availability: available ? "Disponible" : "Rupture de stock",
      available,
      lowStock: false,
      images: firstImage ? [firstImage] : [],
    };
  });

  const publicOffers = offers.flatMap((offer) => {
    const components = itemsByOffer.get(offer.id) || [];
    if (!components.length || components.some((item) => excludedPublicCategories.has(item.category))) return [];
    const available = components.every((item) => item.availabilityMode !== "out_of_stock");
    const firstImage = mediaByOwner.get(`offer:${offer.id}`);
    return [{
      id: offer.id,
      kind: "offer" as const,
      productCode: `PACK-${offer.id}`,
      name: offer.name,
      category: "Packs & offres",
      salePrice: Math.max(0, Number(offer.price) || 0),
      comparePrice: Math.max(0, Number(offer.comparePrice) || 0),
      badge: offer.badge,
      description: offer.description,
      availability: available ? "Disponible" : "Rupture de stock",
      available,
      lowStock: false,
      images: firstImage ? [firstImage] : [],
    }];
  });

  const categories = Array.from(new Set([
    ...publicProducts.map((product) => product.category),
    ...(publicOffers.length ? ["Packs & offres"] : []),
  ]));

  const brand = settings.storefront_brand_name?.trim() || settings.account_name?.trim() || "Maison Jiya";
  const announcement = settings.storefront_announcement?.trim() || "Livraison gratuite partout au Maroc";
  const heroTitle = settings.storefront_hero_title?.trim() || "Les pièces que vous aimez, simplement livrées chez vous.";
  const heroText = settings.storefront_hero_text?.trim() || "Choisissez vos articles, validez votre commande en ligne et payez à la livraison. Notre équipe vous contacte ensuite pour confirmer.";
  const shippingNote = settings.storefront_shipping_note?.trim() || "Livraison gratuite partout au Maroc. Notre équipe confirme chaque commande avant préparation.";

  return {
    brand,
    announcement,
    heroTitle,
    heroText,
    shippingNote,
    metaPixelId: settings.storefront_meta_pixel_id?.trim() || "",
    logoUrl,
    heroImageUrl,
    whatsapp: contactWhatsapp,
    contactWhatsapp,
    brandStrip: brandStrip(settings.storefront_brand_strip),
    localized: {
      fr: { announcement, heroTitle, heroText, shippingNote },
      ar: {
        announcement: settings.storefront_announcement_ar?.trim() || "توصيل مجاني إلى جميع أنحاء المغرب",
        heroTitle: settings.storefront_hero_title_ar?.trim() || "قطع أنيقة تحبها، تصل إليك بكل بساطة.",
        heroText: settings.storefront_hero_text_ar?.trim() || "اختر منتجاتك وأرسل طلبك عبر الموقع. سيتواصل معك فريقنا لتأكيد الطلب قبل التجهيز، والدفع عند الاستلام.",
        shippingNote: settings.storefront_shipping_note_ar?.trim() || "توصيل مجاني إلى جميع أنحاء المغرب. يؤكد فريقنا كل طلب قبل التجهيز.",
      },
      en: {
        announcement: settings.storefront_announcement_en?.trim() || "Free delivery across Morocco",
        heroTitle: settings.storefront_hero_title_en?.trim() || "Pieces you love, delivered simply to your door.",
        heroText: settings.storefront_hero_text_en?.trim() || "Choose your items and place your order online. Our team will contact you to confirm it before preparation, with cash on delivery.",
        shippingNote: settings.storefront_shipping_note_en?.trim() || "Free delivery across Morocco. Our team confirms every order before preparation.",
      },
    },
    products: publicProducts,
    offers: publicOffers,
    categories,
  };
}
