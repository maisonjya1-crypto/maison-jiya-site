"use client";

import { useEffect } from "react";

export default function PrivateUiV3Enhancement() {
  useEffect(() => {
    const apply = () => {
      document.querySelectorAll("details.trash-actions").forEach((node) => {
        const details = node as unknown as HTMLDetailsElement;
        details.open = true;
        details.dataset.actionsVisible = "true";
      });

      document.querySelectorAll('select[name="availabilityMode"]').forEach((node) => {
        const select = node as unknown as HTMLSelectElement;
        const automatic = select.querySelector('option[value="auto"]') as HTMLOptionElement | null;
        const available = select.querySelector('option[value="available"]') as HTMLOptionElement | null;
        const unavailable = select.querySelector('option[value="out_of_stock"]') as HTMLOptionElement | null;
        if (automatic) automatic.textContent = "Disponible sur le site (indépendant du stock)";
        if (available) available.textContent = "Disponible sur le site (manuel)";
        if (unavailable) unavailable.textContent = "Afficher « Rupture » manuellement";
      });

      document.querySelectorAll(".storefront-cms-public-category-note").forEach((node) => {
        const note = node as unknown as HTMLElement;
        if (note.dataset.manualCatalogNote === "true") return;
        note.dataset.manualCatalogNote = "true";
        note.textContent = "Le stock interne sert uniquement de suggestion. Un produit n’apparaît sur la boutique que si tu coches « Afficher ce produit sur le site public ». La disponibilité publique n’est plus calculée selon la quantité en stock.";
      });
    };

    const timer = window.setTimeout(apply, 0);
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return null;
}
