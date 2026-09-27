import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

function assertPrivateLoadingSource() {
  const dashboard = readFileSync(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /auth-loading-shell/);
  assert.match(dashboard, /Préparation de votre espace de pilotage/);
}

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);

  let worker;
  try {
    ({ default: worker } = await import(workerUrl.href));
  } catch (error) {
    // vinext 1.x laisse les imports Cloudflare natifs au runtime Workerd.
    // Node ne sait pas charger le protocole cloudflare:, donc le bundle Worker
    // est contrôlé séparément avec `wrangler deploy --dry-run` dans la CI.
    if (
      error?.code === "ERR_UNSUPPORTED_ESM_URL_SCHEME"
      && String(error?.message || "").includes("cloudflare:")
    ) {
      assertPrivateLoadingSource();
      return;
    }
    throw error;
  }

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /auth-loading-shell/);
  assert.match(html, /Préparation de votre espace de pilotage/);
  assert.doesNotMatch(html, /Assistant IA/);
});
