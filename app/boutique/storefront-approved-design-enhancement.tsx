"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CatalogItem, StorefrontCatalog } from "./storefront-types";

type Language = "fr" | "ar" | "en";
type SelectBridge = { options: ArrayLike<{ value: string }>; value: string; dispatchEvent: (event: Event) => boolean };

type UiCopy = {
  catalogue: string;
  offers: string;
  contact: string;
  search: string;
  categories: string;
  categoriesSub: string;
  watches: string;
  jewelry: string;
  wallets: string;
  packs: string;
  view: string;
  discover: string;
  freeDelivery: string;
  freeDeliverySub: string;
  cod: string;
  codSub: string;
  customerService: string;
  customerServiceSub: string;
  satisfaction: string;
  satisfactionSub: string;
};

const ui: Record<Language, UiCopy> = {
  fr: {
    catalogue: "Catalogue", offers: "Offres", contact: "Contact", search: "Rechercher un produit…",
    categories: "NOS CATÉGORIES", categoriesSub: "Découvrez nos collections soigneusement sélectionnées",
    watches: "MONTRES", jewelry: "BIJOUX", wallets: "PORTEFEUILLES", packs: "PACKS", view: "Voir →", discover: "Découvrir la collection",
    freeDelivery: "Livraison gratuite", freeDeliverySub: "Partout au Maroc", cod: "Paiement à la livraison", codSub: "Vous payez à la réception",
    customerService: "Service client", customerServiceSub: "À votre écoute 7j/7", satisfaction: "Satisfaction garantie", satisfactionSub: "Votre satisfaction d’abord",
  },
  ar: {
    catalogue: "الكتالوج", offers: "العروض", contact: "تواصل معنا", search: "ابحث عن منتج…",
    categories: "فئاتنا", categoriesSub: "اكتشف مجموعاتنا المختارة بعناية",
    watches: "الساعات", jewelry: "المجوهرات", wallets: "المحافظ", packs: "الباقات", view: "عرض ←", discover: "اكتشف المجموعة",
    freeDelivery: "توصيل مجاني", freeDeliverySub: "إلى جميع أنحاء المغرب", cod: "الدفع عند الاستلام", codSub: "تدفع عند الاستلام",
    customerService: "خدمة الزبناء", customerServiceSub: "في خدمتك 7 أيام", satisfaction: "رضاكم أولويتنا", satisfactionSub: "خدمة موثوقة قبل كل شيء",
  },
  en: {
    catalogue: "Catalog", offers: "Offers", contact: "Contact", search: "Search for a product…",
    categories: "OUR CATEGORIES", categoriesSub: "Discover our carefully selected collections",
    watches: "WATCHES", jewelry: "JEWELRY", wallets: "WALLETS", packs: "PACKS", view: "View →", discover: "Discover the collection",
    freeDelivery: "Free delivery", freeDeliverySub: "Across Morocco", cod: "Cash on delivery", codSub: "Pay when you receive it",
    customerService: "Customer service", customerServiceSub: "Here for you 7 days a week", satisfaction: "Satisfaction first", satisfactionSub: "Reliable service first",
  },
};

const referenceBrands = ["ROLEX", "OMEGA", "CARTIER", "ARMANI", "BOSS", "HERMÈS", "MICHAEL KORS", "FOSSIL", "LACOSTE"];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function firstMatching(items: CatalogItem[], terms: string[]) {
  return items.find((item) => terms.some((term) => normalize(item.category).includes(term) || normalize(item.name).includes(term)));
}

function ServiceIcon({ kind }: { kind: "delivery" | "payment" | "support" | "satisfaction" }) {
  if (kind === "delivery") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 8h16v13H3zM19 13h5l4 5v3h-9zM8 25a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm16 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>;
  if (kind === "payment") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 5h20v22H6zM6 11h20M10 21h7" /></svg>;
  if (kind === "support") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 17a10 10 0 0 1 20 0v7h-5v-8h5M6 16h5v8H6zM21 27h-7" /></svg>;
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 27 7v8c0 7-4.7 11.6-11 14-6.3-2.4-11-7-11-14V7zM11 16l3 3 7-7" /></svg>;
}

export default function StorefrontApprovedDesignEnhancement() {
  const [header, setHeader] = useState<HTMLElement | null>(null);
  const [hero, setHero] = useState<HTMLElement | null>(null);
  const [brandStrip, setBrandStrip] = useState<HTMLElement | null>(null);
  const [afterBrandHost, setAfterBrandHost] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<Language>("fr");
  const [catalog, setCatalog] = useState<StorefrontCatalog | null>(null);

  useEffect(() => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const nextHeader = document.querySelector<HTMLElement>(".storefront-v3-header");
      const nextHero = document.querySelector<HTMLElement>(".storefront-v3-hero");
      const nextBrandStrip = document.querySelector<HTMLElement>(".storefront-v3-brand-strip");
      if (nextHeader && nextHero && nextBrandStrip) {
        setHeader(nextHeader);
        setHero(nextHero);
        setBrandStrip(nextBrandStrip);
        let host = document.querySelector<HTMLElement>(".storefront-reference-after-brand");
        if (!host) {
          host = document.createElement("div");
          host.className = "storefront-reference-after-brand";
          nextBrandStrip.insertAdjacentElement("afterend", host);
        }
        setAfterBrandHost(host);
        window.clearInterval(timer);
      } else if (attempts >= 30) {
        window.clearInterval(timer);
      }
    }, 50);
    return () => {
      window.clearInterval(timer);
      document.querySelector(".storefront-reference-after-brand")?.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/storefront/catalog?reference=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (!cancelled && body) setCatalog(body as StorefrontCatalog); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const categoryCards = useMemo(() => {
    if (!catalog) return [];
    const products = catalog.products || [];
    const watches = firstMatching(products, ["montre", "watch"]);
    const jewelry = firstMatching(products, ["bijou", "jewel", "bracelet", "collier"]);
    const wallets = firstMatching(products, ["portefeuille", "wallet", "porte monnaie", "porte-monnaie"]);
    const pack = catalog.offers?.[0] || firstMatching(products, ["pack", "coffret"]);
    return [
      { key: "watches", label: ui[lang].watches, item: watches, category: watches?.category || "Montres", target: "catalogue" },
      { key: "jewelry", label: ui[lang].jewelry, item: jewelry, category: jewelry?.category || "Bijoux", target: "catalogue" },
      { key: "wallets", label: ui[lang].wallets, item: wallets, category: wallets?.category || "Portefeuilles", target: "catalogue" },
      { key: "packs", label: ui[lang].packs, item: pack, category: "", target: "offres" },
    ];
  }, [catalog, lang]);

  const heroImages = useMemo(() => {
    if (!catalog) return [];
    const products = catalog.products || [];
    const picks = [
      firstMatching(products, ["montre", "watch"]),
      firstMatching(products, ["bijou", "jewel", "bracelet"]),
      firstMatching(products, ["portefeuille", "wallet"]),
      catalog.offers?.[0],
    ].filter((item): item is CatalogItem => Boolean(item));
    const urls = picks.map((item) => item.images?.[0]).filter((url): url is string => Boolean(url));
    for (const item of products) {
      const url = item.images?.[0];
      if (url && !urls.includes(url)) urls.push(url);
      if (urls.length >= 4) break;
    }
    return urls.slice(0, 4);
  }, [catalog]);

  function switchLanguage(next: Language) {
    setLang(next);
    const wanted = next === "fr" ? "FR" : next === "ar" ? "ع" : "EN";
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".storefront-v3-language button"))
      .find((candidate) => candidate.textContent?.trim() === wanted);
    button?.click();
  }

  function focusSearch() {
    document.querySelector("#catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.querySelector<HTMLInputElement>(".storefront-v3-tools input")?.focus(), 350);
  }

  function openCart() {
    document.querySelector<HTMLButtonElement>(".storefront-v3-cart-button")?.click();
  }

  function goToCategory(category: string, target: string) {
    if (target === "offres") {
      document.querySelector("#offres")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const select = document.querySelector(".storefront-v3-tools select") as unknown as SelectBridge | null;
    if (select && category) {
      const option = Array.from(select.options).find((entry) => entry.value === category || normalize(entry.value) === normalize(category));
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    document.querySelector("#catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const t = ui[lang];

  return <>
    {header && createPortal(<div className="mj-native-header">
      <button className="mj-native-search" type="button" onClick={focusSearch} aria-label={t.search}>
        <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="14" cy="14" r="8" /><path d="m20 20 7 7" /></svg><span>{t.search}</span>
      </button>
      <a className="mj-native-logo" href="/boutique" aria-label="Maison Jiya">
        <strong>JIYA</strong><em>Maison Jiya</em><small>L’HEURE DE BRILLER</small>
      </a>
      <div className="mj-native-actions">
        <div className="mj-native-langs" aria-label="Language / اللغة">
          <button className={lang === "fr" ? "active" : ""} onClick={() => switchLanguage("fr")}>FR</button>
          <button className={lang === "ar" ? "active" : ""} onClick={() => switchLanguage("ar")}>ع</button>
          <button className={lang === "en" ? "active" : ""} onClick={() => switchLanguage("en")}>EN</button>
        </div>
        <a className="mj-native-account" href="#contact" aria-label={t.contact}>♙</a>
        <button className="mj-native-cart" type="button" onClick={openCart} aria-label="Panier">▢</button>
      </div>
      <nav className="mj-native-nav" aria-label="Navigation boutique">
        <a href="#catalogue">{t.catalogue}</a><a href="#offres">{t.offers}</a><a href="#contact">{t.contact}</a>
      </nav>
    </div>, header)}

    {hero && createPortal(<section className="mj-native-hero" aria-label="Maison Jiya">
      <div className="mj-native-hero-copy">
        <div className="mj-native-hero-brand"><strong>JIYA</strong><em>Maison Jiya</em></div>
        <p>L’HEURE DE BRILLER</p>
        <div className="mj-native-hero-categories"><span>{t.watches}</span><span>{t.jewelry}</span><span>{t.wallets}</span></div>
        <a href="#catalogue">{t.discover} <b>→</b></a>
      </div>
      <div className="mj-native-hero-products" aria-hidden="true">
        {heroImages.map((src, index) => <figure key={`${src}-${index}`}><img src={src} alt="" /></figure>)}
      </div>
      <span className="mj-native-arrow left" aria-hidden="true">‹</span><span className="mj-native-arrow right" aria-hidden="true">›</span>
    </section>, hero)}

    {brandStrip && createPortal(<div className="mj-native-brands" aria-label="Marques">
      {[...referenceBrands, ...referenceBrands].map((brand, index) => <span key={`${brand}-${index}`}>{brand}</span>)}
    </div>, brandStrip)}

    {afterBrandHost && createPortal(<>
      <section className="storefront-reference-services" aria-label="Services Maison Jiya">
        <article><ServiceIcon kind="delivery" /><div><strong>{t.freeDelivery}</strong><span>{t.freeDeliverySub}</span></div></article>
        <article><ServiceIcon kind="payment" /><div><strong>{t.cod}</strong><span>{t.codSub}</span></div></article>
        <article><ServiceIcon kind="support" /><div><strong>{t.customerService}</strong><span>{t.customerServiceSub}</span></div></article>
        <article><ServiceIcon kind="satisfaction" /><div><strong>{t.satisfaction}</strong><span>{t.satisfactionSub}</span></div></article>
      </section>
      <section className="storefront-reference-categories">
        <header><h2>{t.categories}</h2><p>{t.categoriesSub}</p></header>
        <div>{categoryCards.map((card) => <button key={card.key} type="button" onClick={() => goToCategory(card.category, card.target)}>
          <span className="storefront-reference-category-media">
            {card.item?.images?.[0] ? <img src={card.item.images[0]} alt="" loading="lazy" /> : <i>{card.label.slice(0, 1)}</i>}
            <em><b>{card.label}</b><small>{t.view}</small></em>
          </span>
        </button>)}</div>
      </section>
    </>, afterBrandHost)}
  </>;
}
