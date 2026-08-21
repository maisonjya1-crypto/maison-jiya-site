import { getAuthenticatedUser } from "../../auth";
import { getRawDb } from "../../../db";
import { ensurePushNotifications, getVapidConfig } from "../../../db/push-notifications";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function text(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function requireUser(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;
  return user;
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401, headers: { "cache-control": "no-store" } });
  try {
    const database = await getRawDb();
    const config = await getVapidConfig(database);
    const count = await database.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = ?").bind(user.id).first<{ count: number }>();
    return Response.json({ publicKey: config.publicKey, subscriptions: Number(count?.count || 0) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Maison Jiya push config failed", error);
    return Response.json({ error: "Notifications indisponibles." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const user = await requireUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });

  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Abonnement invalide." }, { status: 400 }); }

  const endpoint = text(payload.endpoint, 4000);
  const keys = payload.keys && typeof payload.keys === "object" ? payload.keys as Record<string, unknown> : {};
  const p256dh = text(keys.p256dh, 1000);
  const auth = text(keys.auth, 1000);
  const expiration = payload.expirationTime == null ? null : new Date(Number(payload.expirationTime)).toISOString();
  if (!endpoint.startsWith("https://")) return Response.json({ error: "Endpoint push invalide." }, { status: 400 });

  try {
    const database = await getRawDb();
    await ensurePushNotifications(database);
    await database.prepare(`
      INSERT INTO push_subscriptions (
        user_id, endpoint, p256dh, auth, expiration_time, user_agent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        expiration_time = excluded.expiration_time,
        user_agent = excluded.user_agent,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      user.id,
      endpoint,
      p256dh,
      auth,
      expiration,
      text(request.headers.get("user-agent"), 500),
    ).run();
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Maison Jiya push subscribe failed", error);
    return Response.json({ error: "Impossible d’activer les notifications." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const user = await requireUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  let endpoint = "";
  try {
    const payload = await request.json() as Record<string, unknown>;
    endpoint = text(payload.endpoint, 4000);
  } catch {
    return Response.json({ error: "Abonnement invalide." }, { status: 400 });
  }
  if (!endpoint) return Response.json({ error: "Endpoint manquant." }, { status: 400 });
  try {
    const database = await getRawDb();
    await ensurePushNotifications(database);
    await database.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").bind(endpoint, user.id).run();
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Maison Jiya push unsubscribe failed", error);
    return Response.json({ error: "Impossible de désactiver les notifications." }, { status: 500 });
  }
}
