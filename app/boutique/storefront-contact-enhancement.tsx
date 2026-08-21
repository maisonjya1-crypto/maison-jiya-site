"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ContactCatalog = {
  brand?: string;
  whatsapp?: string;
  contactWhatsapp?: string;
};

export default function StorefrontContactEnhancement() {
  const [navHost, setNavHost] = useState<Element | null>(null);
  const [contactHost, setContactHost] = useState<Element | null>(null);
  const [brand, setBrand] = useState("Maison Jiya");
  const [phone, setPhone] = useState("");

  const loadContact = useCallback(async () => {
    try {
      const response = await fetch("/api/storefront/catalog", { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as ContactCatalog;
      setBrand(body.brand?.trim() || "Maison Jiya");
      setPhone((body.contactWhatsapp || body.whatsapp || "").trim());
    } catch {
      // Le catalogue principal affiche déjà son propre état d’erreur.
    }
  }, []);

  useEffect(() => {
    const locate = () => {
      setNavHost(document.querySelector(".storefront-header nav"));
      let host = document.querySelector("[data-storefront-contact-host]");
      if (!host) {
        const footer = document.querySelector(".storefront-footer");
        if (footer?.parentElement) {
          host = document.createElement("div");
          host.setAttribute("data-storefront-contact-host", "true");
          footer.parentElement.insertBefore(host, footer);
        }
      }
      setContactHost(host);

      const heroCategories = document.querySelector<HTMLElement>(".storefront-hero-card small");
      if (heroCategories) heroCategories.textContent = "Montres · Bijoux · Portefeuilles · Packs";
      const searchInput = document.querySelector<HTMLInputElement>(".storefront-tools input");
      if (searchInput) searchInput.placeholder = "Montre, portefeuille, référence…";
    };

    const timer = window.setTimeout(locate, 0);
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      const host = document.querySelector("[data-storefront-contact-host]");
      host?.remove();
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContact(), 0);
    return () => window.clearTimeout(timer);
  }, [loadContact]);

  const waDigits = phone.replace(/\D/g, "").replace(/^0/, "212");
  const waUrl = waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Bonjour ${brand}, j’ai une question concernant votre boutique.`)}` : "";

  return <>
    {navHost && createPortal(<a href="#contact">Contact</a>, navHost)}
    {contactHost && createPortal(
      <section className="storefront-contact" id="contact">
        <div>
          <span>Contact</span>
          <h2>Une question avant de commander ?</h2>
          <p>Écris directement à {brand} sur WhatsApp Business. Notre équipe peut t’aider pour un produit, une offre ou ta commande.</p>
        </div>
        {waUrl ? <a href={waUrl} target="_blank" rel="noreferrer">Contacter sur WhatsApp</a> : <div className="storefront-contact-missing">Le contact WhatsApp sera disponible prochainement.</div>}
      </section>,
      contactHost,
    )}
    {waUrl && <a className="storefront-whatsapp-float" href={waUrl} target="_blank" rel="noreferrer" aria-label="Contacter Maison Jiya sur WhatsApp">WhatsApp</a>}
  </>;
}
