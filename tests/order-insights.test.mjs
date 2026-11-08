import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const insights = loadSource("lib/order-insights.ts");
const order = (id, phone, status, extra = {}) => ({ id, orderRef: `MJ-${id}`, phone, customerName: "Salma Benali", city: "Rabat", products: "Montre Acier", saleAmount: 250, status, createdAt: "2026-11-01", ...extra });

test("le même numéro est reconnu quel que soit son format", () => {
  assert.equal(insights.phoneKey("+212 6 12 34 56 78"), "0612345678");
  assert.equal(insights.phoneKey("00212612345678"), "0612345678");
  assert.equal(insights.phoneKey("612345678"), "0612345678");
  assert.equal(insights.phoneKey("123"), "");
});

test("client à risque : nouveau, fidèle, à surveiller, à risque", () => {
  const orders = [
    order(1, "0612345678", "Livrée"), order(2, "+212612345678", "Livrée"), order(3, "0612345678", "En attente"),
    order(10, "0700000000", "Retour", { returnReason: "Refus de la cliente" }), order(11, "0700000000", "En attente"),
    order(20, "0655555555", "Annulée"), order(21, "0655555555", "Livrée"), order(22, "0655555555", "En attente"),
    order(30, "0666666666", "En attente"),
    order(40, "0677777777", "Livrée", { deletedAt: "2026-11-02" }), order(41, "0677777777", "En attente"),
  ];
  const index = insights.buildCustomerIndex(orders);
  const level = (id) => insights.riskLabel(insights.customerHistory(index, orders.find((item) => item.id === id))).level;
  assert.equal(level(3), "trusted");
  assert.equal(level(11), "high");
  assert.match(insights.riskLabel(insights.customerHistory(index, orders.find((item) => item.id === 11))).detail, /Refus de la cliente/);
  assert.equal(level(22), "watch");
  assert.equal(level(30), "new");
  assert.equal(level(41), "new", "une commande supprimée ne compte pas");
});

test("taux par produit : confirmation sur décidées, livraison et retours sur colis terminés, ventes magasin exclues", () => {
  const rows = insights.outcomeRates([
    order(1, "0611111111", "Livrée"), order(2, "0611111112", "Livrée"), order(3, "0611111113", "Retour"),
    order(4, "0611111114", "Annulée"), order(5, "0611111115", "En attente"), order(6, "0611111116", "Expédiée"),
    order(7, "0611111117", "Livrée", { fulfillmentType: "Magasin physique" }),
  ], (item) => item.products);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.orders, 6);
  assert.equal(row.confirmed, 4);
  assert.equal(row.confirmationRate, 80);
  assert.equal(row.deliveryRate, 66.7);
  assert.equal(row.returnRate, 33.3);
  assert.equal(row.pending, 1);
});

test("messages WhatsApp : prénom, référence, montant, lien de suivi, en français et en arabe", () => {
  const fr = insights.whatsappTemplates(order(5, "0612345678", "Expédiée", { carrier: "Sendit" }), { trackingBaseUrl: "https://maisonjiya.pages.dev/boutique/suivi" });
  assert.deepEqual(fr.map((item) => item.key), ["confirm", "no_answer", "shipped", "delivery_day", "review"]);
  assert.match(fr[0].text, /^Bonjour Salma, c’est Maison Jiya\. .*MJ-5.*250 DH.*Rabat/);
  assert.match(fr[2].text, /avec Sendit.*suivi\?ref=MJ-5/);
  const ar = insights.whatsappTemplates(order(5, "0612345678", "Confirmée"), { lang: "ar" });
  assert.match(ar[0].text, /^السلام عليكم Salma/);
  assert.equal(insights.whatsappLink("0612345678", "Salut"), "https://wa.me/212612345678?text=Salut");
});

test("le logiciel affiche le risque, les messages et les taux", () => {
  const dashboard = read("app/dashboard-client.tsx");
  assert.match(dashboard, /<CustomerRiskBadge order=\{o\} index=\{customerIndex\} \/>/);
  assert.match(dashboard, /allOrders=\{data\.orders\}/);
  assert.match(dashboard, /<OrderWhatsappTemplates order=\{order\} \/>/);
  assert.match(dashboard, /<RateTable title="Taux de confirmation, livraison et retour par produit" rows=\{productRates\} \/>/);
  assert.match(dashboard, /<RateTable title="Taux de confirmation, livraison et retour par ville" rows=\{cityRates\} \/>/);
});
