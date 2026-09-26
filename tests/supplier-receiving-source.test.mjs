import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [schema, compat, route, dashboard, backups, sheets] = await Promise.all([
  readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/schema-compat.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
  readFile(new URL("../db/backups.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/backup/google-sheets/route.ts", import.meta.url), "utf8"),
]);

test("les achats peuvent être liés à un produit et mémorisent leur réception", () => {
  assert.match(schema, /productId: integer\("product_id"\).*products\.id/);
  assert.match(schema, /receivedQuantity: integer\("received_quantity"\).*default\(0\)/);
  assert.match(schema, /receivedAt: text\("received_at"\)/);
  assert.match(schema, /purchaseId: integer\("purchase_id"\).*purchases\.id/);
  assert.match(compat, /ensurePurchaseColumns/);
  assert.match(compat, /stock_movements_purchase_id_idx/);
});

test("la réception fournisseur ajoute le stock une seule fois et crée un mouvement traçable", () => {
  const start = route.indexOf('payload.action === "receivePurchase"');
  const end = route.indexOf('payload.action === "deletePurchase"', start);
  assert.ok(start >= 0 && end > start, "action receivePurchase introuvable");
  const action = route.slice(start, end);
  assert.match(action, /received_quantity < quantity/);
  assert.match(action, /SET stock_quantity = stock_quantity \+ \?/);
  assert.match(action, /'Réception fournisseur'/);
  assert.match(action, /purchase_id/);
  assert.match(action, /results\[0\]\?\.meta\?\.changes/);
});

test("un achat réceptionné ne peut plus être supprimé ni changer de produit ou quantité", () => {
  assert.match(route, /Cet achat a déjà été réceptionné\. Le produit et la quantité doivent rester inchangés/);
  assert.match(route, /Cet achat a déjà alimenté le stock et doit rester dans l’historique/);
  assert.match(route, /Ce produit a encore une réception fournisseur en attente/);
});

test("l’interface sépare l’achat de la réception réelle du stock", () => {
  assert.match(dashboard, /Achat ≠ stock reçu/);
  assert.match(dashboard, /Réceptionner le stock/);
  assert.match(dashboard, /receivePurchase/);
  assert.match(dashboard, /Produit lié au stock/);
  assert.match(dashboard, /Réception fournisseur/);
});

test("sauvegardes et Google Sheets conservent les liens de réception fournisseur", () => {
  assert.match(backups, /"product_id".*"received_quantity".*"received_at"/);
  assert.match(backups, /"purchase_id"/);
  assert.match(backups, /UPDATE stock_movements SET purchase_id = NULL/);
  assert.match(sheets, /Quantité réceptionnée/);
  assert.match(sheets, /ID achat fournisseur/);
});


test("les index de réception sont créés seulement après l’ajout des colonnes sur une base existante", () => {
  const schemaEnd = compat.indexOf("async function ensureOrderColumns");
  const bootstrap = compat.slice(0, schemaEnd);
  assert.doesNotMatch(bootstrap, /CREATE INDEX IF NOT EXISTS purchases_product_id_idx/);
  assert.doesNotMatch(bootstrap, /CREATE INDEX IF NOT EXISTS stock_movements_purchase_id_idx/);

  const purchaseStart = compat.indexOf("async function ensurePurchaseColumns");
  const purchaseEnd = compat.indexOf("async function ensureProductColumns", purchaseStart);
  const purchaseEnsure = compat.slice(purchaseStart, purchaseEnd);
  assert.match(purchaseEnsure, /ALTER TABLE purchases ADD COLUMN product_id/);
  assert.match(purchaseEnsure, /CREATE INDEX IF NOT EXISTS purchases_product_id_idx/);

  const movementStart = compat.indexOf("async function ensureStockMovementColumns");
  const movementEnd = compat.indexOf("async function ensureCapitalColumns", movementStart);
  const movementEnsure = compat.slice(movementStart, movementEnd);
  assert.match(movementEnsure, /ALTER TABLE stock_movements ADD COLUMN purchase_id/);
  assert.match(movementEnsure, /CREATE INDEX IF NOT EXISTS stock_movements_purchase_id_idx/);
});
