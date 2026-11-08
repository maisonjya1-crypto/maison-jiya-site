// Suivi de commande côté client : on ne montre que l'avancement, jamais l'adresse ni le nom.
export type TrackingStage = "received" | "confirmed" | "shipped" | "out_for_delivery" | "delivered" | "returned" | "cancelled";

export function trackingStage(status: string): TrackingStage {
  switch ((status || "").trim()) {
    case "Confirmée": return "confirmed";
    case "Expédiée": return "shipped";
    case "En livraison": return "out_for_delivery";
    case "Livrée": return "delivered";
    case "Retour":
    case "Retour reçu":
    case "Retournée":
    case "Refusée": return "returned";
    case "Annulée": return "cancelled";
    default: return "received";
  }
}

export const TRACKING_STEPS: TrackingStage[] = ["received", "confirmed", "shipped", "out_for_delivery", "delivered"];

// Page publique de suivi du transporteur, quand elle existe.
export function carrierTrackingUrl(carrier: string) {
  return /force\s*log/i.test(carrier || "") ? "https://forcelog.ma/suivi-de-colis/" : "";
}

export function normalizeOrderRef(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 40);
}
