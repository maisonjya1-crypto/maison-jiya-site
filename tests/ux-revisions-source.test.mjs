import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dashboard = await readFile(new URL("app/dashboard-client.tsx", root), "utf8");
const api = await readFile(new URL("app/api/data/route.ts", root), "utf8");
const styles = await readFile(new URL("app/globals.css", root), "utf8");
const meta = await readFile(new URL("db/meta.ts", root), "utf8");

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

test("Meta conserve le total natif, convertit en MAD et élimine les doublons API", () => {
  assert.match(meta, /nativeSpend \* fx\.rate/);
  assert.match(meta, /meta_last_native_spend/);
  assert.match(meta, /meta_last_converted_spend/);
  assert.match(meta, /inArray\(adPerformance\.id/);
  assert.match(dashboard, /Dernière conversion/);
});
