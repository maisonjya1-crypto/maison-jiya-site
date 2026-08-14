import { applySenditStatusUpdate, getSenditWebhookSecret } from "../../../../../db/carriers";

const MAX_BODY_BYTES = 64 * 1024;

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function signatureBytes(header: string) {
  const value = header.trim().replace(/^sha256=/i, "");
  if (/^[0-9a-f]{64}$/i.test(value)) {
    return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
  }
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

async function readBoundedBody(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function validSignature(rawBody: Uint8Array<ArrayBuffer>, header: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  const supplied = signatureBytes(header);
  const validLength = supplied.byteLength === expected.byteLength;
  const comparable = validLength ? supplied : new Uint8Array(expected.byteLength);
  const cloudflareSubtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual(left: ArrayBuffer | ArrayBufferView, right: ArrayBuffer | ArrayBufferView): boolean;
  };
  return cloudflareSubtle.timingSafeEqual(expected, comparable) && validLength;
}

async function sha256Hex(value: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function webhookPayload(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const event = typeof record.event === "string" ? record.event.trim() : "";
  const code = typeof record.code === "string" ? record.code.trim() : "";
  const newStatus = typeof record.newStatus === "string" ? record.newStatus.trim() : "";
  if (event !== "delivery.status.update" || !code || code.length > 100 || !newStatus || newStatus.length > 100) return null;
  return {
    event,
    code,
    newStatus,
    lastActionAt: typeof record.lastActionAt === "string" ? record.lastActionAt.slice(0, 40) : "",
    message: typeof record.message === "string" ? record.message.slice(0, 500) : "",
    proofImage: typeof record.proofImage === "string" ? record.proofImage.slice(0, 1000) : "",
  };
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "Requête trop volumineuse." }, 413);
  const secret = await getSenditWebhookSecret();
  if (!secret) return json({ error: "Webhook Sendit non configuré." }, 503);
  const signature = request.headers.get("x-sendit-signature") || "";
  if (!signature) return json({ error: "Signature requise." }, 401);
  const rawBody = await readBoundedBody(request);
  if (!rawBody) return json({ error: "Requête trop volumineuse." }, 413);
  if (!(await validSignature(rawBody, signature, secret))) return json({ error: "Signature invalide." }, 401);

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return json({ error: "Contenu JSON invalide." }, 400);
  }
  const payload = webhookPayload(parsed);
  if (!payload) return json({ error: "Événement Sendit invalide." }, 400);
  const result = await applySenditStatusUpdate({ ...payload, payloadHash: await sha256Hex(rawBody) });
  console.log(JSON.stringify({ message: "Sendit webhook processed", code: payload.code, status: payload.newStatus, ...result }));
  return json({ received: true, ...result });
}
