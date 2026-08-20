import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dashboard = await readFile(new URL("app/dashboard-client.tsx", root), "utf8");
const api = await readFile(new URL("app/api/data/route.ts", root), "utf8");
const styles = await readFile(new URL("app/globals.css", root), "utf8");
const meta = await readFile(new URL("db/meta.ts", root), "utf8");
const schema = await readFile(new URL("db/schema.ts", root), "utf8");
const database = await readFile(new URL("db/index.ts", root), "utf8");

test("la corbeille propose restaurer ou supprimer définitivement dans un menu trois points", () => {
  assert.match(dashboard, /className="order-actions trash-actions"/);
  assert.match(dashboard, /Supprimer définitivement/);
  assert.match(dashboard, /submit\("deleteOrderPermanently"/);
  assert.match(api, /payload\.action === "deleteOrderPermanently"/);
  assert.match(api, /AND deleted_at IS NOT NULL/);
});

test("la barre latérale peut défiler indépendamment", () => {
  assert.match(styles, /\.sidebar \{[^}]*overflow-y:auto/);
  assert.match(styles, /scrollbar-width:thin/);
});

test("les sauvegardes et le journal sont repliables", () => {
  assert.match(dashboard, /settings-disclosure continuity-panel/);
  assert.match(dashboard, /settings-disclosure audit-panel/);
  assert.match(dashboard, /<summary className="settings-disclosure-summary">/);
});

test("le formulaire produit calcule tous les coûts et propose un prix de vente", () => {
  assert.match(dashboard, /function ProductPricingFields/);
  assert.match(dashboard, /Emballage/);
  assert.match(dashboard, /Publicité \/ vente/);
  assert.match(dashboard, /Livraison à votre charge/);
  assert.match(dashboard, /Bénéfice souhaité/);
  assert.match(dashboard, /Utiliser le prix conseillé/);
});

test("Meta reconstruit les lignes, conserve le montant natif et convertit en MAD", () => {
  assert.match(meta, /nativeSpend \* fx\.rate/);
  assert.match(meta, /meta_last_native_spend/);
  assert.match(meta, /meta_last_converted_spend/);
  assert.match(meta, /campaign_id,campaign_name,spend/);
  assert.match(meta, /DELETE FROM ad_performance WHERE source/);
  assert.match(meta, /native_spend_cents/);
  assert.match(meta, /meta_import_revision/);
  assert.match(dashboard, /Dernière conversion/);
  assert.match(dashboard, /Reçu de Meta/);
  assert.match(dashboard, /Le texte « 10\$\/j »/);
  assert.match(schema, /nativeSpendCents: integer\("native_spend_cents"\)/);
  assert.match(database, /ensureAdPerformanceColumns/);
});
