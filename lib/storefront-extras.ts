// Gammes et option coffret de la boutique publique.
export type Audience = "" | "homme" | "femme" | "unisexe";
export const AUDIENCES: Exclude<Audience, "">[] = ["homme", "femme", "unisexe"];

export function normalizeAudience(value: unknown): Audience {
  const clean = String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (["homme", "hommes", "men", "man", "h"].includes(clean)) return "homme";
  if (["femme", "femmes", "women", "woman", "f"].includes(clean)) return "femme";
  if (["unisexe", "unisex", "mixte", "u"].includes(clean)) return "unisexe";
  return "";
}

/** Un article unisexe apparaît aussi dans les filtres Homme et Femme. */
export function matchesAudience(itemAudience: string | undefined, filter: Audience) {
  if (!filter) return true;
  const audience = normalizeAudience(itemAudience);
  return audience === filter || (audience === "unisexe" && (filter === "homme" || filter === "femme"));
}

// Option « coffret premium » : un coffret par article du panier (un pack compte pour un article).
export type GiftBox = { enabled: boolean; label: string; price: number; cost: number; text: string };

export function giftBoxFromSettings(settings: Record<string, string | undefined>): GiftBox {
  const price = Math.max(0, Math.round((Number(settings.storefront_giftbox_price) || 0) * 100) / 100);
  return {
    enabled: settings.storefront_giftbox_enabled === "1" && price > 0,
    label: settings.storefront_giftbox_label?.trim() || "Coffret premium",
    price,
    cost: Math.max(0, Math.round((Number(settings.storefront_giftbox_cost) || 0) * 100) / 100),
    text: settings.storefront_giftbox_text?.trim() || "Coffret rigide élégant, idéal pour offrir.",
  };
}

export function giftBoxTotal(box: Pick<GiftBox, "enabled" | "price">, articles: number, chosen: boolean) {
  if (!chosen || !box.enabled || articles <= 0) return { count: 0, amount: 0 };
  const count = Math.min(40, Math.floor(articles));
  return { count, amount: Math.round(box.price * count * 100) / 100 };
}
