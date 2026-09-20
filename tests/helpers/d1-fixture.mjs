import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { Script } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const root = resolve(import.meta.dirname, '../..');
const require = createRequire(resolve(root, 'package.json'));
const ts = require('typescript');

export function loadSource(path, overrides = {}) {
  const filename = resolve(root, path);
  const source = readFileSync(filename, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const loadedModule = { exports: {} };
  const localRequire = createRequire(filename);
  const resolveImport = (id) => {
    if (Object.hasOwn(overrides, id)) return overrides[id];
    if (id.startsWith('.')) return loadSource(resolve(dirname(filename), id + '.ts'), overrides);
    return localRequire(id);
  };
  new Script(`(function(exports, require, module, fetch) {${code}\n})`, {filename}).runInThisContext()(loadedModule.exports, resolveImport, loadedModule, overrides.fetch || (() => { throw new Error('Unexpected network call in test'); }));
  return loadedModule.exports;
}

export function memoryD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const database = {
    sqlite,
    prepare(sql) {
      let values = [];
      const execute = () => {
        const numbered = /\?\d+/.test(sql);
        const bindings = [];
        const query = numbered ? sql.replace(/\?(\d+)/g, (_, number) => { bindings.push(values[Number(number) - 1]); return '?'; }) : sql;
        const statement = sqlite.prepare(query);
        const args = numbered ? bindings : values;
        if (statement.columns().length) return { results: statement.all(...args), success: true, meta: { changes: 0 } };
        const result = statement.run(...args);
        return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      };
      return {
        bind(...params) { values = params; return this; },
        async all() { return execute(); },
        async run() { return execute(); },
        async first(column) { const row = execute().results[0]; return column ? row?.[column] ?? null : row ?? null; },
        async raw() { return execute().results.map(row => Object.values(row)); },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.all()); sqlite.exec('COMMIT'); return results; }
      catch(error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return database;
}

export async function fixture() {
  const database = memoryD1();
  const source = ts.createSourceFile('index.ts', readFileSync(resolve(root, 'db/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'schemaStatements') {
      for (const statement of node.initializer.elements) database.sqlite.exec(statement.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  await loadSource('db/platform-upgrades.ts').ensurePlatformUpgrades(database);
  await loadSource('db/google-sheets-sync.ts').ensureGoogleSheetsSyncSchema(database);
  database.sqlite.exec(`
    INSERT INTO customers (id, name, phone, city) VALUES (1, 'Client test', '0612345678', 'Casablanca');
    INSERT INTO products (id, product_code, name, category, purchase_price, sale_price, stock_quantity) VALUES (1, 'TEST-1', 'Produit test', 'Montres', 10, 25, 0);
    INSERT INTO orders (id, order_ref, customer_id, product_id, city, address, products, quantity, sale_amount, status, carrier, carrier_dispatch_state) VALUES (1, 'TEST-ORDER', 1, 1, 'Casablanca', 'Adresse fictive', 'Produit test', 1, 25, 'Confirmée', 'Sendit', 'À renseigner');
    INSERT INTO ad_performance (id, campaign, external_id, spend, revenue, order_count, native_spend_cents, native_revenue_cents, native_currency, source, performance_date) VALUES (1, 'Test', 'test-meta-id', 100, 200, 2, 1000, 2000, 'EUR', 'Meta API', date('now'));
    INSERT INTO settings (key, value) VALUES ('security_backup_token_hash', 'test-hash'), ('backup_webhook_url', 'https://script.google.com/macros/s/test-only/exec');
  `);
  return database;
}
