"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Product = {
  id: number;
  productCode: string;
  name: string;
  category: string;
  salePrice: number;
  availability: string;
  lowStock: boolean;
};

type Catalog = {
  brand: string;
  announcement: string;
  whatsapp: string;
  products: Product[];
  categories: string[];
};

type Cart = Record<number, number>;
type FbqWindow = Window & { fbq?: (...args: unknown[]) => void };

const money = (value: number) => `${Number(value).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} DH`;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");

function track(event: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  (window as FbqWindow).fbq?.("track", event, data || {});
}

export default function StorefrontClient() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tous");
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmation, setConfirmation] = useState<{ orderRef: string; total: number } | null>(null);
  const [utm, setUtm] = useState({ source: "", medium: "", campaign: "" });

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("maison-jiya-cart-v1");
        if (saved) setCart(JSON.parse(saved) as Cart);
      } catch {
        localStorage.removeItem("maison-jiya-cart-v1");
      }

      const params = new URLSearchParams(window.location.search);
      setUtm({
        source: params.get("utm_source") || "",
        medium: params.get("utm_medium") || "",
        campaign: params.get("utm_campaign") || "",
      });
    }, 0);

    void (async () => {
      try {
        const response = await fetch("/api/storefront/catalog", { cache: "no-store" });
        const body = await response.json() as Catalog & { error?: string };
        if (!response.ok) throw new Error(body.error || "Catalogue indisponible.");
        setCatalog(body);
        track("ViewContent", { content_name: "Maison Jiya Boutique" });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Catalogue indisponible.");
      } finally {
        setLoading(false);
      }
    })();

    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    try { localStorage.setItem("maison-jiya-cart-v1", JSON.stringify(cart)); } catch { /* stockage facultatif */ }
  }, [cart]);

  const products = useMemo(() => catalog?.products ?? [], [catalog]);
  const filtered = useMemo(() => {
    const cleanQuery = normalize(query.trim());
    return products.filter((product) => {
      if (category !== "Tous" && product.category !== category) return false;
      if (!cleanQuery) return true;
      return normalize(`${product.name} ${product.productCode} ${product.category}`).includes(cleanQuery);
    });
  }, [category, products, query]);

  const cartLines = useMemo(() => Object.entries(cart).map(([id, quantity]) => {
    const product = products.find((item) => item.id === Number(id));
    return product ? { product, quantity } : null;
  }).filter((line): line is { product: Product; quantity: number } => Boolean(line)), [cart, products]);
  const itemCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const total = cartLines.reduce((sum, line) => sum + line.product.salePrice * line.quantity, 0);

  function add(product: Product) {
    setCart((current) => ({ ...current, [product.id]: Math.min(20, (current[product.id] || 0) + 1) }));
    setCartOpen(true);
    track("AddToCart", { content_ids: [product.productCode], content_name: product.name, value: product.salePrice, currency: "MAD" });
  }

  function updateQuantity(productId: number, quantity: number) {
    setCart((current) => {
      if (quantity <= 0) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      return { ...current, [productId]: Math.min(20, quantity) };
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
          items: cartLines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
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

  const waDigits = catalog?.whatsapp?.replace(/\D/g, "").replace(/^0/, "212") || "";

  return <main className="storefront-shell">
    <div className="storefront-announcement">{catalog?.announcement || "Paiement à la livraison partout au Maroc"}</div>
    <header className="storefront-header">
      <a className="storefront-brand" href="/boutique" aria-label="Maison Jiya boutique">
        <Image src="/maison-jiya-logo.jpeg" alt="Maison Jiya" width={48} height={48} priority />
        <span><strong>{catalog?.brand || "Maison Jiya"}</strong><small>Boutique officielle</small></span>
      </a>
      <nav><a href="#catalogue">Catalogue</a><a href="#commande">Comment commander</a></nav>
      <button className="storefront-cart-button" type="button" onClick={() => setCartOpen(true)}><span>Panier</span><b>{itemCount}</b></button>
    </header>

    <section className="storefront-hero">
      <div>
        <span className="storefront-eyebrow">Maison Jiya · Maroc</span>
        <h1>Les pièces que vous aimez, simplement livrées chez vous.</h1>
        <p>Choisissez vos articles, validez votre commande en ligne et payez à la livraison. Notre équipe vous contacte ensuite pour confirmer.</p>
        <div className="storefront-hero-actions"><a href="#catalogue">Voir le catalogue</a>{waDigits && <a className="secondary" href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer">Nous écrire sur WhatsApp</a>}</div>
        <div className="storefront-trust"><span>Paiement à la livraison</span><span>Confirmation par notre équipe</span><span>Livraison au Maroc</span></div>
      </div>
      <div className="storefront-hero-card" aria-hidden="true"><span>MJ</span><strong>Maison Jiya</strong><small>Montres · Bijoux · Wallets · Électronique</small></div>
    </section>

    <section className="storefront-catalogue" id="catalogue">
      <div className="storefront-section-head"><div><span>Notre sélection</span><h2>Catalogue Maison Jiya</h2></div><strong>{filtered.length} article{filtered.length === 1 ? "" : "s"}</strong></div>
      <div className="storefront-tools">
        <label><span>Rechercher</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Montre, wallet, référence…" /></label>
        <label><span>Catégorie</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="Tous">Toutes les catégories</option>{catalog?.categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>

      {loading && <div className="storefront-state">Chargement du catalogue…</div>}
      {error && <div className="storefront-state error">{error}</div>}
      {!loading && !error && <div className="storefront-product-grid">
        {filtered.map((product) => <article className="storefront-product" key={product.id}>
          <div className="storefront-product-visual"><span>{product.category.slice(0, 1).toUpperCase()}</span><small>{product.category}</small>{product.lowStock && <em>Dernières pièces</em>}</div>
          <div className="storefront-product-body"><span>{product.productCode}</span><h3>{product.name}</h3><div><strong>{money(product.salePrice)}</strong><small>Paiement à la livraison</small></div><button type="button" onClick={() => add(product)}>Ajouter au panier</button></div>
        </article>)}
        {!filtered.length && <div className="storefront-state">Aucun article ne correspond à votre recherche.</div>}
      </div>}
    </section>

    <section className="storefront-how" id="commande"><span>Simple et rapide</span><h2>Comment commander ?</h2><div><article><b>01</b><strong>Choisissez</strong><p>Ajoutez un ou plusieurs produits à votre panier.</p></article><article><b>02</b><strong>Commandez</strong><p>Indiquez votre nom, téléphone, ville et adresse.</p></article><article><b>03</b><strong>Confirmez</strong><p>Maison Jiya vous contacte avant l’envoi de votre colis.</p></article></div></section>

    <footer className="storefront-footer"><div><strong>Maison Jiya</strong><small>Boutique officielle · Maroc</small></div><p>Paiement à la livraison. Les commandes sont confirmées avant expédition.</p></footer>

    {cartOpen && <div className="storefront-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}><aside className="storefront-drawer" role="dialog" aria-modal="true" aria-label="Panier"><header><div><span>Votre panier</span><strong>{itemCount} article{itemCount === 1 ? "" : "s"}</strong></div><button type="button" onClick={() => setCartOpen(false)} aria-label="Fermer">×</button></header><div className="storefront-cart-lines">{cartLines.map(({ product, quantity }) => <article key={product.id}><div><strong>{product.name}</strong><small>{product.productCode} · {money(product.salePrice)}</small></div><div className="storefront-qty"><button type="button" onClick={() => updateQuantity(product.id, quantity - 1)}>−</button><span>{quantity}</span><button type="button" onClick={() => updateQuantity(product.id, quantity + 1)}>+</button></div><strong>{money(product.salePrice * quantity)}</strong></article>)}{!cartLines.length && <div className="storefront-state">Votre panier est vide.</div>}</div><footer><div><span>Total produits</span><strong>{money(total)}</strong></div><small>Les éventuels frais de livraison sont confirmés par notre équipe.</small><button type="button" disabled={!cartLines.length} onClick={beginCheckout}>Passer la commande</button></footer></aside></div>}

    {checkoutOpen && <div className="storefront-overlay"><section className="storefront-checkout" role="dialog" aria-modal="true" aria-label="Finaliser la commande"><header><div><span>Paiement à la livraison</span><h2>Finaliser ma commande</h2></div><button type="button" onClick={() => setCheckoutOpen(false)} aria-label="Fermer">×</button></header><div className="storefront-checkout-summary"><span>{itemCount} article{itemCount === 1 ? "" : "s"}</span><strong>{money(total)}</strong></div><form onSubmit={submitOrder}><label><span>Nom complet *</span><input name="customerName" autoComplete="name" required minLength={2} maxLength={120} /></label><label><span>Téléphone *</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="06XXXXXXXX" required /></label><div className="storefront-form-row"><label><span>Ville *</span><input name="city" autoComplete="address-level2" required maxLength={100} /></label><label><span>Adresse *</span><input name="address" autoComplete="street-address" required minLength={5} maxLength={260} /></label></div><label><span>Note (optionnel)</span><textarea name="note" rows={3} maxLength={240} placeholder="Couleur, précision sur l’adresse…" /></label><label className="storefront-honeypot" aria-hidden="true"><span>Site</span><input name="website" tabIndex={-1} autoComplete="off" /></label>{submitError && <p className="storefront-submit-error">{submitError}</p>}<button className="storefront-submit" type="submit" disabled={submitting}>{submitting ? "Enregistrement…" : `Commander · ${money(total)}`}</button><small className="storefront-cod-note">Aucun paiement en ligne. Vous payez à la livraison après confirmation de votre commande.</small></form></section></div>}

    {confirmation && <div className="storefront-overlay"><section className="storefront-success" role="dialog" aria-modal="true"><span>Commande reçue</span><h2>Merci pour votre commande.</h2><p>Notre équipe va vous contacter pour confirmer vos informations avant l’expédition.</p><div><small>Référence</small><strong>{confirmation.orderRef || "Maison Jiya"}</strong><small>Total produits</small><strong>{money(confirmation.total)}</strong></div>{waDigits && <a href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Bonjour Maison Jiya, je viens de passer la commande ${confirmation.orderRef}.`)}`} target="_blank" rel="noreferrer">Contacter Maison Jiya</a>}<button type="button" onClick={() => setConfirmation(null)}>Continuer mes achats</button></section></div>}
  </main>;
}
