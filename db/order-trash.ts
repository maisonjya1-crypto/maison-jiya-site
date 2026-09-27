type TrashOrderRow = {
  id: number;
  orderRef: string;
  productId: number | null;
  quantity: number;
  status: string;
  stockDeducted: number;
  deletedAt: string | null;
};

const stockCommittedStatuses = new Set(["Confirmée", "Expédiée", "En livraison", "Livrée", "Retour"]);

async function readOrder(database: D1Database, orderId: number) {
  return database.prepare(`
    SELECT
      id,
      order_ref AS orderRef,
      product_id AS productId,
      quantity,
      status,
      stock_deducted AS stockDeducted,
      deleted_at AS deletedAt
    FROM orders
    WHERE id = ?
    LIMIT 1
  `).bind(orderId).first<TrashOrderRow>();
}

function singleProductTransitionStatements(
  database: D1Database,
  order: TrashOrderRow,
  nextStockDeducted: boolean,
  now: string,
) {
  if (!order.productId || Boolean(order.stockDeducted) === nextStockDeducted) return [] as D1PreparedStatement[];

  if (nextStockDeducted) {
    return [
      database.prepare("UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?")
        .bind(order.quantity, order.productId),
      database.prepare(`
        INSERT INTO stock_movements (product_id, order_id, movement_type, quantity, note, created_at)
        VALUES (?, ?, 'Commande', ?, ?, ?)
      `).bind(order.productId, order.id, order.quantity, `Déduction après restauration · ${order.orderRef}`, now),
    ];
  }

  return [
    database.prepare("UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?")
      .bind(order.quantity, order.productId),
    database.prepare(`
      INSERT INTO stock_movements (product_id, order_id, movement_type, quantity, note, created_at)
      VALUES (?, ?, 'Réintégration', ?, ?, ?)
    `).bind(order.productId, order.id, order.quantity, `Réintégration corbeille · ${order.orderRef}`, now),
  ];
}

async function ensureSingleProductStock(database: D1Database, order: TrashOrderRow) {
  if (!order.productId) return;
  const product = await database.prepare(
    "SELECT stock_quantity AS stockQuantity FROM products WHERE id = ? LIMIT 1",
  ).bind(order.productId).first<{ stockQuantity: number }>();
  if (!product) throw new Error("Le produit associé à cette commande est introuvable.");
  if (product.stockQuantity < order.quantity) {
    throw new Error(`Stock insuffisant pour restaurer cette commande : ${product.stockQuantity} unité(s) disponible(s).`);
  }
}

export async function moveOrderToTrash(
  database: D1Database,
  orderId: number,
  deletedByUserId: number,
  deletedAt = new Date().toISOString(),
) {
  const order = await readOrder(database, orderId);
  if (!order || order.deletedAt) throw new Error("Commande introuvable.");

  const statements: D1PreparedStatement[] = [
    database.prepare(`
      UPDATE orders
      SET deleted_at = ?,
          deleted_by_user_id = ?,
          stock_deducted = 0,
          updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).bind(deletedAt, deletedByUserId, deletedAt, orderId),
    ...singleProductTransitionStatements(database, order, false, deletedAt),
  ];

  const results = await database.batch(statements);
  if (!results[0]?.meta?.changes) throw new Error("Commande introuvable.");
  return { orderRef: order.orderRef, stockRestored: Boolean(order.stockDeducted) };
}

export async function restoreOrderFromTrash(
  database: D1Database,
  orderId: number,
  restoredAt = new Date().toISOString(),
) {
  const order = await readOrder(database, orderId);
  if (!order || !order.deletedAt) throw new Error("Commande absente de la corbeille.");

  const shouldDeduct = stockCommittedStatuses.has(order.status);
  if (shouldDeduct && !order.stockDeducted && order.productId) await ensureSingleProductStock(database, order);

  try {
    const results = await database.batch([
      database.prepare(`
        UPDATE orders
        SET deleted_at = NULL,
            deleted_by_user_id = NULL,
            stock_deducted = ?,
            updated_at = ?
        WHERE id = ? AND deleted_at IS NOT NULL
      `).bind(shouldDeduct ? 1 : 0, restoredAt, orderId),
      ...singleProductTransitionStatements(database, order, shouldDeduct, restoredAt),
    ]);
    if (!results[0]?.meta?.changes) throw new Error("Commande absente de la corbeille.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLocaleLowerCase("fr").includes("stock insuffisant")) {
      throw new Error("Stock insuffisant pour restaurer cette commande. Réapprovisionnez le stock puis réessayez.");
    }
    throw error;
  }

  return { orderRef: order.orderRef, stockDeducted: shouldDeduct };
}

export async function releaseTrashedOrderStock(
  database: D1Database,
  orderId: number,
  releasedAt = new Date().toISOString(),
) {
  const order = await readOrder(database, orderId);
  if (!order || !order.deletedAt) throw new Error("Cette commande n’est pas dans la corbeille.");
  if (!order.stockDeducted) return { orderRef: order.orderRef, stockRestored: false };

  await database.batch([
    database.prepare("UPDATE orders SET stock_deducted = 0, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL")
      .bind(releasedAt, orderId),
    ...singleProductTransitionStatements(database, order, false, releasedAt),
  ]);
  return { orderRef: order.orderRef, stockRestored: true };
}
