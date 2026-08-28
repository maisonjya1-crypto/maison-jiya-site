"use client";

import { useEffect } from "react";

const DESKTOP_MEN = "/storefront/brand/hero-men.svg";
const DESKTOP_WOMEN = "/storefront/brand/hero-women.svg";
const MOBILE_MEN = "/storefront/brand/hero-men-mobile.svg";
const MOBILE_WOMEN = "/storefront/brand/hero-women-mobile.svg";

export default function StorefrontMobileHeroProducts() {
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px) and (orientation: portrait)");

    const apply = () => {
      const men = document.querySelector<HTMLImageElement>(".mj-hero-men .mj-hero-composition");
      const women = document.querySelector<HTMLImageElement>(".mj-hero-women .mj-hero-composition");
      const mobile = media.matches;

      if (men) {
        const next = mobile ? MOBILE_MEN : DESKTOP_MEN;
        if (!men.src.endsWith(next)) men.src = next;
        men.dataset.mobileHeroProduct = mobile ? "true" : "false";
      }
      if (women) {
        const next = mobile ? MOBILE_WOMEN : DESKTOP_WOMEN;
        if (!women.src.endsWith(next)) women.src = next;
        women.dataset.mobileHeroProduct = mobile ? "true" : "false";
      }
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    media.addEventListener("change", apply);
    window.addEventListener("orientationchange", apply);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  return null;
}
