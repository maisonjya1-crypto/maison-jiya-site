import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/d1';
import { fixture, loadSource } from './helpers/d1-fixture.mjs';

async function databaseFor(t) {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  return db;
}

function businessRows(db) {
  return Object.fromEntries(['customers', 'products', 'orders', 'ad_performance', 'settings', 'stock_movements', 'google_sheets_sync_state'].map(table => [table, db.sqlite.prepare(`SELECT * FROM ${table}`).all()]));
}

async function saveBackup(db, change = () => {}) {
  const backups = loadSource('db/backups.ts');
  await backups.createDailyBackup(db, 'Test isolé');
  const row = db.sqlite.prepare('SELECT id, snapshot_json FROM daily_backups').get();
  const snapshot = JSON.parse(row.snapshot_json);
  change(snapshot);
  db.sqlite.prepare('UPDATE daily_backups SET snapshot_json = ? WHERE id = ?').run(JSON.stringify(snapshot), row.id);
  return () => backups.restoreDailyBackup(db, row.id);
}

test('une erreur tardive de restauration annule toutes les suppressions et insertions', async t => {
  const db = await databaseFor(t);
  const restore = await saveBackup(db, snapshot => {
    for (let id = 2; id <= 60; id++) snapshot.tables.products.push({ ...snapshot.tables.products[0], id, product_code: `TEST-${id}` });
    snapshot.tables.stockMovements.push({ id: 1, product_id: 999, order_id: 1, movement_type: 'Commande', quantity: 1, note: '', created_at: new Date().toISOString() });
  });
  const before = businessRows(db);
  await assert.rejects(restore, /FOREIGN KEY constraint failed/);
  assert.deepEqual(businessRows(db), before);
});

test('une sauvegarde incomplète est refusée avant toute suppression', async t => {
  const db = await databaseFor(t);
  const restore = await saveBackup(db, snapshot => { delete snapshot.tables.orders; });
  const before = businessRows(db);
  await assert.rejects(restore, /Format de sauvegarde incompatible/);
  assert.deepEqual(businessRows(db), before);
});

test('la restauration conserve les données Meta et la configuration protégée Google Sheets', async t => {
  const db = await databaseFor(t);
  const originalAd = db.sqlite.prepare('SELECT * FROM ad_performance').get();
  const restore = await saveBackup(db, snapshot => {
    snapshot.tables.settings.push({ key: 'security_backup_token_hash', value: 'ancienne-valeur' });
    snapshot.tables.settings.push({ key: 'backup_webhook_url', value: 'ancienne-url' });
  });
  db.sqlite.exec("UPDATE ad_performance SET external_id = 'modifié', native_currency = 'MAD', native_spend_cents = 0, native_revenue_cents = 0");
  const version = db.sqlite.prepare('SELECT current_version FROM google_sheets_sync_state').get().current_version;
  await restore();
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM ad_performance').get(), originalAd);
  assert.equal(db.sqlite.prepare("SELECT value FROM settings WHERE key = 'security_backup_token_hash'").get().value, 'test-hash');
  assert.equal(db.sqlite.prepare("SELECT value FROM settings WHERE key = 'backup_webhook_url'").get().value, 'https://script.google.com/macros/s/test-only/exec');
  assert.ok(db.sqlite.prepare('SELECT current_version FROM google_sheets_sync_state').get().current_version > version);
});

test('les sauvegardes v1 antérieures aux colonnes Meta restent restaurables', async t => {
  const db = await databaseFor(t);
  const restore = await saveBackup(db, snapshot => {
    delete snapshot.tables.inventoryCounts;
    delete snapshot.tables.carrierEvents;
    for (const key of ['external_id', 'native_spend_cents', 'native_revenue_cents', 'native_currency']) delete snapshot.tables.ads[0][key];
  });
  await restore();
  const ad = db.sqlite.prepare('SELECT * FROM ad_performance').get();
  assert.equal(ad.external_id, '');
  assert.equal(ad.native_spend_cents, 0);
  assert.equal(ad.native_revenue_cents, 0);
  assert.equal(ad.native_currency, 'MAD');
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM orders').get().n, 1);
});

function metaClient(db, insights) {
  return loadSource('db/meta.ts', {
    '.': { getDb: async () => drizzle(db), getRawDb: async () => db },
    'cloudflare:workers': { env: { META_ACCESS_TOKEN: 'test-only', META_AD_ACCOUNT_ID: '123', META_API_VERSION: 'v25.0' } },
    fetch: async url => Response.json(String(url).includes('/insights?') ? { data: insights } : { currency: 'MAD' }),
  });
}

test('un import Meta échoué après 50 lignes conserve les anciennes données', async t => {
  const db = await databaseFor(t);
  db.sqlite.exec("CREATE TRIGGER fail_meta BEFORE INSERT ON ad_performance WHEN NEW.external_id = 'fail' BEGIN SELECT RAISE(ABORT, 'test insertion failure'); END");
  const before = db.sqlite.prepare('SELECT * FROM ad_performance').all();
  const insights = Array.from({ length: 51 }, (_, i) => ({ campaign_id: i === 50 ? 'fail' : String(i), spend: '10', date_start: new Date().toISOString().slice(0, 10) }));
  const result = await metaClient(db, insights).syncMetaAds();
  assert.equal(result.failed, true);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM ad_performance').all(), before);
});

for (const empty of [false, true]) {
  test(`un import Meta ${empty ? 'vide' : 'réussi'} préserve les saisies manuelles et l'historique hors période`, async t => {
    const db = await databaseFor(t);
    db.sqlite.exec("INSERT INTO ad_performance (campaign, spend, revenue, order_count, source, performance_date) VALUES ('Manuel', 20, 0, 0, 'Manuel', date('now')), ('Ancien', 30, 0, 0, 'Meta API', '2020-01-01')");
    const rows = empty ? [] : [{ campaign_id: 'new-id', campaign_name: 'Nouvelle', spend: '12.34', date_start: new Date().toISOString().slice(0, 10) }];
    const result = await metaClient(db, rows).syncMetaAds();
    assert.equal(result.failed, false);
    assert.equal(result.imported, rows.length);
    const ads = db.sqlite.prepare('SELECT * FROM ad_performance').all();
    assert.equal(ads.length, rows.length + 2);
    assert.ok(ads.some(ad => ad.campaign === 'Manuel'));
    assert.ok(ads.some(ad => ad.campaign === 'Ancien'));
    if (!empty) assert.equal(ads.find(ad => ad.external_id === 'new-id').native_spend_cents, 1234);
  });
}

function carrierClient(db, calls, fail = false) {
  return loadSource('db/carriers.ts', {
    './index': { getDb: async () => drizzle(db), getRawDb: async () => db },
    'cloudflare:workers': { env: { SENDIT_PUBLIC_KEY: 'test-public', SENDIT_PRIVATE_KEY: 'test-private', FORCELOG_API_KEY: 'test-force' } },
    fetch: async (url, options) => {
      calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
      if (fail) throw new Error('Erreur fournisseur simulée');
      if (url.endsWith('/login')) return Response.json({ token: 'test-session' });
      if (url.includes('/districts?')) return Response.json({ data: [{ id: 46, name: 'Casablanca', price: 20 }] });
      if (url.endsWith('/deliveries')) return Response.json({ code: 'TEST-SENDIT', fee: 20 });
      if (url.endsWith('/Parcels/AddParcel')) return Response.json({ tracking_number: 'TEST-FORCELOG' });
      throw new Error(`Unexpected test URL: ${url}`);
    },
  });
}

for (const provider of ['Sendit', 'ForceLog']) {
  test(`une commande publique confirmée peut être autorisée une seule fois chez ${provider} (API simulée)`, async t => {
    const db = await databaseFor(t);
    const calls = [];
    const client = carrierClient(db, calls);
    const results = await Promise.all([client.dispatchAuthorizedOrder(1, provider), client.dispatchAuthorizedOrder(1, provider)]);
    assert.equal(results.filter(result => result.success).length, 1);
    assert.equal(calls.filter(call => call.url.endsWith('/deliveries') || call.url.endsWith('/Parcels/AddParcel')).length, 1);
    const order = db.sqlite.prepare('SELECT * FROM orders WHERE id = 1').get();
    assert.equal(order.carrier_dispatch_state, 'Créé');
    assert.equal(order.status, 'Expédiée');
    assert.match(order.tracking_number, /^TEST-/);
    const count = calls.length;
    assert.equal((await client.dispatchAuthorizedOrder(1, provider)).attempted, false);
    assert.equal(calls.length, count);
  });
}

test('les colis manuels, en cours et les commandes non confirmées ne sont pas envoyés', async t => {
  const db = await databaseFor(t);
  const calls = [];
  const client = carrierClient(db, calls);
  for (const state of ['Enregistré manuellement', 'Création en cours']) {
    db.sqlite.prepare('UPDATE orders SET carrier_dispatch_state = ?').run(state);
    assert.equal((await client.dispatchAuthorizedOrder(1, 'Sendit')).attempted, false);
  }
  db.sqlite.exec("UPDATE orders SET status = 'En attente', carrier_dispatch_state = 'À renseigner'");
  assert.equal((await client.dispatchAuthorizedOrder(1, 'Sendit')).attempted, false);
  assert.equal(calls.length, 0);
});

test('un échec transporteur conserve la commande et permet une nouvelle autorisation', async t => {
  const db = await databaseFor(t);
  const result = await carrierClient(db, [], true).dispatchAuthorizedOrder(1, 'Sendit');
  assert.equal(result.attempted, true);
  assert.equal(result.success, false);
  const order = db.sqlite.prepare('SELECT * FROM orders').get();
  assert.equal(order.carrier_dispatch_state, 'Erreur');
  assert.equal(order.status, 'Confirmée');
  assert.equal(order.tracking_number, '');
  assert.equal((await carrierClient(db, []).dispatchAuthorizedOrder(1, 'Sendit')).success, true);
});
