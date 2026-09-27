import assert from "node:assert/strict";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

test("la politique de répartition tombe sur 50/30/20 si les réglages sont absents ou invalides", () => {
  const policy = loadSource("lib/allocation-policy.ts");
  assert.deepEqual(policy.allocationPolicyFromSettings({}), { reinvestment: 50, salary: 30, emergency: 20 });
  assert.deepEqual(
    policy.allocationPolicyFromSettings({ reinvestment_allocation: "60", salary_allocation: "25", emergency_allocation: "10" }),
    { reinvestment: 50, salary: 30, emergency: 20 },
  );
});

test("les montants automatiques respectent les pourcentages et conservent les centimes", () => {
  const policy = loadSource("lib/allocation-policy.ts");
  assert.deepEqual(
    policy.allocationAmounts(123.45, { reinvestment: 40, salary: 35, emergency: 25 }),
    { reinvestment: 49.38, salary: 43.2, emergency: 30.87 },
  );
});

test("la réconciliation applique la configuration active aux écritures automatiques", async t => {
  const db = await fixture();
  t.after(() => db.sqlite.close());
  db.sqlite.exec(`
    UPDATE orders
    SET payment_status = 'Encaissé',
        sale_amount = 123.45,
        product_cost = 0,
        shipping_cost = 0,
        fees = 0,
        return_cost = 0,
        paid_at = '2026-09-27T12:00:00.000Z'
    WHERE id = 1;
    INSERT INTO settings (key, value) VALUES
      ('reinvestment_allocation', '40'),
      ('salary_allocation', '35'),
      ('emergency_allocation', '25')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `);

  const allocations = loadSource("db/allocations.ts", {
    ".": { getRawDb: async () => db },
  });
  await allocations.reconcileOrderAllocations(1);

  const rows = db.sqlite.prepare(
    "SELECT category, amount, label FROM capital_ledger WHERE order_id = 1 AND is_automatic = 1 ORDER BY category",
  ).all();
  assert.deepEqual(rows.map(row => [row.category, row.amount]), [
    ["Fonds d’urgence", 30.87],
    ["Réinvestissement", 49.38],
    ["Salaire personnel", 43.2],
  ]);
  assert.match(rows.find(row => row.category === "Réinvestissement").label, /^40% marge commande/);
});

test("l’API réserve la modification au propriétaire et exige un total de 100 %", async () => {
  const route = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8"));
  const start = route.indexOf('payload.action === "updateAllocationPolicy"');
  const end = route.indexOf('payload.action === "updateSetting"', start);
  const block = route.slice(start, end);
  assert.match(block, /access\.isOwner/);
  assert.match(block, /totalise exactement 100/);
  assert.match(block, /reinvestment_allocation/);
  assert.match(block, /salary_allocation/);
  assert.match(block, /emergency_allocation/);
  assert.match(block, /reconcileOrderAllocations\(\)/);
});

test("le dashboard et Google Sheets affichent uniquement la vraie politique active", async () => {
  const [dashboard, sheetRoute] = await Promise.all([
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/api/backup/google-sheets/route.ts", import.meta.url), "utf8")),
  ]);
  assert.match(dashboard, /Répartition automatique de la marge encaissée/);
  assert.match(dashboard, /allocationPolicy\.reinvestment/);
  assert.match(dashboard, /allocationPolicy\.salary/);
  assert.match(dashboard, /allocationPolicy\.emergency/);
  assert.match(sheetRoute, /reinvestment_allocation/);
  assert.match(sheetRoute, /salary_allocation/);
  assert.match(sheetRoute, /emergency_allocation/);
  assert.doesNotMatch(sheetRoute, /stock_allocation: "Part du réinvestissement stock"/);
  assert.doesNotMatch(sheetRoute, /ads_allocation: "Part du réinvestissement publicité"/);
});
