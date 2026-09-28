import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");

test("le correctif disponibilité ne peut plus s'auto-déclencher en boucle", async () => {
  const source = await readText("app/private-ui-v3-enhancement.tsx");
  assert.match(source, /mjAvailabilityLabelsReady/);
  assert.match(source, /if \(select\.dataset\.mjAvailabilityLabelsReady === "true"\) return/);
  assert.match(source, /automatic && automatic\.textContent !==/);
  assert.match(source, /available && available\.textContent !==/);
  assert.match(source, /unavailable && unavailable\.textContent !==/);
});

test("le CMS boutique affiche clairement si le compte peut modifier prix et photos", async () => {
  const source = await readText("app/storefront-cms-v2-enhancement.tsx");
  assert.match(source, /Mode édition/);
  assert.match(source, /Lecture seule/);
  assert.match(source, /modifier les prix/);
  assert.match(source, /ajouter\/supprimer les photos/);
});

test("l'API boutique autorise toujours uniquement admin et editor à modifier", async () => {
  const admin = await readText("app/api/storefront/admin/route.ts");
  const media = await readText("app/api/storefront/admin/media/route.ts");
  assert.match(admin, /\["admin", "editor"\]\.includes\(access\.user\.role\)/);
  assert.match(media, /\["admin", "editor"\]\.includes\(user\.role\)/);
});
