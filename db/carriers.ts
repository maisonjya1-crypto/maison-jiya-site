import { and, eq, isNull } from "drizzle-orm";
import { getDb, getRawDb } from "./index";
import { reconcileOrderAllocations } from "./allocations";
import { moroccanPhoneHelp, normalizeMoroccanPhone } from "./phone";
import { customers, orders } from "./schema";
import { normalizeOrderPaymentState, type OrderPaymentStatus } from "../lib/order-payment-lifecycle";

type CarrierSecrets = {
  FORCELOG_API_KEY?: string;
  SENDIT_PRIVATE_KEY?: string;
  SENDIT_PUBLIC_KEY?: string;
  SENDIT_WEBHOOK_SECRET?: string;
};

type JsonRecord = Record<string, unknown>;

export type CarrierRuntimeStatus = {
  forceLogApiConfigured: boolean;
  forceLogApiVerified: boolean;
  forceLogApiCheckedAt: string;
  forceLogApiLastError: string;
  senditApiConfigured: boolean;
  senditApiVerified: boolean;
  senditApiCheckedAt: string;
  senditApiLastError: string;
  senditWebhookConfigured: boolean;
  senditWebhookVerifiedAt: string;
};

export type CarrierSyncResult = {
  forceLog: { configured: boolean; verified: boolean; error: string };
  sendit: { configured: boolean; verified: boolean; error: string };
  updated: number;
};

export type CarrierDispatchResult = {
  attempted: boolean;
  message: string;
  success: boolean;
  trackingNumber?: string;
};

export type CarrierQuote = {
  available: boolean;
  carrier: "Sendit" | "ForceLog";
  error?: string;
  fee: number | null;
};

export type CarrierQuoteResult = {
  pickupCity: "Casablanca";
  quotes: CarrierQuote[];
  recommendedCarrier: "Sendit" | "ForceLog" | null;
};

export type CarrierStatusUpdateResult = {
  duplicate: boolean;
  internalStatus: string | null;
  matched: boolean;
  updated: boolean;
};

const SENDIT_API_BASE = "https://app.sendit.ma/api/v1";
const FORCELOG_API_BASE = "https://api.forcelog.ma/customer";
const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;
const CONNECTION_HEALTH_MAX_AGE_MS = 2 * 60 * 60 * 1000;
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

function healthIsFresh(checkedAt: string) {
  const timestamp = Date.parse(checkedAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= CONNECTION_HEALTH_MAX_AGE_MS;
}

async function recordCarrierHealth(provider: "sendit" | "forcelog", verified: boolean, error = "") {
  const database = await getRawDb();
  const checkedAt = new Date().toISOString();
  const prefix = `carrier_health_${provider}`;
  const values = [
    [`${prefix}_status`, verified ? "verified" : "error"],
    [`${prefix}_checked_at`, checkedAt],
    [`${prefix}_last_error`, verified ? "" : error.slice(0, 300)],
  ] as const;
  await database.batch(values.map(([key, value]) => database.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, value, checkedAt)));
}

export async function getCarrierRuntimeStatus(): Promise<CarrierRuntimeStatus> {
  const env = await runtimeSecrets();
  const database = await getRawDb();
  const healthRows = (await database.prepare(`
    SELECT key, value
    FROM settings
    WHERE key LIKE 'carrier_health_%'
  `).all<{ key: string; value: string }>()).results;
  const health = Object.fromEntries(healthRows.map((row) => [row.key, row.value]));
  const webhook = await database.prepare(`
    SELECT received_at AS receivedAt
    FROM carrier_events
    WHERE provider = 'sendit' AND event_type = 'delivery.status.update'
    ORDER BY received_at DESC
    LIMIT 1
  `).first<{ receivedAt: string }>();
  const forceLogApiConfigured = Boolean(env.FORCELOG_API_KEY?.trim());
  const senditApiConfigured = Boolean(env.SENDIT_PUBLIC_KEY?.trim() && env.SENDIT_PRIVATE_KEY?.trim());
  const senditWebhookConfigured = Boolean(env.SENDIT_WEBHOOK_SECRET?.trim() || env.SENDIT_PRIVATE_KEY?.trim());
  const forceLogApiCheckedAt = health.carrier_health_forcelog_checked_at || "";
  const senditApiCheckedAt = health.carrier_health_sendit_checked_at || "";
  return {
    forceLogApiConfigured,
    forceLogApiVerified: forceLogApiConfigured && health.carrier_health_forcelog_status === "verified" && healthIsFresh(forceLogApiCheckedAt),
    forceLogApiCheckedAt,
    forceLogApiLastError: health.carrier_health_forcelog_last_error || "",
    senditApiConfigured,
    senditApiVerified: senditApiConfigured && health.carrier_health_sendit_status === "verified" && healthIsFresh(senditApiCheckedAt),
    senditApiCheckedAt,
    senditApiLastError: health.carrier_health_sendit_last_error || "",
    senditWebhookConfigured,
    senditWebhookVerifiedAt: senditWebhookConfigured ? webhook?.receivedAt || "" : "",
  };
}

export async function getSenditWebhookSecret() {
  const env = await runtimeSecrets();
  return env.SENDIT_WEBHOOK_SECRET?.trim() || env.SENDIT_PRIVATE_KEY?.trim() || "";
}

async function boundedText(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PROVIDER_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Réponse de l’agence trop volumineuse.");
    }
    raw += decoder.decode(value, { stream: true });
  }
  return raw + decoder.decode();
}

async function smallJsonResponse(response: Response, provider: string) {
  const raw = await boundedText(response);
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

function decimalValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
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

function senditDistrict(payload: unknown, city: string) {
  const target = normalize(city);
  const records: JsonRecord[] = [];
  collectRecords(payload, records);
  const candidates = records.map((record) => {
    const id = Number(record.id ?? record.district_id ?? record.districtId);
    const nestedCity = asRecord(record.city);
    const names = [record.name, record.label, record.city_name, record.cityName, nestedCity?.name]
      .filter((value): value is string => typeof value === "string")
      .map(normalize);
    return { id, names, fee: decimalValue(record.price ?? record.fee) };
  }).filter((candidate) => Number.isInteger(candidate.id) && candidate.id > 0 && candidate.names.length > 0);
  return candidates.find((candidate) => candidate.names.includes(target))
    ?? candidates.find((candidate) => candidate.names.some((name) => name.includes(target) || target.includes(name)))
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
  const phone = normalizeMoroccanPhone(input.phone);
  if (!phone) throw new Error(moroccanPhoneHelp);
  const token = await senditToken(publicKey, privateKey);
  const authHeaders = { "accept": "application/json", "authorization": `Bearer ${token}` };
  const districtsResponse = await fetch(`${SENDIT_API_BASE}/districts?querystring=${encodeURIComponent(input.city)}&pickup-district=46`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(8_000),
  });
  const districts = await smallJsonResponse(districtsResponse, "Sendit");
  const district = senditDistrict(districts, input.city);
  if (!district) throw new Error(`Ville « ${input.city} » introuvable dans la liste Sendit.`);
  const response = await fetch(`${SENDIT_API_BASE}/deliveries`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      district_id: district.id,
      name: input.customerName,
      amount: String(input.saleAmount),
      address: input.address,
      phone,
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
  const fee = numericValue(deepValue(payload, new Set(["fee", "delivery_fee", "deliveryfees"]))) || district.fee || 0;
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
  const phone = normalizeMoroccanPhone(input.phone);
  if (!phone) throw new Error(moroccanPhoneHelp);
  const response = await fetch(`${FORCELOG_API_BASE}/Parcels/AddParcel`, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({
      ORDER_NUM: input.orderRef.slice(0, 20),
      RECEIVER: input.customerName.slice(0, 50),
      PHONE: phone,
      CITY: input.city.slice(0, 50),
      ADDRESS: input.address.slice(0, 100),
      COMMENT: `Commande ${input.orderRef}`,
      PRODUCT_NATURE: input.products.slice(0, 100),
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

async function quoteSendit(city: string, publicKey: string, privateKey: string): Promise<CarrierQuote> {
  try {
    const token = await senditToken(publicKey, privateKey);
    const response = await fetch(`${SENDIT_API_BASE}/districts?querystring=${encodeURIComponent(city)}&pickup-district=46`, {
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    const district = senditDistrict(await smallJsonResponse(response, "Sendit"), city);
    if (!district || district.fee === null) throw new Error(`Tarif indisponible pour « ${city} ».`);
    return { carrier: "Sendit", fee: district.fee, available: true };
  } catch (error) {
    return { carrier: "Sendit", fee: null, available: false, error: shortError(error) };
  }
}

async function quoteForceLog(city: string, apiKey: string): Promise<CarrierQuote> {
  try {
    const response = await fetch(`${FORCELOG_API_BASE}/Cities`, {
      headers: { accept: "application/json", "X-API-Key": apiKey },
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await smallJsonResponse(response, "ForceLog");
    const records: JsonRecord[] = [];
    collectRecords(payload, records);
    const target = normalize(city);
    const candidates = records.map((record) => ({
      name: typeof record.NAME === "string" ? record.NAME : typeof record.name === "string" ? record.name : "",
      regularFee: decimalValue(record.D_FEES ?? record.delivery_fees),
      sameCityFee: decimalValue(record.D_FEES_SAME_CITY ?? record.delivery_fees_same_city),
    })).filter((record) => record.name);
    const match = candidates.find((candidate) => normalize(candidate.name) === target)
      ?? candidates.find((candidate) => normalize(candidate.name).includes(target) || target.includes(normalize(candidate.name)));
    if (!match) throw new Error(`Ville « ${city} » introuvable dans la liste ForceLog.`);
    const fee = normalize(city) === normalize("Casablanca") ? match.sameCityFee ?? match.regularFee : match.regularFee;
    if (fee === null) throw new Error(`Tarif indisponible pour « ${city} ».`);
    return { carrier: "ForceLog", fee, available: true };
  } catch (error) {
    return { carrier: "ForceLog", fee: null, available: false, error: shortError(error) };
  }
}

export async function quoteCarrierRates(city: string): Promise<CarrierQuoteResult> {
  const cleanCity = city.trim().slice(0, 100);
  if (!cleanCity) throw new Error("Indiquez la ville de destination.");
  const env = await runtimeSecrets();
  const senditPublic = env.SENDIT_PUBLIC_KEY?.trim() || "";
  const senditPrivate = env.SENDIT_PRIVATE_KEY?.trim() || "";
  const forceLogKey = env.FORCELOG_API_KEY?.trim() || "";
  const [sendit, forceLog] = await Promise.all([
    senditPublic && senditPrivate
      ? quoteSendit(cleanCity, senditPublic, senditPrivate)
      : Promise.resolve<CarrierQuote>({ carrier: "Sendit", fee: null, available: false, error: "Clés Sendit non configurées." }),
    forceLogKey
      ? quoteForceLog(cleanCity, forceLogKey)
      : Promise.resolve<CarrierQuote>({ carrier: "ForceLog", fee: null, available: false, error: "Clé ForceLog non configurée." }),
  ]);
  const available = [sendit, forceLog].filter((quote) => quote.available && quote.fee !== null).sort((left, right) => (left.fee ?? Infinity) - (right.fee ?? Infinity));
  return { pickupCity: "Casablanca", quotes: [sendit, forceLog], recommendedCarrier: available[0]?.carrier ?? null };
}

function shortError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "Erreur de connexion à l’agence.";
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function dispatchAuthorizedOrder(orderId: number, requestedCarrier: string): Promise<CarrierDispatchResult> {
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
    fulfillmentType: orders.fulfillmentType,
    status: orders.status,
    carrier: orders.carrier,
    trackingNumber: orders.trackingNumber,
    carrierDispatchState: orders.carrierDispatchState,
  }).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).where(and(eq(orders.id, orderId), isNull(orders.deletedAt))).limit(1);
  if (!order) return { attempted: false, success: false, message: "Commande introuvable." };
  if (order.fulfillmentType === "Magasin physique") return { attempted: false, success: false, message: "Cette vente a été remise en magasin : aucun colis ne doit être créé." };
  if (order.status !== "Confirmée") return { attempted: false, success: false, message: "Passez d’abord la commande au statut « Confirmée »." };
  if (order.trackingNumber || order.carrierDispatchState === "Créé") return { attempted: false, success: true, trackingNumber: order.trackingNumber, message: `Ce colis est déjà créé · suivi ${order.trackingNumber}.` };
  const selectedCarrier = requestedCarrier.trim() || order.carrier;
  const provider = carrierProvider(selectedCarrier);
  if (!provider) return { attempted: false, success: false, message: "Choisissez Sendit ou ForceLog avant d’autoriser." };
  if (!order.address.trim()) return { attempted: false, success: false, message: "Ajoutez l’adresse de livraison pour envoyer la commande à l’agence." };
  if (!order.customerName || !order.phone) return { attempted: false, success: false, message: "Les coordonnées de la cliente sont incomplètes." };

  const env = await runtimeSecrets();
  if (provider === "sendit" && (!env.SENDIT_PUBLIC_KEY?.trim() || !env.SENDIT_PRIVATE_KEY?.trim())) {
    return { attempted: false, success: false, message: "Les clés Sendit doivent encore être ajoutées dans Cloudflare." };
  }
  if (provider === "forcelog" && !env.FORCELOG_API_KEY?.trim()) {
    return { attempted: false, success: false, message: "La clé ForceLog doit encore être ajoutée dans Cloudflare." };
  }

  const rawDb = await getRawDb();
  const authorizedAt = new Date().toISOString();
  const claimed = await rawDb.prepare("UPDATE orders SET carrier = ?, carrier_dispatch_state = 'Création en cours', carrier_authorized_at = ?, updated_at = ? WHERE id = ? AND tracking_number = '' AND carrier_dispatch_state IN ('À autoriser', 'À renseigner', 'Erreur')")
    .bind(selectedCarrier, authorizedAt, authorizedAt, order.id).run();
  if ((claimed.meta.changes ?? 0) === 0) return { attempted: false, success: false, message: "La création est déjà en cours. Actualisez dans quelques secondes." };

  try {
    let created: { fee: number; trackingNumber: string };
    if (provider === "sendit") {
      const publicKey = env.SENDIT_PUBLIC_KEY?.trim() || "";
      const privateKey = env.SENDIT_PRIVATE_KEY?.trim() || "";
      created = await createSenditParcel({ ...order, customerName: order.customerName, phone: order.phone }, publicKey, privateKey);
    } else {
      const apiKey = env.FORCELOG_API_KEY?.trim() || "";
      created = await createForceLogParcel({ ...order, customerName: order.customerName, phone: order.phone }, apiKey);
    }

    const now = new Date().toISOString();
    const eventHash = await sha256Hex(`${provider}:parcel.created:${order.id}:${created.trackingNumber}`);
    await rawDb.batch([
      rawDb.prepare("UPDATE orders SET tracking_number = ?, status = 'Expédiée', carrier_dispatch_state = 'Créé', shipping_cost = CASE WHEN ? > 0 THEN ? ELSE shipping_cost END, updated_at = ? WHERE id = ? AND tracking_number = ''")
        .bind(created.trackingNumber, created.fee, created.fee, now, order.id),
      rawDb.prepare("INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_name, changed_at) VALUES (?, 'Confirmée', 'Expédiée', ?, ?)")
        .bind(order.id, `Autorisation ${selectedCarrier}`, now),
      rawDb.prepare("INSERT INTO audit_logs (username, display_name, action, entity_type, entity_id, entity_label, created_at) VALUES ('systeme', ?, 'Création transporteur autorisée', 'Commande', ?, ?, ?)")
        .bind(selectedCarrier, String(order.id), `${order.orderRef} · ${created.trackingNumber}`, now),
      rawDb.prepare("INSERT OR IGNORE INTO carrier_events (provider, event_type, external_code, external_status, payload_hash, message, order_id, processed, received_at) VALUES (?, 'parcel.created', ?, 'CREATED', ?, ?, ?, 1, ?)")
        .bind(provider, created.trackingNumber, eventHash, `Commande ${order.orderRef} créée après autorisation`, order.id, now),
    ]);
    return { attempted: true, success: true, trackingNumber: created.trackingNumber, message: `Colis créé chez ${selectedCarrier} · suivi ${created.trackingNumber}.` };
  } catch (error) {
    const message = shortError(error);
    const now = new Date().toISOString();
    const eventHash = await sha256Hex(`${provider}:dispatch.error:${order.id}:${now}`);
    await rawDb.batch([
      rawDb.prepare("UPDATE orders SET carrier_dispatch_state = 'Erreur', updated_at = ? WHERE id = ? AND tracking_number = ''").bind(now, order.id),
      rawDb.prepare("INSERT OR IGNORE INTO carrier_events (provider, event_type, external_code, external_status, payload_hash, message, order_id, processed, error_message, received_at) VALUES (?, 'parcel.create.error', ?, 'ERROR', ?, ?, ?, 0, ?, ?)")
        .bind(provider, order.orderRef, eventHash, `Échec après autorisation de ${order.orderRef}`, order.id, message, now),
    ]);
    return { attempted: true, success: false, message: `Le colis n’a pas été créé chez ${selectedCarrier} : ${message}` };
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

function mapForceLogStatus(externalStatus: string) {
  const status = normalize(externalStatus).toUpperCase();
  if (["DELIVERED", "LIVRE", "LIVREE"].includes(status)) return "Livrée";
  if (status.includes("RETURN") || status.includes("RETOUR") || status.includes("REFUS")) return "Retour";
  if (status.includes("CANCEL") || status.includes("ANNULE")) return "Annulée";
  if (["NEWPARCEL", "NOUVEAU", "WAITINGPICKUP", "ATTENTERAMASSAGE"].includes(status)) return "Expédiée";
  if (status.includes("TRANSIT") || status.includes("PROGRESS") || status.includes("LIVRAISON") || status.includes("DISTRIBUTION") || status.includes("RAMASSE")) return "En livraison";
  return null;
}

async function updateTrackedOrder(input: {
  carrierName: string;
  externalStatus: string;
  fee: number | null;
  invoiceCode?: string;
  orderId: number;
  orderRef: string;
  paid: boolean;
  provider: "forcelog" | "sendit";
  status: string | null;
}) {
  const rawDb = await getRawDb();
  const current = await rawDb.prepare("SELECT status, payment_status AS paymentStatus, shipping_cost AS shippingCost, paid_at AS paidAt, refunded_at AS refundedAt, carrier_invoice_code AS carrierInvoiceCode FROM orders WHERE id = ? AND deleted_at IS NULL")
    .bind(input.orderId).first<{ paymentStatus: string; shippingCost: number; status: string; paidAt: string | null; refundedAt: string | null; carrierInvoiceCode: string }>();
  if (!current) return false;
  const now = new Date().toISOString();
  const nextStatus = input.status || current.status;
  const requestedPaymentStatus = current.paymentStatus as OrderPaymentStatus;
  const paymentState = normalizeOrderPaymentState({
    status: nextStatus,
    requestedPaymentStatus,
    previousPaymentStatus: current.paymentStatus,
    paidAt: current.paidAt,
    refundedAt: current.refundedAt,
    carrierPaid: input.paid,
    now,
  });
  const fee = input.fee !== null ? input.fee : current.shippingCost;
  const invoiceCode = input.invoiceCode || current.carrierInvoiceCode || "";
  if (
    nextStatus === current.status
    && paymentState.paymentStatus === current.paymentStatus
    && paymentState.paidAt === current.paidAt
    && paymentState.refundedAt === current.refundedAt
    && fee === current.shippingCost
    && invoiceCode === current.carrierInvoiceCode
  ) return false;
  const paymentAction = paymentState.paymentStatus === "Remboursé"
    ? "Remboursement transporteur"
    : paymentState.paymentStatus === "Non encaissé" && current.paymentStatus !== "Non encaissé"
      ? "Encaissement annulé"
      : paymentState.paymentStatus === "Encaissé" && current.paymentStatus !== "Encaissé"
        ? "Encaissement transporteur"
        : "Suivi transporteur";
  const statements = [
    rawDb.prepare("UPDATE orders SET status = ?, payment_status = ?, shipping_cost = ?, paid_at = ?, refunded_at = ?, carrier_invoice_code = ?, updated_at = ? WHERE id = ?")
      .bind(nextStatus, paymentState.paymentStatus, fee, paymentState.paidAt, paymentState.refundedAt, invoiceCode, now, input.orderId),
    rawDb.prepare("INSERT INTO audit_logs (username, display_name, action, entity_type, entity_id, entity_label, created_at) VALUES (?, ?, ?, 'Commande', ?, ?, ?)")
      .bind(input.provider, `${input.carrierName} automatique`, paymentAction, String(input.orderId), `${input.orderRef} · ${input.externalStatus}`, now),
  ];
  if (nextStatus !== current.status) {
    statements.push(rawDb.prepare("INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_name, changed_at) VALUES (?, ?, ?, ?, ?)")
      .bind(input.orderId, current.status, nextStatus, `${input.carrierName} automatique`, now));
  }
  await rawDb.batch(statements);
  return true;
}

async function syncForceLog(apiKey: string) {
  const rawDb = await getRawDb();
  const tracked = (await rawDb.prepare(`SELECT id, order_ref AS orderRef, tracking_number AS trackingNumber
    FROM orders WHERE deleted_at IS NULL AND tracking_number <> '' AND lower(replace(carrier, ' ', '')) LIKE '%forcelog%'
    AND (payment_status <> 'Encaissé' OR status NOT IN ('Livrée', 'Retour', 'Annulée')) ORDER BY updated_at DESC LIMIT 20`)
    .all<{ id: number; orderRef: string; trackingNumber: string }>()).results;
  let updated = 0;
  for (const order of tracked) {
    try {
      const response = await fetch(`${FORCELOG_API_BASE}/Parcels/GetParcel?Code=${encodeURIComponent(order.trackingNumber)}`, {
        headers: { accept: "application/json", "X-API-Key": apiKey },
        signal: AbortSignal.timeout(8_000),
      });
      const payload = await smallJsonResponse(response, "ForceLog");
      const statusValue = deepValue(payload, new Set(["status_code", "status"]));
      const situation = deepValue(payload, new Set(["situation"]));
      const feeValue = deepValue(payload, new Set(["delivery_fees", "deliveryfees"]));
      const externalStatus = typeof statusValue === "string" ? statusValue : "";
      const paid = typeof situation === "string" && normalize(situation) === "paye";
      if (await updateTrackedOrder({ carrierName: "ForceLog", externalStatus, fee: decimalValue(feeValue), orderId: order.id, orderRef: order.orderRef, paid, provider: "forcelog", status: mapForceLogStatus(externalStatus) })) updated += 1;
    } catch (error) {
      console.error("ForceLog sync failed", order.trackingNumber, shortError(error));
    }
  }
  return updated;
}

async function syncSendit(publicKey: string, privateKey: string, verifiedToken = "") {
  const token = verifiedToken || await senditToken(publicKey, privateKey);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 90);
  const invoicesResponse = await fetch(`${SENDIT_API_BASE}/invoices?startDate=${start.toISOString().slice(0, 10)}&endDate=${new Date().toISOString().slice(0, 10)}`, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
  });
  const invoicesPayload = await smallJsonResponse(invoicesResponse, "Sendit");
  const records: JsonRecord[] = [];
  collectRecords(invoicesPayload, records);
  const paidInvoices = records.filter((record) => typeof record.code === "string" && normalize(String(record.status || "")) === "paid").slice(0, 20);
  let updated = 0;
  const rawDb = await getRawDb();
  for (const invoice of paidInvoices) {
    const invoiceCode = String(invoice.code);
    try {
      const detailResponse = await fetch(`${SENDIT_API_BASE}/invoices/${encodeURIComponent(invoiceCode)}`, {
        headers: { accept: "application/json", authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000),
      });
      const detail = await smallJsonResponse(detailResponse, "Sendit");
      const itemRecords: JsonRecord[] = [];
      collectRecords(detail, itemRecords);
      const deliveryItems = itemRecords.filter((record) => normalize(String(record.type || "")) === "delivery" && typeof record.code === "string");
      for (const item of deliveryItems) {
        const code = String(item.code);
        const order = await rawDb.prepare("SELECT id, order_ref AS orderRef, status FROM orders WHERE tracking_number = ? AND deleted_at IS NULL AND lower(replace(carrier, ' ', '')) LIKE '%sendit%' LIMIT 1")
          .bind(code).first<{ id: number; orderRef: string; status: string }>();
        if (!order) continue;
        const externalStatus = String(item.status || "PAID");
        if (await updateTrackedOrder({ carrierName: "Sendit", externalStatus, fee: decimalValue(item.fee), invoiceCode, orderId: order.id, orderRef: order.orderRef, paid: true, provider: "sendit", status: mapSenditStatus(externalStatus) })) updated += 1;
      }
    } catch (error) {
      console.error("Sendit invoice sync failed", invoiceCode, shortError(error));
    }
  }
  return updated;
}

export async function syncCarrierOperations(): Promise<CarrierSyncResult> {
  const env = await runtimeSecrets();
  const forceLogKey = env.FORCELOG_API_KEY?.trim() || "";
  const senditPublic = env.SENDIT_PUBLIC_KEY?.trim() || "";
  const senditPrivate = env.SENDIT_PRIVATE_KEY?.trim() || "";
  const result: CarrierSyncResult = {
    forceLog: { configured: Boolean(forceLogKey), verified: false, error: "" },
    sendit: { configured: Boolean(senditPublic && senditPrivate), verified: false, error: "" },
    updated: 0,
  };

  let senditVerifiedToken = "";
  if (result.sendit.configured) {
    try {
      senditVerifiedToken = await senditToken(senditPublic, senditPrivate);
      result.sendit.verified = true;
      await recordCarrierHealth("sendit", true);
    } catch (error) {
      result.sendit.error = shortError(error);
      await recordCarrierHealth("sendit", false, result.sendit.error);
    }
  }

  if (result.forceLog.configured) {
    try {
      const response = await fetch(`${FORCELOG_API_BASE}/Cities`, {
        headers: { accept: "application/json", "X-API-Key": forceLogKey },
        signal: AbortSignal.timeout(8_000),
      });
      await smallJsonResponse(response, "ForceLog");
      result.forceLog.verified = true;
      await recordCarrierHealth("forcelog", true);
    } catch (error) {
      result.forceLog.error = shortError(error);
      await recordCarrierHealth("forcelog", false, result.forceLog.error);
    }
  }

  const tasks: Promise<number>[] = [];
  if (result.forceLog.verified) tasks.push(syncForceLog(forceLogKey));
  if (result.sendit.verified) tasks.push(syncSendit(senditPublic, senditPrivate, senditVerifiedToken));
  const operations = await Promise.allSettled(tasks);
  result.updated = operations.reduce((total, operation) => total + (operation.status === "fulfilled" ? operation.value : 0), 0);
  if (result.updated > 0) await reconcileOrderAllocations();
  return result;
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

  const order = await rawDb.prepare(`SELECT id, order_ref AS orderRef, product_id AS productId, quantity, status, payment_status AS paymentStatus, paid_at AS paidAt, refunded_at AS refundedAt, stock_deducted AS stockDeducted
    FROM orders WHERE tracking_number = ? AND deleted_at IS NULL AND lower(replace(carrier, ' ', '')) LIKE '%sendit%' LIMIT 1`).bind(input.code).first<{
      id: number;
      orderRef: string;
      productId: number | null;
      quantity: number;
      status: string;
      paymentStatus: string;
      paidAt: string | null;
      refundedAt: string | null;
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
  const paymentState = normalizeOrderPaymentState({
    status: nextStatus,
    requestedPaymentStatus: order.paymentStatus as OrderPaymentStatus,
    previousPaymentStatus: order.paymentStatus,
    paidAt: order.paidAt,
    refundedAt: order.refundedAt,
    now: receivedAt,
  });
  if (
    order.status === nextStatus
    && paymentState.paymentStatus === order.paymentStatus
    && paymentState.paidAt === order.paidAt
    && paymentState.refundedAt === order.refundedAt
  ) {
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
    rawDb.prepare("UPDATE orders SET status = ?, payment_status = ?, paid_at = ?, refunded_at = ?, stock_deducted = ?, return_reason = CASE WHEN ? = 'Retour' AND return_reason = '' THEN 'Autre' ELSE return_reason END, return_note = CASE WHEN ? = 'Retour' AND return_note = '' THEN ? ELSE return_note END, updated_at = ? WHERE id = ?")
      .bind(nextStatus, paymentState.paymentStatus, paymentState.paidAt, paymentState.refundedAt, order.productId ? (stockCommittedStatuses.has(nextStatus) ? 1 : 0) : order.stockDeducted, nextStatus, nextStatus, input.message.slice(0, 240), receivedAt, order.id),
    rawDb.prepare("INSERT INTO audit_logs (username, display_name, action, entity_type, entity_id, entity_label, created_at) VALUES ('sendit', 'Sendit automatique', ?, 'Commande', ?, ?, ?)")
      .bind(
        paymentState.paymentStatus === "Remboursé" && order.paymentStatus !== "Remboursé" ? "Remboursement transporteur" : "Statut reçu",
        String(order.id),
        `${order.orderRef} · ${input.newStatus}`,
        receivedAt,
      ),
    rawDb.prepare("UPDATE carrier_events SET order_id = ?, processed = 1 WHERE payload_hash = ?").bind(order.id, input.payloadHash),
  ];
  if (order.status !== nextStatus) {
    statements.push(
      rawDb.prepare("INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_name, changed_at) VALUES (?, ?, ?, 'Sendit automatique', ?)")
        .bind(order.id, order.status, nextStatus, receivedAt),
    );
  }
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
  await reconcileOrderAllocations(order.id);
  return { duplicate: false, internalStatus: nextStatus, matched: true, updated: true };
}
