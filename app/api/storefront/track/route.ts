import { getRawDb } from "../../../../db";
import { normalizeMoroccanPhone } from "../../../../db/phone";
import { normalizeOrderRef, trackingStage } from "../../../../lib/order-tracking";

export const dynamic = "force-dynamic";

// Suivi public d'une commande : il faut la référence ET le téléphone de la commande.
// Réponse identique si l'un des deux est faux (on ne révèle pas qu'une référence existe).
const WINDOW_MS = 15 * 60 * 1000;
const MAX_LOOKUPS_PER_IP = 20;
const NOT_FOUND = "Aucune commande ne correspond à cette référence et ce numéro.";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function allowLookup(database: D1Database, request: Request) {
  await database.prepare(`
    CREATE TABLE IF NOT EXISTS storefront_rate_limits (
      key_hash TEXT PRIMARY KEY NOT NULL,
      window_started_at TEXT NOT NULL,
      request_count INTEGER DEFAULT 0 NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `).run();
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const keyHash = await sha256(`track:${ip}`);
  const now = Date.now();
  const row = await database.prepare("SELECT window_started_at AS windowStartedAt, request_count AS requestCount FROM storefront_rate_limits WHERE key_hash = ? LIMIT 1")
    .bind(keyHash).first<{ windowStartedAt: string; requestCount: number }>();
  const startedAt = row?.windowStartedAt ? new Date(row.windowStartedAt).getTime() : 0;
  if (startedAt && now - startedAt <= WINDOW_MS && Number(row?.requestCount || 0) >= MAX_LOOKUPS_PER_IP) return false;
  if (!startedAt || now - startedAt > WINDOW_MS) {
    await database.prepare(`
      INSERT INTO storefront_rate_limits (key_hash, window_started_at, request_count, updated_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(key_hash) DO UPDATE SET window_started_at = excluded.window_started_at, request_count = 1, updated_at = CURRENT_TIMESTAMP
    `).bind(keyHash, new Date(now).toISOString()).run();
  } else {
    await database.prepare("UPDATE storefront_rate_limits SET request_count = request_count + 1, updated_at = CURRENT_TIMESTAMP WHERE key_hash = ?").bind(keyHash).run();
  }
  return true;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Requête refusée." }, { status: 403 });
  let payload: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.length > 2000) return Response.json({ error: "Requête trop volumineuse." }, { status: 413 });
    payload = JSON.parse(text || "{}");
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  const ref = normalizeOrderRef(payload.ref);
  const phone = normalizeMoroccanPhone(String(payload.phone ?? "").slice(0, 40));
  if (!ref || ref.length < 4 || !phone) return Response.json({ error: "Indiquez la référence reçue après votre commande et votre numéro marocain." }, { status: 400 });

  try {
    const database = await getRawDb();
    if (!(await allowLookup(database, request))) return Response.json({ error: "Trop de recherches. Réessayez dans quelques minutes." }, { status: 429 });
    const order = await database.prepare(`
      SELECT orders.order_ref AS orderRef, orders.status, orders.city, orders.quantity, orders.sale_amount AS saleAmount,
             orders.carrier, orders.tracking_number AS trackingNumber, orders.created_at AS createdAt, orders.updated_at AS updatedAt,
             orders.fulfillment_type AS fulfillmentType
      FROM orders
      JOIN customers ON customers.id = orders.customer_id
      WHERE UPPER(orders.order_ref) = ? AND customers.phone = ? AND orders.deleted_at IS NULL
      LIMIT 1
    `).bind(ref, phone).first<{ orderRef: string; status: string; city: string; quantity: number; saleAmount: number; carrier: string; trackingNumber: string; createdAt: string; updatedAt: string | null; fulfillmentType: string }>();
    if (!order) return Response.json({ error: NOT_FOUND }, { status: 404 });
    const carrier = order.carrier && order.carrier !== "Non affecté" ? order.carrier : "";
    return Response.json({
      orderRef: order.orderRef,
      stage: trackingStage(order.status),
      city: order.city,
      quantity: Number(order.quantity) || 1,
      total: Number(order.saleAmount) || 0,
      carrier,
      trackingNumber: carrier ? order.trackingNumber || "" : "",
      createdAt: order.createdAt,
      updatedAt: order.updatedAt || order.createdAt,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Maison Jiya order tracking failed", error);
    return Response.json({ error: "Le suivi est momentanément indisponible. Contactez-nous sur WhatsApp." }, { status: 500 });
  }
}
