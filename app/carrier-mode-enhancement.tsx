"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Mode = "auto" | "manual";
type Quote = { available: boolean; carrier: "Sendit" | "ForceLog"; error?: string; fee: number | null };
type QuoteResult = { pickupCity: "Casablanca"; quotes: Quote[]; recommendedCarrier: "Sendit" | "ForceLog" | null };
type PortalContainer = Parameters<typeof createPortal>[1];

const money = (value: number) => `${Number(value).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD`;

function setControlledValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function cleanCarrier(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed === "Non affecté" ? "" : trimmed;
}

function readFormInitial(form: HTMLFormElement) {
  const isNewOrder = Boolean(form.querySelector('select[name="productId"]'));
  const nativeCarrier = form.querySelector('.carrier-quote-chooser input[name="carrier"]') as HTMLInputElement | null;
  const nativeFee = form.querySelector('.carrier-quote-chooser input[name="shippingCost"]') as HTMLInputElement | null;
  const tracking = form.querySelector('input[name="trackingNumber"]') as HTMLInputElement | null;
  const currentCarrier = cleanCarrier(nativeCarrier?.value || "");
  return {
    isNewOrder,
    carrier: isNewOrder ? "" : currentCarrier,
    fee: isNewOrder ? "0" : (nativeFee?.value || "0"),
    tracking: isNewOrder ? "" : (tracking?.value || ""),
    mode: (isNewOrder || !currentCarrier ? "auto" : "manual") as Mode,
  };
}

function humanQuoteError(error?: string) {
  if (!error) return "Tarif indisponible";
  const lower = error.toLocaleLowerCase("fr");
  if (lower.includes("non configur") || lower.includes("missing api key")) return "API non connectée";
  if (lower.includes("invalid") || lower.includes("401")) return "Clé API refusée";
  return error.length > 110 ? `${error.slice(0, 107)}…` : error;
}

function CarrierModePanel({ form }: { form: HTMLFormElement }) {
  const initial = useMemo(() => readFormInitial(form), [form]);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [carrier, setCarrier] = useState(initial.carrier);
  const [shippingFee, setShippingFee] = useState(initial.fee);
  const [trackingNumber, setTrackingNumber] = useState(initial.tracking);
  const [city, setCity] = useState(() => (form.querySelector('input[name="city"]') as HTMLInputElement | null)?.value || "");
  const [quotes, setQuotes] = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const locked = Boolean(initial.tracking);
  const suggestions = ["ForceLog", "Sendit", "Cathedis", "Jibli", "Chronodiali", "Amana"];

  useEffect(() => {
    const cityInput = form.querySelector('input[name="city"]') as HTMLInputElement | null;
    if (!cityInput) return;
    const read = () => setCity(cityInput.value);
    cityInput.addEventListener("input", read);
    cityInput.addEventListener("change", read);
    return () => {
      cityInput.removeEventListener("input", read);
      cityInput.removeEventListener("change", read);
    };
  }, [form]);

  useEffect(() => {
    const nativeCarrier = form.querySelector('.carrier-quote-chooser input[name="carrier"]') as HTMLInputElement | null;
    const nativeFee = form.querySelector('.carrier-quote-chooser input[name="shippingCost"]') as HTMLInputElement | null;
    if (nativeCarrier) nativeCarrier.disabled = true;
    if (nativeFee) nativeFee.disabled = true;

    const timer = window.setTimeout(() => {
      const manualInputs = form.querySelectorAll('.mj-carrier-manual .mj-carrier-fields input');
      const manualCarrier = manualInputs.item(0) as HTMLInputElement | null;
      const manualFee = manualInputs.item(1) as HTMLInputElement | null;
      const manualTracking = manualInputs.item(2) as HTMLInputElement | null;
      if (manualCarrier && manualCarrier.value !== carrier) setControlledValue(manualCarrier, carrier);
      if (manualFee && manualFee.value !== shippingFee) setControlledValue(manualFee, shippingFee);
      if (manualTracking && manualTracking.value !== trackingNumber) setControlledValue(manualTracking, trackingNumber);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      if (nativeCarrier) nativeCarrier.disabled = false;
      if (nativeFee) nativeFee.disabled = false;
    };
  }, [carrier, form, shippingFee, trackingNumber]);

  useEffect(() => {
    if (mode !== "auto") return;
    const cleanCity = city.trim();
    if (cleanCity.length < 2) {
      const timer = window.setTimeout(() => { setQuotes(null); setQuoteError(""); setLoading(false); }, 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setQuoteError("");
      void fetch(`/api/integrations/carriers/quote?city=${encodeURIComponent(cleanCity)}`, { signal: controller.signal })
        .then(async (response) => {
          const body = await response.json() as QuoteResult & { error?: string };
          if (!response.ok) throw new Error(body.error || "Tarifs indisponibles.");
          setQuotes(body);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setQuoteError(error instanceof Error ? error.message : "Tarifs indisponibles.");
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [city, mode]);

  function chooseAuto(quote: Quote) {
    if (!quote.available || quote.fee === null || locked) return;
    setCarrier(quote.carrier);
    setShippingFee(String(quote.fee));
    if (!locked) setTrackingNumber("");
  }

  function switchMode(next: Mode) {
    if (locked) return;
    setMode(next);
    if (next === "auto") {
      setCarrier("");
      setShippingFee("0");
      setTrackingNumber("");
    }
  }

  const submitCarrier = cleanCarrier(carrier) || "Non affecté";
  return <section className="mj-carrier-mode-panel">
    <input type="hidden" name="carrierMode" value={mode} />
    <input type="hidden" name="carrier" value={submitCarrier} />
    <input type="hidden" name="shippingCost" value={shippingFee || "0"} />
    <input type="hidden" name="trackingNumber" value={trackingNumber} />

    <div className="mj-carrier-mode-head">
      <div>
        <span>Livraison</span>
        <strong>Comment veux-tu choisir l’agence ?</strong>
        <small>Automatique pour comparer les prix, manuel si le colis est déjà créé chez une agence.</small>
      </div>
      {locked && <span className="mj-carrier-lock">Suivi déjà lié</span>}
    </div>

    <div className="mj-carrier-mode-tabs" role="group" aria-label="Mode de sélection du transporteur">
      <button type="button" className={mode === "auto" ? "active" : ""} onClick={() => switchMode("auto")} disabled={locked}>
        <strong>Automatique</strong><small>Comparer Sendit / ForceLog</small>
      </button>
      <button type="button" className={mode === "manual" ? "active" : ""} onClick={() => switchMode("manual")} disabled={locked}>
        <strong>Manuel</strong><small>Agence déjà choisie ou autre agence</small>
      </button>
    </div>

    {mode === "auto" ? <div className="mj-carrier-auto-body">
      <div className="mj-carrier-auto-title">
        <div><strong>Comparaison des tarifs</strong><small>Départ Casablanca → {city.trim() || "ville à renseigner"}</small></div>
        <span>{loading ? "Comparaison…" : "Choisis toi-même"}</span>
      </div>
      {!city.trim() && <div className="mj-carrier-empty">Saisis la ville de livraison pour afficher les tarifs.</div>}
      {quoteError && <div className="mj-carrier-api-error">{quoteError}</div>}
      {quotes && <div className="mj-carrier-auto-grid">
        {quotes.quotes.map((quote) => {
          const selected = carrier === quote.carrier;
          const recommended = quotes.recommendedCarrier === quote.carrier;
          return <button type="button" key={quote.carrier} className={`${selected ? "selected" : ""} ${recommended ? "recommended" : ""}`} disabled={!quote.available || locked} onClick={() => chooseAuto(quote)}>
            <span><strong>{quote.carrier}</strong>{recommended && <em>Meilleur tarif</em>}</span>
            <b>{quote.fee === null ? "Indisponible" : money(quote.fee)}</b>
            <small>{quote.available ? (selected ? "✓ Agence choisie" : "Cliquer pour choisir") : humanQuoteError(quote.error)}</small>
          </button>;
        })}
      </div>}
      <p className="mj-carrier-auto-note">Le badge « meilleur tarif » est seulement une recommandation : aucune agence n’est sélectionnée tant que tu ne cliques pas dessus.</p>
    </div> : <div className="mj-carrier-manual-body">
      <div className="mj-carrier-manual-title"><strong>Transporteur libre</strong><small>Tu peux écrire ForceLog, Sendit ou n’importe quelle autre agence.</small></div>
      <div className="mj-carrier-quick-picks">
        {suggestions.slice(0, 2).map((name) => <button key={name} type="button" className={carrier.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr") ? "active" : ""} onClick={() => setCarrier(name)} disabled={locked}>{name}</button>)}
        <button type="button" onClick={() => setCarrier("")} disabled={locked}>Autre agence</button>
      </div>
      <div className="mj-carrier-manual-fields">
        <label><span>Agence utilisée</span><input value={carrier} onChange={(event) => setCarrier(event.target.value)} list="mj-carrier-mode-suggestions" placeholder="Écris le nom de l’agence…" disabled={locked} /><datalist id="mj-carrier-mode-suggestions">{suggestions.map((name) => <option key={name} value={name} />)}</datalist></label>
        <label><span>Frais de livraison (MAD)</span><input type="number" min="0" step="1" inputMode="decimal" value={shippingFee} onChange={(event) => setShippingFee(event.target.value)} placeholder="35" disabled={locked} /></label>
        <label><span>N° de suivi (optionnel)</span><input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder="Code de suivi…" disabled={locked} /></label>
      </div>
      <p className="mj-carrier-manual-note">Si tu as déjà créé la commande directement sur ForceLog, choisis ForceLog ici, saisis les frais et le numéro de suivi si tu l’as.</p>
    </div>}
  </section>;
}

function StructuredOrderStockFix({ form }: { form: HTMLFormElement }) {
  useEffect(() => {
    const modal = form.closest(".modal") as HTMLElement | null;
    const legacy = modal?.querySelector(".order-stock-state.legacy") as HTMLElement | null;
    const orderRef = (modal?.querySelector(".modal-head .card-kicker")?.textContent || "").trim();
    if (!legacy || !orderRef) return;
    const controller = new AbortController();
    void fetch(`/api/orders/meta?ref=${encodeURIComponent(orderRef)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ hasStructuredItems?: boolean; itemCount?: number; stockDeducted?: boolean; packName?: string }>;
      })
      .then((meta) => {
        if (!meta?.hasStructuredItems || controller.signal.aborted) return;
        legacy.classList.remove("legacy");
        legacy.classList.add(meta.stockDeducted ? "deducted" : "waiting", "mj-structured-stock-fixed");
        const icon = legacy.querySelector(":scope > span");
        const strong = legacy.querySelector("strong");
        const small = legacy.querySelector("small");
        if (icon) icon.textContent = meta.stockDeducted ? "✓" : "◷";
        if (strong) strong.textContent = meta.stockDeducted ? "Stock multi-produits déjà déduit" : "Stock multi-produits en attente";
        if (small) small.textContent = `${meta.itemCount || 0} ligne(s) produit reliée(s)${meta.packName ? ` · ${meta.packName}` : ""}. Le stock est géré article par article.`;
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [form]);
  return null;
}

export default function CarrierModeEnhancement() {
  const [activeForm, setActiveForm] = useState<HTMLFormElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const scan = () => {
      document.querySelectorAll<HTMLElement>(".carrier-quote-chooser, .mj-carrier-manual").forEach((element) => element.classList.add("mj-carrier-ui-replaced"));
      const forms = Array.from(document.querySelectorAll<HTMLFormElement>(".modal form"));
      const form = forms.find((candidate) => candidate.querySelector(".carrier-quote-chooser") || candidate.querySelector(".mj-carrier-manual")) || null;
      if (!form) {
        setActiveForm(null);
        setHost(null);
        return;
      }
      if (!form.dataset.mjCarrierFormId) form.dataset.mjCarrierFormId = crypto.randomUUID();
      let nextHost = form.querySelector('[data-mj-carrier-mode-host="true"]') as HTMLElement | null;
      if (!nextHost) {
        nextHost = document.createElement("div");
        nextHost.dataset.mjCarrierModeHost = "true";
        const multiBuilder = form.querySelector(".mj-multi-order-builder") as HTMLElement | null;
        const quote = form.querySelector(".carrier-quote-chooser") as HTMLElement | null;
        const anchor = multiBuilder || quote;
        if (anchor?.parentNode) anchor.parentNode.insertBefore(nextHost, anchor.nextSibling);
        else form.insertBefore(nextHost, form.querySelector(".modal-actions"));
      }
      setActiveForm((current) => current === form ? current : form);
      setHost((current) => current === nextHost ? current : nextHost);
    };
    const timer = window.setTimeout(scan, 0);
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { window.clearTimeout(timer); observer.disconnect(); };
  }, []);

  if (!activeForm || !host) return null;
  return <>
    {createPortal(<CarrierModePanel key={activeForm.dataset.mjCarrierFormId} form={activeForm} />, host as unknown as PortalContainer)}
    <StructuredOrderStockFix form={activeForm} />
  </>;
}
