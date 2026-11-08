import { aboutCopy, deliveryCopy, heroCopy } from "../../../../lib/storefront-copy";
import { getAuthenticatedUser } from "../../../auth";
import { getRawDb } from "../../../../db";
import { normalizeMoroccanPhone } from "../../../../db/phone";
import { ensureStorefrontCms, getStorefrontMedia, getStorefrontPromotions, type StorefrontMarketingSectionRow, type StorefrontOfferItemRow, type StorefrontOfferRow, type StorefrontProductSettingRow } from "../../../../db/storefront-cms";
import { normalizeEligibleCategories } from "../../../../lib/storefront-promotions";

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

function promotionCode(value: unknown, fallbackName: string) {
  const explicit = text(value, 60).toUpperCase().replace(/[^A-Z0-9:_-]/g, "");
  if (explicit) return explicit.startsWith("PROMO:") ? explicit : `PROMO:${explicit}`;
  const slug = fallbackName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "OFFRE";
  return `PROMO:${slug}`;
}

const canonicalPromotionCategories = new Map([
  ["montres", "Montres"],
  ["bijoux", "Bijoux"],
  ["portefeuilles", "Portefeuilles"],
]);

function promotionCategories(value: unknown) {
  const normalized = normalizeEligibleCategories(value);
  return normalized
    .map((category) => canonicalPromotionCategories.get(category))
    .filter((category): category is string => Boolean(category));
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
      'storefront_contact_whatsapp', 'whatsapp_numbers',
      'storefront_promo_enabled', 'storefront_promo_badge', 'storefront_promo_title',
      'storefront_promo_text', 'storefront_promo_cta_label', 'storefront_promo_offer_id',
      'storefront_about_title', 'storefront_about_text', 'storefront_about_title_ar',
      'storefront_about_text_ar', 'storefront_about_title_en', 'storefront_about_text_en'
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
      COALESCE(s.description, '') AS description,
      COALESCE(s.sort_order, 0) AS sortOrder
    FROM products p
    LEFT JOIN storefront_product_settings s ON s.product_id = p.id
    WHERE p.archived_at IS NULL
      AND p.category NOT IN ('Électronique', 'Electronique', 'Boîtes', 'Boites')
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

  const promotions = await getStorefrontPromotions(database);

  const marketingSections = (await database.prepare(`
    SELECT id, eyebrow, title, body, badge, cta_label AS ctaLabel,
           target, placement, is_active AS isActive, sort_order AS sortOrder,
           created_at AS createdAt, updated_at AS updatedAt
    FROM storefront_marketing_sections
    ORDER BY placement, sort_order, id DESC
  `).all<StorefrontMarketingSectionRow>()).results;

  // Table créée par migrations/0019_storefront_reviews.sql ; liste vide si la migration n'est pas encore passée.
  type ReviewRow = { id: number; customerName: string; city: string; rating: number; body: string; productId: number | null; source: string; reviewDate: string | null; isVisible: number; sortOrder: number; createdAt: string };
  const reviews: ReviewRow[] = await database.prepare(`
    SELECT id, customer_name AS customerName, city, rating, body, product_id AS productId, source,
           review_date AS reviewDate, is_visible AS isVisible, sort_order AS sortOrder, created_at AS createdAt
    FROM storefront_reviews
    ORDER BY sort_order, COALESCE(review_date, created_at) DESC, id DESC
  `).all<ReviewRow>().then((result) => result.results || []).catch(() => []);

  const media = await getStorefrontMedia(database);
  const allowedProductIds = new Set(products.map((product) => product.productId));

  return {
    settings: {
      brandName: settings.storefront_brand_name || "Maison Jiya",
      announcement: deliveryCopy(settings.storefront_announcement, "fr", "announcement"),
      heroTitle: heroCopy(settings.storefront_hero_title, "fr", "title"),
      heroText: heroCopy(settings.storefront_hero_text, "fr", "text"),
      aboutTitle: aboutCopy(settings.storefront_about_title, "fr", "title"),
      aboutText: aboutCopy(settings.storefront_about_text, "fr", "text"),
      aboutTitleAr: settings.storefront_about_title_ar || "",
      aboutTextAr: settings.storefront_about_text_ar || "",
      aboutTitleEn: settings.storefront_about_title_en || "",
      aboutTextEn: settings.storefront_about_text_en || "",
      shippingNote: deliveryCopy(settings.storefront_shipping_note, "fr", "shippingNote"),
      metaPixelId: settings.storefront_meta_pixel_id || "",
      promoEnabled: settings.storefront_promo_enabled === "1",
      promoBadge: settings.storefront_promo_badge || "",
      promoTitle: settings.storefront_promo_title || "",
      promoText: settings.storefront_promo_text || "",
      promoCtaLabel: settings.storefront_promo_cta_label || "Voir l’offre",
      promoOfferId: Math.max(0, Number(settings.storefront_promo_offer_id) || 0),
      contactWhatsapp: configuredContact || businessWhatsapp,
      defaultBusinessWhatsapp: businessWhatsapp,
      contactUsesDefault: !configuredContact,
    },
    products: products.map((product) => ({
      ...product,
      isVisible: Boolean(product.isVisible),
      media: media.filter((item) => item.ownerType === "product" && item.ownerId === product.productId),
    })),
    offers: offers.map((offer) => ({
      ...offer,
      isActive: Boolean(offer.isActive),
      items: offerItems.filter((item) => item.offerId === offer.id && allowedProductIds.has(item.productId)),
      media: media.filter((item) => item.ownerType === "offer" && item.ownerId === offer.id),
    })),
    promotions: promotions.map((promotion) => ({
      ...promotion,
      isActive: Boolean(promotion.isActive),
      displayEnabled: Boolean(promotion.displayEnabled),
      eligibleCategories: promotionCategories(promotion.eligibleCategories),
      media: media.filter((item) => item.ownerType === "promotion" && item.ownerId === promotion.id),
    })),
    marketingSections: marketingSections.map((section) => ({
      ...section,
      isActive: Boolean(section.isActive),
      media: media.filter((item) => item.ownerType === "marketing" && item.ownerId === section.id),
    })),
    reviews: reviews.map((review) => ({
      ...review,
      isVisible: Boolean(review.isVisible),
      media: media.filter((item) => item.ownerType === "review" && item.ownerId === review.id),
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
      const promoOfferId = Math.max(0, integer(payload.promoOfferId));
      if (promoOfferId > 0) {
        const offerExists = await database.prepare("SELECT id FROM storefront_offers WHERE id = ? LIMIT 1").bind(promoOfferId).first<{ id: number }>();
        if (!offerExists) throw new Error("L’offre liée au bandeau n’existe plus.");
      }
      const rows: Array<[string, string]> = [
        ["storefront_brand_name", text(payload.brandName, 80) || "Maison Jiya"],
        ["storefront_announcement", text(payload.announcement, 160)],
        ["storefront_hero_title", text(payload.heroTitle, 180)],
        ["storefront_hero_text", text(payload.heroText, 420)],
        ["storefront_shipping_note", text(payload.shippingNote, 220)],
        ["storefront_about_title", text(payload.aboutTitle, 120)],
        ["storefront_about_text", text(payload.aboutText, 1600)],
        ["storefront_about_title_ar", text(payload.aboutTitleAr, 120)],
        ["storefront_about_text_ar", text(payload.aboutTextAr, 1600)],
        ["storefront_about_title_en", text(payload.aboutTitleEn, 120)],
        ["storefront_about_text_en", text(payload.aboutTextEn, 1600)],
        ["storefront_meta_pixel_id", text(payload.metaPixelId, 40).replace(/[^0-9]/g, "")],
        ["storefront_promo_enabled", boolean(payload.promoEnabled, false) ? "1" : "0"],
        ["storefront_promo_badge", text(payload.promoBadge, 50)],
        ["storefront_promo_title", text(payload.promoTitle, 140)],
        ["storefront_promo_text", text(payload.promoText, 260)],
        ["storefront_promo_cta_label", text(payload.promoCtaLabel, 50) || "Voir l’offre"],
        ["storefront_promo_offer_id", promoOfferId > 0 ? String(promoOfferId) : ""],
        ["storefront_contact_whatsapp", useDefaultWhatsapp ? "" : (contactWhatsapp || "")],
      ];
      await database.batch(rows.map(([key, value]) => database.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).bind(key, value)));
    } else if (action === "saveProduct") {
      const productId = integer(payload.productId);
      if (productId <= 0) throw new Error("Produit invalide.");
      const exists = await database.prepare("SELECT id, category FROM products WHERE id = ? AND archived_at IS NULL LIMIT 1").bind(productId).first<{ id: number; category: string }>();
      if (!exists) throw new Error("Ce produit n’existe plus.");
      if (excludedPublicCategories.has(exists.category)) throw new Error("Cette catégorie n’est pas publiée sur la boutique.");
      const availabilityMode = ["auto", "available", "out_of_stock"].includes(text(payload.availabilityMode, 30)) ? text(payload.availabilityMode, 30) : "auto";
      await database.prepare(`
        INSERT INTO storefront_product_settings (
          product_id, public_name, public_price, is_visible, availability_mode,
          badge, description, sort_order, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(product_id) DO UPDATE SET
          public_name = excluded.public_name,
          public_price = excluded.public_price,
          is_visible = excluded.is_visible,
          availability_mode = excluded.availability_mode,
          badge = excluded.badge,
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
        text(payload.description, 600),
        integer(payload.sortOrder),
      ).run();
    } else if (action === "savePromotion") {
      const promotionId = integer(payload.promotionId);
      const name = text(payload.name, 140);
      if (!name) throw new Error("Le nom de la promotion est obligatoire.");
      const ruleType = text(payload.ruleType, 40);
      const allowedRuleTypes = new Set(["second_item_percent", "percent_items", "buy_x_get_y_free"]);
      if (!allowedRuleTypes.has(ruleType)) throw new Error("Type de promotion invalide.");

      const percentValue = Math.min(100, money(payload.percentValue));
      const minimumQuantity = Math.max(ruleType === "second_item_percent" ? 2 : 1, Math.min(50, integer(payload.minimumQuantity, 1)));
      const buyQuantity = Math.max(1, Math.min(20, integer(payload.buyQuantity, 2)));
      const freeQuantity = Math.max(1, Math.min(20, integer(payload.freeQuantity, 1)));
      if ((ruleType === "second_item_percent" || ruleType === "percent_items") && percentValue <= 0) {
        throw new Error("Indiquez un pourcentage de remise supérieur à 0.");
      }
      const categories = promotionCategories(payload.eligibleCategories);
      if (!categories.length) throw new Error("Choisissez au moins une catégorie concernée.");
      const code = promotionCode(payload.code, name);
      const priority = Math.max(1, Math.min(999, integer(payload.priority, 100)));
      const displayEnabled = boolean(payload.displayEnabled, true);
      const badge = text(payload.badge, 40) || "OFFRE";
      const ctaLabel = text(payload.ctaLabel, 60) || "Voir les produits";

      const duplicate = await database.prepare("SELECT id FROM storefront_promotions WHERE code = ? AND id <> ? LIMIT 1")
        .bind(code, promotionId).first<{ id: number }>();
      if (duplicate) throw new Error("Ce code de promotion existe déjà.");

      if (promotionId > 0) {
        const exists = await database.prepare("SELECT id FROM storefront_promotions WHERE id = ? LIMIT 1").bind(promotionId).first<{ id: number }>();
        if (!exists) throw new Error("Cette promotion n’existe plus.");
        await database.prepare(`
          UPDATE storefront_promotions
          SET name = ?, code = ?, description = ?, rule_type = ?, percent_value = ?,
              minimum_quantity = ?, buy_quantity = ?, free_quantity = ?,
              eligible_categories = ?, is_active = ?, priority = ?,
              display_enabled = ?, badge = ?, cta_label = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          name,
          code,
          text(payload.description, 700),
          ruleType,
          ruleType === "buy_x_get_y_free" ? 100 : percentValue,
          minimumQuantity,
          buyQuantity,
          freeQuantity,
          JSON.stringify(categories),
          boolean(payload.isActive, true) ? 1 : 0,
          priority,
          displayEnabled ? 1 : 0,
          badge,
          ctaLabel,
          promotionId,
        ).run();
      } else {
        await database.prepare(`
          INSERT INTO storefront_promotions (
            name, code, description, rule_type, percent_value, minimum_quantity,
            buy_quantity, free_quantity, eligible_categories, is_active, priority,
            display_enabled, badge, cta_label, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          name,
          code,
          text(payload.description, 700),
          ruleType,
          ruleType === "buy_x_get_y_free" ? 100 : percentValue,
          minimumQuantity,
          buyQuantity,
          freeQuantity,
          JSON.stringify(categories),
          boolean(payload.isActive, true) ? 1 : 0,
          priority,
          displayEnabled ? 1 : 0,
          badge,
          ctaLabel,
        ).run();
      }
    } else if (action === "deletePromotion") {
      const promotionId = integer(payload.promotionId);
      if (promotionId <= 0) throw new Error("Promotion invalide.");
      await database.batch([
        database.prepare("DELETE FROM storefront_media WHERE owner_type = 'promotion' AND owner_id = ?").bind(promotionId),
        database.prepare("DELETE FROM storefront_promotions WHERE id = ?").bind(promotionId),
      ]);
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
        SELECT id, category FROM products
        WHERE id IN (${placeholders})
          AND archived_at IS NULL
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
    } else if (action === "saveMarketingSection") {
      const sectionId = integer(payload.sectionId);
      const title = text(payload.title, 160);
      if (!title) throw new Error("Le titre du bloc marketing est obligatoire.");
      const target = text(payload.target, 40);
      const allowedTargets = new Set(["offers", "catalogue", "Montres", "Bijoux", "Portefeuilles"]);
      const placement = text(payload.placement, 40);
      const allowedPlacements = new Set(["after_categories", "before_catalogue", "before_contact"]);
      const normalizedTarget = allowedTargets.has(target) ? target : "offers";
      const normalizedPlacement = allowedPlacements.has(placement) ? placement : "after_categories";

      if (sectionId > 0) {
        const exists = await database.prepare("SELECT id FROM storefront_marketing_sections WHERE id = ? LIMIT 1").bind(sectionId).first<{ id: number }>();
        if (!exists) throw new Error("Ce bloc marketing n’existe plus.");
        await database.prepare(`
          UPDATE storefront_marketing_sections
          SET eyebrow = ?, title = ?, body = ?, badge = ?, cta_label = ?, target = ?,
              placement = ?, is_active = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          text(payload.eyebrow, 80),
          title,
          text(payload.body, 500),
          text(payload.badge, 50),
          text(payload.ctaLabel, 60) || "Voir",
          normalizedTarget,
          normalizedPlacement,
          boolean(payload.isActive, true) ? 1 : 0,
          integer(payload.sortOrder),
          sectionId,
        ).run();
      } else {
        await database.prepare(`
          INSERT INTO storefront_marketing_sections (
            eyebrow, title, body, badge, cta_label, target, placement, is_active, sort_order, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          text(payload.eyebrow, 80),
          title,
          text(payload.body, 500),
          text(payload.badge, 50),
          text(payload.ctaLabel, 60) || "Voir",
          normalizedTarget,
          normalizedPlacement,
          boolean(payload.isActive, true) ? 1 : 0,
          integer(payload.sortOrder),
        ).run();
      }
    } else if (action === "deleteMarketingSection") {
      const sectionId = integer(payload.sectionId);
      if (sectionId <= 0) throw new Error("Bloc marketing invalide.");
      await database.batch([
        database.prepare("DELETE FROM storefront_media WHERE owner_type = 'marketing' AND owner_id = ?").bind(sectionId),
        database.prepare("DELETE FROM storefront_marketing_sections WHERE id = ?").bind(sectionId),
      ]);
    } else if (action === "saveReview") {
      // Uniquement de vrais avis : nom tel qu'accepté par le client, source et date réelles.
      const reviewId = integer(payload.reviewId);
      const customerName = text(payload.customerName, 60);
      const body = text(payload.body, 700);
      if (!customerName) throw new Error("Indiquez le prénom du client (ex. Salma B.).");
      if (body.length < 5) throw new Error("Recopiez le message du client.");
      const rating = Math.max(1, Math.min(5, integer(payload.rating) || 5));
      const sources = new Set(["WhatsApp", "Instagram", "Facebook", "TikTok", "Téléphone", "En personne", "Autre"]);
      const source = sources.has(text(payload.source, 30)) ? text(payload.source, 30) : "Autre";
      const reviewDate = /^\d{4}-\d{2}-\d{2}$/.test(text(payload.reviewDate, 10)) ? text(payload.reviewDate, 10) : null;
      const productId = integer(payload.productId) > 0 ? integer(payload.productId) : null;
      const values = [customerName, text(payload.city, 60), rating, body, productId, source, reviewDate, boolean(payload.isVisible, true) ? 1 : 0, integer(payload.sortOrder)];
      if (reviewId > 0) {
        const exists = await database.prepare("SELECT id FROM storefront_reviews WHERE id = ? LIMIT 1").bind(reviewId).first<{ id: number }>();
        if (!exists) throw new Error("Cet avis n’existe plus.");
        await database.prepare(`
          UPDATE storefront_reviews
          SET customer_name = ?, city = ?, rating = ?, body = ?, product_id = ?, source = ?, review_date = ?,
              is_visible = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(...values, reviewId).run();
      } else {
        await database.prepare(`
          INSERT INTO storefront_reviews (customer_name, city, rating, body, product_id, source, review_date, is_visible, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(...values).run();
      }
    } else if (action === "deleteReview") {
      const reviewId = integer(payload.reviewId);
      if (reviewId <= 0) throw new Error("Avis invalide.");
      await database.batch([
        database.prepare("DELETE FROM storefront_media WHERE owner_type = 'review' AND owner_id = ?").bind(reviewId),
        database.prepare("DELETE FROM storefront_reviews WHERE id = ?").bind(reviewId),
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
