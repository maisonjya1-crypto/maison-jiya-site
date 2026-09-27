export type PurchaseReceiptResult = {
  purchaseId: number;
  supplier: string;
  item: string;
  productId: number;
  productCode: string;
  productName: string;
  receivedQuantity: number;
  previousStock: number;
  newStock: number;
  previousAverageCost: number;
  receivedUnitCost: number;
  newAverageCost: number;
};

type PurchaseRow = {
  id: number;
  supplier: string;
  item: string;
  productId: number | null;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
};

type ProductRow = {
  id: number;
  productCode: string;
  name: string;
  purchasePrice: number;
  stockQuantity: number;
};

function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function weightedAverageUnitCost(
  currentStock: number,
  currentAverageCost: number,
  receivedQuantity: number,
  receivedUnitCost: number,
) {
  const stock = Math.max(0, Number(currentStock) || 0);
  const quantity = Math.max(0, Number(receivedQuantity) || 0);
  if (!quantity) return roundMoney(Math.max(0, Number(currentAverageCost) || 0));
  const currentCost = Math.max(0, Number(currentAverageCost) || 0);
  const incomingCost = Math.max(0, Number(receivedUnitCost) || 0);
  return roundMoney(((stock * currentCost) + (quantity * incomingCost)) / (stock + quantity));
}

export async function receivePurchaseIntoStock(database: D1Database, purchaseId: number, receivedAt = new Date().toISOString()): Promise<PurchaseReceiptResult> {
  const purchase = await database.prepare(`
    SELECT
      id,
      supplier,
      item,
      product_id AS productId,
      quantity,
      received_quantity AS receivedQuantity,
      unit_cost AS unitCost
    FROM purchases
    WHERE id = ?
    LIMIT 1
  `).bind(purchaseId).first<PurchaseRow>();

  if (!purchase) throw new Error("Achat introuvable.");
  if (!purchase.productId) throw new Error("Reliez d’abord cet achat à un produit du catalogue.");
  if (purchase.receivedQuantity >= purchase.quantity) throw new Error("Cet achat a déjà été réceptionné dans le stock.");

  const product = await database.prepare(`
    SELECT
      id,
      product_code AS productCode,
      name,
      purchase_price AS purchasePrice,
      stock_quantity AS stockQuantity
    FROM products
    WHERE id = ? AND archived_at IS NULL
    LIMIT 1
  `).bind(purchase.productId).first<ProductRow>();

  if (!product) throw new Error("Le produit lié à cet achat est introuvable.");

  const remaining = purchase.quantity - purchase.receivedQuantity;
  const expectedAverageCost = weightedAverageUnitCost(
    product.stockQuantity,
    product.purchasePrice,
    remaining,
    purchase.unitCost,
  );

  const results = await database.batch([
    database.prepare(`
      UPDATE purchases
      SET received_quantity = quantity,
          received_at = ?
      WHERE id = ?
        AND product_id = ?
        AND received_quantity < quantity
        AND EXISTS (
          SELECT 1 FROM products WHERE id = ? AND archived_at IS NULL
        )
    `).bind(receivedAt, purchase.id, purchase.productId, purchase.productId),
    database.prepare(`
      UPDATE products
      SET purchase_price = ROUND(
            ((purchase_price * stock_quantity) + (? * ?))
            / (stock_quantity + ?),
            2
          ),
          stock_quantity = stock_quantity + ?
      WHERE id = ?
        AND archived_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM purchases
          WHERE id = ?
            AND product_id = ?
            AND received_at = ?
        )
    `).bind(
      purchase.unitCost,
      remaining,
      remaining,
      remaining,
      purchase.productId,
      purchase.id,
      purchase.productId,
      receivedAt,
    ),
    database.prepare(`
      INSERT INTO stock_movements (product_id, purchase_id, movement_type, quantity, note, created_at)
      SELECT ?, ?, 'Réception fournisseur', ?, ?, ?
      WHERE EXISTS (
        SELECT 1
        FROM purchases
        WHERE id = ?
          AND product_id = ?
          AND received_at = ?
      )
    `).bind(
      purchase.productId,
      purchase.id,
      remaining,
      `Réception fournisseur · ${purchase.supplier} · ${purchase.item}`,
      receivedAt,
      purchase.id,
      purchase.productId,
      receivedAt,
    ),
  ]);

  if (!results[0]?.meta?.changes) throw new Error("Cet achat vient déjà d’être réceptionné.");

  const refreshed = await database.prepare(`
    SELECT purchase_price AS purchasePrice, stock_quantity AS stockQuantity
    FROM products
    WHERE id = ?
    LIMIT 1
  `).bind(purchase.productId).first<{ purchasePrice: number; stockQuantity: number }>();

  return {
    purchaseId: purchase.id,
    supplier: purchase.supplier,
    item: purchase.item,
    productId: purchase.productId,
    productCode: product.productCode,
    productName: product.name,
    receivedQuantity: remaining,
    previousStock: product.stockQuantity,
    newStock: refreshed?.stockQuantity ?? product.stockQuantity + remaining,
    previousAverageCost: product.purchasePrice,
    receivedUnitCost: purchase.unitCost,
    newAverageCost: refreshed?.purchasePrice ?? expectedAverageCost,
  };
}
