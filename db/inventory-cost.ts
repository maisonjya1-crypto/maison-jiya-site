export type PurchaseReceiptResult = {
  purchaseId: number;
  supplier: string;
  item: string;
  productId: number;
  productCode: string;
  productName: string;
  receivedQuantity: number;
  totalReceivedQuantity: number;
  remainingQuantity: number;
  procurementStatus: "Partiellement reçu" | "Reçu";
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

export async function receivePurchaseIntoStock(
  database: D1Database,
  purchaseId: number,
  requestedQuantityOrReceivedAt?: number | string,
  receivedAtInput?: string,
): Promise<PurchaseReceiptResult> {
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

  const remainingBefore = purchase.quantity - purchase.receivedQuantity;
  const receivedAt = typeof requestedQuantityOrReceivedAt === "string"
    ? requestedQuantityOrReceivedAt
    : receivedAtInput || new Date().toISOString();
  const requestedQuantity = typeof requestedQuantityOrReceivedAt === "number"
    ? Math.round(requestedQuantityOrReceivedAt)
    : remainingBefore;

  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
    throw new Error("La quantité réceptionnée doit être un entier supérieur à zéro.");
  }
  if (requestedQuantity > remainingBefore) {
    throw new Error(`Vous ne pouvez réceptionner que ${remainingBefore} unité(s) restante(s).`);
  }

  const totalReceivedQuantity = purchase.receivedQuantity + requestedQuantity;
  const remainingQuantity = purchase.quantity - totalReceivedQuantity;
  const procurementStatus = remainingQuantity === 0 ? "Reçu" : "Partiellement reçu";
  const expectedAverageCost = weightedAverageUnitCost(
    product.stockQuantity,
    product.purchasePrice,
    requestedQuantity,
    purchase.unitCost,
  );

  const results = await database.batch([
    database.prepare(`
      UPDATE purchases
      SET received_quantity = received_quantity + ?,
          received_at = ?,
          procurement_status = ?
      WHERE id = ?
        AND product_id = ?
        AND received_quantity + ? <= quantity
        AND received_quantity < quantity
        AND procurement_status IN ('Commandé', 'Partiellement reçu')
        AND EXISTS (
          SELECT 1 FROM products WHERE id = ? AND archived_at IS NULL
        )
    `).bind(
      requestedQuantity,
      receivedAt,
      procurementStatus,
      purchase.id,
      purchase.productId,
      requestedQuantity,
      purchase.productId,
    ),
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
            AND received_quantity >= ?
        )
    `).bind(
      purchase.unitCost,
      requestedQuantity,
      requestedQuantity,
      requestedQuantity,
      purchase.productId,
      purchase.id,
      purchase.productId,
      receivedAt,
      totalReceivedQuantity,
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
          AND received_quantity >= ?
      )
    `).bind(
      purchase.productId,
      purchase.id,
      requestedQuantity,
      `Réception fournisseur · ${purchase.supplier} · ${purchase.item}`,
      receivedAt,
      purchase.id,
      purchase.productId,
      receivedAt,
      totalReceivedQuantity,
    ),
  ]);

  if (!results[0]?.meta?.changes) throw new Error("Cette réception n’a pas été enregistrée. Rechargez les données puis réessayez.");

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
    receivedQuantity: requestedQuantity,
    totalReceivedQuantity,
    remainingQuantity,
    procurementStatus,
    previousStock: product.stockQuantity,
    newStock: refreshed?.stockQuantity ?? product.stockQuantity + requestedQuantity,
    previousAverageCost: product.purchasePrice,
    receivedUnitCost: purchase.unitCost,
    newAverageCost: refreshed?.purchasePrice ?? expectedAverageCost,
  };
}

export type PurchaseLineReceiptResult =
  | (PurchaseReceiptResult & { stockUpdated: true })
  | {
      purchaseId: number;
      supplier: string;
      item: string;
      productId: null;
      productName: string;
      receivedQuantity: number;
      totalReceivedQuantity: number;
      remainingQuantity: number;
      procurementStatus: "Partiellement reçu" | "Reçu";
      stockUpdated: false;
    };

export async function receivePurchaseLine(
  database: D1Database,
  purchaseId: number,
  requestedQuantity?: number,
  receivedAtInput = new Date().toISOString(),
): Promise<PurchaseLineReceiptResult> {
  const purchase = await database.prepare(`
    SELECT
      id,
      supplier,
      item,
      product_id AS productId,
      quantity,
      received_quantity AS receivedQuantity,
      procurement_status AS procurementStatus
    FROM purchases
    WHERE id = ?
    LIMIT 1
  `).bind(purchaseId).first<PurchaseRow & { procurementStatus: string }>();

  if (!purchase) throw new Error("Achat introuvable.");
  if (purchase.productId) {
    const result = await receivePurchaseIntoStock(database, purchaseId, requestedQuantity, receivedAtInput);
    return { ...result, stockUpdated: true };
  }
  if (!["Commandé", "Partiellement reçu"].includes(purchase.procurementStatus)) {
    throw new Error("Cette ligne ne peut pas être réceptionnée dans son état actuel.");
  }
  if (purchase.receivedQuantity >= purchase.quantity) throw new Error("Cette ligne a déjà été entièrement réceptionnée.");

  const remainingBefore = purchase.quantity - purchase.receivedQuantity;
  const quantity = requestedQuantity === undefined ? remainingBefore : Math.round(requestedQuantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("La quantité réceptionnée doit être un entier supérieur à zéro.");
  }
  if (quantity > remainingBefore) {
    throw new Error(`Vous ne pouvez réceptionner que ${remainingBefore} unité(s) restante(s).`);
  }

  const totalReceivedQuantity = purchase.receivedQuantity + quantity;
  const remainingQuantity = purchase.quantity - totalReceivedQuantity;
  const procurementStatus = remainingQuantity === 0 ? "Reçu" : "Partiellement reçu";
  const result = await database.prepare(`
    UPDATE purchases
    SET received_quantity = received_quantity + ?,
        received_at = ?,
        procurement_status = ?
    WHERE id = ?
      AND product_id IS NULL
      AND received_quantity + ? <= quantity
      AND received_quantity < quantity
      AND procurement_status IN ('Commandé', 'Partiellement reçu')
  `).bind(quantity, receivedAtInput, procurementStatus, purchase.id, quantity).run();

  if (!result.meta?.changes) throw new Error("Cette réception n’a pas été enregistrée. Rechargez les données puis réessayez.");

  return {
    purchaseId: purchase.id,
    supplier: purchase.supplier,
    item: purchase.item,
    productId: null,
    productName: purchase.item,
    receivedQuantity: quantity,
    totalReceivedQuantity,
    remainingQuantity,
    procurementStatus,
    stockUpdated: false,
  };
}

export async function receivePurchaseOrderImmediately(
  database: D1Database,
  purchaseRef: string,
  receivedAtInput = new Date().toISOString(),
) {
  const result = await database.prepare(`
    SELECT id, quantity
    FROM purchases
    WHERE purchase_ref = ?
    ORDER BY purchase_line_no, id
  `).bind(purchaseRef).all<{ id: number; quantity: number }>();

  if (!result.results.length) throw new Error("Bon de commande introuvable.");
  const receipts: PurchaseLineReceiptResult[] = [];
  for (const line of result.results) {
    receipts.push(await receivePurchaseLine(database, line.id, Number(line.quantity || 0), receivedAtInput));
  }
  return receipts;
}
