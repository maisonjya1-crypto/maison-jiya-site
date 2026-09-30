import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migrations/0014_readable_product_codes.sql", import.meta.url), "utf8");

test("la migration renomme exactement les 88 IDs produit visibles sans toucher aux IDs internes", () => {
  const pairs = [...migration.matchAll(/WHEN\s+(\d+)\s+THEN\s+'([^']+)'/g)].map((match) => ({
    id: Number(match[1]),
    code: match[2],
  }));
  assert.equal(pairs.length, 88);
  assert.deepEqual(pairs.map((item) => item.id).sort((a,b) => a-b), Array.from({ length: 88 }, (_, index) => index + 1));
  assert.equal(new Set(pairs.map((item) => item.code)).size, 88);
  assert.ok(pairs.every((item) => /^[A-Z]{1,3}(?:-[A-Z0-9]+)+-\d{2}$/.test(item.code)));
  assert.doesNotMatch(migration, /UPDATE\s+orders/i);
  assert.doesNotMatch(migration, /stock_quantity\s*=/i);
  assert.doesNotMatch(migration, /sale_price\s*=/i);
  assert.doesNotMatch(migration, /purchase_price\s*=/i);
});

test("les familles principales gardent des IDs immédiatement reconnaissables", () => {
  assert.match(migration, /WHEN 41 THEN 'M-CSH-01'/);   // Cartier Santos homme
  assert.match(migration, /WHEN 32 THEN 'B-TUL-01'/);  // Bracelet Tulip
  assert.match(migration, /WHEN 33 THEN 'C-VC-01'/);   // Collier Van Cleef
  assert.match(migration, /WHEN 74 THEN 'W-HER-01'/);  // Wallet Hermes
  assert.match(migration, /WHEN 27 THEN 'BX-BIJ-01'/); // Boite bijoux
  assert.match(migration, /WHEN 4 THEN 'E-AP3-01'/);    // AirPods Pro 3
});
