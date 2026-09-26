import { getRawDb } from "../../../../db";
import { getAuthenticatedUser } from "../../../auth";

type LiveOrder = {
  id: number;
  orderRef: string;
  customerName: string | null;
  products: string;
};

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store, max-age=0",
      pragma: "no-cache",
    },
  });
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return noStoreJson({ error: "Connexion requise." }, 401);

    const database = await getRawDb();
    const [state, orderResult] = await Promise.all([
      database.prepare(`
        SELECT current_version AS version
        FROM google_sheets_sync_state
        WHERE id = 1
      `).first<{ version: number }>(),
      database.prepare(`
        SELECT
          orders.id AS id,
          orders.order_ref AS orderRef,
          customers.name AS customerName,
          orders.products AS products
        FROM orders
        LEFT JOIN customers ON customers.id = orders.customer_id
        WHERE orders.deleted_at IS NULL
        ORDER BY orders.id DESC
        LIMIT 25
      `).all<LiveOrder>(),
    ]);

    return noStoreJson({
      version: Number(state?.version || 0),
      orders: orderResult.results,
    });
  } catch (error) {
    console.error("Maison Jiya live refresh failed", error instanceof Error ? error.message : String(error));
    return noStoreJson({ error: "Actualisation momentanément indisponible." }, 503);
  }
}
