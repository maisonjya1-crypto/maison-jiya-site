"use client";

import { useEffect } from "react";

function contactPlaceholder() {
  const active = document.querySelector<HTMLButtonElement>(
    ".mj-native-langs button.active, .storefront-v3-language button.active",
  );
  const value = active?.textContent?.trim().toLowerCase() || "fr";
  if (value === "ع" || value === "ar") return "اكتب رسالتك هنا…";
  if (value === "en") return "Write your message here…";
  return "Écrivez votre message ici…";
}

export default function StorefrontWhatsappContactHotfix() {
  useEffect(() => {
    let disposed = false;
    let activeLink: HTMLAnchorElement | null = null;
    let activeTextarea: HTMLTextAreaElement | null = null;
    let lastOpen = 0;

    const unwire = () => {
      if (activeLink) {
        activeLink.removeEventListener("pointerup", openWhatsapp, true);
        activeLink.removeEventListener("click", openWhatsapp, true);
      }
      activeLink = null;
      activeTextarea = null;
    };

    const destinationFor = (link: HTMLAnchorElement, textarea: HTMLTextAreaElement | null) => {
      const message = textarea?.value.trim() || "";
      if (!message) return link.href;
      try {
        const target = new URL(link.href, window.location.href);
        target.searchParams.set("text", message);
        return target.toString();
      } catch {
        return link.href;
      }
    };

    function openWhatsapp(event: Event) {
      if (!activeLink) return;
      const now = Date.now();
      if (now - lastOpen < 650) {
        event.preventDefault();
        return;
      }
      const href = destinationFor(activeLink, activeTextarea);
      if (!href) return;
      lastOpen = now;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(href);
    }

    const ensureTextarea = (section: HTMLElement) => {
      let textarea = section.querySelector<HTMLTextAreaElement>("textarea[data-whatsapp-message-input='true']");
      if (!textarea) {
        textarea = document.createElement("textarea");
        textarea.dataset.whatsappMessageInput = "true";
        textarea.className = "storefront-whatsapp-message-input";
        textarea.rows = 3;
        textarea.maxLength = 500;
        textarea.autocomplete = "off";
        textarea.spellcheck = true;
        textarea.setAttribute("aria-label", "Message WhatsApp");
        textarea.placeholder = contactPlaceholder();
        const copy = section.querySelector<HTMLElement>(":scope > div") || section;
        copy.appendChild(textarea);
      } else {
        textarea.placeholder = contactPlaceholder();
      }
      return textarea;
    };

    const wire = () => {
      if (disposed) return;
      const section = document.querySelector<HTMLElement>(".storefront-v3-contact");
      const link = section?.querySelector<HTMLAnchorElement>("a[href*='wa.me'], a[href*='whatsapp']") || null;
      if (!section || !link) return;

      const textarea = ensureTextarea(section);
      if (activeLink === link && activeTextarea === textarea) return;

      unwire();
      activeLink = link;
      activeTextarea = textarea;
      link.dataset.whatsappContactReady = "true";
      link.addEventListener("pointerup", openWhatsapp, true);
      link.addEventListener("click", openWhatsapp, true);
    };

    wire();
    const observer = new MutationObserver(wire);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "href"] });

    return () => {
      disposed = true;
      observer.disconnect();
      unwire();
    };
  }, []);

  return null;
}
