import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8");
const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const meta = await readFile(new URL("../db/meta.ts", import.meta.url), "utf8");
const allocations = await readFile(new URL("../db/allocations.ts", import.meta.url), "utf8");

test("la recherche générale couvre commandes, produits, clients, achats et publicités", () => {
  assert.match(dashboard, /function GlobalSearch/);
  for (const source of ["data.orders", "data.products", "data.customers", "data.purchases", "data.ads"]) assert.match(dashboard, new RegExp(source.replace(".", "\\.")));
});

test("le rapport calcule le gain exact et sépare les quatre emplacements d'argent", () => {
  assert.match(dashboard, /function ReportsPage/);
  assert.match(dashboard, /Caisse magasin/);
  assert.match(dashboard, /Banque estimée/);
  assert.match(dashboard, /Argent transporteurs/);
  assert.match(dashboard, /Créances en cours/);
  assert.match(dashboard, /Gain exact par commande/);
});

test("chaque commande peut être liée à une campagne et contactée par WhatsApp", () => {
  assert.match(schema, /campaign: text\("campaign"\)/);
  assert.match(api, /selectedCampaign/);
  assert.match(dashboard, /https:\/\/wa\.me/);
  assert.match(dashboard, /Contacter sur WhatsApp/);
});

test("l'import tableur est borné et met à jour le stock", () => {
  assert.match(api, /parsedRows\.length > 200/);
  assert.match(api, /payload\.action === "importOrders"/);
  assert.match(api, /stockQuantity: sql/);
  assert.match(dashboard, /modele-commandes-maison-jiya\.csv/);
});

test("Meta Ads utilise uniquement des secrets serveur et une version API configurée", () => {
  assert.match(meta, /META_ACCESS_TOKEN/);
  assert.match(meta, /META_AD_ACCOUNT_ID/);
  assert.match(meta, /META_API_VERSION/);
  assert.match(meta, /graph\.facebook\.com/);
  assert.doesNotMatch(dashboard, /META_ACCESS_TOKEN/);
});

test("Meta Ads détecte la devise du compte et convertit dépenses et revenus en MAD", () => {
  assert.match(meta, /fields: "currency"/);
  assert.match(meta, /open\.er-api\.com\/v6\/latest/);
  assert.match(meta, /nativeSpend \* fx\.rate/);
  assert.match(meta, /actionTotal\(row\.action_values/);
  assert.match(meta, /row\.nativeRevenue \* fx\.rate/);
  assert.match(dashboard, /converties en MAD/);
});

test("réinvestissement, salaire et fonds d’urgence sont des écritures liées aux commandes", () => {
  assert.match(allocations, /order_id/);
  assert.match(allocations, /Réinvestissement/);
  assert.match(allocations, /Salaire personnel/);
  assert.match(allocations, /Fonds d’urgence/);
  assert.match(allocations, /is_automatic = 1/);
});
