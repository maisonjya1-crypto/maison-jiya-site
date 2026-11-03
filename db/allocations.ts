import { getRawDb } from "./index";
import { allocationAmounts, allocationPolicyFromSettings } from "../lib/allocation-policy";

type AllocationOrder = {
  id: number;
  order_ref: string;
  sale_amount: number;
  product_cost: number;
  shipping_cost: number;
  fees: number;
  return_cost: number;
  paid_at: string | null;
  created_at: string;
};

type AutomaticEntry = { order_id: number; auto_key: string; amount: number };

// Une requête D1 = un appel. Les écritures sont regroupées en lots pour rester
// très loin de la limite Cloudflare de 1 000 requêtes par exécution.
const WRITE_BATCH_SIZE = 90;

/**
 * Recalcule les affectations automatiques du capital (réinvestissement, salaire,
 * fonds d'urgence) à partir de la marge des commandes encaissées.
 *
 * - Avec `orderId` : seule cette commande est recalculée (cas d'une modification).
 * - Sans `orderId` : toutes les commandes, en 2 lectures et quelques écritures
 *   groupées, quel que soit le nombre de commandes.
 */
export async function reconcileOrderAllocations(orderId?: number) {
  const database = await getRawDb();
  const allocationSettings = (await database.prepare(
    "SELECT key, value FROM settings WHERE key IN ('reinvestment_allocation', 'salary_allocation', 'emergency_allocation')",
  ).all<{ key: string; value: string }>()).results;
  const policy = allocationPolicyFromSettings(Object.fromEntries(allocationSettings.map((row) => [row.key, row.value])));

  const orderFilter = orderId ? " AND id = ?" : "";
  const orderQuery = database.prepare(`SELECT id, order_ref, sale_amount, product_cost, shipping_cost, fees, return_cost, paid_at, created_at
    FROM orders WHERE deleted_at IS NULL AND payment_status = 'Encaissé'${orderFilter}`);
  const entryQuery = database.prepare(`SELECT order_id, auto_key, amount FROM capital_ledger
    WHERE is_automatic = 1 AND order_id IS NOT NULL${orderId ? " AND order_id = ?" : ""}`);
  const [rows, entries] = await Promise.all([
    (orderId ? orderQuery.bind(orderId) : orderQuery).all<AllocationOrder>().then((result) => result.results),
    (orderId ? entryQuery.bind(orderId) : entryQuery).all<AutomaticEntry>().then((result) => result.results),
  ]);

  const entriesByOrder = new Map<number, AutomaticEntry[]>();
  for (const entry of entries) {
    const list = entriesByOrder.get(Number(entry.order_id));
    if (list) list.push(entry);
    else entriesByOrder.set(Number(entry.order_id), [entry]);
  }

  // Les écritures d'une même commande restent toujours dans le même lot (atomique).
  const groups: D1PreparedStatement[][] = [];
  const paidOrderIds = new Set<number>();

  for (const order of rows) {
    paidOrderIds.add(Number(order.id));
    const contribution = Math.max(0, order.sale_amount - order.product_cost - order.shipping_cost - order.fees - order.return_cost);
    const { reinvestment, salary, emergency } = allocationAmounts(contribution, policy);
    const expected = new Map([[`order:${order.id}:reinvest`, reinvestment], [`order:${order.id}:salary`, salary], [`order:${order.id}:emergency`, emergency]]);
    const current = entriesByOrder.get(Number(order.id)) || [];
    const alreadyCorrect = contribution > 0 && current.length === 3 && current.every((entry) => expected.get(entry.auto_key) === Number(entry.amount));
    if (alreadyCorrect) continue;
    const group: D1PreparedStatement[] = [];
    if (current.length) {
      group.push(database.prepare("DELETE FROM capital_ledger WHERE is_automatic = 1 AND order_id = ?").bind(order.id));
    }
    if (contribution) {
      const entryDate = (order.paid_at || order.created_at).slice(0, 10);
      group.push(
        database.prepare("INSERT INTO capital_ledger (direction, category, label, amount, account, order_id, is_automatic, auto_key, entry_date) VALUES ('Affectation', 'Réinvestissement', ?, ?, 'Réinvestissement', ?, 1, ?, ?)").bind(`${policy.reinvestment}% marge commande · ${order.order_ref}`, reinvestment, order.id, `order:${order.id}:reinvest`, entryDate),
        database.prepare("INSERT INTO capital_ledger (direction, category, label, amount, account, order_id, is_automatic, auto_key, entry_date) VALUES ('Affectation', 'Salaire personnel', ?, ?, 'Salaire personnel', ?, 1, ?, ?)").bind(`${policy.salary}% marge commande · ${order.order_ref}`, salary, order.id, `order:${order.id}:salary`, entryDate),
        database.prepare("INSERT INTO capital_ledger (direction, category, label, amount, account, order_id, is_automatic, auto_key, entry_date) VALUES ('Affectation', 'Fonds d’urgence', ?, ?, 'Fonds d’urgence', ?, 1, ?, ?)").bind(`${policy.emergency}% marge commande · ${order.order_ref}`, emergency, order.id, `order:${order.id}:emergency`, entryDate),
      );
    }
    if (group.length) groups.push(group);
  }

  // Affectations d'une commande qui n'est plus encaissée (annulée, supprimée, remboursée).
  const staleOrderIds = [...entriesByOrder.keys()].filter((id) => !paidOrderIds.has(id));
  if (orderId && !paidOrderIds.has(orderId) && !staleOrderIds.includes(orderId)) staleOrderIds.push(orderId);
  for (const staleOrderId of staleOrderIds) {
    groups.push([database.prepare("DELETE FROM capital_ledger WHERE is_automatic = 1 AND order_id = ?").bind(staleOrderId)]);
  }

  let pending: D1PreparedStatement[] = [];
  for (const group of groups) {
    if (pending.length && pending.length + group.length > WRITE_BATCH_SIZE) {
      await database.batch(pending);
      pending = [];
    }
    pending.push(...group);
  }
  if (pending.length) await database.batch(pending);
  return rows.length;
}
