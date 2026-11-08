/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { runDailyMaintenance } from "../db/backups";
import { syncCarrierOperations } from "../db/carriers";
import { syncMetaAds } from "../db/meta";
import { reconcileOrderAllocations } from "../db/allocations";
import { processGoogleSheetsSyncQueue } from "../db/google-sheets-sync";
import { getRawDb } from "../db";
import { seoFileResponse } from "../lib/seo-files";
import { productPath } from "../lib/product-slug";
import { loadStorefrontCatalogFast } from "../db/storefront-public-fast";

interface Env extends CloudflareEnv {
  ASSETS: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

function withSecurityHeaders(response: Response, pathname: string, isHttps: boolean) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (isHttps && pathname.startsWith("/boutique")) {
    headers.set("strict-transport-security", "max-age=31536000");
  }

  const contentType = headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    headers.set("x-frame-options", "DENY");
  }
  if (pathname === "/") {
    headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const seoFile = await seoFileResponse(url.pathname, async () => {
      const catalog = await loadStorefrontCatalogFast(await getRawDb());
      return [...catalog.offers, ...catalog.products].map(productPath);
    });
    if (seoFile) return withSecurityHeaders(seoFile, url.pathname, url.protocol === "https:");

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(response, url.pathname, url.protocol === "https:");
    }

    const response = await handler.fetch(request, env, ctx);
    if (
      url.pathname.startsWith("/api/")
      && !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())
    ) {
      ctx.waitUntil(
        getRawDb()
          .then((database) => processGoogleSheetsSyncQueue(database))
          .then(() => undefined)
          .catch((error) => console.error("Maison Jiya background Google Sheets sync failed", error instanceof Error ? error.message : String(error))),
      );
    }
    return withSecurityHeaders(response, url.pathname, url.protocol === "https:");
  },
  async scheduled(controller: ScheduledController, _env: Env, ctx: ExecutionContext) {
    if (controller.cron === "*/5 * * * *") {
      ctx.waitUntil(
        getRawDb()
          .then((database) => processGoogleSheetsSyncQueue(database))
          .then(() => undefined)
          .catch((error) => console.error("Maison Jiya scheduled Google Sheets sync failed", error instanceof Error ? error.message : String(error))),
      );
      return;
    }
    if (controller.cron === "*/30 * * * *") {
      ctx.waitUntil(syncCarrierOperations());
      return;
    }
    ctx.waitUntil(Promise.all([
      getRawDb().then((database) => runDailyMaintenance(database)),
      syncMetaAds().then(() => undefined),
      reconcileOrderAllocations().then(() => undefined),
    ]).then(() => undefined));
  },
};

export default worker;
