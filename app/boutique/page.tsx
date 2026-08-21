import { getPublicDb } from "../../db/public-db";
import { loadStorefrontCatalogFast } from "../../db/storefront-public-fast";
import StorefrontClientFast from "./storefront-client-fast";
import type { StorefrontCatalog } from "./storefront-types";

export const dynamic = "force-dynamic";

export default async function BoutiquePage() {
  let initialCatalog: StorefrontCatalog | null = null;
  try {
    const database = await getPublicDb();
    initialCatalog = await loadStorefrontCatalogFast(database);
  } catch (error) {
    console.error("Maison Jiya storefront preload failed", error);
  }
  return <StorefrontClientFast initialCatalog={initialCatalog} />;
}
