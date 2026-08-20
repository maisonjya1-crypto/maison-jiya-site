import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dashboard = await readFile(new URL("app/dashboard-client.tsx", root), "utf8");
const api = await readFile(new URL("app/api/data/route.ts", root), "utf8");
const schema = await readFile(new URL("db/schema.ts", root), "utf8");
const database = await readFile(new URL("db/index.ts", root), "utf8");
const backups = await readFile(new URL("db/backups.ts", root), "utf8");

test("le fichier Products Database est reconnu et les lignes vides sont ignorées", () => {
  assert.match(dashboard, /idproduct: "productCode"/);
  assert.match(dashboard, /nomduproduit: "name"/);
  assert.match(dashboard, /prixdachatdh: "purchasePrice"/);
  assert.match(dashboard, /prixdeventeminimumdh: "minimumSalePrice"/);
  assert.match(dashboard, /stockrestant: "stockRemaining"/);
  assert.match(dashboard, /rows\.filter\(\(row\) => String\(row\.productCode/);
});

test("l’import privilégie le stock restant et évite les doublons", () => {
  assert.match(api, /payload\.action === "importProducts"/);
  assert.match(api, /row\.stockRemaining \?\? row\.initialQuantity/);
  assert.match(api, /uploadCodes\.has\(code\)/);
  assert.match(api, /conflictMode\) === "update"/);
  assert.match(api, /déjà présent\(s\), ignoré\(s\)/);
});

test("les catégories et les prix décimaux du Google Sheet sont normalisés", () => {
  assert.match(api, /replace\(",", "\."\)/);
  assert.match(api, /electroniques/);
  assert.match(api, /return "Électronique"/);
  assert.match(api, /return "Boîtes"/);
  assert.match(api, /return "Wallets"/);
});

test("le prix minimum est conservé dans la base, les sauvegardes et l’interface", () => {
  assert.match(schema, /minimumSalePrice: integer\("minimum_sale_price"\)/);
  assert.match(database, /ensureProductColumns/);
  assert.match(backups, /minimum_sale_price/);
  assert.match(dashboard, /Prix de vente minimum/);
  assert.match(dashboard, /product\.minimumSalePrice/);
});
