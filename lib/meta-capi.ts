// API Conversions Meta (côté serveur).
// - Lead : à la commande (même event_id que le Pixel « lead-<réf> » → pas de doublon).
// - Purchase : seulement quand la commande passe « Livrée » (paiement à la livraison encaissé).
// N'est utilisé que si le client a accepté les cookies Meta sur la boutique.
export type MarketingAttribution = { consent: true; fbp?: string; fbc?: string; clientIp?: string; userAgent?: string; url?: string; at: string };
export type CapiCustomer = { phone?: string | null; city?: string | null; name?: string | null };
export type CapiEvent = {
  event_name: "Lead" | "Purchase";
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url?: string;
  user_data: Record<string, string | string[]>;
  custom_data: Record<string, unknown>;
};

const DEFAULT_API_VERSION = "v22.0";

export function metaPhone(phone: string | null | undefined) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 10) digits = `212${digits.slice(1)}`;
  if (/^[5-7]\d{8}$/.test(digits)) digits = `212${digits}`;
  return /^212[5-7]\d{8}$/.test(digits) ? digits : "";
}

const normalizeText = (value: string | null | undefined) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const cleanCookie = (value: unknown, prefix: string) => {
  const text = String(value ?? "").trim().slice(0, 300);
  return text.startsWith(prefix) && /^[\w.\-]+$/.test(text) ? text : "";
};

/** Lit l'accord du client et ses identifiants Meta envoyés par la boutique (jamais sans accord). */
export function attributionFromRequest(raw: unknown, request: Request, now = new Date()): MarketingAttribution | null {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (input.consent !== true) return null;
  const url = String(input.url ?? "").slice(0, 500);
  return {
    consent: true,
    fbp: cleanCookie(input.fbp, "fb.") || undefined,
    fbc: cleanCookie(input.fbc, "fb.") || undefined,
    clientIp: request.headers.get("cf-connecting-ip") || undefined,
    userAgent: (request.headers.get("user-agent") || "").slice(0, 400) || undefined,
    url: /^https:\/\//.test(url) ? url : undefined,
    at: now.toISOString(),
  };
}

export async function capiUserData(customer: CapiCustomer, attribution: MarketingAttribution) {
  const data: Record<string, string | string[]> = { country: [await sha256("ma")] };
  const phone = metaPhone(customer.phone);
  if (phone) data.ph = [await sha256(phone)];
  const city = normalizeText(customer.city);
  if (city) data.ct = [await sha256(city)];
  const firstName = normalizeText(String(customer.name || "").trim().split(/\s+/)[0]);
  if (firstName) data.fn = [await sha256(firstName)];
  if (phone) data.external_id = [await sha256(`maisonjiya:${phone}`)];
  if (attribution.fbp) data.fbp = attribution.fbp;
  if (attribution.fbc) data.fbc = attribution.fbc;
  if (attribution.clientIp) data.client_ip_address = attribution.clientIp;
  if (attribution.userAgent) data.client_user_agent = attribution.userAgent;
  return data;
}

export type CapiItem = { productCode: string; quantity: number; unitPrice: number };

export function capiCustomData(orderRef: string, value: number, items: CapiItem[]) {
  return {
    currency: "MAD",
    value: Math.round(value * 100) / 100,
    order_id: orderRef,
    content_type: "product",
    content_ids: items.map((item) => item.productCode),
    contents: items.map((item) => ({ id: item.productCode, quantity: item.quantity, item_price: item.unitPrice })),
    num_items: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

export type CapiConfig = { pixelId: string; token: string; apiVersion?: string; testEventCode?: string };

export async function sendCapiEvents(config: CapiConfig, events: CapiEvent[], fetchImpl: typeof fetch = fetch, timeoutMs = 4000) {
  if (!config.pixelId || !/^\d{6,20}$/.test(config.pixelId) || !config.token || !events.length) return { sent: false, reason: "not_configured" as const };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: Record<string, unknown> = { data: events };
    if (config.testEventCode) body.test_event_code = config.testEventCode;
    const response = await fetchImpl(`https://graph.facebook.com/${config.apiVersion || DEFAULT_API_VERSION}/${config.pixelId}/events?access_token=${encodeURIComponent(config.token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) return { sent: false, reason: "error" as const, status: response.status, detail: text.slice(0, 300) };
    return { sent: true as const, detail: text.slice(0, 300) };
  } catch (error) {
    return { sent: false, reason: "error" as const, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export async function readCapiConfig(database: D1Database): Promise<CapiConfig | null> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as { META_CAPI_TOKEN?: string; META_API_VERSION?: string; META_CAPI_TEST_CODE?: string };
  const token = runtime.META_CAPI_TOKEN?.trim();
  if (!token) return null;
  const row = await database.prepare("SELECT value FROM settings WHERE key = 'storefront_meta_pixel_id' LIMIT 1").first<{ value: string }>();
  const pixelId = (row?.value || "").replace(/\D/g, "");
  if (!pixelId) return null;
  return { pixelId, token, apiVersion: runtime.META_API_VERSION?.trim() || undefined, testEventCode: runtime.META_CAPI_TEST_CODE?.trim() || undefined };
}

async function recordStatus(database: D1Database, value: string) {
  await database.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES ('meta_capi_last_status', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).bind(value.slice(0, 300)).run().catch(() => undefined);
}

/** Lead serveur au moment de la commande (ne bloque jamais la commande). */
export async function sendLeadEvent(database: D1Database, input: { orderRef: string; total: number; items: CapiItem[]; customer: CapiCustomer; attribution: MarketingAttribution }, fetchImpl: typeof fetch = fetch, configOverride?: CapiConfig | null) {
  try {
    const config = configOverride === undefined ? await readCapiConfig(database) : configOverride;
    if (!config) return { sent: false, reason: "not_configured" as const };
    const result = await sendCapiEvents(config, [{
      event_name: "Lead",
      event_time: Math.floor(Date.now() / 1000),
      event_id: `lead-${input.orderRef}`,
      action_source: "website",
      event_source_url: input.attribution.url,
      user_data: await capiUserData(input.customer, input.attribution),
      custom_data: capiCustomData(input.orderRef, input.total, input.items),
    }], fetchImpl, 2500);
    await recordStatus(database, result.sent ? `Lead OK ${new Date().toISOString()}` : `Lead erreur : ${result.detail || result.reason}`);
    return result;
  } catch (error) {
    return { sent: false, reason: "error" as const, detail: error instanceof Error ? error.message : String(error) };
  }
}

type DeliveredRow = { id: number; orderRef: string; saleAmount: number; itemsJson: string | null; city: string; updatedAt: string; attribution: string; phone: string; name: string };

/** Purchase pour les commandes livrées (appelé par la tâche planifiée toutes les 5 minutes). */
export async function sendDeliveredPurchases(database: D1Database, fetchImpl: typeof fetch = fetch, configOverride?: CapiConfig | null, now = new Date()) {
  const config = configOverride === undefined ? await readCapiConfig(database) : configOverride;
  if (!config) return { sent: 0, skipped: "not_configured" };
  let rows: DeliveredRow[] = [];
  try {
    rows = (await database.prepare(`
      SELECT o.id, o.order_ref AS orderRef, o.sale_amount AS saleAmount, o.items_json AS itemsJson, o.city,
             o.updated_at AS updatedAt, o.marketing_attribution_json AS attribution, c.phone, c.name
      FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.status = 'Livrée' AND o.deleted_at IS NULL AND o.capi_purchase_sent_at IS NULL
        AND o.marketing_attribution_json IS NOT NULL AND o.marketing_attribution_json <> ''
      ORDER BY o.updated_at
      LIMIT 50
    `).all<DeliveredRow>()).results || [];
  } catch {
    return { sent: 0, skipped: "migration_pending" };
  }
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const events: CapiEvent[] = [];
  const ids: number[] = [];
  const expired: number[] = [];
  for (const row of rows) {
    let attribution: MarketingAttribution;
    try { attribution = JSON.parse(row.attribution); } catch { expired.push(row.id); continue; }
    if (attribution?.consent !== true) { expired.push(row.id); continue; }
    const deliveredAt = Math.floor(new Date(row.updatedAt.includes("T") ? row.updatedAt : `${row.updatedAt.replace(" ", "T")}Z`).getTime() / 1000);
    // Meta refuse les événements de plus de 7 jours.
    if (!Number.isFinite(deliveredAt) || nowSeconds - deliveredAt > 6.5 * 86400) { expired.push(row.id); continue; }
    let items: CapiItem[] = [];
    try {
      items = (JSON.parse(row.itemsJson || "[]") as Array<{ productCode?: string; quantity?: number; lineSaleAmount?: number }>)
        .filter((item) => item.productCode)
        .map((item) => ({ productCode: String(item.productCode), quantity: Number(item.quantity) || 1, unitPrice: Math.round(((Number(item.lineSaleAmount) || 0) / (Number(item.quantity) || 1)) * 100) / 100 }));
    } catch { items = []; }
    events.push({
      event_name: "Purchase",
      event_time: Math.min(deliveredAt, nowSeconds),
      event_id: `purchase-${row.orderRef}`,
      action_source: "website",
      event_source_url: attribution.url,
      user_data: await capiUserData({ phone: row.phone, city: row.city, name: row.name }, attribution),
      custom_data: capiCustomData(row.orderRef, Number(row.saleAmount) || 0, items),
    });
    ids.push(row.id);
  }
  if (expired.length) {
    await database.prepare(`UPDATE orders SET capi_purchase_sent_at = 'expire' WHERE id IN (${expired.map(() => "?").join(",")})`).bind(...expired).run();
  }
  if (!events.length) return { sent: 0 };
  const result = await sendCapiEvents(config, events, fetchImpl);
  if (result.sent) {
    await database.prepare(`UPDATE orders SET capi_purchase_sent_at = CURRENT_TIMESTAMP WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).run();
  }
  await recordStatus(database, result.sent ? `Purchase OK (${ids.length}) ${now.toISOString()}` : `Purchase erreur : ${result.detail || result.reason}`);
  return { sent: result.sent ? ids.length : 0 };
}
