import { getAuthenticatedUser } from "../../../auth";
import { getRawDb } from "../../../../db";
import { normalizeMoroccanPhone } from "../../../../db/phone";
import { ensurePlatformUpgrades } from "../../../../db/platform-upgrades";

type WhatsAppNumber = {
  id: string;
  label: string;
  phone: string;
  isDefault: boolean;
};

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function parseNumbers(value: string | null): WhatsAppNumber[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is WhatsAppNumber => Boolean(
      item && typeof item === "object"
      && typeof (item as WhatsAppNumber).id === "string"
      && typeof (item as WhatsAppNumber).label === "string"
      && typeof (item as WhatsAppNumber).phone === "string"
    ));
  } catch {
    return [];
  }
}

function normalizeInput(value: unknown, index: number): WhatsAppNumber {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const phone = normalizeMoroccanPhone(typeof row.phone === "string" ? row.phone : "");
  if (!phone) throw new Error(`Numéro ${index + 1} invalide. Utilisez un numéro marocain comme 0612345678.`);
  const label = (typeof row.label === "string" ? row.label : "WhatsApp").trim().replace(/\s+/g, " ").slice(0, 60) || "WhatsApp";
  const suppliedId = typeof row.id === "string" ? row.id.trim() : "";
  return {
    id: /^[A-Za-z0-9_-]{3,80}$/.test(suppliedId) ? suppliedId : crypto.randomUUID(),
    label,
    phone,
    isDefault: row.isDefault === true,
  };
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const database = await getRawDb();
  await ensurePlatformUpgrades(database);
  const row = await database.prepare("SELECT value FROM settings WHERE key = 'whatsapp_numbers' LIMIT 1").first<{ value: string }>();
  return Response.json({ numbers: parseNumbers(row?.value || "[]"), canEdit: user.role === "admin" });
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: "Origine de la requête refusée." }, { status: 403 });
  const user = await getAuthenticatedUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Seul l’administrateur peut modifier les numéros WhatsApp." }, { status: 403 });

  let payload: { numbers?: unknown };
  try {
    payload = await request.json() as { numbers?: unknown };
  } catch {
    return Response.json({ error: "Données WhatsApp invalides." }, { status: 400 });
  }
  if (!Array.isArray(payload.numbers) || payload.numbers.length > 10) {
    return Response.json({ error: "Vous pouvez enregistrer jusqu’à 10 numéros WhatsApp." }, { status: 400 });
  }

  try {
    const normalized = payload.numbers.map(normalizeInput);
    const phones = new Set<string>();
    for (const row of normalized) {
      if (phones.has(row.phone)) throw new Error(`Le numéro ${row.phone} apparaît plusieurs fois.`);
      phones.add(row.phone);
    }
    let defaultAssigned = false;
    const numbers = normalized.map((row, index) => {
      const isDefault = !defaultAssigned && (row.isDefault || (index === 0 && !normalized.some((item) => item.isDefault)));
      if (isDefault) defaultAssigned = true;
      return { ...row, isDefault };
    });

    const database = await getRawDb();
    await ensurePlatformUpgrades(database);
    const now = new Date().toISOString();
    await database.batch([
      database.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('whatsapp_numbers', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).bind(JSON.stringify(numbers), now),
      database.prepare(`
        INSERT INTO audit_logs (user_id, username, display_name, action, entity_type, entity_id, entity_label, created_at)
        VALUES (?, ?, ?, 'Modification', 'WhatsApp', NULL, ?, ?)
      `).bind(user.id, user.username, user.displayName, `${numbers.length} numéro(s) configuré(s)`, now),
    ]);
    return Response.json({ numbers, canEdit: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Enregistrement WhatsApp impossible." }, { status: 400 });
  }
}
