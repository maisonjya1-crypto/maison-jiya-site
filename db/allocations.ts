import { getRawDb } from ".";

type AllocationOrder = {
  id: number;
  order_ref: string;
  sale_amount: number;
  product_cost: number;
  shipping_cost: number;
  ad_cost: number;
  fees: number;
  return_cost: number;
  paid_at: string | null;
  created_at: string;
};

export async function reconcileOrderAllocations(orderId?: number) {
  const database = await getRawDb();
  const query = `SELECT id, order_ref, sale_amount, product_cost, shipping_cost, ad_cost, fees, return_cost, paid_at, created_at
    FROM orders WHERE deleted_at IS NULL AND payment_status = 'Encaissé'${orderId ? " AND id = ?" : ""}`;
  const rows = orderId
    ? (await database.prepare(query).bind(orderId).all<AllocationOrder>()).results
    : (await database.prepare(query).all<AllocationOrder>()).results;
  if (!orderId) await database.prepare("DELETE FROM capital_ledger WHERE is_automatic = 1 AND order_id NOT IN (SELECT id FROM orders WHERE deleted_at IS NULL AND payment_status = 'Encaissé')").run();
  if (orderId) await database.prepare("DELETE FROM capital_ledger WHERE is_automatic = 1 AND order_id = ?").bind(orderId).run();
  for (const order of rows) {
    const profit = Math.max(0, order.sale_amount - order.product_cost - order.shipping_cost - order.ad_cost - order.fees - order.return_cost);
    const reinvestment = Math.floor(profit * 0.5);
    const salary = Math.floor(profit * 0.3);
    const emergency = profit - reinvestment - salary;
    const expected = new Map([[`order:${order.id}:reinvest`, reinvestment], [`order:${order.id}:salary`, salary], [`order:${order.id}:emergency`, emergency]]);
    const current = (await database.prepare("SELECT auto_key, amount FROM capital_ledger WHERE is_automatic = 1 AND order_id = ?").bind(order.id).all<{ auto_key: string; amount: number }>()).results;
    const alreadyCorrect = profit > 0 && current.length === 3 && current.every((entry) => expected.get(entry.auto_key) === entry.amount);
    if (alreadyCorrect) continue;
    if (current.length) await database.prepare("DELETE FROM capital_ledger WHERE is_automatic = 1 AND order_id = ?").bind(order.id).run();
    if (!profit) continue;
    const entryDate = (order.paid_at || order.created_at).slice(0, 10);
    await database.batch([
      database.prepare("INSERT INTO capital_ledger (direction, category, label, amount, account, order_id, is_automatic, auto_key, entry_date) VALUES ('Affectation', 'Réinvestissement', ?, ?, 'Réinvestissement', ?, 1, ?, ?)").bind(`50% du gain · ${order.order_ref}`, reinvestment, order.id, `order:${order.id}:reinvest`, entryDate),
      database.prepare("INSERT INTO capital_ledger (direction, category, label, amount, account, order_id, is_automatic, auto_key, entry_date) VALUES ('Affectation', 'Salaire personnel', ?, ?, 'Salaire personnel', ?, 1, ?, ?)").bind(`30% du gain · ${order.order_ref}`, salary, order.id, `order:${order.id}:salary`, entryDate),
      database.prepare("INSERT INTO capital_ledger (direction, category, label, amount, account, order_id, is_automatic, auto_key, entry_date) VALUES ('Affectation', 'Fonds d’urgence', ?, ?, 'Fonds d’urgence', ?, 1, ?, ?)").bind(`20% du gain · ${order.order_ref}`, emergency, order.id, `order:${order.id}:emergency`, entryDate),
    ]);
  }
  return rows.length;
}
