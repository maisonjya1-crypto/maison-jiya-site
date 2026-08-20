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
type MetaAdAccountResponse = {
  currency?: string;
  error?: { message?: string };
};
type ExchangeRateResponse = {
  result?: string;
  rates?: Record<string, number>;
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

async function getMadRate(currency: string) {
  const normalizedCurrency = currency.toUpperCase();
  if (normalizedCurrency === "MAD") {
    await updateMetaSetting("meta_currency", "MAD");
    await updateMetaSetting("meta_fx_rate", "1");
    await updateMetaSetting("meta_fx_updated_at", new Date().toISOString());
    return { currency: "MAD", rate: 1, cached: false };
  }

  const db = await getDb();
  const rows = await db.select().from(settings);
  const saved = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const cachedRate = Number(saved.meta_fx_rate);
  const cachedAt = Date.parse(saved.meta_fx_updated_at || "");
  const cacheMatches = saved.meta_currency === normalizedCurrency && Number.isFinite(cachedRate) && cachedRate > 0;
  if (cacheMatches && Number.isFinite(cachedAt) && Date.now() - cachedAt < 20 * 60 * 60 * 1000) {
    return { currency: normalizedCurrency, rate: cachedRate, cached: true };
  }

  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(normalizedCurrency)}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json" },
    });
    const body = await response.json() as ExchangeRateResponse;
    const rate = Number(body.rates?.MAD);
    if (!response.ok || body.result !== "success" || !Number.isFinite(rate) || rate <= 0) {
      throw new Error("Taux MAD indisponible.");
    }
    await updateMetaSetting("meta_currency", normalizedCurrency);
    await updateMetaSetting("meta_fx_rate", String(rate));
    await updateMetaSetting("meta_fx_updated_at", new Date().toISOString());
    return { currency: normalizedCurrency, rate, cached: false };
  } catch (error) {
    if (cacheMatches) return { currency: normalizedCurrency, rate: cachedRate, cached: true };
    throw error;
  }
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
  let imported = 0;
  let pageCount = 0;
  const db = await getDb();

  try {
    const accountParams = new URLSearchParams({ access_token: accessToken, fields: "currency" });
    const accountResponse = await fetch(`https://graph.facebook.com/${apiVersion}/${accountId}?${accountParams.toString()}`, {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: "application/json" },
    });
    const accountBody = await accountResponse.json() as MetaAdAccountResponse;
    if (!accountResponse.ok || accountBody.error) throw new Error(accountBody.error?.message || `Meta a répondu ${accountResponse.status}.`);
    const accountCurrency = (accountBody.currency || "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(accountCurrency)) throw new Error("Meta n’a pas fourni la devise du compte publicitaire.");
    const fx = await getMadRate(accountCurrency);
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
        const spend = Math.max(0, Math.round((Number(row.spend) || 0) * fx.rate));
        const revenue = Math.max(0, Math.round(actionTotal(row.action_values, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]) * fx.rate));
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
    const conversion = accountCurrency === "MAD" ? "devise MAD" : `1 ${accountCurrency} = ${fx.rate.toFixed(4)} MAD`;
    return { configured: true, imported, failed: false, message: `${imported} ligne(s) Meta Ads synchronisée(s) · ${conversion}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "Synchronisation Meta impossible.";
    await updateMetaSetting("meta_status", "Erreur de synchronisation");
    await updateMetaSetting("meta_last_error", message);
    return { configured: true, imported: 0, failed: true, message };
  }
}

export async function getMetaRuntimeStatus() {
  const { env } = await import("cloudflare:workers");
  const runtime = env as CloudflareEnv & { META_ACCESS_TOKEN?: string; META_AD_ACCOUNT_ID?: string; META_API_VERSION?: string };
  return Boolean(runtime.META_ACCESS_TOKEN?.trim() && runtime.META_AD_ACCOUNT_ID?.trim() && runtime.META_API_VERSION?.trim());
}
