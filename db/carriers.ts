import { and, eq, isNull } from "drizzle-orm";
import { getDb, getRawDb } from "./index";
import { customers, orders } from "./schema";

type CarrierSecrets = {
  FORCELOG_API_KEY?: string;
  SENDIT_PRIVATE_KEY?: string;
  SENDIT_PUBLIC_KEY?: string;
  SENDIT_WEBHOOK_SECRET?: string;
};

type JsonRecord = Record<string, unknown>;

export type CarrierRuntimeStatus = {
  forceLogApiConfigured: boolean;
  senditApiConfigured: boolean;
  senditWebhookConfigured: boolean;
};

export type CarrierDispatchResult = {
  attempted: boolean;
  message: string;
  success: boolean;
  trackingNumber?: string;
};

export type CarrierStatusUpdateResult = {
  duplicate: boolean;
  internalStatus: string | null;
  matched: boolean;
  updated: boolean;
};

const SENDIT_API_BASE = "https://app.sendit.ma/api/v1";
const FORCELOG_API_BASE = "https://api.forcelog.ma/customer";
const stockCommittedStatuses = new Set(["Confirmée", "Expédiée", "En livraison", "Livrée", "Retour"]);

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/[^a-z0-9]/g, "");
}

function carrierProvider(carrier: string): "forcelog" | "sendit" | null {
  const value = normalize(carrier);
  if (value.includes("forcelog")) return "forcelog";
  if (value.includes("sendit")) return "sendit";
  return null;
}

async function runtimeSecrets() {
  const { env } = await import("cloudflare:workers");
  return env as CloudflareEnv & CarrierSecrets;
}

export async function getCarrierRuntimeStatus(): Promise<CarrierRuntimeStatus> {
  const env = await runtimeSecrets();
  return {
    forceLogApiConfigured: Boolean(env.FORCELOG_API_KEY?.trim()),
    senditApiConfigured: Boolean(env.SENDIT_PUBLIC_KEY?.trim() && env.SENDIT_PRIVATE_KEY?.trim()),
    senditWebhookConfigured: Boolean(env.SENDIT_WEBHOOK_SECRET?.trim() || env.SENDIT_PRIVATE_KEY?.trim()),
  };
}

export async function getSenditWebhookSecret() {
  const env = await runtimeSecrets();
  return env.SENDIT_WEBHOOK_SECRET?.trim() || env.SENDIT_PRIVATE_KEY?.trim() || "";
}

async function smallJsonResponse(response: Response, provider: string) {
  const raw = await response.text();
  if (!response.ok) {
    const shortMessage = raw.replace(/\s+/g, " ").slice(0, 220);
    throw new Error(`${provider} a refusé la demande (${response.status})${shortMessage ? ` : ${shortMessage}` : ""}`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${provider} a renvoyé une réponse illisible.`);
  }
}

function deepValue(value: unknown, keys: Set<string>, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepValue(item, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  for (const [key, child] of Object.entries(record)) {
    if (keys.has(key.toLocaleLowerCase("en"))) return child;
  }
  for (const child of Object.values(record)) {
    const found = deepValue(child, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function numericValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function trackingFromResponse(payload: unknown, includeCode = false) {
  const keys = new Set(["tracking_number", "trackingnumber"]);
  if (includeCode) keys.add("code");
  const value = deepValue(payload, keys);
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function collectRecords(value: unknown, records: JsonRecord[], depth = 0) {
  if (depth > 6 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectRecords(item, records, depth + 1));
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  records.push(record);
  Object.values(record).forEach((child) => collectRecords(child, records, depth + 1));
}

function senditDistrictId(payload: unknown, city: string) {
  const target = normalize(city);
  const records: JsonRecord[] = [];
  collectRecords(payload, records);
  const candidates = records.map((record) => {
    const id = Number(record.id ?? record.district_id ?? record.districtId);
    const nestedCity = asRecord(record.city);
    const names = [record.name, record.label, record.city_name, record.cityName, nestedCity?.name]
      .filter((value): value is string => typeof value === "string")
      .map(normalize);
    return { id, names };
  }).filter((candidate) => Number.isInteger(candidate.id) && candidate.id > 0 && candidate.names.length > 0);
  return candidates.find((candidate) => candidate.names.includes(target))?.id
    ?? candidates.find((candidate) => candidate.names.some((name) => name.includes(target) || target.includes(name)))?.id
    ?? null;
}

async function senditToken(publicKey: string, privateKey: string) {
  const response = await fetch(`${SENDIT_API_BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ public_key: publicKey, secret_key: privateKey }),
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await smallJsonResponse(response, "Sendit");
  const token = deepValue(payload, new Set(["token"]));
  if (typeof token !== "string" || !token.trim()) throw new Error("Sendit n’a pas fourni de jeton de connexion.");
  return token.trim();
}

async function createSenditParcel(input: {
  address: string;
  city: string;
  customerName: string;
  orderRef: string;
  phone: string;
  products: string;
  saleAmount: number;
}, publicKey: string, privateKey: string) {
  const token = await senditToken(publicKey, privateKey);
  const authHeaders = { "accept": "application/json", "authorization": `Bearer ${token}` };
  const districtsResponse = await fetch(`${SENDIT_API_BASE}/districts`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(8_000),
  });
  const districts = await smallJsonResponse(districtsResponse, "Sendit");
  const districtId = senditDistrictId(districts, input.city);
  if (!districtId) throw new Error(`Ville « ${input.city} » introuvable dans la liste Sendit.`);
  const response = await fetch(`${SENDIT_API_BASE}/deliveries`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      district_id: districtId,
      name: input.customerName,
      amount: String(input.saleAmount),
      address: input.address,
      phone: input.phone,
      comment: `Commande ${input.orderRef}`,
      reference: input.orderRef,
      allow_open: 1,
      allow_try: 0,
      products_from_stock: 0,
      products: input.products,
      packaging_id: 1,
      option_exchange: 0,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await smallJsonResponse(response, "Sendit");
  const trackingNumber = trackingFromResponse(payload, true);
  if (!trackingNumber) throw new Error("Sendit n’a pas renvoyé de numéro de suivi.");
  const fee = numericValue(deepValue(payload, new Set(["fee", "delivery_fee", "deliveryfees"])));
  return { trackingNumber, fee };
}

async function createForceLogParcel(input: {
  address: string;
  city: string;
  customerName: string;
  orderRef: string;
  phone: string;
  products: string;
  saleAmount: number;
}, apiKey: string) {
  const response = await fetch(`${FORCELOG_API_BASE}/Parcels/AddParcel`, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({
      ORDER_NUM: input.orderRef,
      RECEIVER: input.customerName,
      PHONE: input.phone,
      CITY: input.city,
      ADDRESS: input.address,
      COMMENT: `Commande ${input.orderRef}`,
      PRODUCT_NATURE: input.products,
      COD: input.saleAmount,
      CAN_OPEN: true,
      STOCK: false,
      FRAGILE: false,
      CARTON: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await smallJsonResponse(response, "ForceLog");
  const trackingNumber = trackingFromResponse(payload);
  if (!trackingNumber) throw new Error("ForceLog n’a pas renvoyé de numéro de suivi.");
  return { trackingNumber, fee: 0 };
}

function shortError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "Erreur de connexion à l’agence.";
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function dispatchConfirmedOrder(orderId: number): Promise<CarrierDispatchResult> {
  const db = await getDb();
  const [order] = await db.select({
    id: orders.id,
    orderRef: orders.orderRef,
    address: orders.address,
    city: orders.city,
    customerName: customers.name,
    phone: customers.phone,
    products: orders.products,
    saleAmount: orders.saleAmount,
    shippingCost: orders.shippingCost,
    status: orders.status,
    carrier: orders.carrier,
    trackingNumber: orders.trackingNumber,
  }).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).where(and(eq(orders.id, orderId), isNull(orders.deletedAt))).limit(1);
  if (!order || order.status !== "Confirmée" || order.trackingNumber) return { attempted: false, success: true, message: "" };
  const provider = carrierProvider(order.carrier);
  if (!provider) return { attempted: false, success: true, message: "" };
  if (!order.address.trim()) return { attempted: false, success: false, message: "Ajoutez l’adresse de livraison pour envoyer la commande à l’agence." };
  if (!order.customerName || !order.phone) return { attempted: false, success: false, message: "Les coordonnées de la cliente sont incomplètes." };

  const env = await runtimeSecrets();
  try {
    let created: { fee: number; trackingNumber: string };
    if (provider === "sendit") {
      const publicKey = env.SENDIT_PUBLIC_KEY?.trim() || "";
      const privateKey = env.SENDIT_PRIVATE_KEY?.trim() || "";
      if (!publicKey || !privateKey) return { attempted: false, success: false, message: "Commande confirmée. Les clés Sendit doivent encore être ajoutées dans Cloudflare." };
      created = await createSenditParcel({ ...order, customerName: order.customerName, phone: order.phone }, publicKey, privateKey);
    } else {
      const apiKey = env.FORCELOG_API_KEY?.trim() || "";
      if (!apiKey) return { attempted: false, success: false, message: "Commande confirmée. La clé ForceLog doit encore être ajoutée dans Cloudflare." };
      created = await createForceLogParcel({ ...order, customerName: order.customerName, phone: order.phone }, apiKey);
    }

    const now = new Date().toISOString();
    const rawDb = await getRawDb();
    const eventHash = await sha256Hex(`${provider}:parcel.created:${order.id}:${created.trackingNumber}`);
    await rawDb.batch([
      rawDb.prepare("UPDATE orders SET tracking_number = ?, status = 'Expédiée', shipping_cost = CASE WHEN shipping_cost = 0 AND ? > 0 THEN ? ELSE shipping_cost END, updated_at = ? WHERE id = ? AND tracking_number = ''")
        .bind(created.trackingNumber, created.fee, created.fee, now, order.id),
      rawDb.prepare("INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_name, changed_at) VALUES (?, 'Confirmée', 'Expédiée', ?, ?)")
        .bind(order.id, `Automatisation ${order.carrier}`, now),
      rawDb.prepare("INSERT INTO audit_logs (username, display_name, action, entity_type, entity_id, entity_label, created_at) VALUES ('systeme', ?, 'Envoi automatique', 'Commande', ?, ?, ?)")
        .bind(order.carrier, String(order.id), `${order.orderRef} · ${created.trackingNumber}`, now),
      rawDb.prepare("INSERT OR IGNORE INTO carrier_events (provider, event_type, external_code, external_status, payload_hash, message, order_id, processed, received_at) VALUES (?, 'parcel.created', ?, 'CREATED', ?, ?, ?, 1, ?)")
        .bind(provider, created.trackingNumber, eventHash, `Commande ${order.orderRef} créée automatiquement`, order.id, now),
    ]);
    return { attempted: true, success: true, trackingNumber: created.trackingNumber, message: `Commande envoyée automatiquement à ${order.carrier} · suivi ${created.trackingNumber}.` };
  } catch (error) {
    const message = shortError(error);
    const rawDb = await getRawDb();
    const now = new Date().toISOString();
    const eventHash = await sha256Hex(`${provider}:dispatch.error:${order.id}:${now}`);
    await rawDb.prepare("INSERT OR IGNORE INTO carrier_events (provider, event_type, external_code, external_status, payload_hash, message, order_id, processed, error_message, received_at) VALUES (?, 'parcel.create.error', ?, 'ERROR', ?, ?, ?, 0, ?, ?)")
      .bind(provider, order.orderRef, eventHash, `Échec de l’envoi automatique de ${order.orderRef}`, order.id, message, now).run();
    return { attempted: true, success: false, message: `Commande enregistrée, mais l’envoi à ${order.carrier} a échoué : ${message}` };
  }
}

export function mapSenditStatus(externalStatus: string) {
  const status = externalStatus.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (["DELIVERED", "LIVRE", "LIVREE"].includes(status)) return "Livrée";
  if (status.includes("RETURN") || status.includes("RETOUR") || status.includes("REFUS")) return "Retour";
  if (status.includes("CANCEL")) return "Annulée";
  if (["PENDING", "NEW", "NEW_PARCEL", "WAITING_PICKUP"].includes(status)) return "Expédiée";
  if (["PICKED_UP", "IN_PROGRESS", "IN_TRANSIT", "OUT_FOR_DELIVERY", "POSTPONED", "UNREACHABLE", "DISTRIBUTION"].includes(status)) return "En livraison";
  return null;
}

export async function applySenditStatusUpdate(input: {
  code: string;
  event: string;
  lastActionAt: string;
  message: string;
  newStatus: string;
  payloadHash: string;
  proofImage: string;
}): Promise<CarrierStatusUpdateResult> {
  const rawDb = await getRawDb();
  const receivedAt = new Date().toISOString();
  const inserted = await rawDb.prepare("INSERT OR IGNORE INTO carrier_events (provider, event_type, external_code, external_status, payload_hash, message, proof_image, occurred_at, processed, received_at) VALUES ('sendit', ?, ?, ?, ?, ?, ?, ?, 0, ?)")
    .bind(input.event, input.code, input.newStatus, input.payloadHash, input.message, input.proofImage, input.lastActionAt || null, receivedAt).run();
  if ((inserted.meta.changes ?? 0) === 0) return { duplicate: true, internalStatus: mapSenditStatus(input.newStatus), matched: true, updated: false };

  const order = await rawDb.prepare(`SELECT id, order_ref AS orderRef, product_id AS productId, quantity, status, stock_deducted AS stockDeducted
    FROM orders WHERE tracking_number = ? AND deleted_at IS NULL AND lower(replace(carrier, ' ', '')) LIKE '%sendit%' LIMIT 1`).bind(input.code).first<{
      id: number;
      orderRef: string;
      productId: number | null;
      quantity: number;
      status: string;
      stockDeducted: number;
    }>();
  if (!order) {
    await rawDb.prepare("UPDATE carrier_events SET error_message = 'Commande introuvable' WHERE payload_hash = ?").bind(input.payloadHash).run();
    return { duplicate: false, internalStatus: mapSenditStatus(input.newStatus), matched: false, updated: false };
  }
  const nextStatus = mapSenditStatus(input.newStatus);
  if (!nextStatus) {
    await rawDb.prepare("UPDATE carrier_events SET order_id = ?, error_message = 'Statut Sendit non reconnu' WHERE payload_hash = ?").bind(order.id, input.payloadHash).run();
    return { duplicate: false, internalStatus: null, matched: true, updated: false };
  }
  if (order.status === nextStatus) {
    await rawDb.prepare("UPDATE carrier_events SET order_id = ?, processed = 1 WHERE payload_hash = ?").bind(order.id, input.payloadHash).run();
    return { duplicate: false, internalStatus: nextStatus, matched: true, updated: false };
  }

  const shouldDeduct = Boolean(order.productId && !order.stockDeducted && stockCommittedStatuses.has(nextStatus));
  const shouldRestore = Boolean(order.productId && order.stockDeducted && !stockCommittedStatuses.has(nextStatus));
  if (shouldDeduct && order.productId) {
    const product = await rawDb.prepare("SELECT stock_quantity AS stockQuantity FROM products WHERE id = ?").bind(order.productId).first<{ stockQuantity: number }>();
    if (!product || product.stockQuantity < order.quantity) {
      await rawDb.prepare("UPDATE carrier_events SET order_id = ?, error_message = 'Stock insuffisant' WHERE payload_hash = ?").bind(order.id, input.payloadHash).run();
      return { duplicate: false, internalStatus: nextStatus, matched: true, updated: false };
    }
  }

  const statements = [
    rawDb.prepare("UPDATE orders SET status = ?, stock_deducted = ?, return_reason = CASE WHEN ? = 'Retour' AND return_reason = '' THEN 'Autre' ELSE return_reason END, return_note = CASE WHEN ? = 'Retour' AND return_note = '' THEN ? ELSE return_note END, updated_at = ? WHERE id = ?")
      .bind(nextStatus, order.productId ? (stockCommittedStatuses.has(nextStatus) ? 1 : 0) : order.stockDeducted, nextStatus, nextStatus, input.message.slice(0, 240), receivedAt, order.id),
    rawDb.prepare("INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_name, changed_at) VALUES (?, ?, ?, 'Sendit automatique', ?)")
      .bind(order.id, order.status, nextStatus, receivedAt),
    rawDb.prepare("INSERT INTO audit_logs (username, display_name, action, entity_type, entity_id, entity_label, created_at) VALUES ('sendit', 'Sendit automatique', 'Statut reçu', 'Commande', ?, ?, ?)")
      .bind(String(order.id), `${order.orderRef} · ${input.newStatus}`, receivedAt),
    rawDb.prepare("UPDATE carrier_events SET order_id = ?, processed = 1 WHERE payload_hash = ?").bind(order.id, input.payloadHash),
  ];
  if (shouldDeduct && order.productId) {
    statements.push(
      rawDb.prepare("UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?").bind(order.quantity, order.productId),
      rawDb.prepare("INSERT INTO stock_movements (product_id, order_id, movement_type, quantity, note, created_at) VALUES (?, ?, 'Commande', ?, ?, ?)")
        .bind(order.productId, order.id, order.quantity, `Déduction automatique Sendit · ${order.orderRef}`, receivedAt),
    );
  } else if (shouldRestore && order.productId) {
    statements.push(
      rawDb.prepare("UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?").bind(order.quantity, order.productId),
      rawDb.prepare("INSERT INTO stock_movements (product_id, order_id, movement_type, quantity, note, created_at) VALUES (?, ?, 'Réintégration', ?, ?, ?)")
        .bind(order.productId, order.id, order.quantity, `Réintégration automatique Sendit · ${order.orderRef}`, receivedAt),
    );
  }
  await rawDb.batch(statements);
  return { duplicate: false, internalStatus: nextStatus, matched: true, updated: true };
}
