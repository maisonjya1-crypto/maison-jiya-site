import { getAuthenticatedUser } from "../../../auth";
import { getRawDb } from "../../../../db";
import { ensurePlatformUpgrades } from "../../../../db/platform-upgrades";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });

  const orderRef = new URL(request.url).searchParams.get("ref")?.trim().slice(0, 80) || "";
  if (!orderRef) return Response.json({ error: "Référence de commande manquante." }, { status: 400 });

  const database = await getRawDb();
  await ensurePlatformUpgrades(database);
  const row = await database.prepare(`
    SELECT order_ref AS orderRef, items_json AS itemsJson, pack_name AS packName,
           stock_deducted AS stockDeducted
    FROM orders
    WHERE order_ref = ? AND deleted_at IS NULL
    LIMIT 1
  `).bind(orderRef).first<{ orderRef: string; itemsJson: string | null; packName: string | null; stockDeducted: number }>();

  if (!row) return Response.json({ error: "Commande introuvable." }, { status: 404 });

  let items: unknown[] = [];
  try {
    const parsed = row.itemsJson ? JSON.parse(row.itemsJson) : [];
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    items = [];
  }

  return Response.json({
    orderRef: row.orderRef,
    hasStructuredItems: items.length > 0,
    itemCount: items.length,
    packName: row.packName || "",
    stockDeducted: Boolean(row.stockDeducted),
  });
}
