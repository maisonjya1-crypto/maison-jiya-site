import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("les formats marocains sont normalisés avant les appels transporteurs", async () => {
  const [phone, carriers] = await Promise.all([read("db/phone.ts"), read("db/carriers.ts")]);
  assert.match(phone, /00212/);
  assert.match(phone, /0\[5-7\]/);
  assert.match(carriers, /PHONE: phone/);
  assert.match(carriers, /phone,/);
});

test("le téléphone est modifiable et validé avant l’autorisation", async () => {
  const [dashboard, api] = await Promise.all([read("app/dashboard-client.tsx"), read("app/api/data/route.ts")]);
  assert.match(dashboard, /Téléphone de livraison \*/);
  assert.match(api, /authorizeCarrierDispatch/);
  assert.match(api, /normalizeMoroccanPhone\(textValue\(payload\.phone\)\)/);
  assert.match(api, /UPDATE customers SET phone/);
});
