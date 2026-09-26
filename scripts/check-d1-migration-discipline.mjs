import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relative) => readFile(path.join(root, relative), "utf8");

async function walk(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(relative));
    else result.push(relative.replaceAll("\\", "/"));
  }
  return result;
}

function ddlSignatures(source) {
  const signatures = [];
  for (const match of source.matchAll(/ALTER\s+TABLE\s+[`"]?([A-Za-z0-9_]+)[`"]?\s+ADD(?:\s+COLUMN)?\s+[`"]?([A-Za-z0-9_]+)/gi)) {
    signatures.push(`ALTER:${match[1].toLowerCase()}.${match[2].toLowerCase()}`);
  }
  for (const match of source.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+[`"]?([A-Za-z0-9_]+)/gi)) {
    signatures.push(`CREATE_TABLE:${match[1].toLowerCase()}`);
  }
  return signatures;
}

const [wrangler, deployWorkflow, indexSource, baselineRaw] = await Promise.all([
  read("wrangler.jsonc"),
  read(".github/workflows/deploy-cloudflare.yml"),
  read("db/index.ts"),
  read("scripts/d1-runtime-schema-baseline.json"),
]);

if (!/"migrations_dir"\s*:\s*"migrations"/.test(wrangler)) throw new Error("wrangler.jsonc doit utiliser migrations/.");
if (!/"migrations_table"\s*:\s*"d1_migrations"/.test(wrangler)) throw new Error("La table d1_migrations doit rester explicite.");

const applyIndex=deployWorkflow.indexOf("d1 migrations apply maison-jiya-pilotage-db --remote");
const deployIndex=deployWorkflow.indexOf("- name: Deploy Worker");
if (applyIndex < 0 || deployIndex < 0 || applyIndex > deployIndex) throw new Error("Les migrations D1 doivent être appliquées avant le Worker.");

if (/ALTER\s+TABLE|CREATE\s+TABLE/i.test(indexSource)) throw new Error("db/index.ts ne doit plus contenir de DDL.");

const migrationFiles=(await readdir(path.join(root,"migrations"))).filter(name=>/\.sql$/i.test(name)).sort();
if (!migrationFiles.length || migrationFiles[0] !== "0000_production_baseline.sql") throw new Error("Baseline D1 production manquant.");
const productionSql=(await Promise.all(migrationFiles.map(name=>read(path.join("migrations",name))))).join("\n");
if (!/CREATE TABLE IF NOT EXISTS d1_schema_baseline/i.test(productionSql)) throw new Error("Marqueur baseline D1 manquant.");

const drizzleFiles=(await readdir(path.join(root,"drizzle"))).filter(name=>/^\d+.*\.sql$/i.test(name));
for (const name of drizzleFiles) {
  const version=Number(name.match(/^(\d+)/)?.[1] || -1);
  if (version > 20) throw new Error(`${name}: drizzle/ est figé après 0020. Utilisez migrations/.`);
}

const baseline=JSON.parse(baselineRaw);
const allowed=new Set(baseline.signatures || []);
const current=new Set();
for (const file of (await walk("db")).filter(name=>name.endsWith(".ts"))) {
  for (const signature of ddlSignatures(await read(file))) current.add(signature);
}
const additions=[...current].filter(signature=>!allowed.has(signature)).sort();
if (additions.length) {
  throw new Error("Nouveau DDL runtime interdit. Utilisez migrations/*.sql :\n- "+additions.join("\n- "));
}
console.log(`D1 discipline OK · ${migrationFiles.length} migration(s) production · ${current.size} signature(s) runtime historiques.`);
