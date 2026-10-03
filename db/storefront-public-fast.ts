import type { StorefrontCatalog } from "../app/boutique/storefront-types";
import { normalizeMoroccanPhone } from "./phone";
import { normalizeEligibleCategories, type StorefrontPromotion } from "../lib/storefront-promotions";

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
type PublicPromotionRow = {
  id: number;
  name: string;
  code: string;
  description: string;
  ruleType: StorefrontPromotion["ruleType"];
  percentValue: number;
  minimumQuantity: number;
  buyQuantity: number;
  freeQuantity: number;
  eligibleCategories: string;
  isActive: number;
  priority: number;
};
type PublicMarketingRow = {
  id: number;
  eyebrow: string;
  title: string;
  body: string;
  badge: string;
  ctaLabel: string;
  target: string;
  placement: string;
};
type OfferItemRow = {
  offerId: number;
  productId: number;
  category: string;
  availabilityMode: string;
  archivedAt: string | null;
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
        AND p.archived_at IS NULL
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
      SELECT id, name, code, description,
             rule_type AS ruleType,
             percent_value AS percentValue,
             minimum_quantity AS minimumQuantity,
             buy_quantity AS buyQuantity,
             free_quantity AS freeQuantity,
             eligible_categories AS eligibleCategories,
             is_active AS isActive,
             priority
      FROM storefront_promotions
      WHERE is_active = 1
      ORDER BY priority, id
      LIMIT 100
    `),
    database.prepare(`
      SELECT i.offer_id AS offerId, i.product_id AS productId,
             p.category AS category,
             COALESCE(s.availability_mode, 'available') AS availabilityMode,
             p.archived_at AS archivedAt
      FROM storefront_offer_items i
      JOIN products p ON p.id = i.product_id
      LEFT JOIN storefront_product_settings s ON s.product_id = p.id
      ORDER BY i.offer_id, i.product_id
    `),
    database.prepare(`
      SELECT m.id, m.owner_type AS ownerType, m.owner_id AS ownerId, m.kind
      FROM storefront_media m
      WHERE m.owner_type = 'brand'
         OR m.kind = 'gallery'
      ORDER BY m.owner_type, m.owner_id, m.sort_order, m.id
    `),
    database.prepare(`
      SELECT id, eyebrow, title, body, badge, cta_label AS ctaLabel, target, placement
      FROM storefront_marketing_sections
      WHERE is_active = 1
      ORDER BY placement, sort_order, id DESC
      LIMIT 30
    `),
    database.prepare(`
      SELECT key, value FROM settings
      WHERE key IN (
        'account_name', 'whatsapp_numbers', 'storefront_brand_name', 'storefront_announcement',
        'storefront_hero_title', 'storefront_hero_text', 'storefront_shipping_note',
        'storefront_meta_pixel_id', 'storefront_contact_whatsapp', 'storefront_brand_strip',
        'storefront_promo_enabled', 'storefront_promo_badge', 'storefront_promo_title',
        'storefront_promo_text', 'storefront_promo_cta_label', 'storefront_promo_offer_id',
        'storefront_announcement_ar', 'storefront_announcement_en',
        'storefront_hero_title_ar', 'storefront_hero_title_en',
        'storefront_hero_text_ar', 'storefront_hero_text_en',
        'storefront_shipping_note_ar', 'storefront_shipping_note_en'
      )
    `),
  ]);

  const products = rows<PublicProductRow>(result[0]);
  const offers = rows<PublicOfferRow>(result[1]);
  const promotionRows = rows<PublicPromotionRow>(result[2]);
  const offerItems = rows<OfferItemRow>(result[3]);
  const media = rows<MediaRow>(result[4]);
  const marketingRows = rows<PublicMarketingRow>(result[5]);
  const settingsRows = rows<SettingRow>(result[6]);
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

  const publicProducts = products.flatMap((product) => {
    const available = product.availabilityMode !== "out_of_stock";
    const images = (mediaByOwner.get(`product:${product.id}`) || []).slice(0, 6);
    const salePrice = Math.max(0, Number(product.salePrice) || 0);
    // La boutique publique n'affiche jamais une fiche incomplète : la publication
    // reste manuelle et une vraie photo + un nom + un prix sont requis.
    if (!images.length || !product.name.trim() || salePrice <= 0) return [];
    return [{
      id: product.id,
      kind: "product" as const,
      productCode: product.productCode,
      name: product.name,
      category: publicCategory(product.category),
      salePrice,
      comparePrice: 0,
      badge: product.badge,
      description: product.description,
      availability: available ? "Disponible à la commande" : "Indisponible",
      available,
      lowStock: false,
      images,
    }];
  });

  const publicPromotions: StorefrontPromotion[] = promotionRows.map((promotion) => ({
    id: Number(promotion.id) || 0,
    name: promotion.name?.trim() || "",
    code: promotion.code?.trim() || "",
    description: promotion.description?.trim() || "",
    ruleType: promotion.ruleType,
    percentValue: Math.max(0, Math.min(100, Number(promotion.percentValue) || 0)),
    minimumQuantity: Math.max(1, Math.floor(Number(promotion.minimumQuantity) || 1)),
    buyQuantity: Math.max(0, Math.floor(Number(promotion.buyQuantity) || 0)),
    freeQuantity: Math.max(0, Math.floor(Number(promotion.freeQuantity) || 0)),
    eligibleCategories: normalizeEligibleCategories(promotion.eligibleCategories).map((category) => {
      if (category === "montres") return "Montres";
      if (category === "bijoux") return "Bijoux";
      if (category === "portefeuilles") return "Portefeuilles";
      return category;
    }),
    isActive: Boolean(promotion.isActive),
    priority: Number(promotion.priority) || 100,
  })).filter((promotion) => promotion.name && promotion.code);

  const publicOffers = offers.flatMap((offer) => {
    const components = itemsByOffer.get(offer.id) || [];
    if (!components.length || components.some((item) => excludedPublicCategories.has(item.category) || item.archivedAt)) return [];
    const available = components.every((item) => item.availabilityMode !== "out_of_stock");
    const images = (mediaByOwner.get(`offer:${offer.id}`) || []).slice(0, 6);
    const salePrice = Math.max(0, Number(offer.price) || 0);
    if (!images.length || !offer.name.trim() || salePrice <= 0) return [];
    return [{
      id: offer.id,
      kind: "offer" as const,
      productCode: `PACK-${offer.id}`,
      name: offer.name,
      category: "Packs & offres",
      salePrice,
      comparePrice: Math.max(0, Number(offer.comparePrice) || 0),
      badge: offer.badge,
      description: offer.description,
      availability: available ? "Disponible à la commande" : "Indisponible",
      available,
      lowStock: false,
      images,
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
  const configuredPromoOfferId = Math.max(0, Number(settings.storefront_promo_offer_id) || 0);
  const promoOfferId = publicOffers.some((offer) => offer.id === configuredPromoOfferId) ? configuredPromoOfferId : null;
  const promotionBanner = {
    enabled: settings.storefront_promo_enabled === "1",
    badge: settings.storefront_promo_badge?.trim() || "OFFRE",
    title: settings.storefront_promo_title?.trim() || "",
    text: settings.storefront_promo_text?.trim() || "",
    ctaLabel: settings.storefront_promo_cta_label?.trim() || "Voir l’offre",
    offerId: promoOfferId,
  };

  const marketingSections = marketingRows.flatMap((section) => {
    const target = ["offers", "catalogue", "Montres", "Bijoux", "Portefeuilles"].includes(section.target) ? section.target : "offers";
    const placement = ["after_categories", "before_catalogue", "before_contact"].includes(section.placement) ? section.placement : "after_categories";
    const title = section.title?.trim() || "";
    if (!title) return [];
    return [{
      id: section.id,
      eyebrow: section.eyebrow?.trim() || "",
      title,
      body: section.body?.trim() || "",
      badge: section.badge?.trim() || "",
      ctaLabel: section.ctaLabel?.trim() || "Voir",
      target: target as "offers" | "catalogue" | "Montres" | "Bijoux" | "Portefeuilles",
      placement: placement as "after_categories" | "before_catalogue" | "before_contact",
      imageUrl: mediaByOwner.get(`marketing:${section.id}`)?.[0] || "",
    }];
  });

  return {
    brand,
    announcement,
    heroTitle,
    heroText,
    shippingNote,
    metaPixelId: settings.storefront_meta_pixel_id?.trim() || "",
    promotionBanner,
    marketingSections,
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
    promotions: publicPromotions,
    categories,
  };
}
