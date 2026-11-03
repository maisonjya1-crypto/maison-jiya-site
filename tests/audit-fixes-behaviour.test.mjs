import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixture, latestBackup, loadSource } from "./helpers/d1-fixture.mjs";

// Tests de comportement (pas de lecture du texte du code) pour les corrections de l'audit du 03/11/2026.

function countingDatabase(db) {
  const counter = { queries: 0, batches: 0 };
  const wrapped = {
    ...db,
    prepare(sql) {
      const statement = db.prepare(sql);
      const count = (fn) => async (...args) => { counter.queries += 1; return fn.apply(statement, args); };
      return {
        bind(...params) { statement.bind(...params); return this; },
        all: count(statement.all), run: count(statement.run), first: count(statement.first), raw: count(statement.raw),
        // Utilisé par batch : pas compté séparément, un batch D1 compte pour une seule requête.
        async __execute() { return statement.all(); },
      };
    },
    async batch(statements) {
      counter.queries += 1;
      counter.batches += 1;
      db.sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.__execute());
        db.sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        db.sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { database: wrapped, counter };
}

function insertPaidOrders(db, count) {
  const insert = db.sqlite.prepare(`
    INSERT INTO orders (order_ref, customer_id, product_id, city, address, products, quantity, sale_amount, product_cost,
      shipping_cost, fees, status, payment_status, paid_at, carrier, carrier_dispatch_state)
    VALUES (?, 1, 1, 'Casablanca', ?, 'Produit test', 1, 250, 100, 30, 0, 'Livrée', 'Encaissé', '2026-10-01T10:00:00.000Z', 'Sendit', 'Livré')
  `);
  db.sqlite.exec("BEGIN");
  for (let index = 0; index < count; index += 1) {
    insert.run(`AUDIT-${index}`, `Adresse de test numéro ${index} quartier Maarif Casablanca ${"x".repeat(120)}`);
  }
  db.sqlite.exec("COMMIT");
}

test("C3 — une grosse sauvegarde est découpée en morceaux < 2 Mo, vérifiable et restaurable", async (t) => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const backups = loadSource("db/backups.ts");
  insertPaidOrders(db, 2500);

  await backups.createDailyBackup(db, "Test volumineux", true);
  const chunks = db.sqlite.prepare("SELECT chunk_index, length(data) AS size FROM daily_backup_chunks ORDER BY chunk_index").all();
  assert.ok(chunks.length > 1, "la sauvegarde doit être découpée");
  for (const chunk of chunks) assert.ok(Buffer.byteLength("x".repeat(chunk.size)) < 2_000_000);
  const row = db.sqlite.prepare("SELECT snapshot_json FROM daily_backups ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.snapshot_json, "", "le JSON n'est plus stocké dans une seule cellule");

  const parsed = JSON.parse(latestBackup(db).snapshot_json);
  assert.equal(parsed.tables.orders.length, 2501);

  const verification = await backups.verifyLatestBackup(db);
  assert.equal(verification.ok, true, verification.error);

  db.sqlite.exec("DELETE FROM capital_ledger; UPDATE orders SET deleted_at = NULL; DELETE FROM orders WHERE order_ref LIKE 'AUDIT-1%';");
  await backups.restoreDailyBackup(db, latestBackup(db).id);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 2501);
});

test("C3 — une ancienne sauvegarde (JSON en ligne) reste restaurable", async (t) => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  const backups = loadSource("db/backups.ts");
  await backups.createDailyBackup(db, "Copie", true);
  const current = latestBackup(db);
  db.sqlite.prepare("UPDATE daily_backups SET snapshot_json = ? WHERE id = ?").run(current.snapshot_json, current.id);
  db.sqlite.prepare("DELETE FROM daily_backup_chunks WHERE backup_id = ?").run(current.id);
  assert.equal((await backups.verifyLatestBackup(db)).ok, true);
  await backups.restoreDailyBackup(db, current.id);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 1);
});

test("C3 — une sauvegarde automatique ratée n'empêche plus d'ouvrir le logiciel", async () => {
  const route = await readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8");
  const snapshotBody = route.slice(route.indexOf("async function snapshot("), route.indexOf("export async function GET("));
  assert.match(snapshotBody, /try \{\s*await createDailyBackup\(rawDatabase\);\s*\} catch/);
});

test("C5 — le recalcul complet du capital reste sous 60 requêtes D1 (limite Cloudflare : 1 000) avec 1 200 commandes encaissées", async (t) => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  insertPaidOrders(db, 1200);
  const { database, counter } = countingDatabase(db);
  const allocations = loadSource("db/allocations.ts", { "./index": { getRawDb: async () => database } });

  await allocations.reconcileOrderAllocations();
  const firstRunQueries = counter.queries;
  // 3 lectures + 1 200 × 3 écritures groupées par 90 → environ 43 lots, très loin de la limite de 1 000.
  assert.ok(firstRunQueries < 60, `requêtes : ${firstRunQueries}`);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM capital_ledger WHERE is_automatic = 1").get().n, 3600);
  const sample = db.sqlite.prepare("SELECT category, amount FROM capital_ledger WHERE order_id = (SELECT id FROM orders WHERE order_ref = 'AUDIT-0') ORDER BY category").all();
  // Marge 250 - 100 - 30 = 120 → 50 % / 30 % / 20 %.
  assert.deepEqual(sample.map((row) => [row.category, Number(row.amount)]), [["Fonds d’urgence", 24], ["Réinvestissement", 60], ["Salaire personnel", 36]]);

  counter.queries = 0;
  await allocations.reconcileOrderAllocations();
  assert.ok(counter.queries <= 4, `un second passage sans changement ne doit rien réécrire (${counter.queries})`);
});

test("C5 — une commande modifiée ou annulée ne recalcule que ses propres affectations", async (t) => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  insertPaidOrders(db, 300);
  const { database, counter } = countingDatabase(db);
  const allocations = loadSource("db/allocations.ts", { "./index": { getRawDb: async () => database } });
  await allocations.reconcileOrderAllocations();

  const target = db.sqlite.prepare("SELECT id FROM orders WHERE order_ref = 'AUDIT-5'").get().id;
  db.sqlite.prepare("UPDATE orders SET sale_amount = 330 WHERE id = ?").run(target);
  counter.queries = 0;
  await allocations.reconcileOrderAllocations(target);
  assert.ok(counter.queries <= 4, `requêtes : ${counter.queries}`);
  assert.equal(Number(db.sqlite.prepare("SELECT amount FROM capital_ledger WHERE auto_key = ?").get(`order:${target}:reinvest`).amount), 100);

  db.sqlite.prepare("UPDATE orders SET status = 'Annulée', payment_status = 'Non encaissé' WHERE id = ?").run(target);
  await allocations.reconcileOrderAllocations(target);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM capital_ledger WHERE order_id = ?").get(target).n, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM capital_ledger WHERE is_automatic = 1").get().n, 897);
});

test("C2 — 200 références créées dans la même milliseconde sont toutes différentes", () => {
  const { referenceWithPrefix } = loadSource("lib/reference.ts");
  const realNow = Date.now;
  Date.now = () => 1_793_000_000_000;
  try {
    for (let run = 0; run < 50; run += 1) {
      const refs = Array.from({ length: 200 }, () => referenceWithPrefix("MJ-I"));
      assert.equal(new Set(refs).size, 200);
      for (const ref of refs) assert.match(ref, /^MJ-I[0-9A-Z]{11}$/);
    }
  } finally {
    Date.now = realNow;
  }
});

test("C4 / purge — la corbeille expirée de plus de 100 commandes est vidée sans erreur D1", async (t) => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  insertPaidOrders(db, 250);
  db.sqlite.exec("UPDATE orders SET deleted_at = '2020-01-01T00:00:00.000Z' WHERE order_ref LIKE 'AUDIT-%'");
  const strict = {
    ...db,
    prepare(sql) {
      const parameters = (sql.match(/\?/g) || []).length;
      if (parameters > 100) throw new Error(`too many SQL variables (${parameters})`);
      return db.prepare(sql);
    },
  };
  const backups = loadSource("db/backups.ts");
  await backups.purgeExpiredTrash(strict);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM orders WHERE order_ref LIKE 'AUDIT-%'").get().n, 0);
});

// ——— Boutique publique : fiche client et anti-spam (S1, S2) ———
async function storefrontFixture() {
  const db = await fixture();
  const promotionMigration = await readFile(new URL("../migrations/0016_storefront_independent_promotions.sql", import.meta.url), "utf8");
  db.sqlite.exec(promotionMigration);
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
    "../../../../db/storefront-cms": {
      ensureStorefrontCms: async () => undefined,
      getStorefrontPromotions: async (_database, activeOnly = false) => {
        const where = activeOnly ? "WHERE is_active = 1" : "";
        return db.sqlite.prepare(`
          SELECT id, name, code, description, rule_type AS ruleType,
                 percent_value AS percentValue, minimum_quantity AS minimumQuantity,
                 buy_quantity AS buyQuantity, free_quantity AS freeQuantity,
                 eligible_categories AS eligibleCategories, is_active AS isActive,
                 priority, created_at AS createdAt, updated_at AS updatedAt
          FROM storefront_promotions ${where}
          ORDER BY priority, id
        `).all();
      },
    },
    "../../../../db/push-notifications": { notifyNewOrder: async () => ({ delivered: 0, subscriptions: 0 }) },
  });
}


function publicOrder(overrides = {}, ip = "198.51.100.7") {
  return new Request("https://maison-jiya.test/api/storefront/orders", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://maison-jiya.test", "cf-connecting-ip": ip },
    body: JSON.stringify({
      customerName: "Autre Nom",
      phone: "06 12 34 56 78",
      city: "Rabat",
      address: "45 avenue de test Rabat",
      website: "",
      items: [{ kind: "product", id: 1, quantity: 1 }],
      ...overrides,
    }),
  });
}

test("S1 — une commande publique ne renomme plus un client existant", async (t) => {
  const db = await storefrontFixture();
  t.after(() => db.sqlite.close());
  const route = loadOrderRoute(db);
  const response = await route.POST(publicOrder());
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const customer = db.sqlite.prepare("SELECT name, city FROM customers WHERE phone = '0612345678'").get();
  assert.deepEqual({ ...customer }, { name: "Client test", city: "Casablanca" });
  const order = db.sqlite.prepare("SELECT city, return_note FROM orders WHERE order_ref LIKE 'MJ-W%'").get();
  assert.equal(order.city, "Rabat");
  assert.match(order.return_note, /Nom indiqué sur la boutique : Autre Nom/);
});

test("S1 — un nouveau client est toujours créé avec ses coordonnées", async (t) => {
  const db = await storefrontFixture();
  t.after(() => db.sqlite.close());
  const route = loadOrderRoute(db);
  const response = await route.POST(publicOrder({ phone: "0700112233", customerName: "Nouvelle Cliente" }));
  assert.equal(response.status, 201);
  assert.equal(db.sqlite.prepare("SELECT name FROM customers WHERE phone = '0700112233'").get().name, "Nouvelle Cliente");
});

test("S2 — des fautes de saisie ne bloquent plus le client, mais le spam par téléphone reste bloqué", async (t) => {
  const db = await storefrontFixture();
  t.after(() => db.sqlite.close());
  const route = loadOrderRoute(db);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const invalid = await route.POST(publicOrder({ phone: "12" }));
    assert.equal(invalid.status, 400);
  }
  const valid = await route.POST(publicOrder({ phone: "0711223344" }));
  assert.equal(valid.status, 201, "après 6 erreurs de saisie, la commande valide passe");

  for (let quantity = 2; quantity <= 4; quantity += 1) {
    const response = await route.POST(publicOrder({ phone: "0711223344", items: [{ kind: "product", id: 1, quantity }] }));
    assert.equal(response.status, 201);
  }
  const blocked = await route.POST(publicOrder({ phone: "0711223344", items: [{ kind: "product", id: 1, quantity: 5 }] }));
  assert.equal(blocked.status, 429, "5e commande du même numéro en 15 minutes bloquée");

  const otherCustomerSameIp = await route.POST(publicOrder({ phone: "0655443322" }));
  assert.equal(otherCustomerSameIp.status, 201, "un autre client sur la même IP opérateur peut commander");
});
