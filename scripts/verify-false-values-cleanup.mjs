import { readFileSync } from "node:fs";

function rows(path) {
  const payload = JSON.parse(readFileSync(path, "utf8"));
  const batches = Array.isArray(payload) ? payload : [payload];
  return batches.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []);
}

function stable(value) {
  return JSON.stringify(value);
}

const beforeProducts = rows(process.argv[2]);
const afterProducts = rows(process.argv[3]);
const beforeMovements = rows(process.argv[4]);
const afterMovements = rows(process.argv[5]);
const checks = rows(process.argv[6]);

if (stable(beforeProducts) !== stable(afterProducts)) {
  throw new Error("Le stock produit a changé pendant le nettoyage.");
}
if (stable(beforeMovements) !== stable(afterMovements)) {
  throw new Error("Le contenu des mouvements de stock a changé pendant le nettoyage.");
}

const check = checks[0] || {};
if (Number(check.false_orders_remaining) !== 0) {
  throw new Error(`Il reste ${check.false_orders_remaining} fausse(s) commande(s).`);
}
if (Number(check.false_history_remaining) !== 0) {
  throw new Error(`Il reste ${check.false_history_remaining} historique(s) de fausse commande.`);
}
if (Number(check.real_order_remaining) !== 1) {
  throw new Error("La commande réelle de contrôle MJ-WADFL33 n'est plus présente.");
}
if (Number(check.real_customer_remaining) !== 1) {
  throw new Error("La cliente réelle de contrôle n'est plus présente.");
}

console.log("Nettoyage vérifié : fausses valeurs supprimées, stock inchangé, commande réelle conservée.");
