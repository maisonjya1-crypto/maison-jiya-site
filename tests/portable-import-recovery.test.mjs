import assert from "node:assert/strict";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

async function databaseFor(t) {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  return db;
}

const now = "2026-09-25T12:00:00.000Z";

function portableExport(overrides = {}) {
  return {
    exportVersion: 1,
    source: "Maison Jiya",
    exportedAt: now,
    tables: {
      clients: [{ id: 10, name: "Cliente importée", phone: "0600000010", city: "Rabat", created_at: now }],
      produits: [{
        id: 10,
        product_code: "IMP-10",
        name: "Produit importé",
        category: "Bijoux",
        purchase_price: 20,
        sale_price: 50,
        stock_quantity: 3,
        created_at: now,
      }],
      commandes: [{
        id: 10,
        order_ref: "IMP-ORDER",
        customer_id: 10,
        product_id: 10,
        city: "Rabat",
        address: "Adresse importée",
        products: "Produit importé · IMP-10",
        quantity: 1,
        sale_amount: 50,
        status: "En attente",
        payment_status: "À encaisser",
        source: "WhatsApp",
        carrier: "Non affecté",
        stock_deducted: 0,
        created_at: now,
        items_json: JSON.stringify([{ productId: 10, quantity: 1 }]),
        pack_name: "Pack test",
      }],
      mouvements_stock: [{
        id: 10,
        product_id: 10,
        order_id: null,
        movement_type: "Entrée",
        quantity: 3,
        note: "Import historique",
        created_at: now,
      }],
      inventaires: [],
      achats: [],
      depenses: [],
      publicites: [],
      tresorerie_capital: [],
      historique_commandes: [{
        id: 10,
        order_id: 10,
        from_status: null,
        to_status: "En attente",
        changed_by_user_id: null,
        changed_by_name: "Import",
        changed_at: now,
      }],
      evenements_transporteurs: [],
      journal_actions: [],
      membres: [{ id: 999, username: "ancien", display_name: "Ancien", role: "admin", is_active: 1, created_at: now, updated_at: now }],
      parametres: [
        { key: "theme", value: "rose-poudre", updated_at: now },
        { key: "account_email", value: "ancienne-adresse@example.com", updated_at: now },
        { key: "security_backup_token_hash", value: "ancien-secret", updated_at: now },
      ],
      boutique_produits: [{
        product_id: 10,
        public_name: "Bijou public",
        public_price: 55,
        is_visible: 1,
        availability_mode: "available",
        badge: "",
        description: "Description",
        sort_order: 1,
        updated_at: now,
      }],
      boutique_offres: [],
      boutique_composition_offres: [],
      boutique_medias: [],
      journal_sync_google_sheets: [{ id: 99, event_id: "ancien-event", version: 1, status: "synced" }],
      ...overrides,
    },
  };
}

test("l’import portable v1 restaure les données, les valeurs héritées et la boutique sans remplacer les secrets", async t => {
  const db = await databaseFor(t);
  db.sqlite.exec("INSERT INTO settings (key, value) VALUES ('account_email', 'actuelle@example.com') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const importer = loadSource("db/data-import.ts");

  const summary = await importer.restorePortableDataImport(db, JSON.stringify(portableExport()));

  assert.equal(summary.exportVersion, 1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM products").get().n, 1);
  const product = db.sqlite.prepare("SELECT * FROM products").get();
  assert.equal(product.product_code, "IMP-10");
  assert.equal(product.minimum_sale_price, 50);
  assert.equal(product.stock_quantity, 3);

  const order = db.sqlite.prepare("SELECT * FROM orders").get();
  assert.equal(order.order_ref, "IMP-ORDER");
  assert.equal(order.fulfillment_type, "Livraison");
  assert.equal(order.items_json, JSON.stringify([{ productId: 10, quantity: 1 }]));
  assert.equal(order.pack_name, "Pack test");

  assert.equal(db.sqlite.prepare("SELECT value FROM settings WHERE key = 'theme'").get().value, "rose-poudre");
  assert.equal(db.sqlite.prepare("SELECT value FROM settings WHERE key = 'account_email'").get().value, "actuelle@example.com");
  assert.equal(db.sqlite.prepare("SELECT value FROM settings WHERE key = 'security_backup_token_hash'").get().value, "test-hash");

  const storefront = db.sqlite.prepare("SELECT * FROM storefront_product_settings WHERE product_id = 10").get();
  assert.equal(storefront.public_name, "Bijou public");
  assert.equal(storefront.is_visible, 1);

  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM google_sheets_sync_log").get().n, 0);
  assert.ok(db.sqlite.prepare("SELECT current_version FROM google_sheets_sync_state").get().current_version > 0);
  assert.ok(db.sqlite.prepare("SELECT count(*) AS n FROM daily_backups WHERE reason = 'Avant import d’un export portable'").get().n >= 1);
});

test("un ancien export sans dépenses et sans nouvelles colonnes reste importable", async t => {
  const db = await databaseFor(t);
  const importer = loadSource("db/data-import.ts");
  const data = portableExport({
    depenses: undefined,
    achats: [{
      id: 10,
      supplier: "Fournisseur",
      item: "Ancien achat",
      quantity: 5,
      unit_cost: 12,
      total_cost: 60,
      payment_status: "Payé",
      created_at: now,
    }],
  });
  delete data.tables.depenses;

  const preview = importer.previewPortableDataImport(JSON.stringify(data));
  assert.match(preview.warnings.join(" "), /depenses/i);

  await importer.restorePortableDataImport(db, JSON.stringify(data));
  const purchase = db.sqlite.prepare("SELECT * FROM purchases").get();
  assert.equal(purchase.product_id, null);
  assert.equal(purchase.account, "Banque");
  assert.equal(purchase.paid_at, now);
  assert.equal(purchase.received_quantity, 0);
  assert.equal(purchase.received_at, null);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM expenses").get().n, 0);
});

test("une référence incohérente est refusée avant la sauvegarde et avant toute suppression", async t => {
  const db = await databaseFor(t);
  const importer = loadSource("db/data-import.ts");
  const before = db.sqlite.prepare("SELECT product_code FROM products ORDER BY id").all();
  const bad = portableExport({
    mouvements_stock: [{
      id: 10,
      product_id: 999,
      order_id: null,
      movement_type: "Entrée",
      quantity: 3,
      note: "",
      created_at: now,
    }],
  });

  await assert.rejects(() => importer.restorePortableDataImport(db, JSON.stringify(bad)), /Référence introuvable/);
  assert.deepEqual(db.sqlite.prepare("SELECT product_code FROM products ORDER BY id").all(), before);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM daily_backups WHERE reason = 'Avant import d’un export portable'").get().n, 0);
});

test("une erreur SQL tardive annule toutes les suppressions et insertions, tout en gardant le filet de sécurité", async t => {
  const db = await databaseFor(t);
  const importer = loadSource("db/data-import.ts");
  const beforeProducts = db.sqlite.prepare("SELECT * FROM products ORDER BY id").all();
  const beforeOrders = db.sqlite.prepare("SELECT * FROM orders ORDER BY id").all();
  const broken = portableExport({
    produits: [{
      id: 10,
      product_code: "IMP-10",
      name: "Produit cassé",
      category: "Bijoux",
      purchase_price: null,
      sale_price: 50,
      stock_quantity: 3,
      created_at: now,
    }],
  });

  await assert.rejects(() => importer.restorePortableDataImport(db, JSON.stringify(broken)), /NOT NULL|constraint/i);
  assert.deepEqual(db.sqlite.prepare("SELECT * FROM products ORDER BY id").all(), beforeProducts);
  assert.deepEqual(db.sqlite.prepare("SELECT * FROM orders ORDER BY id").all(), beforeOrders);
  assert.ok(db.sqlite.prepare("SELECT count(*) AS n FROM daily_backups WHERE reason = 'Avant import d’un export portable'").get().n >= 1);
});

test("la sauvegarde de sécurité inclut aussi la configuration boutique et reste compatible avec les anciennes copies", async t => {
  const db = await databaseFor(t);
  const cms = loadSource("db/storefront-cms.ts");
  const backups = loadSource("db/backups.ts");
  await cms.ensureStorefrontCms(db);
  db.sqlite.prepare("UPDATE storefront_product_settings SET public_name = 'Avant import' WHERE product_id = 1").run();

  await backups.createDailyBackup(db, "Sécurité boutique", true);
  const backup = db.sqlite.prepare("SELECT id, snapshot_json FROM daily_backups ORDER BY id DESC LIMIT 1").get();
  const parsed = JSON.parse(backup.snapshot_json);
  assert.ok(Array.isArray(parsed.tables.storefrontProducts));
  assert.ok(Array.isArray(parsed.tables.storefrontOffers));
  assert.ok(Array.isArray(parsed.tables.storefrontOfferItems));
  assert.ok(Array.isArray(parsed.tables.storefrontMedia));

  db.sqlite.prepare("UPDATE storefront_product_settings SET public_name = 'Après import' WHERE product_id = 1").run();
  await backups.restoreDailyBackup(db, backup.id);
  assert.equal(db.sqlite.prepare("SELECT public_name FROM storefront_product_settings WHERE product_id = 1").get().public_name, "Avant import");

  await backups.createDailyBackup(db, "Ancienne copie simulée", true);
  const legacy = db.sqlite.prepare("SELECT id, snapshot_json FROM daily_backups ORDER BY id DESC LIMIT 1").get();
  const legacySnapshot = JSON.parse(legacy.snapshot_json);
  delete legacySnapshot.tables.storefrontProducts;
  delete legacySnapshot.tables.storefrontOffers;
  delete legacySnapshot.tables.storefrontOfferItems;
  delete legacySnapshot.tables.storefrontMedia;
  db.sqlite.prepare("UPDATE daily_backups SET snapshot_json = ?, record_count = ? WHERE id = ?").run(
    JSON.stringify(legacySnapshot),
    Object.values(legacySnapshot.tables).reduce((total, rows) => total + (Array.isArray(rows) ? rows.length : 0), 0),
    legacy.id,
  );
  db.sqlite.prepare("UPDATE storefront_product_settings SET public_name = 'Boutique actuelle' WHERE product_id = 1").run();
  await backups.restoreDailyBackup(db, legacy.id);
  assert.equal(db.sqlite.prepare("SELECT public_name FROM storefront_product_settings WHERE product_id = 1").get().public_name, "Boutique actuelle");
});

test("la restauration complète reste propriétaire, idempotente et confirmée explicitement dans l’interface", async () => {
  const [route, dashboard, docs] = await Promise.all([
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../docs/disaster-recovery.md", import.meta.url), "utf8")),
  ]);

  const start = route.indexOf('payload.action === "importPortableExport"');
  const end = route.indexOf('payload.action === "restoreBackup"', start);
  const block = route.slice(start, end);
  assert.match(block, /access\.isOwner/);
  assert.match(block, /protectMutation\("importPortableExport"\)/);
  assert.match(block, /restorePortableDataImport/);
  assert.match(dashboard, /accept="\.json,application\/json"/);
  assert.match(dashboard, /typed !== "RESTAURER"/);
  assert.match(dashboard, /Une sauvegarde de sécurité sera créée avant l’import/);
  assert.match(docs, /réimportable par Maison Jiya/);
  assert.doesNotMatch(docs, /n’est pas encore automatisée/);
});
