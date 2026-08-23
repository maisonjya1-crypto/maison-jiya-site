import { getPublicDb } from "../../db/public-db";
import { loadStorefrontCatalogFast } from "../../db/storefront-public-fast";
import StorefrontClientV3 from "./storefront-client-v3";
import type { StorefrontCatalog } from "./storefront-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BoutiquePage() {
  let initialCatalog: StorefrontCatalog | null = null;
  try {
    const database = await getPublicDb();
    initialCatalog = await loadStorefrontCatalogFast(database);
  } catch (error) {
    console.error("Maison Jiya storefront preload failed", error);
  }
  return <StorefrontClientV3 initialCatalog={initialCatalog} />;
}
