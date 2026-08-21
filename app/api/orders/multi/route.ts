import { getAuthenticatedUser } from "../../../auth";
import { getRawDb } from "../../../../db";
import { moroccanPhoneHelp, normalizeMoroccanPhone } from "../../../../db/phone";
import { ensurePlatformUpgrades } from "../../../../db/platform-upgrades";

type CatalogProduct = {
  id: number;
  productCode: string;
  name: string;
  purchasePrice: number;
  salePrice: number;
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

const statuses = ["En attente", "Confirmée", "Expédiée", "En livraison", "Livrée", "Retour", "Annulée"];
const sources = ["WhatsApp", "Instagram", "Facebook", "TikTok", "Site web", "Magasin physique", "Autre", "Non renseignée"];
const stockCommittedStatuses = new Set(["Confirmée", "Expédiée", "En livraison", "Livrée", "Retour"]);
const returnReasons = ["Cliente injoignable", "Refus de la cliente", "Adresse incorrecte", "Cliente absente", "Produit endommagé", "Mauvais produit", "Autre"];

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function positiveInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function money(value: unknown, fallback = 0) {
  const parsed = typeof value === "string" ? Number(value.trim().replace(/\s/g, "").replace(",", ".")) : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : fallback;
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function parseRequestedItems(value: unknown) {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { parsed = []; }
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 20) {
    throw new Error("Sélectionnez entre 1 et 20 lignes produit pour cette commande.");
  }
  const quantities = new Map<number, number>();
  for (const raw of parsed) {
    const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const productId = positiveInt(row.productId);
    const quantity = positiveInt(row.quantity);
    if (!productId || quantity < 1 || quantity > 999) throw new Error("Un produit ou une quantité de la commande est invalide.");
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  return [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

function allocateSale(items: Array<{ product: CatalogProduct; quantity: number }>, saleAmount: number) {
  const weights = items.map(({ product, quantity }) => product.salePrice * quantity);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let allocated = 0;
  return items.map(({ product, quantity }, index): CapturedItem => {
    const lineSaleAmount = index === items.length - 1
      ? Math.round((saleAmount - allocated) * 100) / 100
      : Math.round((totalWeight ? saleAmount * (weights[index] / totalWeight) : saleAmount / items.length) * 100) / 100;
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

async function syncGoogleSheets(database: D1Database) {
  try {
    const row = await database.prepare("SELECT value FROM settings WHERE key = 'security_backup_webhook_url' LIMIT 1").first<{ value: string }>();
    if (!row?.value) return;
    const url = new URL(row.value);
    if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)) return;
    await fetch(url.toString(), { method: "POST", redirect: "manual", signal: AbortSignal.timeout(3500), headers: { "user-agent": "Maison-Jiya-Backup/1.0" } });
  } catch (error) {
    console.error("Maison Jiya order Sheets sync failed", error);
  }
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: "Origine de la requête refusée." }, { status: 403 });
  const user = await getAuthenticatedUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (!["admin", "editor"].includes(user.role)) return Response.json({ error: "Votre compte est en lecture seule." }, { status: 403 });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Commande invalide." }, { status: 400 });
  }

  try {
    const requestedItems = parseRequestedItems(payload.items);
    const database = await getRawDb();
    await ensurePlatformUpgrades(database);

    const placeholders = requestedItems.map(() => "?").join(", ");
    const productRows = (await database.prepare(`
      SELECT id, product_code AS productCode, name, purchase_price AS purchasePrice,
             sale_price AS salePrice, stock_quantity AS stockQuantity
      FROM products WHERE id IN (${placeholders})
    `).bind(...requestedItems.map((item) => item.productId)).all<CatalogProduct>()).results;
    if (productRows.length !== requestedItems.length) throw new Error("Un des produits sélectionnés n’existe plus dans le catalogue.");
    const byId = new Map(productRows.map((product) => [product.id, product]));
    const lines = requestedItems.map((item) => ({ product: byId.get(item.productId)!, quantity: item.quantity }));

    const fulfillmentType = text(payload.fulfillmentType) === "Magasin physique" ? "Magasin physique" : "Livraison";
    const isStoreSale = fulfillmentType === "Magasin physique";
    const customerName = text(payload.customerName).slice(0, 160);
    const phone = normalizeMoroccanPhone(text(payload.phone));
    const city = text(payload.city, isStoreSale ? "Casablanca" : "").slice(0, 120);
    const address = isStoreSale ? "Magasin Maison Jiya" : text(payload.address).slice(0, 300);
    if (!phone) return Response.json({ error: moroccanPhoneHelp }, { status: 400 });
    if (!customerName || !city || (!isStoreSale && !address)) throw new Error("Cliente, téléphone, ville et adresse sont obligatoires.");

    const statusCandidate = isStoreSale ? "Livrée" : text(payload.status, "En attente");
    const status = statuses.includes(statusCandidate) ? statusCandidate : "En attente";
    const returnReason = status === "Retour" && returnReasons.includes(text(payload.returnReason)) ? text(payload.returnReason) : "";
    const returnNote = status === "Retour" ? text(payload.returnNote).slice(0, 240) : "";
    if (status === "Retour" && !returnReason) throw new Error("Choisissez le motif du retour.");
    if (returnReason === "Autre" && !returnNote) throw new Error("Précisez le motif du retour.");

    if (stockCommittedStatuses.has(status)) {
      for (const { product, quantity } of lines) {
        if (quantity > product.stockQuantity) {
          return Response.json({ error: `Stock insuffisant pour ${product.name} : ${product.stockQuantity} unité(s) disponible(s).` }, { status: 409 });
        }
      }
    }

    const catalogTotal = lines.reduce((sum, { product, quantity }) => sum + product.salePrice * quantity, 0);
    const saleAmount = money(payload.saleAmount, catalogTotal);
    const capturedItems = allocateSale(lines, saleAmount);
    const totalQuantity = capturedItems.reduce((sum, item) => sum + item.quantity, 0);
    const productCost = capturedItems.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);
    const rawPackName = text(payload.packName).replace(/\s+/g, " ").slice(0, 100);
    const packEnabled = payload.isPack === true || text(payload.isPack) === "true";
    const packName = packEnabled && capturedItems.length > 1 ? (rawPackName || "Pack") : "";
    const itemSummary = capturedItems.map((item) => `${item.name} ×${item.quantity}`).join(" + ");
    const productLabel = packName ? `${packName} · ${itemSummary}` : itemSummary;

    let customer = await database.prepare("SELECT id FROM customers WHERE phone = ? LIMIT 1").bind(phone).first<{ id: number }>();
    if (!customer) {
      await database.prepare("INSERT INTO customers (name, phone, city) VALUES (?, ?, ?)").bind(customerName, phone, city).run();
      customer = await database.prepare("SELECT id FROM customers WHERE phone = ? LIMIT 1").bind(phone).first<{ id: number }>();
    } else {
      await database.prepare("UPDATE customers SET name = ?, city = ? WHERE id = ?").bind(customerName, city, customer.id).run();
    }
    if (!customer) throw new Error("Création du client impossible.");

    const sourceCandidate = isStoreSale ? "Magasin physique" : text(payload.source, "Non renseignée");
    const source = sources.includes(sourceCandidate) ? sourceCandidate : "Non renseignée";
    const campaignRaw = text(payload.campaign).slice(0, 120);
    const campaign = isStoreSale || campaignRaw === "Aucune campagne" ? "" : campaignRaw;

    const manualCarrier = text(payload.carrierManual).replace(/\s+/g, " ").slice(0, 80);
    const carrier = isStoreSale ? "Magasin physique" : (manualCarrier || text(payload.carrier, "Non affecté").slice(0, 80));
    const shippingCost = isStoreSale ? 0 : money(payload.shippingCostManual, money(payload.shippingCost));
    const trackingNumber = isStoreSale ? "" : text(payload.trackingNumberManual, text(payload.trackingNumber)).slice(0, 120);
    const adCost = money(payload.adCost);
    const fees = money(payload.fees);
    const paymentStatus = isStoreSale ? "Encaissé" : "À encaisser";
    const dispatchState = isStoreSale ? "Non requis" : manualCarrier ? "Enregistré manuellement" : "À autoriser";
    const now = new Date().toISOString();
    const paidAt = isStoreSale ? now : null;
    const orderRef = `MJ-${Date.now().toString(36).slice(-5).toUpperCase()}${crypto.randomUUID().slice(0, 2).toUpperCase()}`;

    const columns = [
      "order_ref", "customer_id", "product_id", "city", "address", "products", "quantity", "sale_amount", "product_cost",
      "shipping_cost", "ad_cost", "fees", "return_cost", "return_reason", "return_note", "source", "campaign", "fulfillment_type",
      "status", "payment_status", "carrier", "tracking_number", "carrier_dispatch_state", "stock_deducted", "paid_at", "items_json", "pack_name", "updated_at",
    ];
    const values: Array<string | number | null> = [
      orderRef, customer.id, null, city, address, productLabel, totalQuantity, saleAmount, productCost,
      shippingCost, adCost, fees, 0, returnReason, returnNote, source, campaign, fulfillmentType,
      status, paymentStatus, carrier || "Non affecté", trackingNumber, dispatchState, 0, paidAt, JSON.stringify(capturedItems), packName, now,
    ];
    const statements: D1PreparedStatement[] = [
      database.prepare(`INSERT INTO orders (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).bind(...values),
      database.prepare(`
        INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id, changed_by_name, changed_at)
        SELECT id, NULL, ?, ?, ?, ? FROM orders WHERE order_ref = ?
      `).bind(status, user.id, user.displayName, now, orderRef),
      database.prepare(`
        INSERT INTO audit_logs (user_id, username, display_name, action, entity_type, entity_id, entity_label, created_at)
        VALUES (?, ?, ?, 'Ajout', 'Commande', NULL, ?, ?)
      `).bind(user.id, user.username, user.displayName, `${orderRef} · ${productLabel}`, now),
    ];
    if (stockCommittedStatuses.has(status)) statements.push(database.prepare("UPDATE orders SET stock_deducted = 1 WHERE order_ref = ?").bind(orderRef));

    try {
      await database.batch(statements);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLocaleLowerCase("fr").includes("stock insuffisant")) {
        return Response.json({ error: "Stock insuffisant pour au moins un article. Actualisez le catalogue puis réessayez." }, { status: 409 });
      }
      throw error;
    }

    await syncGoogleSheets(database);
    return Response.json({ ok: true, orderRef, products: productLabel, totalQuantity, productCost, carrier, shippingCost, trackingNumber });
  } catch (error) {
    console.error("Maison Jiya order creation failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Création de la commande impossible." }, { status: 400 });
  }
}
