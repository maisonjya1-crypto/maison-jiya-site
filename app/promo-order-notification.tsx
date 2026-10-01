"use client";

import { useCallback, useEffect, useState } from "react";

type PromoOrder = {
  orderRef: string;
  campaign: string;
  status: string;
  source: string;
  createdAt: string;
};

const SEEN_KEY = "maison-jiya-promo-order-seen-v1";

function isPromoOrder(order: PromoOrder) {
  return order.status === "En attente"
    && order.source === "Site web"
    && order.campaign.includes("PROMO:2E50");
}

export default function PromoOrderNotification() {
  const [orders, setOrders] = useState<PromoOrder[]>([]);
  const [visible, setVisible] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as { orders?: PromoOrder[] };
      const promoOrders = (body.orders || [])
        .filter(isPromoOrder)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

      setOrders(promoOrders);
      const newestRef = promoOrders[0]?.orderRef || "";
      let seenRef = "";
      try { seenRef = localStorage.getItem(SEEN_KEY) || ""; } catch { /* stockage facultatif */ }
      setVisible(Boolean(newestRef && newestRef !== seenRef));
    } catch {
      // Le dashboard principal garde sa propre gestion d'erreur.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 1200);
    const interval = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  if (!visible || !orders.length) return null;

  const newest = orders[0];

  function close() {
    try { localStorage.setItem(SEEN_KEY, newest.orderRef); } catch { /* stockage facultatif */ }
    setVisible(false);
  }

  function openOrders() {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".nav-item"))
      .find((candidate) => candidate.querySelector(".nav-label")?.textContent?.trim() === "Commandes");
    button?.click();
    close();
  }

  return (
    <aside className="promo-order-private-notification" role="status" aria-live="polite">
      <span className="promo-order-private-badge">−50%</span>
      <div className="promo-order-private-copy">
        <strong>{orders.length === 1 ? "Nouvelle commande avec l’offre -50 %" : `${orders.length} commandes avec l’offre -50 %`}</strong>
        <small>{newest.orderRef} · Le total inclut déjà la remise.</small>
        <button type="button" onClick={openOrders}>Voir les commandes</button>
      </div>
      <button className="promo-order-private-close" type="button" onClick={close} aria-label="Fermer la notification">×</button>
    </aside>
  );
}
