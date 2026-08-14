import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/integrations/sendit/webhook/route.ts", import.meta.url), "utf8");
const carriers = await readFile(new URL("../db/carriers.ts", import.meta.url), "utf8");

test("le webhook Sendit vérifie la signature avant de lire les données métier", () => {
  assert.match(route, /x-sendit-signature/i);
  assert.match(route, /HMAC/);
  assert.match(route, /timingSafeEqual/);
  assert.ok(route.indexOf("if (!(await validSignature") < route.lastIndexOf("applySenditStatusUpdate"));
});

test("le webhook Sendit limite le corps et refuse les événements inconnus", () => {
  assert.match(route, /MAX_BODY_BYTES/);
  assert.match(route, /delivery\.status\.update/);
  assert.match(route, /Événement Sendit invalide/);
});

test("les clés transporteur restent des secrets Cloudflare", () => {
  assert.match(carriers, /SENDIT_PUBLIC_KEY/);
  assert.match(carriers, /SENDIT_PRIVATE_KEY/);
  assert.match(carriers, /FORCELOG_API_KEY/);
  assert.doesNotMatch(carriers, /[A-Fa-f0-9]{32,}/);
});

test("les statuts Sendit sont reliés aux statuts Maison Jiya", () => {
  for (const status of ["DELIVERED", "RETURN", "CANCEL", "POSTPONED", "UNREACHABLE"]) {
    assert.match(carriers, new RegExp(status));
  }
  for (const status of ["Livrée", "Retour", "Annulée", "En livraison"]) {
    assert.match(carriers, new RegExp(status));
  }
});
