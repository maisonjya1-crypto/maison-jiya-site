import { getRawDb } from "../../../../db";
import { normalizeMoroccanPhone } from "../../../../db/phone";
import { ensurePlatformUpgrades } from "../../../../db/platform-upgrades";

type RequestedItem = { productId: number; quantity: number };
type ProductRow = {
  id: number;
  productCode: string;
  name: string;
  salePrice: number;
  purchasePrice: number;
  stockQuantity: number;
};

type CapturedItem = {
  productId: number;
  productCode: string;
  name: string;
  quantity: number;
  unitCost: number;
  catalogUnitPrice: number;
  lineSaleAmount: number;
};

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function parseItems(value: unknown): RequestedItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new Error("Votre panier est invalide.");
  const grouped = new Map<number, number>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") throw new Error("Votre panier est invalide.");
    const row = raw as Record<string, unknown>;
    const productId = Number(row.productId);
    const quantity = Number(row.quantity);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new Error("Un article du panier est invalide.");
    }
    grouped.set(productId, (grouped.get(productId) || 0) + quantity);
  }
  const items = [...grouped.entries()].map(([productId, quantity]) => ({ productId, quantity }));
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
  if (!freshWindow && Number(row?.requestCount || 0) >= 5) {
    throw new Error("Trop de tentatives. Réessayez dans quelques minutes.");
  }

  if (freshWindow) {
    await database.prepare(`
      INSERT INTO storefront_rate_limits (key_hash, window_started_at, request_count, updated_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(key_hash) DO UPDATE SET window_started_at = excluded.window_started_at, request_count = 1, updated_at = CURRENT_TIMESTAMP
    `).bind(keyHash, new Date(now).toISOString()).run();
  } else {
    await database.prepare("UPDATE storefront_rate_limits SET request_count = request_count + 1, updated_at = CURRENT_TIMESTAMP WHERE key_hash = ?")
      .bind(keyHash).run();
  }
}

function allocateSale(items: Array<{ product: ProductRow; quantity: number }>, total: number): CapturedItem[] {
  const weights = items.map(({ product, quantity }) => product.salePrice * quantity);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  let allocated = 0;
  return items.map(({ product, quantity }, index) => {
    const lineSaleAmount = index === items.length - 1
      ? Math.round((total - allocated) * 100) / 100
      : Math.round((weightTotal ? total * (weights[index] / weightTotal) : total / items.length) * 100) / 100;
    allocated += lineSaleAmount;
    return {
      productId: product.id,
      productCode: product.productCode,
      name: product.name,
      quantity,
      unitCost: product.purchasePrice,
      catalogUnitPrice: product.salePrice,
      lineSaleAmount,
    };
  });
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: "Requête refusée." }, { status: 403 });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Commande invalide." }, { status: 400 });
  }

  try {
    if (text(payload.website, 100)) return Response.json({ ok: true, orderRef: "" });

    const database = await getRawDb();
    await ensurePlatformUpgrades(database);
    await enforceRateLimit(database, request);

    const items = parseItems(payload.items);
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

    const placeholders = items.map(() => "?").join(", ");
    const rows = (await database.prepare(`
      SELECT id, product_code AS productCode, name,
             sale_price AS salePrice, purchase_price AS purchasePrice,
             stock_quantity AS stockQuantity
      FROM products
      WHERE id IN (${placeholders})
    `).bind(...items.map((item) => item.productId)).all<ProductRow>()).results;
    if (rows.length !== items.length) throw new Error("Un article du panier n’est plus disponible.");

    const byId = new Map(rows.map((product) => [product.id, product]));
    const lines = items.map((item) => ({ product: byId.get(item.productId)!, quantity: item.quantity }));
    for (const { product, quantity } of lines) {
      if (product.stockQuantity <= 0 || quantity > product.stockQuantity) {
        throw new Error(`${product.name} n’est plus disponible dans cette quantité.`);
      }
    }

    const saleAmount = lines.reduce((sum, { product, quantity }) => sum + product.salePrice * quantity, 0);
    if (saleAmount <= 0) throw new Error("Le montant de la commande est invalide.");
    const capturedItems = allocateSale(lines, saleAmount);
    const totalQuantity = capturedItems.reduce((sum, item) => sum + item.quantity, 0);
    const productCost = capturedItems.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
    const productLabel = capturedItems.map((item) => `${item.name} ×${item.quantity}`).join(" + ");

    const duplicate = await database.prepare(`
      SELECT orders.order_ref AS orderRef
      FROM orders
      JOIN customers ON customers.id = orders.customer_id
      WHERE customers.phone = ?
        AND orders.deleted_at IS NULL
        AND orders.created_at >= datetime('now', '-2 minutes')
        AND orders.products = ?
      ORDER BY orders.id DESC
      LIMIT 1
    `).bind(phone, productLabel).first<{ orderRef: string }>();
    if (duplicate?.orderRef) {
      return Response.json({ ok: true, orderRef: duplicate.orderRef, duplicate: true }, { headers: { "cache-control": "no-store" } });
    }

    let customer = await database.prepare("SELECT id FROM customers WHERE phone = ? LIMIT 1").bind(phone).first<{ id: number }>();
    if (!customer) {
      await database.prepare("INSERT INTO customers (name, phone, city) VALUES (?, ?, ?)").bind(customerName, phone, city).run();
      customer = await database.prepare("SELECT id FROM customers WHERE phone = ? LIMIT 1").bind(phone).first<{ id: number }>();
    } else {
      await database.prepare("UPDATE customers SET name = ?, city = ? WHERE id = ?").bind(customerName, city, customer.id).run();
    }
    if (!customer) throw new Error("Impossible d’enregistrer vos coordonnées.");

    const now = new Date().toISOString();
    const orderRef = `MJ-W${Date.now().toString(36).slice(-5).toUpperCase()}${crypto.randomUUID().slice(0, 2).toUpperCase()}`;
    const attribution = [campaign, utmSource && `src:${utmSource}`, utmMedium && `med:${utmMedium}`].filter(Boolean).join(" · ").slice(0, 120);
    const noteSuffix = note ? ` · Note client: ${note}` : "";

    await database.batch([
      database.prepare(`
        INSERT INTO orders (
          order_ref, customer_id, product_id, city, address, products, quantity,
          sale_amount, product_cost, shipping_cost, ad_cost, fees, return_cost,
          return_reason, return_note, source, campaign, fulfillment_type, status,
          payment_status, carrier, tracking_number, carrier_dispatch_state,
          stock_deducted, items_json, pack_name, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, '', ?, 'Site web', ?, 'Livraison', 'En attente', 'À encaisser', 'Non affecté', '', 'À renseigner', 0, ?, '', ?, ?)
      `).bind(
        orderRef,
        customer.id,
        city,
        address,
        productLabel,
        totalQuantity,
        saleAmount,
        productCost,
        noteSuffix.slice(0, 240),
        attribution,
        JSON.stringify(capturedItems),
        now,
        now,
      ),
      database.prepare(`
        INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id, changed_by_name, changed_at)
        SELECT id, NULL, 'En attente', NULL, 'Boutique publique', ? FROM orders WHERE order_ref = ?
      `).bind(now, orderRef),
      database.prepare(`
        INSERT INTO audit_logs (user_id, username, display_name, action, entity_type, entity_id, entity_label, created_at)
        VALUES (NULL, 'storefront', 'Boutique publique', 'Commande web', 'Commande', NULL, ?, ?)
      `).bind(`${orderRef} · ${productLabel}`.slice(0, 300), now),
    ]);

    return Response.json({
      ok: true,
      orderRef,
      total: saleAmount,
      payment: "Paiement à la livraison",
      message: "Commande reçue. Maison Jiya vous contactera pour confirmation.",
    }, {
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
