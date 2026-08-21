import { getRawDb } from "../../../../db";
import { ensurePlatformUpgrades } from "../../../../db/platform-upgrades";

type PublicProductRow = {
  id: number;
  productCode: string;
  name: string;
  category: string;
  salePrice: number;
  stockQuantity: number;
};

type WhatsAppNumber = {
  label?: string;
  phone?: string;
  isDefault?: boolean;
};

function cacheHeaders() {
  return {
    "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  };
}

export async function GET() {
  try {
    const database = await getRawDb();
    await ensurePlatformUpgrades(database);

    const products = (await database.prepare(`
      SELECT
        id,
        product_code AS productCode,
        name,
        category,
        sale_price AS salePrice,
        stock_quantity AS stockQuantity
      FROM products
      WHERE stock_quantity > 0
      ORDER BY category COLLATE NOCASE, name COLLATE NOCASE
      LIMIT 500
    `).all<PublicProductRow>()).results;

    const settingsRows = (await database.prepare(`
      SELECT key, value
      FROM settings
      WHERE key IN ('account_name', 'whatsapp_numbers', 'storefront_announcement')
    `).all<{ key: string; value: string }>()).results;
    const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));

    let whatsapp = "";
    try {
      const parsed = JSON.parse(settings.whatsapp_numbers || "[]") as WhatsAppNumber[];
      const preferred = parsed.find((item) => item?.isDefault && item?.phone) || parsed.find((item) => item?.phone);
      whatsapp = typeof preferred?.phone === "string" ? preferred.phone.replace(/\D/g, "") : "";
    } catch {
      whatsapp = "";
    }

    const publicProducts = products.map((product) => ({
      id: product.id,
      productCode: product.productCode,
      name: product.name,
      category: product.category || "Autre",
      salePrice: Math.max(0, Number(product.salePrice) || 0),
      availability: product.stockQuantity > 0 ? "En stock" : "Indisponible",
      lowStock: product.stockQuantity > 0 && product.stockQuantity <= 3,
    }));

    return Response.json({
      brand: settings.account_name?.trim() || "Maison Jiya",
      announcement: settings.storefront_announcement?.trim() || "Paiement à la livraison partout au Maroc",
      whatsapp,
      products: publicProducts,
      categories: Array.from(new Set(publicProducts.map((product) => product.category))),
    }, { headers: cacheHeaders() });
  } catch (error) {
    console.error("Maison Jiya storefront catalog failed", error);
    return Response.json({ error: "Le catalogue est momentanément indisponible." }, {
      status: 503,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
}
