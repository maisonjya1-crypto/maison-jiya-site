import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("les transporteurs distinguent secrets présents et connexion réellement vérifiée", async () => {
  const [carriers, data, dashboard] = await Promise.all([
    read("db/carriers.ts"),
    read("app/api/data/route.ts"),
    read("app/dashboard-client.tsx"),
  ]);
  assert.match(carriers, /carrier_health_sendit_status/);
  assert.match(carriers, /carrier_health_forcelog_status/);
  assert.match(carriers, /CONNECTION_HEALTH_MAX_AGE_MS/);
  assert.match(carriers, /senditApiVerified/);
  assert.match(carriers, /forceLogApiVerified/);
  assert.match(carriers, /await senditToken\(senditPublic, senditPrivate\)/);
  assert.match(carriers, /FORCELOG_API_BASE}\/Cities/);
  assert.match(data, /sendit_api_verified/);
  assert.match(data, /forcelog_api_verified/);
  assert.match(dashboard, /API vérifiée/);
  assert.doesNotMatch(dashboard, />Connecté<\/span>[\s\S]{0,300}Sendit automatique/);
});

test("le webhook Sendit n'est déclaré vérifié qu'après un événement signé réellement reçu", async () => {
  const [carriers, webhook, dashboard] = await Promise.all([
    read("db/carriers.ts"),
    read("app/api/integrations/sendit/webhook/route.ts"),
    read("app/dashboard-client.tsx"),
  ]);
  assert.match(webhook, /validSignature/);
  assert.match(webhook, /x-sendit-signature/);
  assert.match(carriers, /event_type = 'delivery\.status\.update'/);
  assert.match(carriers, /senditWebhookVerifiedAt/);
  assert.match(dashboard, /Webhook signé réellement reçu/);
  assert.match(dashboard, /aucun événement signé reçu pour l’instant/);
});

test("la synchronisation manuelle ne masque plus un échec fournisseur derrière un OK générique", async () => {
  const [carriers, data] = await Promise.all([
    read("db/carriers.ts"),
    read("app/api/data/route.ts"),
  ]);
  assert.doesNotMatch(carriers, /sync\.completed/);
  assert.doesNotMatch(carriers, /external_status[^\n]*'OK'/);
  assert.match(data, /Aucune connexion transporteur n’a pu être vérifiée/);
  assert.match(data, /Connexion vérifiée/);
  assert.match(data, /À corriger/);
});

test("Meta distingue secrets configurés et dernière connexion réellement réussie", async () => {
  const [meta, dashboard] = await Promise.all([
    read("db/meta.ts"),
    read("app/dashboard-client.tsx"),
  ]);
  assert.match(meta, /updateMetaSetting\("meta_status", "Connecté"\)/);
  assert.match(meta, /updateMetaSetting\("meta_last_sync_at"/);
  assert.match(meta, /updateMetaSetting\("meta_status", "Erreur de synchronisation"\)/);
  assert.match(dashboard, /metaVerified/);
  assert.match(dashboard, /Connexion Meta vérifiée lors de la dernière synchronisation/);
  assert.match(dashboard, /Secrets Meta présents, mais la dernière vérification API a échoué/);
});
