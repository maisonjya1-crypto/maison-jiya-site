import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadSource } from "./helpers/d1-fixture.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("une livraison historique reste reconnue après un retour", () => {
  const dates = loadSource("lib/accounting-dates.ts");
  const order = {
    id: 7,
    status: "Retour",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
  };
  const history = [
    { orderId: 7, toStatus: "Livrée", changedAt: "2026-09-05T10:00:00.000Z" },
    { orderId: 7, toStatus: "Retour", changedAt: "2026-09-10T10:00:00.000Z" },
  ];
  assert.equal(dates.deliveryRecognitionDate(order, history), "2026-09-05T10:00:00.000Z");
  assert.equal(dates.returnRecognitionDate(7, history), "2026-09-10T10:00:00.000Z");
});

test("le bénéfice global conserve les coûts d'une commande retournée", () => {
  const finance = loadSource("lib/finance.ts");
  const result = finance.calculateOperatingProfit([
    { status: "Retour", paymentStatus: "Remboursé", saleAmount: 500, productCost: 100, shippingCost: 40, fees: 10, returnCost: 25 },
  ], [], []);
  assert.equal(result.deliveredRevenue, 0);
  assert.equal(result.deliveredOrderCosts, 150);
  assert.equal(result.losses, 25);
  assert.equal(result.profit, -175);
});

test("la boutique publique ne bloque plus les commandes quand le stock interne est à zéro", async () => {
  const fast = await read("db/storefront-public-fast.ts");
  const fallback = await read("db/storefront-public.ts");
  const orderRoute = await read("app/api/storefront/orders/route.ts");

  assert.doesNotMatch(fast, /product\.stockQuantity > 0/);
  assert.doesNotMatch(fast, /item\.stockQuantity >= item\.quantity/);
  assert.match(fast, /product\.availabilityMode !== "out_of_stock"/);
  assert.match(fast, /components\.every\(\(item\) => item\.availabilityMode !== "out_of_stock"\)/);
  assert.match(fast, /Disponible à la commande/);

  assert.doesNotMatch(fallback, /product\.stockQuantity > 0/);
  assert.doesNotMatch(fallback, /item\.stockQuantity >= item\.quantity/);
  assert.match(fallback, /product\.availabilityMode !== "out_of_stock"/);
  assert.match(fallback, /components\.every\(\(item\) => item\.availabilityMode !== "out_of_stock"\)/);

  assert.match(orderRoute, /une commande publique reste "En attente"/);
  assert.match(orderRoute, /n'est jamais refusée[\s\S]*stock actuel est inférieur/);
  assert.match(orderRoute, /stock_deducted[\s\S]*0/);
});

test("les quantités métier ne sont plus arrondies silencieusement", async () => {
  const data = await read("app/api/data/route.ts");
  const multi = await read("app/api/orders/multi/route.ts");
  assert.match(data, /Number\.isInteger\(parsed\)/);
  assert.doesNotMatch(data.slice(data.indexOf("function numberValue"), data.indexOf("function moneyValue")), /Math\.round/);
  assert.match(data, /La quantité reçue doit être un nombre entier positif/);
  assert.match(multi, /Number\.isInteger\(parsed\)/);
  assert.doesNotMatch(multi.slice(multi.indexOf("function positiveInt"), multi.indexOf("function money")), /Math\.round/);
});

test("une expiration push invalide est rejetée avant toISOString", async () => {
  const push = await read("app/api/push/route.ts");
  assert.match(push, /Number\.isFinite\(expirationMillis\)/);
  assert.match(push, /Number\.isNaN\(expirationDate\.getTime\(\)\)/);
  assert.doesNotMatch(push, /new Date\(Number\(payload\.expirationTime\)\)\.toISOString\(\)/);
});

test("les commandes publiques ont une limite de corps même sans Content-Length", async () => {
  const route = await read("app/api/storefront/orders/route.ts");
  assert.match(route, /MAX_ORDER_BODY_BYTES = 32_000/);
  assert.match(route, /request\.body\.getReader\(\)/);
  assert.match(route, /total > MAX_ORDER_BODY_BYTES/);
  assert.match(route, /status: 413/);
});

test("un simple snapshot ne recalcule plus toutes les affectations de capital", async () => {
  const route = await read("app/api/data/route.ts");
  const start = route.indexOf("async function snapshot(access: AccessInfo)");
  const end = route.indexOf("function", start + 20);
  const snapshot = route.slice(start, end > start ? end : start + 2500);
  assert.doesNotMatch(snapshot, /reconcileOrderAllocations\(\)/);
  assert.match(route, /allocationSensitiveActions/);
});


test("la version Meta reste définie dans Wrangler sans exposer les secrets", async () => {
  const wrangler = await read("wrangler.jsonc");
  assert.match(wrangler, /"META_API_VERSION"\s*:\s*"v26\.0"/);
  assert.doesNotMatch(wrangler, /META_ACCESS_TOKEN/);
  assert.doesNotMatch(wrangler, /META_AD_ACCOUNT_ID/);
});


test("la calculatrice contextuelle est disponible dans les blocs privés sans modifier les données", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  const styles = await read("app/globals.css");
  assert.match(dashboard, /function BlockCalculatorLayer/);
  assert.match(dashboard, /block-calculator-trigger/);
  assert.match(dashboard, /MAD · quantités · marges/);
  assert.match(dashboard, /Ne modifie aucune donnée du logiciel/);
  assert.match(dashboard, /<BlockCalculatorLayer active={active} \/>/);
  assert.match(styles, /\.block-calculator-popover/);
  assert.match(styles, /\.block-calculator-grid/);
  assert.match(styles, /\.block-calculator-trigger/);
});
