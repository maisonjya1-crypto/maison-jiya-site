"use client";

import { useEffect } from "react";

export default function StorefrontWhatsappContactHotfix() {
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const wire = () => {
      if (disposed || cleanup) return;
      const link = document.querySelector<HTMLAnchorElement>(".storefront-v3-contact a[href*='wa.me'], .storefront-v3-contact a[href*='whatsapp']");
      if (!link) return;

      let lastOpen = 0;
      const openWhatsapp = (event: Event) => {
        const now = Date.now();
        if (now - lastOpen < 650) {
          event.preventDefault();
          return;
        }
        const href = link.href;
        if (!href) return;
        lastOpen = now;
        event.preventDefault();
        event.stopPropagation();
        window.location.assign(href);
      };

      link.dataset.whatsappContactReady = "true";
      link.addEventListener("pointerup", openWhatsapp, true);
      link.addEventListener("click", openWhatsapp, true);
      cleanup = () => {
        link.removeEventListener("pointerup", openWhatsapp, true);
        link.removeEventListener("click", openWhatsapp, true);
      };
    };

    wire();
    const observer = new MutationObserver(wire);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
      cleanup?.();
    };
  }, []);

  return null;
}
