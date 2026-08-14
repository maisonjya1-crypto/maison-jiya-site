import { and, eq, isNull } from "drizzle-orm";
import { getDb, getRawDb } from "./index";
import { moroccanPhoneHelp, normalizeMoroccanPhone } from "./phone";
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
    status: orders.status,
    carrier: orders.carrier,
    trackingNumber: orders.trackingNumber,
    carrierDispatchState: orders.carrierDispatchState,
  }).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).where(and(eq(orders.id, orderId), isNull(orders.deletedAt))).limit(1);
  if (!order) return { attempted: false, success: false, message: "Commande introuvable." };
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
  const claimed = await rawDb.prepare("UPDATE orders SET carrier = ?, carrier_dispatch_state = 'Création en cours', carrier_authorized_at = ?, updated_at = ? WHERE id = ? AND tracking_number = '' AND carrier_dispatch_state IN ('À autoriser', 'Erreur')")
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
  const current = await rawDb.prepare("SELECT status, payment_status AS paymentStatus, shipping_cost AS shippingCost FROM orders WHERE id = ? AND deleted_at IS NULL")
    .bind(input.orderId).first<{ paymentStatus: string; shippingCost: number; status: string }>();
  if (!current) return false;
  const now = new Date().toISOString();
  const nextStatus = input.status || current.status;
  const nextPayment = input.paid ? "Encaissé" : current.paymentStatus;
  const fee = input.fee !== null ? input.fee : current.shippingCost;
  const invoiceCode = input.invoiceCode || "";
  if (nextStatus === current.status && nextPayment === current.paymentStatus && fee === current.shippingCost && !invoiceCode) return false;
  const statements = [
    rawDb.prepare("UPDATE orders SET status = ?, payment_status = ?, shipping_cost = ?, paid_at = CASE WHEN ? = 'Encaissé' THEN COALESCE(paid_at, ?) ELSE paid_at END, carrier_invoice_code = CASE WHEN ? <> '' THEN ? ELSE carrier_invoice_code END, updated_at = ? WHERE id = ?")
      .bind(nextStatus, nextPayment, fee, nextPayment, now, invoiceCode, invoiceCode, now, input.orderId),
    rawDb.prepare("INSERT INTO audit_logs (username, display_name, action, entity_type, entity_id, entity_label, created_at) VALUES (?, ?, ?, 'Commande', ?, ?, ?)")
      .bind(input.provider, `${input.carrierName} automatique`, input.paid ? "Encaissement transporteur" : "Suivi transporteur", String(input.orderId), `${input.orderRef} · ${input.externalStatus}`, now),
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

async function syncSendit(publicKey: string, privateKey: string) {
  const token = await senditToken(publicKey, privateKey);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 90);
  const invoicesResponse = await fetch(`${SENDIT_API_BASE}/invoices?startDate=${start.toISOString().slice(0, 10)}&endDate=${new Date().toISOString().slice(0, 10)}`, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
  });
  const invoicesPayload = await smallJsonResponse(invoicesResponse, "Sendit");
  const records: JsonRecord[] = [];
  collectRecords(invoicesPayload, records);
  const paidInvoices = records.filter((record) => typeof record.code === "string" && normalize(String(record.status || "")) === "paid").slice(0, 5);
  let updated = 0;
  const rawDb = await getRawDb();
  for (const invoice of paidInvoices) {
    const invoiceCode = String(invoice.code);
    const alreadyProcessed = await rawDb.prepare("SELECT id FROM orders WHERE carrier_invoice_code = ? LIMIT 1").bind(invoiceCode).first<{ id: number }>();
    if (alreadyProcessed) continue;
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

export async function syncCarrierOperations() {
  const env = await runtimeSecrets();
  const tasks: Promise<number>[] = [];
  if (env.FORCELOG_API_KEY?.trim()) tasks.push(syncForceLog(env.FORCELOG_API_KEY.trim()));
  if (env.SENDIT_PUBLIC_KEY?.trim() && env.SENDIT_PRIVATE_KEY?.trim()) tasks.push(syncSendit(env.SENDIT_PUBLIC_KEY.trim(), env.SENDIT_PRIVATE_KEY.trim()));
  const results = await Promise.allSettled(tasks);
  const updated = results.reduce((total, result) => total + (result.status === "fulfilled" ? result.value : 0), 0);
  const now = new Date().toISOString();
  const hash = await sha256Hex(`carriers:sync:${now.slice(0, 16)}`);
  const rawDb = await getRawDb();
  await rawDb.prepare("INSERT OR IGNORE INTO carrier_events (provider, event_type, external_code, external_status, payload_hash, message, processed, received_at) VALUES ('system', 'sync.completed', ?, 'OK', ?, ?, 1, ?)")
    .bind(now.slice(0, 16), hash, `${updated} commande(s) mise(s) à jour`, now).run();
  return updated;
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
