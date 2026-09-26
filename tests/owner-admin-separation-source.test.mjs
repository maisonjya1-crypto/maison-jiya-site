import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("le propriétaire principal est distinct du rôle administrateur", async () => {
  const [schema, index, auth, authRoute, data] = await Promise.all([
    read("db/schema.ts"), read("db/schema-compat.ts"), read("app/auth.ts"), read("app/api/auth/route.ts"), read("app/api/data/route.ts"),
  ]);
  assert.match(schema, /isOwner: integer\("is_owner"/);
  assert.match(index, /ALTER TABLE users ADD COLUMN is_owner/);
  assert.match(index, /ORDER BY id ASC LIMIT 1/);
  assert.match(index, /users_single_owner_unique/);
  assert.match(auth, /isOwner: boolean/);
  assert.match(authRoute, /isOwner: true/);
  assert.match(data, /isOwner: user\.isOwner/);
  assert.doesNotMatch(data, /isOwner: user\.role === "admin"/);
  assert.match(data, /isOwner: false/);
});

test("un administrateur partenaire ne peut pas recevoir les pouvoirs propriétaire", async () => {
  const [data, exporter, whatsapp, dashboard] = await Promise.all([
    read("app/api/data/route.ts"), read("app/api/export/route.ts"), read("app/api/settings/whatsapp/route.ts"), read("app/dashboard-client.tsx"),
  ]);
  assert.match(data, /targetMember\.isOwner/);
  assert.match(data, /Le propriétaire principal ne peut pas être rétrogradé/);
  assert.match(exporter, /!user\.isOwner/);
  assert.match(whatsapp, /canEdit: user\.isOwner/);
  assert.match(whatsapp, /if \(!user\.isOwner\)/);
  assert.match(dashboard, /data\.access\.isOwner \? "Propriétaire principal"/);
  assert.match(dashboard, /Administrateur — droits métier étendus/);
  assert.match(dashboard, /Seul le propriétaire principal peut créer des partenaires/);
});

test("la migration historique conserve le premier compte comme propriétaire unique", async () => {
  const migration = await read("drizzle/0020_owner_admin_separation.sql");
  assert.match(migration, /ORDER BY `id` ASC LIMIT 1/);
  assert.match(migration, /NOT EXISTS \(SELECT 1 FROM `users` WHERE `is_owner` = 1\)/);
  assert.match(migration, /WHERE `is_owner` = 1/);
});
