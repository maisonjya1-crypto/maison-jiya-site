"use client";

import { useEffect } from "react";

export default function PrivateUiV3Enhancement() {
  useEffect(() => {
    const apply = () => {
      document.querySelectorAll<HTMLDetailsElement>("details.trash-actions").forEach((details) => {
        details.open = true;
        details.dataset.actionsVisible = "true";
      });

      document.querySelectorAll<HTMLSelectElement>('select[name="availabilityMode"]').forEach((select) => {
        const automatic = select.querySelector<HTMLOptionElement>('option[value="auto"]');
        const available = select.querySelector<HTMLOptionElement>('option[value="available"]');
        const unavailable = select.querySelector<HTMLOptionElement>('option[value="out_of_stock"]');
        if (automatic) automatic.textContent = "Disponible sur le site (indépendant du stock)";
        if (available) available.textContent = "Disponible sur le site (manuel)";
        if (unavailable) unavailable.textContent = "Afficher « Rupture » manuellement";
      });

      document.querySelectorAll<HTMLElement>(".storefront-cms-public-category-note").forEach((note) => {
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
