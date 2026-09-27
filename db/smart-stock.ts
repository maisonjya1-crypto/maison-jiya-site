export type SmartStockRecommendation = {
  productId: number;
  productCode: string;
  productName: string;
  category: string;
  stockQuantity: number;
  alertThreshold: number;
  coverDays: number;
  soldUnits30: number;
  averageDailyDemand: number;
  daysOfCover: number | null;
  pendingInbound: number;
  targetStock: number;
  recommendedQuantity: number;
  supplier: string;
  unitCost: number;
  estimatedCost: number;
  lastPurchaseAt: string | null;
  status: "Rupture" | "Critique" | "À prévoir" | "OK";
};

type ProductRow = {
  id: number;
  productCode: string;
  productName: string;
  category: string;
  stockQuantity: number;
  alertThreshold: number;
  coverDays: number;
  purchasePrice: number;
};

type DemandRow = { productId: number; units: number };
type PendingRow = { productId: number; units: number };
type SupplierRow = { productId: number; supplier: string; unitCost: number; createdAt: string };

function nonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round((parsed + Number.EPSILON) * 100) / 100) : 0;
}

export async function buildSmartStockRecommendations(database: D1Database): Promise<SmartStockRecommendation[]> {
  const [productsResult, demandResult, pendingResult, supplierResult] = await Promise.all([
    database.prepare(`
      SELECT
        id,
        product_code AS productCode,
        name AS productName,
        category,
        stock_quantity AS stockQuantity,
        stock_alert_threshold AS alertThreshold,
        reorder_cover_days AS coverDays,
        purchase_price AS purchasePrice
      FROM products
      WHERE archived_at IS NULL
      ORDER BY name COLLATE NOCASE, id
    `).all<ProductRow>(),
    database.prepare(`
      SELECT
        product_id AS productId,
        MAX(0, SUM(
          CASE
            WHEN movement_type = 'Commande' THEN quantity
            WHEN movement_type = 'Réintégration' THEN -quantity
            ELSE 0
          END
        )) AS units
      FROM stock_movements
      WHERE product_id IS NOT NULL
        AND movement_type IN ('Commande', 'Réintégration')
        AND datetime(created_at) >= datetime('now', '-30 days')
      GROUP BY product_id
    `).all<DemandRow>(),
    database.prepare(`
      SELECT
        product_id AS productId,
        SUM(CASE WHEN quantity > received_quantity THEN quantity - received_quantity ELSE 0 END) AS units
      FROM purchases
      WHERE product_id IS NOT NULL
        AND quantity > received_quantity
      GROUP BY product_id
    `).all<PendingRow>(),
    database.prepare(`
      SELECT productId, supplier, unitCost, createdAt
      FROM (
        SELECT
          product_id AS productId,
          supplier,
          unit_cost AS unitCost,
          created_at AS createdAt,
          ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY datetime(created_at) DESC, id DESC) AS rowNumber
        FROM purchases
        WHERE product_id IS NOT NULL
      )
      WHERE rowNumber = 1
    `).all<SupplierRow>(),
  ]);

  const demand = new Map(demandResult.results.map((row) => [Number(row.productId), nonNegativeInteger(row.units)]));
  const pending = new Map(pendingResult.results.map((row) => [Number(row.productId), nonNegativeInteger(row.units)]));
  const suppliers = new Map(supplierResult.results.map((row) => [Number(row.productId), row]));

  return productsResult.results.map((product) => {
    const stockQuantity = nonNegativeInteger(product.stockQuantity);
    const alertThreshold = nonNegativeInteger(product.alertThreshold);
    const coverDays = Math.min(180, Math.max(1, nonNegativeInteger(product.coverDays) || 30));
    const soldUnits30 = demand.get(product.id) || 0;
    const averageDailyDemand = soldUnits30 / 30;
    const pendingInbound = pending.get(product.id) || 0;
    const targetStock = Math.max(
      alertThreshold,
      Math.ceil((averageDailyDemand * coverDays) + alertThreshold),
    );
    const recommendedQuantity = Math.max(0, targetStock - stockQuantity - pendingInbound);
    const latestSupplier = suppliers.get(product.id);
    const unitCost = money(latestSupplier?.unitCost || product.purchasePrice);
    const estimatedCost = money(recommendedQuantity * unitCost);
    const daysOfCover = averageDailyDemand > 0
      ? Math.round((stockQuantity / averageDailyDemand) * 10) / 10
      : null;
    const status: SmartStockRecommendation["status"] = stockQuantity === 0
      ? "Rupture"
      : stockQuantity <= alertThreshold
        ? "Critique"
        : recommendedQuantity > 0
          ? "À prévoir"
          : "OK";

    return {
      productId: product.id,
      productCode: product.productCode,
      productName: product.productName,
      category: product.category,
      stockQuantity,
      alertThreshold,
      coverDays,
      soldUnits30,
      averageDailyDemand: Math.round(averageDailyDemand * 100) / 100,
      daysOfCover,
      pendingInbound,
      targetStock,
      recommendedQuantity,
      supplier: latestSupplier?.supplier?.trim() || "Fournisseur à renseigner",
      unitCost,
      estimatedCost,
      lastPurchaseAt: latestSupplier?.createdAt || null,
      status,
    };
  }).sort((left, right) => {
    const priority = { Rupture: 0, Critique: 1, "À prévoir": 2, OK: 3 } as const;
    return priority[left.status] - priority[right.status]
      || right.recommendedQuantity - left.recommendedQuantity
      || left.productName.localeCompare(right.productName, "fr");
  });
}
