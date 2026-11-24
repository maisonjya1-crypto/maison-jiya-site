import type { StorefrontCatalog } from "../app/boutique/storefront-types";
import { productPath } from "./product-slug";
import { absoluteUrl, PUBLIC_SITE_URL } from "./site";
import { normalizeAudience } from "./storefront-extras";

// Flux catalogue pour Meta Commerce Manager (CSV relu automatiquement chaque jour).
// L'« id » est le même code que celui envoyé par le Pixel et l'API Conversions (content_ids).
const COLUMNS = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "additional_image_link", "brand", "product_type", "gender", "item_group_id"];

const csvCell = (value: string) => /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function metaCatalogCsv(catalog: StorefrontCatalog) {
  const brand = catalog.brand || "Maison Jiya";
  const rows = [...catalog.products, ...catalog.offers].flatMap((item) => {
    const images = item.images.map(absoluteUrl).filter(Boolean);
    if (!item.productCode || !images.length || item.salePrice <= 0) return [];
    const audience = normalizeAudience(item.audience);
    const description = (item.description?.trim() || `${item.name} — ${item.category}. Livraison partout au Maroc, paiement à la livraison.`).slice(0, 5000);
    return [[
      item.productCode,
      item.name.slice(0, 150),
      description,
      item.available ? "in stock" : "out of stock",
      "new",
      `${item.salePrice.toFixed(2)} MAD`,
      `${PUBLIC_SITE_URL}${productPath(item)}`,
      images[0],
      images.slice(1, 10).join(","),
      brand,
      item.kind === "offer" ? "Packs" : item.category,
      audience === "homme" ? "male" : audience === "femme" ? "female" : audience === "unisexe" ? "unisex" : "",
      "",
    ]];
  });
  return [COLUMNS, ...rows].map((row) => row.map((cell) => csvCell(String(cell))).join(",")).join("\n") + "\n";
}
