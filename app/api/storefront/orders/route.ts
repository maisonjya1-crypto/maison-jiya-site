import { getRawDb } from "../../../../db";
import { normalizeMoroccanPhone } from "../../../../db/phone";
import { ensurePlatformUpgrades } from "../../../../db/platform-upgrades";
import { notifyNewOrder } from "../../../../db/push-notifications";
import { ensureStorefrontCms } from "../../../../db/storefront-cms";

type RequestedCartItem = { kind: "product" | "offer"; id: number; quantity: number };
type ProductRow = {
  id: number;
  productCode: string;
  name: string;
  category: string;
  publicName: string;
  publicPrice: number;
  purchasePrice: number;
  stockQuantity: number;
  isVisible: number;
  availabilityMode: string;
};
type OfferRow = { id: number; name: string; price: number; isActive: number };
type OfferComponentRow = { offerId: number; productId: number; quantity: number };
type CapturedItem = { productId: number; productCode: string; name: string; quantity: number; unitCost: number; catalogUnitPrice: number; lineSaleAmount: number };

const excludedPublicCategories = new Set(["Électronique", "Electronique", "Boîtes", "Boites"]);

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}
function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
function parseItems(value: unknown): RequestedCartItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) throw new Error("Votre panier est invalide.");
  const grouped = new Map<string, RequestedCartItem>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") throw new Error("Votre panier est invalide.");
    const row = raw as Record<string, unknown>;
    const legacyProductId = Number(row.productId);
    const kind = row.kind === "offer" ? "offer" : "product";
    const id = Number(row.id ?? (Number.isInteger(legacyProductId) ? legacyProductId : 0));
    const quantity = Number(row.quantity);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error("Un article du panier est invalide.");
    const key = `${kind}:${id}`;
    const current = grouped.get(key);
    grouped.set(key, { kind, id, quantity: (current?.quantity || 0) + quantity });
  }
  const items = [...grouped.values()];
  if (items.some((item) => item.quantity > 20)) throw new Error("Quantité trop élevée pour un article.");
  return items;
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function enforceRateLimit(database: D1Database, request: Request) {
  await database.prepare(`
    CREATE TABLE IF NOT EXISTS storefront_rate_limits (
      key_hash TEXT PRIMARY KEY NOT NULL,
      window_started_at TEXT NOT NULL,
      request_count INTEGER DEFAULT 0 NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `).run();
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const keyHash = await sha256(`order:${ip}`);
  const now = Date.now();
  const row = await database.prepare("SELECT window_started_at AS windowStartedAt, request_count AS requestCount FROM storefront_rate_limits WHERE key_hash = ? LIMIT 1")
    .bind(keyHash).first<{ windowStartedAt: string; requestCount: number }>();
  const startedAt = row?.windowStartedAt ? new Date(row.windowStartedAt).getTime() : 0;
  const freshWindow = !startedAt || now - startedAt > 15 * 60 * 1000;
  if (!freshWindow && Number(row?.requestCount || 0) >= 5) throw new Error("Trop de tentatives. Réessayez dans quelques minutes.");
  if (freshWindow) {
    await database.prepare(`
      INSERT INTO storefront_rate_limits (key_hash, window_started_at, request_count, updated_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(key_hash) DO UPDATE SET window_started_at = excluded.window_started_at, request_count = 1, updated_at = CURRENT_TIMESTAMP
    `).bind(keyHash, new Date(now).toISOString()).run();
  } else {
    await database.prepare("UPDATE storefront_rate_limits SET request_count = request_count + 1, updated_at = CURRENT_TIMESTAMP WHERE key_hash = ?").bind(keyHash).run();
  }
}

function allocateSale(items: Array<{ product: ProductRow; quantity: number; weight: number }>, total: number): CapturedItem[] {
  const weightTotal = items.reduce((sum, item) => sum + item.weight, 0);
  let allocated = 0;
  return items.map(({ product, quantity, weight }, index) => {
    const lineSaleAmount = index === items.length - 1
      ? Math.round((total - allocated) * 100) / 100
      : Math.round((weightTotal ? total * (weight / weightTotal) : total / items.length) * 100) / 100;
    allocated += lineSaleAmount;
    return {
      productId: product.id,
      productCode: product.productCode,
      name: product.publicName || product.name,
      quantity,
      unitCost: product.purchasePrice,
      catalogUnitPrice: product.publicPrice,
      lineSaleAmount,
    };
  });
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: "Requête refusée." }, { status: 403 });
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Commande invalide." }, { status: 400 }); }

  try {
    if (text(payload.website, 100)) return Response.json({ ok: true, orderRef: "" });
    const database = await getRawDb();
    await ensurePlatformUpgrades(database);
    await ensureStorefrontCms(database);
    await enforceRateLimit(database, request);

    const cart = parseItems(payload.items);
    const customerName = text(payload.customerName, 120);
    const phone = normalizeMoroccanPhone(text(payload.phone, 40));
    const city = text(payload.city, 100);
    const address = text(payload.address, 260);
    const note = text(payload.note, 240);
    const campaign = text(payload.utmCampaign, 120);
    const utmSource = text(payload.utmSource, 80);
    const utmMedium = text(payload.utmMedium, 80);
    if (!customerName || customerName.length < 2) throw new Error("Indiquez votre nom complet.");
    if (!phone) throw new Error("Indiquez un numéro marocain valide.");
    if (!city) throw new Error("Indiquez votre ville.");
    if (!address || address.length < 5) throw new Error("Indiquez votre adresse de livraison.");

    const directIds = cart.filter((item) => item.kind === "product").map((item) => item.id);
    const offerIds = cart.filter((item) => item.kind === "offer").map((item) => item.id);
    const neededProductIds = new Set<number>(directIds);

    let offers: OfferRow[] = [];
    let offerComponents: OfferComponentRow[] = [];
    if (offerIds.length) {
      const placeholders = offerIds.map(() => "?").join(",");
      offers = (await database.prepare(`SELECT id, name, price, is_active AS isActive FROM storefront_offers WHERE id IN (${placeholders})`).bind(...offerIds).all<OfferRow>()).results;
      if (offers.length !== offerIds.length || offers.some((offer) => !offer.isActive)) throw new Error("Une offre du panier n’est plus disponible.");
      offerComponents = (await database.prepare(`SELECT offer_id AS offerId, product_id AS productId, quantity FROM storefront_offer_items WHERE offer_id IN (${placeholders})`).bind(...offerIds).all<OfferComponentRow>()).results;
      for (const component of offerComponents) neededProductIds.add(component.productId);
      for (const offerId of offerIds) if (!offerComponents.some((item) => item.offerId === offerId)) throw new Error("Une offre du panier est incomplète.");
    }

    const productIds = [...neededProductIds];
    if (!productIds.length) throw new Error("Votre panier est vide.");
    const productPlaceholders = productIds.map(() => "?").join(",");
    const rows = (await database.prepare(`
      SELECT p.id, p.product_code AS productCode, p.name, p.category AS category,
        COALESCE(NULLIF(s.public_name, ''), p.name) AS publicName,
        CASE WHEN s.public_price IS NULL OR s.public_price <= 0 THEN p.sale_price ELSE s.public_price END AS publicPrice,
        p.purchase_price AS purchasePrice, p.stock_quantity AS stockQuantity,
        COALESCE(s.is_visible, 1) AS isVisible, COALESCE(s.availability_mode, 'auto') AS availabilityMode
      FROM products p
      LEFT JOIN storefront_product_settings s ON s.product_id = p.id
      WHERE p.id IN (${productPlaceholders})
    `).bind(...productIds).all<ProductRow>()).results;
    if (rows.length !== productIds.length) throw new Error("Un article du panier n’est plus disponible.");
    if (rows.some((product) => excludedPublicCategories.has(product.category))) throw new Error("Un article du panier n’est pas disponible sur la boutique publique.");
    const products = new Map(rows.map((product) => [product.id, product]));

    for (const offer of offers) {
      const components = offerComponents.filter((component) => component.offerId === offer.id);
      if (components.some((component) => products.get(component.productId)?.availabilityMode === "out_of_stock")) {
        throw new Error(`${offer.name} n’est plus disponible.`);
      }
    }

    const expanded = new Map<number, { product: ProductRow; quantity: number; weight: number }>();
    const labels: string[] = [];
    let saleAmount = 0;
    for (const item of cart) {
      if (item.kind === "product") {
        const product = products.get(item.id)!;
        if (!product.isVisible || product.availabilityMode === "out_of_stock") throw new Error(`${product.publicName || product.name} n’est plus disponible.`);
        const lineTotal = product.publicPrice * item.quantity;
        saleAmount += lineTotal;
        labels.push(`${product.publicName || product.name} ×${item.quantity}`);
        const current = expanded.get(product.id);
        expanded.set(product.id, { product, quantity: (current?.quantity || 0) + item.quantity, weight: (current?.weight || 0) + lineTotal });
      } else {
        const offer = offers.find((entry) => entry.id === item.id)!;
        saleAmount += offer.price * item.quantity;
        labels.push(`${offer.name} ×${item.quantity}`);
        const components = offerComponents.filter((component) => component.offerId === offer.id);
        for (const component of components) {
          const product = products.get(component.productId)!;
          const quantity = component.quantity * item.quantity;
          const weight = product.publicPrice * quantity;
          const current = expanded.get(product.id);
          expanded.set(product.id, { product, quantity: (current?.quantity || 0) + quantity, weight: (current?.weight || 0) + weight });
        }
      }
    }
    if (saleAmount <= 0) throw new Error("Le montant de la commande est invalide.");

    const lines = [...expanded.values()];
    for (const { product, quantity } of lines) {
      if (product.stockQuantity <= 0 || quantity > product.stockQuantity) throw new Error(`${product.publicName || product.name} n’est plus disponible dans cette quantité.`);
    }
    const capturedItems = allocateSale(lines, saleAmount);
    const totalQuantity = capturedItems.reduce((sum, item) => sum + item.quantity, 0);
    const productCost = capturedItems.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
    const productLabel = labels.join(" + ").slice(0, 600);
    const onlyOffer = cart.length === 1 && cart[0].kind === "offer" ? offers.find((offer) => offer.id === cart[0].id)?.name || "" : "";

    const duplicate = await database.prepare(`
      SELECT orders.order_ref AS orderRef FROM orders
      JOIN customers ON customers.id = orders.customer_id
      WHERE customers.phone = ? AND orders.deleted_at IS NULL
        AND datetime(orders.created_at) >= datetime('now', '-2 minutes') AND orders.products = ?
      ORDER BY orders.id DESC LIMIT 1
    `).bind(phone, productLabel).first<{ orderRef: string }>();
    if (duplicate?.orderRef) return Response.json({ ok: true, orderRef: duplicate.orderRef, duplicate: true, total: saleAmount }, { headers: { "cache-control": "no-store" } });

    let customer = await database.prepare("SELECT id FROM customers WHERE phone = ? LIMIT 1").bind(phone).first<{ id: number }>();
    if (!customer) {
      await database.prepare("INSERT INTO customers (name, phone, city) VALUES (?, ?, ?)").bind(customerName, phone, city).run();
      customer = await database.prepare("SELECT id FROM customers WHERE phone = ? LIMIT 1").bind(phone).first<{ id: number }>();
    } else await database.prepare("UPDATE customers SET name = ?, city = ? WHERE id = ?").bind(customerName, city, customer.id).run();
    if (!customer) throw new Error("Impossible d’enregistrer vos coordonnées.");

    const now = new Date().toISOString();
    const orderRef = `MJ-W${Date.now().toString(36).slice(-5).toUpperCase()}${crypto.randomUUID().slice(0, 2).toUpperCase()}`;
    const attribution = [campaign, utmSource && `src:${utmSource}`, utmMedium && `med:${utmMedium}`].filter(Boolean).join(" · ").slice(0, 120);
    const noteSuffix = note ? `Note client: ${note}` : "";
    await database.batch([
      database.prepare(`
        INSERT INTO orders (
          order_ref, customer_id, product_id, city, address, products, quantity,
          sale_amount, product_cost, shipping_cost, ad_cost, fees, return_cost,
          return_reason, return_note, source, campaign, fulfillment_type, status,
          payment_status, carrier, tracking_number, carrier_dispatch_state,
          stock_deducted, items_json, pack_name, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, '', ?, 'Site web', ?, 'Livraison', 'En attente', 'À encaisser', 'Non affecté', '', 'À renseigner', 0, ?, ?, ?, ?)
      `).bind(orderRef, customer.id, city, address, productLabel, totalQuantity, saleAmount, productCost, noteSuffix.slice(0, 240), attribution, JSON.stringify(capturedItems), onlyOffer.slice(0, 100), now, now),
      database.prepare(`
        INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id, changed_by_name, changed_at)
        SELECT id, NULL, 'En attente', NULL, 'Boutique publique', ? FROM orders WHERE order_ref = ?
      `).bind(now, orderRef),
      database.prepare(`
        INSERT INTO audit_logs (user_id, username, display_name, action, entity_type, entity_id, entity_label, created_at)
        VALUES (NULL, 'storefront', 'Boutique publique', 'Commande web', 'Commande', NULL, ?, ?)
      `).bind(`${orderRef} · ${productLabel}`.slice(0, 300), now),
    ]);

    await notifyNewOrder(database);

    return Response.json({ ok: true, orderRef, total: saleAmount, payment: "Paiement à la livraison", message: "Commande reçue. Maison Jiya vous contactera pour confirmation." }, {
      status: 201,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    console.error("Maison Jiya public order failed", error);
    const message = error instanceof Error ? error.message : "Impossible d’enregistrer la commande.";
    const status = message.startsWith("Trop de tentatives") ? 429 : 400;
    return Response.json({ error: message }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
}
