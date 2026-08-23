"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CatalogItem, StorefrontCatalog } from "./storefront-types";

type Language = "fr" | "ar" | "en";

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
  currentOffers: string;
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
    watches: "MONTRES", jewelry: "BIJOUX", wallets: "PORTEFEUILLES", packs: "PACKS", view: "Voir →", currentOffers: "OFFRES DU MOMENT",
    freeDelivery: "Livraison gratuite", freeDeliverySub: "Partout au Maroc", cod: "Paiement à la livraison", codSub: "Vous payez à la réception",
    customerService: "Service client", customerServiceSub: "À votre écoute 7j/7", satisfaction: "Satisfaction garantie", satisfactionSub: "Votre satisfaction d’abord",
  },
  ar: {
    catalogue: "الكتالوج", offers: "العروض", contact: "تواصل معنا", search: "ابحث عن منتج…",
    categories: "فئاتنا", categoriesSub: "اكتشف مجموعاتنا المختارة بعناية",
    watches: "الساعات", jewelry: "المجوهرات", wallets: "المحافظ", packs: "الباقات", view: "عرض ←", currentOffers: "العروض الحالية",
    freeDelivery: "توصيل مجاني", freeDeliverySub: "إلى جميع أنحاء المغرب", cod: "الدفع عند الاستلام", codSub: "تدفع عند الاستلام",
    customerService: "خدمة الزبناء", customerServiceSub: "في خدمتك 7 أيام", satisfaction: "رضاكم أولويتنا", satisfactionSub: "خدمة موثوقة قبل كل شيء",
  },
  en: {
    catalogue: "Catalog", offers: "Offers", contact: "Contact", search: "Search for a product…",
    categories: "OUR CATEGORIES", categoriesSub: "Discover our carefully selected collections",
    watches: "WATCHES", jewelry: "JEWELRY", wallets: "WALLETS", packs: "PACKS", view: "View →", currentOffers: "CURRENT OFFERS",
    freeDelivery: "Free delivery", freeDeliverySub: "Across Morocco", cod: "Cash on delivery", codSub: "Pay when you receive it",
    customerService: "Customer service", customerServiceSub: "Here for you 7 days a week", satisfaction: "Satisfaction first", satisfactionSub: "Reliable service first",
  },
};

function currentLanguage(): Language {
  const active = document.querySelector<HTMLButtonElement>(".storefront-v3-language button.active")?.textContent?.trim();
  if (active === "ع") return "ar";
  if (active === "EN") return "en";
  return "fr";
}

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
  const [afterBrandHost, setAfterBrandHost] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<Language>("fr");
  const [catalog, setCatalog] = useState<StorefrontCatalog | null>(null);

  useEffect(() => {
    const apply = () => {
      const root = document.querySelector<HTMLElement>(".storefront-v3");
      const nextHeader = document.querySelector<HTMLElement>(".storefront-v3-header");
      const nextHero = document.querySelector<HTMLElement>(".storefront-v3-hero");
      const brandStrip = document.querySelector<HTMLElement>(".storefront-v3-brand-strip");
      if (root) {
        root.classList.add("storefront-approved-design", "storefront-reference-exact");
      }
      if (nextHeader) setHeader((current) => current === nextHeader ? current : nextHeader);
      if (nextHero) setHero((current) => current === nextHero ? current : nextHero);

      if (brandStrip && !document.querySelector(".storefront-reference-after-brand")) {
        const host = document.createElement("div");
        host.className = "storefront-reference-after-brand";
        brandStrip.insertAdjacentElement("afterend", host);
        setAfterBrandHost(host);
      } else {
        const host = document.querySelector<HTMLElement>(".storefront-reference-after-brand");
        if (host) setAfterBrandHost((current) => current === host ? current : host);
      }

      const nextLang = currentLanguage();
      setLang((current) => current === nextLang ? current : nextLang);
      const nav = document.querySelector<HTMLElement>(".storefront-v3-nav-links");
      if (nav) {
        const desired = [
          { href: "#catalogue", text: ui[nextLang].catalogue },
          { href: "#offres", text: ui[nextLang].offers },
          { href: "#contact", text: ui[nextLang].contact },
        ];
        const anchors = Array.from(nav.querySelectorAll<HTMLAnchorElement>("a"));
        while (anchors.length < desired.length) {
          const anchor = document.createElement("a");
          nav.appendChild(anchor);
          anchors.push(anchor);
        }
        anchors.forEach((anchor, index) => {
          const target = desired[index];
          if (!target) return anchor.remove();
          anchor.setAttribute("href", target.href);
          anchor.textContent = target.text;
          anchor.dataset.approvedNav = "true";
        });
      }

      const offersHeading = document.querySelector<HTMLElement>("#offres .storefront-v3-section-head h2");
      if (offersHeading) offersHeading.textContent = ui[nextLang].currentOffers;
    };

    const timer = window.setTimeout(apply, 0);
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
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

  function focusSearch() {
    const input = document.querySelector<HTMLInputElement>(".storefront-v3-tools input");
    document.querySelector("#catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => input?.focus(), 420);
  }

  function goToCategory(category: string, target: string) {
    if (target === "offres") {
      document.querySelector("#offres")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const select = document.querySelector<HTMLSelectElement>(".storefront-v3-tools select");
    if (select && category) {
      const option = Array.from(select.options).find((entry) => entry.value === category || normalize(entry.value) === normalize(category));
      if (option) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter?.call(select, option.value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    document.querySelector("#catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goContact() {
    document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return <>
    {header && createPortal(<>
      <button className="storefront-approved-search" type="button" onClick={focusSearch} aria-label={ui[lang].search} title={ui[lang].search}>
        <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="14" cy="14" r="8" /><path d="m20 20 7 7" /></svg><small>{ui[lang].search}</small>
      </button>
      <button className="storefront-reference-account" type="button" onClick={goContact} aria-label={ui[lang].contact} title={ui[lang].contact}>
        <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="10" r="5" /><path d="M7 28c0-6 3.5-10 9-10s9 4 9 10" /></svg>
      </button>
    </>, header)}

    {hero && createPortal(<>
      <a className="storefront-reference-hero-hit" href="#catalogue" aria-label={ui[lang].catalogue}>{ui[lang].catalogue}</a>
      <span className="storefront-reference-arrow left" aria-hidden="true">‹</span>
      <span className="storefront-reference-arrow right" aria-hidden="true">›</span>
    </>, hero)}

    {afterBrandHost && createPortal(<>
      <section className="storefront-reference-services" aria-label="Services Maison Jiya">
        <article><ServiceIcon kind="delivery" /><div><strong>{ui[lang].freeDelivery}</strong><span>{ui[lang].freeDeliverySub}</span></div></article>
        <article><ServiceIcon kind="payment" /><div><strong>{ui[lang].cod}</strong><span>{ui[lang].codSub}</span></div></article>
        <article><ServiceIcon kind="support" /><div><strong>{ui[lang].customerService}</strong><span>{ui[lang].customerServiceSub}</span></div></article>
        <article><ServiceIcon kind="satisfaction" /><div><strong>{ui[lang].satisfaction}</strong><span>{ui[lang].satisfactionSub}</span></div></article>
      </section>

      <section className="storefront-reference-categories">
        <header><h2>{ui[lang].categories}</h2><p>{ui[lang].categoriesSub}</p></header>
        <div>
          {categoryCards.map((card) => <button key={card.key} type="button" onClick={() => goToCategory(card.category, card.target)}>
            <span className="storefront-reference-category-media">
              {card.item?.images?.[0] ? <img src={card.item.images[0]} alt="" loading="lazy" /> : <i>{card.label.slice(0, 1)}</i>}
              <em><b>{card.label}</b><small>{ui[lang].view}</small></em>
            </span>
          </button>)}
        </div>
      </section>
    </>, afterBrandHost)}
  </>;
}
