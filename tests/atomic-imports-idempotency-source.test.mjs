import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("les saisies sensibles utilisent une clé de requête réutilisable en cas de retry", async () => {
  const [dashboard, route, schema] = await Promise.all([
    read("app/dashboard-client.tsx"),
    read("app/api/data/route.ts"),
    read("db/schema.ts"),
  ]);

  assert.match(dashboard, /const requestKey =/);
  assert.match(dashboard, /crypto\.randomUUID/);
  assert.match(dashboard, /MUTATION_IN_PROGRESS/);
  assert.match(dashboard, /retrySafeMutationActions/);
  assert.match(route, /reserveMutationReceipt/);
  assert.match(route, /completeMutationReceipt/);
  assert.match(route, /releaseMutationReceipt/);
  assert.match(route, /Cette opération avait déjà été enregistrée/);
  assert.match(schema, /export const mutationReceipts = sqliteTable/);
  assert.match(schema, /requestKey: text\("request_key"\)\.notNull\(\)\.unique\(\)/);
});

test("les imports commandes sont validés avant puis appliqués dans un seul batch D1", async () => {
  const route = await read("app/api/data/route.ts");
  const start = route.indexOf('payload.action === "importOrders"');
  const end = route.indexOf('payload.action === "addOrder"', start);
  const block = route.slice(start, end);

  assert.match(block, /committedByProduct/);
  assert.match(block, /protectMutation\("importOrders"\)/);
  assert.match(block, /const statements = \[\] as ReturnType<typeof rawDatabase\.prepare>\[\]/);
  assert.match(block, /ON CONFLICT\(phone\) DO UPDATE/);
  assert.match(block, /INSERT INTO orders/);
  assert.match(block, /INSERT INTO order_status_history/);
  assert.match(block, /INSERT INTO stock_movements/);
  assert.match(block, /await rawDatabase\.batch\(statements\)/);
  assert.doesNotMatch(block, /for \(const item of normalizedRows\)[\s\S]*?await db\.insert\(orders\)/);
});

test("les imports produits sont tout-ou-rien et gardent la gestion des conflits", async () => {
  const route = await read("app/api/data/route.ts");
  const start = route.indexOf('payload.action === "importProducts"');
  const end = route.indexOf('payload.action === "addProduct"', start);
  const block = route.slice(start, end);

  assert.match(block, /uploadCodes\.has\(code\)/);
  assert.match(block, /conflictMode\) === "update"/);
  assert.match(block, /protectMutation\("importProducts"\)/);
  assert.match(block, /INSERT INTO products/);
  assert.match(block, /UPDATE products/);
  assert.match(block, /INSERT INTO stock_movements/);
  assert.match(block, /await rawDatabase\.batch\(statements\)/);
  assert.doesNotMatch(block, /await db\.insert\(products\).*returning/);
});

test("la création de commande et le client sont enregistrés atomiquement", async () => {
  const route = await read("app/api/data/route.ts");
  const start = route.indexOf('payload.action === "addOrder"');
  const end = route.indexOf('payload.action === "updateOrder"', start);
  const block = route.slice(start, end);

  assert.match(block, /protectMutation\("addOrder"\)/);
  assert.match(block, /INSERT INTO customers/);
  assert.match(block, /ON CONFLICT\(phone\) DO UPDATE/);
  assert.match(block, /SELECT id FROM customers WHERE phone = \?/);
  assert.match(block, /await rawDb\.batch\(statements\)/);
  assert.doesNotMatch(block, /await db\.insert\(customers\)/);
});

test("une erreur d'audit après une mutation ne transforme plus la saisie validée en échec métier", async () => {
  const route = await read("app/api/data/route.ts");

  assert.match(route, /businessMutationCommitted = true/);
  assert.match(route, /try \{\n      await writeAudit/);
  assert.match(route, /audit write failed after committed mutation/);
  assert.match(route, /const responseData = await snapshot\(access\)/);
  assert.doesNotMatch(route, /const refreshedUser = await getAuthenticatedUser\(request\)/);
});
