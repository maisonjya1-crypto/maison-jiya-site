"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

export default function BestSellerHorizontalEnhancement({ initialCatalog }: { initialCatalog: StorefrontCatalog | null }) {
  const [catalog, setCatalog] = useState<StorefrontCatalog | null>(initialCatalog);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

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

  function scroll(direction: -1 | 1) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({
      left: direction * Math.max(280, viewport.clientWidth * 0.82),
      behavior: "smooth",
    });
  }

  if (!host || !items.length) return null;

  return createPortal(
    <section className="storefront-best-sellers" id="best-sellers" aria-label="Best sellers Maison Jiya">
      <div className="storefront-best-sellers-copy">
        <div>
          <span>Les favoris du moment</span>
          <h2>Best sellers</h2>
          <p>Fais glisser horizontalement pour découvrir les modèles Maison Jiya sélectionnés.</p>
        </div>
        <div className="storefront-best-sellers-controls">
          <button type="button" onClick={() => scroll(-1)} disabled={items.length < 2} aria-label="Best sellers précédents">←</button>
          <strong>{items.length} sélection{items.length === 1 ? "" : "s"}</strong>
          <button type="button" onClick={() => scroll(1)} disabled={items.length < 2} aria-label="Best sellers suivants">→</button>
        </div>
      </div>

      <div className="storefront-best-sellers-viewport" ref={viewportRef}>
        <div className="storefront-best-sellers-track">
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
