import { and, eq } from "drizzle-orm";
import { getDb } from ".";
import { adPerformance, settings } from "./schema";

type MetaAction = { action_type?: string; value?: string };
type MetaInsight = {
  campaign_name?: string;
  publisher_platform?: string;
  spend?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  date_start?: string;
};
type MetaInsightsResponse = {
  data?: MetaInsight[];
  error?: { message?: string };
  paging?: { next?: string };
};

function actionTotal(actions: MetaAction[] | undefined, accepted: string[]) {
  const acceptedSet = new Set(accepted);
  return (actions || []).reduce((sum, action) => acceptedSet.has(action.action_type || "") ? sum + (Number(action.value) || 0) : sum, 0);
}

async function updateMetaSetting(key: string, value: string) {
  const db = await getDb();
  const updatedAt = new Date().toISOString();
  await db.insert(settings).values({ key, value, updatedAt }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } });
}

export async function syncMetaAds(days = 31) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as CloudflareEnv & {
    META_ACCESS_TOKEN?: string;
    META_AD_ACCOUNT_ID?: string;
    META_API_VERSION?: string;
  };
  const accessToken = runtime.META_ACCESS_TOKEN?.trim();
  const rawAccount = runtime.META_AD_ACCOUNT_ID?.trim();
  const apiVersion = runtime.META_API_VERSION?.trim();
  if (!accessToken || !rawAccount || !apiVersion) {
    await updateMetaSetting("meta_status", "À connecter");
    return { configured: false, imported: 0, message: "Ajoutez META_ACCESS_TOKEN, META_AD_ACCOUNT_ID et META_API_VERSION dans les secrets Cloudflare." };
  }
  if (!/^v\d+\.\d+$/.test(apiVersion) || !/^(act_)?\d+$/.test(rawAccount)) {
    await updateMetaSetting("meta_status", "Configuration invalide");
    return { configured: true, imported: 0, message: "La version API ou l’identifiant du compte publicitaire est invalide." };
  }

  const accountId = rawAccount.startsWith("act_") ? rawAccount : `act_${rawAccount}`;
  const since = new Date(Date.now() - Math.max(1, Math.min(days, 90)) * 86_400_000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({
    access_token: accessToken,
    level: "campaign",
    fields: "campaign_name,spend,actions,action_values,date_start",
    breakdowns: "publisher_platform",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    limit: "250",
  });
  let nextUrl: string | undefined = `https://graph.facebook.com/${apiVersion}/${accountId}/insights?${params.toString()}`;
  let imported = 0;
  let pageCount = 0;
  const db = await getDb();

  try {
    while (nextUrl && pageCount < 12) {
      const response = await fetch(nextUrl, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) throw new Error(`Réponse Meta inattendue (${response.status}).`);
      const body = await response.json() as MetaInsightsResponse;
      if (!response.ok || body.error) throw new Error(body.error?.message || `Meta a répondu ${response.status}.`);
      for (const row of body.data || []) {
        const campaign = (row.campaign_name || "Campagne Meta").slice(0, 160);
        const platform = (row.publisher_platform || "Meta").replace(/^./, (letter) => letter.toUpperCase()).slice(0, 60);
        const performanceDate = /^\d{4}-\d{2}-\d{2}$/.test(row.date_start || "") ? row.date_start! : until;
        const spend = Math.max(0, Math.round(Number(row.spend) || 0));
        const revenue = Math.max(0, Math.round(actionTotal(row.action_values, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"])));
        const orderCount = Math.max(0, Math.round(actionTotal(row.actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"])));
        const [existing] = await db.select({ id: adPerformance.id }).from(adPerformance).where(and(
          eq(adPerformance.campaign, campaign),
          eq(adPerformance.platform, platform),
          eq(adPerformance.performanceDate, performanceDate),
          eq(adPerformance.source, "Meta API"),
        )).limit(1);
        if (existing) {
          await db.update(adPerformance).set({ spend, revenue, orderCount }).where(eq(adPerformance.id, existing.id));
        } else {
          await db.insert(adPerformance).values({ platform, campaign, spend, revenue, orderCount, source: "Meta API", performanceDate });
        }
        imported += 1;
      }
      nextUrl = body.paging?.next;
      pageCount += 1;
    }
    await updateMetaSetting("meta_status", "Connecté");
    await updateMetaSetting("meta_last_sync_at", new Date().toISOString());
    await updateMetaSetting("meta_last_error", "");
    return { configured: true, imported, message: `${imported} ligne(s) Meta Ads synchronisée(s).` };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "Synchronisation Meta impossible.";
    await updateMetaSetting("meta_status", "Erreur de synchronisation");
    await updateMetaSetting("meta_last_error", message);
    return { configured: true, imported: 0, message };
  }
}

export async function getMetaRuntimeStatus() {
  const { env } = await import("cloudflare:workers");
  const runtime = env as CloudflareEnv & { META_ACCESS_TOKEN?: string; META_AD_ACCOUNT_ID?: string; META_API_VERSION?: string };
  return Boolean(runtime.META_ACCESS_TOKEN?.trim() && runtime.META_AD_ACCOUNT_ID?.trim() && runtime.META_API_VERSION?.trim());
}
