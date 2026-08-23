"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { StorefrontCatalog } from "./storefront-types";

type Language = "fr" | "ar" | "en";

const labels: Record<Language, { catalogue: string; offers: string; contact: string; search: string }> = {
  fr: { catalogue: "Catalogue", offers: "Offres", contact: "Contact", search: "Rechercher" },
  ar: { catalogue: "الكتالوج", offers: "العروض", contact: "تواصل معنا", search: "بحث" },
  en: { catalogue: "Catalog", offers: "Offers", contact: "Contact", search: "Search" },
};

function currentLanguage(): Language {
  const active = document.querySelector<HTMLButtonElement>(".storefront-v3-language button.active")?.textContent?.trim();
  if (active === "ع") return "ar";
  if (active === "EN") return "en";
  return "fr";
}

export default function StorefrontApprovedDesignEnhancement() {
  const [header, setHeader] = useState<HTMLElement | null>(null);
  const [hero, setHero] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<Language>("fr");
  const [catalog, setCatalog] = useState<StorefrontCatalog | null>(null);

  useEffect(() => {
    const apply = () => {
      const root = document.querySelector<HTMLElement>(".storefront-v3");
      const nextHeader = document.querySelector<HTMLElement>(".storefront-v3-header");
      const nextHero = document.querySelector<HTMLElement>(".storefront-v3-hero");
      if (root && !root.classList.contains("storefront-approved-design")) root.classList.add("storefront-approved-design");
      if (nextHeader) setHeader((current) => current === nextHeader ? current : nextHeader);
      if (nextHero) setHero((current) => current === nextHero ? current : nextHero);

      const nextLang = currentLanguage();
      setLang((current) => current === nextLang ? current : nextLang);
      const nav = document.querySelector<HTMLElement>(".storefront-v3-nav-links");
      if (!nav) return;

      const desired = [
        { href: "#catalogue", text: labels[nextLang].catalogue },
        { href: "#offres", text: labels[nextLang].offers },
        { href: "#contact", text: labels[nextLang].contact },
      ];
      const anchors = Array.from(nav.querySelectorAll<HTMLAnchorElement>("a"));
      while (anchors.length < desired.length) {
        const anchor = document.createElement("a");
        nav.appendChild(anchor);
        anchors.push(anchor);
      }
      anchors.forEach((anchor, index) => {
        const target = desired[index];
        if (!target) {
          anchor.remove();
          return;
        }
        if (anchor.getAttribute("href") !== target.href) anchor.setAttribute("href", target.href);
        if (anchor.textContent !== target.text) anchor.textContent = target.text;
        if (anchor.dataset.approvedNav !== "true") anchor.dataset.approvedNav = "true";
      });
    };

    const timer = window.setTimeout(apply, 0);
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/storefront/catalog?approved=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (!cancelled && body) setCatalog(body as StorefrontCatalog); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const collageImages = useMemo(() => {
    if (!catalog) return [] as Array<{ src: string; alt: string }>;
    const seen = new Set<string>();
    const result: Array<{ src: string; alt: string }> = [];
    for (const item of [...catalog.products, ...catalog.offers]) {
      const src = item.images?.[0];
      if (!src || seen.has(src)) continue;
      seen.add(src);
      result.push({ src, alt: item.name });
      if (result.length >= 4) break;
    }
    return result;
  }, [catalog]);

  function focusSearch() {
    const input = document.querySelector<HTMLInputElement>(".storefront-v3-tools input");
    document.querySelector("#catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => input?.focus(), 420);
  }

  const heroHasImage = Boolean(hero?.querySelector(".storefront-v3-hero-media img"));

  return <>
    {header && createPortal(
      <button className="storefront-approved-search" type="button" onClick={focusSearch} aria-label={labels[lang].search} title={labels[lang].search}>
        <span aria-hidden="true">⌕</span><small>{labels[lang].search}</small>
      </button>,
      header,
    )}
    {hero && !heroHasImage && collageImages.length > 0 && createPortal(
      <div className="storefront-approved-hero-collage" aria-hidden="true">
        {collageImages.map((image, index) => <div key={`${image.src}-${index}`} className={`storefront-approved-hero-shot shot-${index + 1}`}><img src={image.src} alt="" loading={index === 0 ? "eager" : "lazy"} /></div>)}
      </div>,
      hero,
    )}
  </>;
}
