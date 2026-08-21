"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CatalogItem, StorefrontCatalog } from "./storefront-types";

type ImageState = { src: string; attempt: number; failed: boolean };

const money = (value: number) => `${Number(value).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} DH`;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
const isBestSeller = (badge: string) => normalize(badge || "").replace(/[^a-z0-9]/g, "").includes("bestseller");

function SafeImage({ src, alt, fallback }: { src: string; alt: string; fallback: ReactNode }) {
  const [storedState, setStoredState] = useState<ImageState>({ src: "", attempt: 0, failed: false });
  const state = storedState.src === src ? storedState : { src, attempt: 0, failed: false };
  if (!src || state.failed) return <>{fallback}</>;
  const separator = src.includes("?") ? "&" : "?";
  const resolvedSrc = state.attempt ? `${src}${separator}retry=${state.attempt}` : src;
  return <img
    src={resolvedSrc}
    alt={alt}
    loading="lazy"
    decoding="async"
    onError={() => {
      if (state.attempt < 1) setStoredState({ src, attempt: 1, failed: false });
      else setStoredState({ src, attempt: state.attempt, failed: true });
    }}
  />;
}

function focusProduct(item: CatalogItem) {
  const catalogue = document.querySelector<HTMLElement>("#catalogue");
  const input = document.querySelector<HTMLInputElement>(".storefront-tools input");
  if (input) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, item.productCode || item.name);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  catalogue?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function BestSellerVerticalEnhancement({ initialCatalog }: { initialCatalog: StorefrontCatalog | null }) {
  const [catalog, setCatalog] = useState<StorefrontCatalog | null>(initialCatalog);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/storefront/catalog?best=${Date.now()}`, {
        cache: "no-store",
        headers: { "cache-control": "no-cache" },
      });
      if (!response.ok) return;
      setCatalog(await response.json() as StorefrontCatalog);
    } catch {
      // Le catalogue principal reste la source de secours.
    }
  }, []);

  useEffect(() => {
    const locate = () => {
      const hero = document.querySelector<HTMLElement>(".storefront-hero");
      if (!hero) return;
      let mount = document.querySelector<HTMLElement>("[data-best-seller-vertical-host]");
      if (!mount) {
        mount = document.createElement("div");
        mount.dataset.bestSellerVerticalHost = "true";
        hero.insertAdjacentElement("afterend", mount);
      }
      setHost(mount);
    };
    const timer = window.setTimeout(locate, 0);
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 400);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const items = useMemo(
    () => (catalog?.products || []).filter((item) => isBestSeller(item.badge)),
    [catalog],
  );
  const safeActive = items.length ? active % items.length : 0;

  useEffect(() => {
    if (items.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % items.length), 3800);
    return () => window.clearInterval(timer);
  }, [items.length]);

  if (!host || !items.length) return null;

  const previous = () => setActive((current) => (current - 1 + items.length) % items.length);
  const next = () => setActive((current) => (current + 1) % items.length);

  return createPortal(
    <section className="storefront-best-sellers" id="best-sellers" aria-label="Best sellers Maison Jiya">
      <div className="storefront-best-sellers-copy">
        <span>Les favoris du moment</span>
        <h2>Best sellers</h2>
        <p>Une sélection des modèles Maison Jiya les plus mis en avant.</p>
        <div className="storefront-best-sellers-controls">
          <button type="button" onClick={previous} disabled={items.length < 2} aria-label="Best seller précédent">↑</button>
          <strong>{String(safeActive + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</strong>
          <button type="button" onClick={next} disabled={items.length < 2} aria-label="Best seller suivant">↓</button>
        </div>
      </div>

      <div className="storefront-best-sellers-viewport">
        <div className="storefront-best-sellers-track" style={{ transform: `translateY(-${safeActive * 100}%)` }}>
          {items.map((item) => {
            const fallback = <div className="storefront-best-seller-fallback"><b>{item.category.slice(0, 1).toUpperCase()}</b><small>{item.category}</small></div>;
            return <article className={`storefront-best-seller-card ${!item.available ? "unavailable" : ""}`} key={item.id}>
              <div className="storefront-best-seller-media">
                {item.images[0] ? <SafeImage src={item.images[0]} alt={item.name} fallback={fallback} /> : fallback}
                <em>Best seller</em>
                {!item.available && <i>Rupture de stock</i>}
              </div>
              <div className="storefront-best-seller-info">
                <span>{item.productCode} · {item.category}</span>
                <h3>{item.name}</h3>
                {item.description && <p>{item.description}</p>}
                <div><strong>{money(item.salePrice)}</strong><small>Paiement à la livraison</small></div>
                <button type="button" onClick={() => focusProduct(item)}>Voir ce produit</button>
              </div>
            </article>;
          })}
        </div>
      </div>
    </section>,
    host,
  );
}
