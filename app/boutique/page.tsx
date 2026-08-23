import { getRawDb } from "../../db";
import { getPublicDb } from "../../db/public-db";
import { ensureStorefrontCms } from "../../db/storefront-cms";
import { loadStorefrontCatalogFast } from "../../db/storefront-public-fast";
import StorefrontClientV3 from "./storefront-client-v3";
import type { StorefrontCatalog } from "./storefront-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function ensureManualCatalogReady() {
  const database = await getRawDb();
  const ready = await database.prepare("SELECT value FROM settings WHERE key = 'storefront_manual_catalog_initialized_v1' LIMIT 1").first<{ value: string }>();
  if (!ready?.value) await ensureStorefrontCms(database);
}

export default async function BoutiquePage() {
  let initialCatalog: StorefrontCatalog | null = null;
  try {
    await ensureManualCatalogReady();
    const database = await getPublicDb();
    initialCatalog = await loadStorefrontCatalogFast(database);
  } catch (error) {
    console.error("Maison Jiya storefront preload failed", error);
  }
  return <StorefrontClientV3 initialCatalog={initialCatalog} />;
}
