import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { ensureGoogleSheetsSyncSchema } from "./google-sheets-sync";
import { ensureLegacySchemaCompatibility } from "./schema-compat";

let databaseReady: Promise<void> | null = null;

async function initializeDatabase(database: D1Database) {
  await ensureLegacySchemaCompatibility(database);
  await ensureGoogleSheetsSyncSchema(database);
  await database.prepare(`
    INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_name, changed_at)
    SELECT orders.id, NULL, orders.status, 'État initial', COALESCE(orders.updated_at, orders.created_at)
    FROM orders
    WHERE NOT EXISTS (
      SELECT 1 FROM order_status_history WHERE order_status_history.order_id = orders.id
    )
  `).run();
}

export async function getRawDb() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure the `DB` binding in wrangler.jsonc before using the database."
    );
  }

  if (!databaseReady) databaseReady = initializeDatabase(env.DB);

  try {
    await databaseReady;
  } catch (error) {
    databaseReady = null;
    throw error;
  }

  return env.DB;
}

export async function getDb() {
  return drizzle(await getRawDb(), { schema });
}
