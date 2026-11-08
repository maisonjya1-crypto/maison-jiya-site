"use client";

import { useEffect, useState, type FormEvent } from "react";
import { TRACKING_STEPS, type TrackingStage } from "../../../lib/order-tracking";

type Result = { orderRef: string; stage: TrackingStage; city: string; quantity: number; total: number; carrier: string; trackingNumber: string; trackingUrl?: string; createdAt: string; updatedAt: string };

const LABELS: Record<TrackingStage, { title: string; text: string }> = {
  received: { title: "Commande reçue", text: "Notre équipe va vous appeler pour confirmer votre commande." },
  confirmed: { title: "Confirmée", text: "Votre commande est confirmée et en préparation." },
  shipped: { title: "Expédiée", text: "Votre colis a été remis au livreur." },
  out_for_delivery: { title: "En livraison", text: "Le livreur va vous contacter. Gardez votre téléphone à portée de main." },
  delivered: { title: "Livrée", text: "Votre commande a été livrée. Merci pour votre confiance !" },
  returned: { title: "Non livrée", text: "Le colis n’a pas pu être livré. Écrivez-nous sur WhatsApp pour organiser une nouvelle livraison." },
  cancelled: { title: "Annulée", text: "Cette commande a été annulée. Écrivez-nous sur WhatsApp si c’est une erreur." },
};

const date = (value: string) => {
  const parsed = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("fr-MA", { day: "numeric", month: "long", year: "numeric" });
};

export default function TrackForm() {
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const fromUrl = new URLSearchParams(window.location.search).get("ref");
      if (fromUrl) setRef(fromUrl.slice(0, 40));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/storefront/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref, phone }) });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(body.error || "Commande introuvable.");
      setResult(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Commande introuvable.");
    } finally {
      setLoading(false);
    }
  }

  const currentIndex = result ? TRACKING_STEPS.indexOf(result.stage) : -1;
  return <div className="mj-track">
    <form className="mj-track-form" onSubmit={(event) => void submit(event)}>
      <label><span>Référence de commande · رقم الطلب</span><input value={ref} onChange={(event) => setRef(event.target.value)} placeholder="Ex. MJ-ABC12-XY34Z5" required maxLength={40} autoComplete="off" /></label>
      <label><span>Téléphone utilisé · رقم الهاتف</span><input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" inputMode="tel" placeholder="06 12 34 56 78" required maxLength={40} autoComplete="tel" /></label>
      <button type="submit" disabled={loading}>{loading ? "Recherche…" : "Voir l’avancement"}</button>
      <small>La référence s’affiche après la commande sur le site. Vous ne la retrouvez pas ? Écrivez-nous sur WhatsApp.</small>
    </form>
    {error && <p className="mj-track-error" role="alert">{error}</p>}
    {result && <section className="mj-track-result" aria-live="polite">
      <header><small>Commande {result.orderRef}</small><h2>{LABELS[result.stage].title}</h2><p>{LABELS[result.stage].text}</p></header>
      {currentIndex >= 0 && <ol className="mj-track-steps">
        {TRACKING_STEPS.map((step, index) => <li key={step} className={index < currentIndex ? "done" : index === currentIndex ? "current" : ""}><span>{LABELS[step].title}</span></li>)}
      </ol>}
      <dl>
        <div><dt>Passée le</dt><dd>{date(result.createdAt)}</dd></div>
        <div><dt>Dernière mise à jour</dt><dd>{date(result.updatedAt)}</dd></div>
        <div><dt>Ville</dt><dd>{result.city}</dd></div>
        <div><dt>Montant à payer à la livraison</dt><dd>{result.total.toLocaleString("fr-MA")} DH</dd></div>
        {result.carrier && <div><dt>Livreur</dt><dd>{result.carrier}{result.trackingNumber ? ` · n° ${result.trackingNumber}` : ""}{result.trackingUrl && <> · <a href={result.trackingUrl} target="_blank" rel="noopener noreferrer">suivre chez {result.carrier}</a></>}</dd></div>}
      </dl>
    </section>}
  </div>;
}
