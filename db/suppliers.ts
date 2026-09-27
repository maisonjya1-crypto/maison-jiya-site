export type SupplierProfileRow = {
  id: number;
  name: string;
  contactName: string;
  phone: string;
  whatsapp: string;
  city: string;
  leadTimeDays: number;
  minimumOrderAmount: number;
  paymentTerms: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
};

export function normalizeSupplierName(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

export async function resolveSupplierProfile(
  database: D1Database,
  supplierId: number | null,
  supplierName: string,
  allowInactive = false,
) {
  if (supplierId) {
    const byId = await database.prepare(`
      SELECT id, name, is_active AS isActive
      FROM suppliers
      WHERE id = ?
      LIMIT 1
    `).bind(supplierId).first<{ id: number; name: string; isActive: number }>();
    if (!byId) throw new Error("Fournisseur introuvable.");
    if (!byId.isActive && !allowInactive) throw new Error("Ce fournisseur est désactivé.");
    return { id: byId.id, name: byId.name };
  }

  const normalized = normalizeSupplierName(supplierName);
  if (!normalized) throw new Error("Le fournisseur est obligatoire.");

  const existing = await database.prepare(`
    SELECT id, name, is_active AS isActive
    FROM suppliers
    WHERE lower(name) = lower(?)
    LIMIT 1
  `).bind(normalized).first<{ id: number; name: string; isActive: number }>();

  if (existing) {
    if (!existing.isActive && !allowInactive) throw new Error("Ce fournisseur existe mais il est désactivé. Réactivez-le avant de créer un achat.");
    return { id: existing.id, name: existing.name };
  }

  const inserted = await database.prepare(`
    INSERT INTO suppliers (name)
    VALUES (?)
    RETURNING id, name
  `).bind(normalized).first<{ id: number; name: string }>();

  if (!inserted) throw new Error("Impossible de créer la fiche fournisseur.");
  return inserted;
}

export function buildPurchaseReference(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `BC-${stamp}-${suffix}`;
}

export function normalizedProcurementStatus(value: unknown, fallback = "Commandé") {
  const status = String(value || fallback).trim();
  return ["Brouillon", "Commandé", "Partiellement reçu", "Reçu", "Annulé"].includes(status)
    ? status
    : fallback;
}
