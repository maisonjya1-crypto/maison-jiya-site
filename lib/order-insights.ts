// Outils d'aide à la décision sur les commandes (logiciel) :
// historique client à risque, taux par produit/ville, messages WhatsApp prêts.
export type InsightOrder = {
  id: number;
  orderRef: string;
  phone: string | null;
  customerName?: string | null;
  city: string;
  products: string;
  saleAmount: number;
  status: string;
  returnReason?: string;
  fulfillmentType?: string;
  carrier?: string;
  trackingNumber?: string;
  createdAt: string;
  deletedAt?: string | null;
};

export function phoneKey(phone: string | null | undefined) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("00212")) digits = digits.slice(5);
  else if (digits.startsWith("212")) digits = digits.slice(3);
  if (/^[5-7]\d{8}$/.test(digits)) digits = `0${digits}`;
  return /^0[5-7]\d{8}$/.test(digits) ? digits : "";
}

const RETURNED = new Set(["Retour", "Retour reçu", "Retournée", "Refusée"]);
const SHIPPED_OR_LATER = new Set(["Confirmée", "Expédiée", "En livraison", "Livrée", "Retour", "Retour reçu"]);

/* ---------- Client à risque ---------- */
export type CustomerHistory = { total: number; delivered: number; returned: number; cancelled: number; inProgress: number; lastReasons: string[] };
export type RiskLevel = "new" | "trusted" | "watch" | "high";

export function buildCustomerIndex(orders: InsightOrder[]) {
  const index = new Map<string, InsightOrder[]>();
  for (const order of orders) {
    if (order.deletedAt) continue;
    const key = phoneKey(order.phone);
    if (!key) continue;
    const list = index.get(key) || [];
    list.push(order);
    index.set(key, list);
  }
  return index;
}

/** Historique du même numéro, sans compter la commande regardée. */
export function customerHistory(index: Map<string, InsightOrder[]>, order: InsightOrder): CustomerHistory {
  const others = (index.get(phoneKey(order.phone)) || []).filter((item) => item.id !== order.id);
  const history: CustomerHistory = { total: others.length, delivered: 0, returned: 0, cancelled: 0, inProgress: 0, lastReasons: [] };
  for (const item of others) {
    if (item.status === "Livrée") history.delivered += 1;
    else if (RETURNED.has(item.status)) {
      history.returned += 1;
      if (item.returnReason) history.lastReasons.push(item.returnReason);
    } else if (item.status === "Annulée") history.cancelled += 1;
    else history.inProgress += 1;
  }
  history.lastReasons = [...new Set(history.lastReasons)].slice(0, 2);
  return history;
}

export function riskLevel(history: CustomerHistory): RiskLevel {
  const problems = history.returned + history.cancelled;
  if (!history.total) return "new";
  if (history.returned >= 2 || problems >= 3 || (history.returned >= 1 && history.delivered === 0)) return "high";
  if (problems >= 1) return "watch";
  return history.delivered > 0 ? "trusted" : "new";
}

export function riskLabel(history: CustomerHistory) {
  const level = riskLevel(history);
  if (level === "new") return { level, short: history.total ? `${history.total} en cours` : "Nouveau client", detail: history.total ? "Commandes précédentes encore en cours." : "Première commande avec ce numéro." };
  if (level === "trusted") return { level, short: `✓ ${history.delivered} livrée${history.delivered > 1 ? "s" : ""}`, detail: "Client déjà livré sans refus ni annulation." };
  const parts = [history.returned && `${history.returned} retour${history.returned > 1 ? "s" : ""}/refus`, history.cancelled && `${history.cancelled} annulée${history.cancelled > 1 ? "s" : ""}`, history.delivered && `${history.delivered} livrée${history.delivered > 1 ? "s" : ""}`].filter(Boolean).join(" · ");
  const reasons = history.lastReasons.length ? ` Motif : ${history.lastReasons.join(", ")}.` : "";
  return {
    level,
    short: `${level === "high" ? "⚠ Risque" : "△ À surveiller"} · ${parts}`,
    detail: `${level === "high" ? "Confirmez bien par appel avant d’expédier (adresse, disponibilité, montant)." : "Un incident passé : confirmez avant d’expédier."}${reasons}`,
  };
}

/* ---------- Taux par produit / ville ---------- */
export type RateRow = { label: string; orders: number; confirmed: number; cancelled: number; delivered: number; returned: number; pending: number; confirmationRate: number | null; deliveryRate: number | null; returnRate: number | null };

export function outcomeRates(orders: InsightOrder[], label: (order: InsightOrder) => string): RateRow[] {
  const rows = new Map<string, RateRow>();
  for (const order of orders) {
    if (order.deletedAt || order.fulfillmentType === "Magasin physique") continue;
    const key = label(order)?.trim() || "Non renseigné";
    const row = rows.get(key) || { label: key, orders: 0, confirmed: 0, cancelled: 0, delivered: 0, returned: 0, pending: 0, confirmationRate: null, deliveryRate: null, returnRate: null };
    row.orders += 1;
    if (SHIPPED_OR_LATER.has(order.status) || RETURNED.has(order.status)) row.confirmed += 1;
    if (order.status === "Annulée") row.cancelled += 1;
    if (order.status === "Livrée") row.delivered += 1;
    if (RETURNED.has(order.status)) row.returned += 1;
    if (order.status === "En attente" || order.status === "Nouvelle") row.pending += 1;
    rows.set(key, row);
  }
  const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
  return [...rows.values()].map((row) => ({
    ...row,
    confirmationRate: ratio(row.confirmed, row.confirmed + row.cancelled),
    deliveryRate: ratio(row.delivered, row.delivered + row.returned),
    returnRate: ratio(row.returned, row.delivered + row.returned),
  })).sort((a, b) => b.orders - a.orders || a.label.localeCompare(b.label, "fr"));
}

/* ---------- Messages WhatsApp ---------- */
export type WhatsappLang = "fr" | "ar";
export type WhatsappTemplate = { key: string; label: string; text: string };

export function whatsappTemplates(order: InsightOrder, options: { brand?: string; trackingBaseUrl?: string; lang?: WhatsappLang } = {}): WhatsappTemplate[] {
  const brand = options.brand || "Maison Jiya";
  const lang = options.lang || "fr";
  const firstName = String(order.customerName || "").trim().split(/\s+/)[0] || "";
  const amount = `${Number(order.saleAmount || 0).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} DH`;
  const tracking = options.trackingBaseUrl ? `${options.trackingBaseUrl}?ref=${encodeURIComponent(order.orderRef)}` : "";
  const carrier = order.carrier && order.carrier !== "Non affecté" ? order.carrier : "";
  if (lang === "ar") {
    const hello = firstName ? `السلام عليكم ${firstName}،` : "السلام عليكم،";
    return [
      { key: "confirm", label: "تأكيد الطلب", text: `${hello} معك ${brand}. توصلنا بطلبك رقم ${order.orderRef} (${order.products}) بمبلغ ${amount} يُدفع عند الاستلام. هل تؤكد الطلب والعنوان في ${order.city}؟` },
      { key: "no_answer", label: "لم يرد على الهاتف", text: `${hello} حاولنا الاتصال بك لتأكيد طلبك رقم ${order.orderRef} من ${brand}. متى يناسبك أن نتصل بك؟` },
      { key: "shipped", label: "تم الإرسال", text: `${hello} طلبك رقم ${order.orderRef} في الطريق إليك${carrier ? ` مع ${carrier}` : ""}. المبلغ ${amount} عند الاستلام.${tracking ? ` تتبع طلبك: ${tracking}` : ""}` },
      { key: "delivery_day", label: "التوصيل اليوم", text: `${hello} سيتصل بك عامل التوصيل اليوم لتسليم طلبك ${order.orderRef}. المرجو إبقاء الهاتف قريبًا منك. المبلغ ${amount}.` },
      { key: "review", label: "بعد التسليم", text: `${hello} شكرًا لثقتك في ${brand}! هل أعجبك طلبك؟ يسعدنا رأيك، ويمكنك إرسال صورة إن أردت.` },
    ];
  }
  const hello = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  return [
    { key: "confirm", label: "Confirmer la commande", text: `${hello} c’est ${brand}. Nous avons bien reçu votre commande ${order.orderRef} (${order.products}) pour ${amount}, à payer à la livraison. Pouvez-vous confirmer la commande et l’adresse à ${order.city} ?` },
    { key: "no_answer", label: "Pas de réponse à l’appel", text: `${hello} nous avons essayé de vous appeler pour confirmer votre commande ${order.orderRef} chez ${brand}. À quel moment pouvons-nous vous joindre ?` },
    { key: "shipped", label: "Colis expédié", text: `${hello} votre commande ${order.orderRef} est en route${carrier ? ` avec ${carrier}` : ""}. Montant à régler à la réception : ${amount}.${tracking ? ` Suivre la commande : ${tracking}` : ""}` },
    { key: "delivery_day", label: "Livraison aujourd’hui", text: `${hello} le livreur va vous appeler aujourd’hui pour vous remettre votre commande ${order.orderRef}. Merci de garder votre téléphone à portée de main. Montant : ${amount}.` },
    { key: "review", label: "Après livraison (avis)", text: `${hello} merci pour votre confiance chez ${brand} ! Votre commande vous plaît ? Votre avis nous ferait très plaisir, avec une photo si vous le souhaitez.` },
  ];
}

export function whatsappLink(phone: string | null | undefined, text: string) {
  const key = phoneKey(phone);
  const digits = key ? `212${key.slice(1)}` : String(phone || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : "";
}
