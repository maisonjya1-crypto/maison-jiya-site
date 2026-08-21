"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CatalogItem, StorefrontCatalog } from "./storefront-types";

type Cart = Record<string, number>;
type FbqFunction = ((...args: unknown[]) => void) & { queue?: unknown[][]; loaded?: boolean; version?: string };
type FbqWindow = Window & { fbq?: FbqFunction; _fbq?: FbqFunction };

const INITIAL_VISIBLE = 24;
const FEATURED_OFFERS = 8;
const money = (value: number) => `${Number(value).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} DH`;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
const itemKey = (item: Pick<CatalogItem, "kind" | "id">) => `${item.kind === "offer" ? "o" : "p"}:${item.id}`;

function track(event: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  (window as FbqWindow).fbq?.("track", event, data || {});
}

function enableMetaPixel(pixelId: string) {
  if (!pixelId || typeof window === "undefined") return;
  const target = window as FbqWindow;
  if (!target.fbq) {
    const fbq = ((...args: unknown[]) => { fbq.queue = fbq.queue || []; fbq.queue.push(args); }) as FbqFunction;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    target.fbq = fbq;
    target._fbq = fbq;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
  target.fbq?.("init", pixelId);
  target.fbq?.("track", "PageView");
}

export default function StorefrontClientFast({ initialCatalog }: { initialCatalog: StorefrontCatalog | null }) {
  const [catalog, setCatalog] = useState<StorefrontCatalog | null>(initialCatalog);
  const [loading, setLoading] = useState(!initialCatalog);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tous");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmation, setConfirmation] = useState<{ orderRef: string; total: number } | null>(null);
  const [utm, setUtm] = useState({ source: "", medium: "", campaign: "" });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("maison-jiya-cart-v2");
        if (saved) setCart(JSON.parse(saved) as Cart);
      } catch {
        localStorage.removeItem("maison-jiya-cart-v2");
      }
      const params = new URLSearchParams(window.location.search);
      setUtm({ source: params.get("utm_source") || "", medium: params.get("utm_medium") || "", campaign: params.get("utm_campaign") || "" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (initialCatalog) {
      enableMetaPixel(initialCatalog.metaPixelId || "");
      track("ViewContent", { content_name: "Maison Jiya Boutique" });
      return;
    }

    void (async () => {
      try {
        const response = await fetch("/api/storefront/catalog");
        const body = await response.json() as StorefrontCatalog & { error?: string };
        if (!response.ok) throw new Error(body.error || "Catalogue indisponible.");
        setCatalog(body);
        enableMetaPixel(body.metaPixelId || "");
        track("ViewContent", { content_name: "Maison Jiya Boutique" });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Catalogue indisponible.");
      } finally {
        setLoading(false);
      }
    })();
  }, [initialCatalog]);

  useEffect(() => {
    try { localStorage.setItem("maison-jiya-cart-v2", JSON.stringify(cart)); } catch { /* stockage facultatif */ }
  }, [cart]);

  const items = useMemo(() => [...(catalog?.offers ?? []), ...(catalog?.products ?? [])], [catalog]);
  const filtered = useMemo(() => {
    const cleanQuery = normalize(query.trim());
    return items.filter((item) => {
      if (category !== "Tous" && item.category !== category) return false;
      if (!cleanQuery) return true;
      return normalize(`${item.name} ${item.productCode} ${item.category} ${item.description}`).includes(cleanQuery);
    });
  }, [category, items, query]);
  const visibleItems = filtered.slice(0, visibleCount);
  const featuredOffers = (catalog?.offers ?? []).slice(0, FEATURED_OFFERS);

  const cartLines = useMemo(() => Object.entries(cart).map(([key, quantity]) => {
    const item = items.find((candidate) => itemKey(candidate) === key);
    return item ? { key, item, quantity } : null;
  }).filter((line): line is { key: string; item: CatalogItem; quantity: number } => Boolean(line)), [cart, items]);
  const itemCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const total = cartLines.reduce((sum, line) => sum + line.item.salePrice * line.quantity, 0);

  function add(item: CatalogItem) {
    if (!item.available) return;
    const key = itemKey(item);
    setCart((current) => ({ ...current, [key]: Math.min(20, (current[key] || 0) + 1) }));
    setCartOpen(true);
    track("AddToCart", { content_ids: [item.productCode], content_name: item.name, content_type: item.kind, value: item.salePrice, currency: "MAD" });
  }

  function updateQuantity(key: string, quantity: number) {
    setCart((current) => {
      if (quantity <= 0) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: Math.min(20, quantity) };
    });
  }

  function beginCheckout() {
    if (!cartLines.length) return;
    setCartOpen(false);
    setCheckoutOpen(true);
    setSubmitError("");
    track("InitiateCheckout", { value: total, currency: "MAD", num_items: itemCount });
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cartLines.length || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/storefront/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName: form.get("customerName"),
          phone: form.get("phone"),
          city: form.get("city"),
          address: form.get("address"),
          note: form.get("note"),
          website: form.get("website"),
          utmSource: utm.source,
          utmMedium: utm.medium,
          utmCampaign: utm.campaign,
          items: cartLines.map((line) => ({ kind: line.item.kind, id: line.item.id, quantity: line.quantity })),
        }),
      });
      const body = await response.json() as { error?: string; orderRef?: string; total?: number };
      if (!response.ok) throw new Error(body.error || "Commande impossible.");
      const orderRef = body.orderRef || "";
      setConfirmation({ orderRef, total: Number(body.total ?? total) });
      setCart({});
      setCheckoutOpen(false);
      track("Lead", { value: Number(body.total ?? total), currency: "MAD", content_name: "Commande COD" });
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "Commande impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  const waDigits = (catalog?.contactWhatsapp || catalog?.whatsapp || "").replace(/\D/g, "").replace(/^0/, "212");
  const brand = catalog?.brand || "Maison Jiya";
  const waUrl = waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Bonjour ${brand}, j’ai une question concernant votre boutique.`)}` : "";

  return <main className="storefront-shell">
    <div className="storefront-announcement">{catalog?.announcement || "Paiement à la livraison partout au Maroc"}</div>
    <header className="storefront-header">
      <a className="storefront-brand" href="/boutique" aria-label={`${brand} boutique`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={catalog?.logoUrl || "/maison-jiya-logo.jpeg"} alt={brand} loading="eager" fetchPriority="high" />
        <span><strong>{brand}</strong><small>Boutique officielle</small></span>
      </a>
      <nav>
        <a href="#catalogue">Catalogue</a>
        {Boolean(catalog?.offers.length) && <a href="#offres">Offres</a>}
        <a href="#commande">Comment commander</a>
        <a href="#contact">Contact</a>
      </nav>
      <button className="storefront-cart-button" type="button" onClick={() => setCartOpen(true)}><span>Panier</span><b>{itemCount}</b></button>
    </header>

    <section className={`storefront-hero ${catalog?.heroImageUrl ? "has-image" : ""}`}>
      <div>
        <span className="storefront-eyebrow">{brand} · Maroc</span>
        <h1>{catalog?.heroTitle || "Les pièces que vous aimez, simplement livrées chez vous."}</h1>
        <p>{catalog?.heroText || "Choisissez vos articles, validez votre commande en ligne et payez à la livraison. Notre équipe vous contacte ensuite pour confirmer."}</p>
        <div className="storefront-hero-actions">
          <a href="#catalogue">Voir le catalogue</a>
          {waUrl && <a className="secondary" href={waUrl} target="_blank" rel="noreferrer">Nous écrire sur WhatsApp</a>}
        </div>
        <div className="storefront-trust"><span>Paiement à la livraison</span><span>Confirmation par notre équipe</span><span>Livraison au Maroc</span></div>
      </div>
      {catalog?.heroImageUrl
        ? <div className="storefront-hero-photo">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={catalog.heroImageUrl} alt={`Collection ${brand}`} loading="eager" fetchPriority="high" /></div>
        : <div className="storefront-hero-card" aria-hidden="true"><span>MJ</span><strong>{brand}</strong><small>Montres · Bijoux · Portefeuilles · Packs</small></div>}
    </section>

    {Boolean(featuredOffers.length) && <section className="storefront-featured-offers" id="offres">
      <div className="storefront-section-head"><div><span>Offres Maison Jiya</span><h2>Packs & bons plans</h2></div><strong>{catalog?.offers.length} offre(s)</strong></div>
      <div className="storefront-product-grid storefront-offer-grid">{featuredOffers.map((item, index) => <StoreItemCard key={`offer-${item.id}`} item={item} add={add} priority={index < 2} />)}</div>
    </section>}

    <section className="storefront-catalogue" id="catalogue">
      <div className="storefront-section-head"><div><span>Notre sélection</span><h2>Catalogue {brand}</h2></div><strong>{filtered.length} article{filtered.length === 1 ? "" : "s"}</strong></div>
      <div className="storefront-tools">
        <label><span>Rechercher</span><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(INITIAL_VISIBLE); }} placeholder="Montre, portefeuille, référence…" /></label>
        <label><span>Catégorie</span><select value={category} onChange={(event) => { setCategory(event.target.value); setVisibleCount(INITIAL_VISIBLE); }}><option value="Tous">Toutes les catégories</option>{catalog?.categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
      {loading && <div className="storefront-state">Chargement du catalogue…</div>}
      {error && <div className="storefront-state error">{error}</div>}
      {!loading && !error && <>
        <div className="storefront-product-grid">{visibleItems.map((item, index) => <StoreItemCard key={`${item.kind}-${item.id}`} item={item} add={add} priority={index < 4} />)}{!filtered.length && <div className="storefront-state">Aucun article ne correspond à votre recherche.</div>}</div>
        {visibleItems.length < filtered.length && <div className="storefront-load-more-wrap"><button className="storefront-load-more" type="button" onClick={() => setVisibleCount((current) => current + INITIAL_VISIBLE)}>Afficher plus de produits <span>{visibleItems.length}/{filtered.length}</span></button></div>}
      </>}
    </section>

    <section className="storefront-how" id="commande"><span>Simple et rapide</span><h2>Comment commander ?</h2><div><article><b>01</b><strong>Choisissez</strong><p>Ajoutez un ou plusieurs produits ou packs à votre panier.</p></article><article><b>02</b><strong>Commandez</strong><p>Indiquez votre nom, téléphone, ville et adresse.</p></article><article><b>03</b><strong>Confirmez</strong><p>{brand} vous contacte avant l’envoi de votre colis.</p></article></div></section>

    <section className="storefront-contact" id="contact">
      <div><span>Contact</span><h2>Une question avant de commander ?</h2><p>Écris directement à {brand} sur WhatsApp Business. Notre équipe peut t’aider pour un produit, une offre ou ta commande.</p></div>
      {waUrl ? <a href={waUrl} target="_blank" rel="noreferrer">Contacter sur WhatsApp</a> : <div className="storefront-contact-missing">Le contact WhatsApp sera disponible prochainement.</div>}
    </section>

    <footer className="storefront-footer"><div><strong>{brand}</strong><small>Boutique officielle · Maroc</small></div><p>Paiement à la livraison. Les commandes sont confirmées avant expédition.</p></footer>
    {waUrl && <a className="storefront-whatsapp-float" href={waUrl} target="_blank" rel="noreferrer" aria-label={`Contacter ${brand} sur WhatsApp`}>WhatsApp</a>}

    {cartOpen && <div className="storefront-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
      <aside className="storefront-drawer" role="dialog" aria-modal="true" aria-label="Panier">
        <header><div><span>Votre panier</span><strong>{itemCount} article{itemCount === 1 ? "" : "s"}</strong></div><button type="button" onClick={() => setCartOpen(false)} aria-label="Fermer">×</button></header>
        <div className="storefront-cart-lines">{cartLines.map(({ key, item, quantity }) => <article key={key}><div><strong>{item.name}</strong><small>{item.kind === "offer" ? "Pack" : item.productCode} · {money(item.salePrice)}</small></div><div className="storefront-qty"><button type="button" onClick={() => updateQuantity(key, quantity - 1)}>−</button><span>{quantity}</span><button type="button" onClick={() => updateQuantity(key, quantity + 1)}>+</button></div><strong>{money(item.salePrice * quantity)}</strong></article>)}{!cartLines.length && <div className="storefront-state">Votre panier est vide.</div>}</div>
        <footer><div><span>Total produits</span><strong>{money(total)}</strong></div><small>{catalog?.shippingNote || "Les éventuels frais de livraison sont confirmés par notre équipe."}</small><button type="button" disabled={!cartLines.length} onClick={beginCheckout}>Passer la commande</button></footer>
      </aside>
    </div>}

    {checkoutOpen && <div className="storefront-overlay">
      <section className="storefront-checkout" role="dialog" aria-modal="true" aria-label="Finaliser la commande">
        <header><div><span>Paiement à la livraison</span><h2>Finaliser ma commande</h2></div><button type="button" onClick={() => setCheckoutOpen(false)} aria-label="Fermer">×</button></header>
        <div className="storefront-checkout-summary"><span>{itemCount} article{itemCount === 1 ? "" : "s"}</span><strong>{money(total)}</strong></div>
        <form onSubmit={submitOrder}>
          <label><span>Nom complet *</span><input name="customerName" autoComplete="name" required minLength={2} maxLength={120} /></label>
          <label><span>Téléphone *</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="06XXXXXXXX" required /></label>
          <div className="storefront-form-row"><label><span>Ville *</span><input name="city" autoComplete="address-level2" required maxLength={100} /></label><label><span>Adresse *</span><input name="address" autoComplete="street-address" required minLength={5} maxLength={260} /></label></div>
          <label><span>Note (optionnel)</span><textarea name="note" rows={3} maxLength={240} placeholder="Couleur, précision sur l’adresse…" /></label>
          <label className="storefront-honeypot" aria-hidden="true"><span>Site</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
          {submitError && <p className="storefront-submit-error">{submitError}</p>}
          <button className="storefront-submit" type="submit" disabled={submitting}>{submitting ? "Enregistrement…" : `Commander · ${money(total)}`}</button>
          <small className="storefront-cod-note">Aucun paiement en ligne. Vous payez à la livraison après confirmation de votre commande.</small>
        </form>
      </section>
    </div>}

    {confirmation && <div className="storefront-overlay">
      <section className="storefront-success" role="dialog" aria-modal="true">
        <span>Commande reçue</span><h2>Merci pour votre commande.</h2><p>Notre équipe va vous contacter pour confirmer vos informations avant l’expédition.</p>
        <div><small>Référence</small><strong>{confirmation.orderRef || brand}</strong><small>Total produits</small><strong>{money(confirmation.total)}</strong></div>
        {waDigits && <a href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Bonjour ${brand}, je viens de passer la commande ${confirmation.orderRef}.`)}`} target="_blank" rel="noreferrer">Contacter {brand}</a>}
        <button type="button" onClick={() => setConfirmation(null)}>Continuer mes achats</button>
      </section>
    </div>}
  </main>;
}

function StoreItemCard({ item, add, priority = false }: { item: CatalogItem; add: (item: CatalogItem) => void; priority?: boolean }) {
  return <article className={`storefront-product ${item.kind === "offer" ? "storefront-offer" : ""} ${!item.available ? "unavailable" : ""}`}>
    <div className="storefront-product-visual">
      {item.images[0] ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={item.images[0]} alt={item.name} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} /></> : <><span>{item.category.slice(0, 1).toUpperCase()}</span><small>{item.category}</small></>}
      {item.badge && <em className="storefront-product-badge">{item.badge}</em>}
      {item.lowStock && !item.badge && <em>Dernières pièces</em>}
      {!item.available && <i>Rupture de stock</i>}
    </div>
    <div className="storefront-product-body"><span>{item.kind === "offer" ? "Pack Maison Jiya" : item.productCode}</span><h3>{item.name}</h3>{item.description && <p>{item.description}</p>}<div><strong>{money(item.salePrice)}</strong>{item.comparePrice > item.salePrice && <del>{money(item.comparePrice)}</del>}<small>Paiement à la livraison</small></div><button type="button" disabled={!item.available} onClick={() => add(item)}>{item.available ? "Ajouter au panier" : "Indisponible"}</button></div>
  </article>;
}
