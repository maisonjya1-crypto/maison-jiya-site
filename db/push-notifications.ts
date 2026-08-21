type VapidConfig = {
  publicKey: string;
  privateJwk: string;
};

type PushSubscriptionRow = {
  id: number;
  endpoint: string;
};

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textToBase64Url(value: string) {
  return bytesToBase64Url(encoder.encode(value));
}

export async function ensurePushNotifications(database: D1Database) {
  await database.batch([
    database.prepare(`
      CREATE TABLE IF NOT EXISTS push_vapid_config (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        public_key TEXT NOT NULL,
        private_jwk TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `),
    database.prepare(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT DEFAULT '' NOT NULL,
        auth TEXT DEFAULT '' NOT NULL,
        expiration_time TEXT,
        user_agent TEXT DEFAULT '' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `),
    database.prepare("CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id)"),
  ]);
}

export async function getVapidConfig(database: D1Database): Promise<VapidConfig> {
  await ensurePushNotifications(database);
  const existing = await database.prepare(`
    SELECT public_key AS publicKey, private_jwk AS privateJwk
    FROM push_vapid_config WHERE id = 1 LIMIT 1
  `).first<VapidConfig>();
  if (existing?.publicKey && existing.privateJwk) return existing;

  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const generated: VapidConfig = {
    publicKey: bytesToBase64Url(publicRaw),
    privateJwk: JSON.stringify(privateJwk),
  };

  await database.prepare(`
    INSERT OR IGNORE INTO push_vapid_config (id, public_key, private_jwk, created_at)
    VALUES (1, ?, ?, CURRENT_TIMESTAMP)
  `).bind(generated.publicKey, generated.privateJwk).run();

  return (await database.prepare(`
    SELECT public_key AS publicKey, private_jwk AS privateJwk
    FROM push_vapid_config WHERE id = 1 LIMIT 1
  `).first<VapidConfig>()) || generated;
}

async function vapidJwt(endpoint: string, config: VapidConfig) {
  const audience = new URL(endpoint).origin;
  const header = textToBase64Url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = textToBase64Url(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 6 * 60 * 60,
    sub: "mailto:maisonjya1@gmail.com",
  }));
  const unsigned = `${header}.${payload}`;
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(config.privateJwk) as JsonWebKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encoder.encode(unsigned),
  ));
  return `${unsigned}.${bytesToBase64Url(signature)}`;
}

async function pushOne(subscription: PushSubscriptionRow, config: VapidConfig) {
  try {
    const token = await vapidJwt(subscription.endpoint, config);
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        TTL: "120",
        Urgency: "high",
        Authorization: `vapid t=${token}, k=${config.publicKey}`,
        "Crypto-Key": `p256ecdsa=${config.publicKey}`,
      },
    });
    return { id: subscription.id, status: response.status, ok: response.ok };
  } catch (error) {
    console.error("Maison Jiya push delivery failed", error);
    return { id: subscription.id, status: 0, ok: false };
  }
}

export async function notifyNewOrder(database: D1Database) {
  try {
    await ensurePushNotifications(database);
    const subscriptions = (await database.prepare(`
      SELECT ps.id, ps.endpoint
      FROM push_subscriptions ps
      JOIN users u ON u.id = ps.user_id
      WHERE u.is_active = 1 AND u.role IN ('admin', 'editor')
      ORDER BY ps.id DESC
      LIMIT 30
    `).all<PushSubscriptionRow>()).results;
    if (!subscriptions.length) return { delivered: 0, subscriptions: 0 };

    const config = await getVapidConfig(database);
    const results = await Promise.all(subscriptions.map((subscription) => pushOne(subscription, config)));
    const expired = results.filter((result) => result.status === 404 || result.status === 410).map((result) => result.id);
    if (expired.length) {
      const placeholders = expired.map(() => "?").join(",");
      await database.prepare(`DELETE FROM push_subscriptions WHERE id IN (${placeholders})`).bind(...expired).run();
    }
    return { delivered: results.filter((result) => result.ok).length, subscriptions: subscriptions.length };
  } catch (error) {
    console.error("Maison Jiya order push notification failed", error);
    return { delivered: 0, subscriptions: 0 };
  }
}
