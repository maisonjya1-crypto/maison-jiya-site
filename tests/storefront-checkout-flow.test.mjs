import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

async function storefrontFixture() {
  const db = await fixture();
  await loadSource("db/storefront-cms.ts").ensureStorefrontCms(db);
  db.sqlite.exec(`
    UPDATE products
    SET stock_quantity = 0,
        purchase_price = 10,
        sale_price = 250,
        archived_at = NULL
    WHERE id = 1;

    UPDATE storefront_product_settings
    SET public_name = 'Montre test',
        public_price = 250,
        is_visible = 1,
        availability_mode = 'available'
    WHERE product_id = 1;
  `);
  return db;
}

function loadOrderRoute(db, options = {}) {
  return loadSource("app/api/storefront/orders/route.ts", {
    "../../../../db": {
      getRawDb: async () => {
        if (options.failDatabase) throw new Error("SQL_INTERNAL_SECRET");
        return db;
      },
    },
    "../../../../db/platform-upgrades": { ensurePlatformUpgrades: async () => ({ identityRestored: false }) },
    "../../../../db/storefront-cms": { ensureStorefrontCms: async () => undefined },
    "../../../../db/push-notifications": { notifyNewOrder: async () => ({ delivered: 0, subscriptions: 0 }) },
  });
}

function orderRequest(items, ip = "203.0.113.10") {
  return new Request("https://maison-jiya.test/api/storefront/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://maison-jiya.test",
      "cf-connecting-ip": ip,
    },
    body: JSON.stringify({
      customerName: "Client Boutique",
      phone: "06 12 34 56 78",
      city: "Casablanca",
      address: "12 rue de test Casablanca",
      note: "Test QA boutique",
      website: "",
      items,
    }),
  });
}

test("une commande produit à stock 0 est enregistrée En attente sans déduire le stock", async t => {
  const db = await storefrontFixture();
  t.after(() => db.sqlite.close());
  const route = loadOrderRoute(db);

  const response = await route.POST(orderRequest([{ kind: "product", id: 1, quantity: 1 }]));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.ok(body.orderRef);

  const order = db.sqlite.prepare(`
    SELECT status, payment_status AS paymentStatus, stock_deducted AS stockDeducted,
           sale_amount AS saleAmount, product_cost AS productCost, quantity, items_json AS itemsJson
    FROM orders WHERE order_ref = ?
  `).get(body.orderRef);

  assert.equal(order.status, "En attente");
  assert.equal(order.paymentStatus, "À encaisser");
  assert.equal(order.stockDeducted, 0);
  assert.equal(order.saleAmount, 250);
  assert.equal(order.productCost, 10);
  assert.equal(order.quantity, 1);
  assert.deepEqual(JSON.parse(order.itemsJson).map(({ productId, quantity }) => ({ productId, quantity })), [{ productId: 1, quantity: 1 }]);
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM stock_movements WHERE order_id = (SELECT id FROM orders WHERE order_ref = ?)").get(body.orderRef).n, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM order_status_history WHERE order_id = (SELECT id FROM orders WHERE order_ref = ?) AND to_status = 'En attente'").get(body.orderRef).n, 1);
});


test("deux articles au même prix déclenchent -50 % sur un seul des deux", async t => {
  const db = await storefrontFixture();
  t.after(() => db.sqlite.close());
  const route = loadOrderRoute(db);

  const response = await route.POST(orderRequest([{ kind: "product", id: 1, quantity: 2 }], "203.0.113.14"));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.total, 375);
  assert.equal(body.promotion?.code, "PROMO:2E50");
  assert.equal(body.promotion?.discount, 125);

  const order = db.sqlite.prepare(`
    SELECT sale_amount AS saleAmount, product_cost AS productCost, quantity,
           products, campaign, return_note AS returnNote
    FROM orders WHERE order_ref = ?
  `).get(body.orderRef);

  assert.equal(order.saleAmount, 375);
  assert.equal(order.productCost, 20);
  assert.equal(order.quantity, 2);
  assert.match(order.products, /OFFRE 2E -50%/);
  assert.match(order.campaign, /PROMO:2E50/);
  assert.match(order.returnNote, /Offre 2e article -50 % appliquée/);
});

test("avec deux prix différents la remise porte sur l'article éligible le moins cher", async t => {
  const db = await storefrontFixture();
  t.after(() => db.sqlite.close());

  db.sqlite.exec(`
    INSERT INTO products (id, product_code, name, category, purchase_price, sale_price, stock_quantity)
    VALUES (2, 'TEST-2', 'Bijou test', 'Bijoux', 5, 100, 0);
    INSERT INTO storefront_product_settings (
      product_id, public_name, public_price, is_visible, availability_mode, badge, description, sort_order
    ) VALUES (2, 'Bijou test', 100, 1, 'available', '', '', 1);
  `);

  const route = loadOrderRoute(db);
  const response = await route.POST(orderRequest([
    { kind: "product", id: 1, quantity: 1 },
    { kind: "product", id: 2, quantity: 1 },
  ], "203.0.113.15"));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.promotion?.discount, 50);
  assert.equal(body.total, 300);
});

test("un pack reste commandable avec ses composants à stock 0", async t => {
  const db = await storefrontFixture();
  t.after(() => db.sqlite.close());

  db.sqlite.exec(`
    INSERT INTO storefront_offers (id, name, description, price, compare_price, badge, is_active, sort_order)
    VALUES (1, 'Pack test', '', 400, 500, 'PROMO', 1, 0);
    INSERT INTO storefront_offer_items (offer_id, product_id, quantity)
    VALUES (1, 1, 2);
  `);

  const route = loadOrderRoute(db);
  const response = await route.POST(orderRequest([{ kind: "offer", id: 1, quantity: 1 }], "203.0.113.11"));
  const body = await response.json();

  assert.equal(response.status, 201);
  const order = db.sqlite.prepare(`
    SELECT status, stock_deducted AS stockDeducted, sale_amount AS saleAmount,
           product_cost AS productCost, quantity, pack_name AS packName, items_json AS itemsJson
    FROM orders WHERE order_ref = ?
  `).get(body.orderRef);

  assert.equal(order.status, "En attente");
  assert.equal(order.stockDeducted, 0);
  assert.equal(order.saleAmount, 400);
  assert.equal(order.productCost, 20);
  assert.equal(order.quantity, 2);
  assert.equal(order.packName, "Pack test");
  assert.deepEqual(JSON.parse(order.itemsJson).map(({ productId, quantity }) => ({ productId, quantity })), [{ productId: 1, quantity: 2 }]);
  assert.equal(db.sqlite.prepare("SELECT stock_quantity FROM products WHERE id = 1").get().stock_quantity, 0);
});

test("le statut manuel Indisponible bloque toujours une commande publique", async t => {
  const db = await storefrontFixture();
  t.after(() => db.sqlite.close());
  db.sqlite.exec("UPDATE storefront_product_settings SET availability_mode = 'out_of_stock' WHERE product_id = 1");

  const route = loadOrderRoute(db);
  const response = await route.POST(orderRequest([{ kind: "product", id: 1, quantity: 1 }], "203.0.113.12"));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /n’est plus disponible/);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM orders WHERE order_ref LIKE 'MJ-W%'").get().n, 0);
});

test("une erreur interne ne fuite jamais les détails techniques au client", async t => {
  const db = await storefrontFixture();
  t.after(() => db.sqlite.close());
  const route = loadOrderRoute(db, { failDatabase: true });

  const response = await route.POST(orderRequest([{ kind: "product", id: 1, quantity: 1 }], "203.0.113.13"));
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, "Impossible d’enregistrer la commande.");
  assert.doesNotMatch(JSON.stringify(body), /SQL_INTERNAL_SECRET/);
});

test("le panier client nettoie le stockage local, les articles retirés et les quantités invalides", async () => {
  const client = await readFile(new URL("../app/boutique/storefront-client-v3.tsx", import.meta.url), "utf8");

  assert.match(client, /function sanitizeStoredCart/);
  assert.match(client, /Number\.isInteger\(quantity\)/);
  assert.match(client, /Math\.min\(20, quantity\)/);
  assert.match(client, /function pruneCartForCatalog/);
  assert.match(client, /if \(!item \|\| !item\.available\) continue/);
  assert.match(client, /setCart\(pruneCartForCatalog\(sanitizeStoredCart\(JSON\.parse\(savedCart\)\), initialCatalog\)\)/);
  assert.match(client, /setCart\(\(current\) => pruneCartForCatalog\(current, body\)\)/);
  assert.match(client, /maxLength=\{120\}/);
  assert.match(client, /maxLength=\{40\}/);
  assert.match(client, /maxLength=\{100\}/);
  assert.match(client, /maxLength=\{260\}/);
  assert.match(client, /setSubmitError\(error instanceof Error && error\.message \? error\.message : t\.orderFailed\)/);
  assert.match(client, /promoSecondItem/);
  assert.match(client, /cartPricing\.discount/);
  assert.match(client, /isSecondItemPromoCategory/);
});
