"use client";

import { useEffect } from "react";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
const isBestSeller = (value: string) => normalize(value || "").replace(/[^a-z0-9]/g, "").includes("bestseller");

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function BestSellerCmsEnhancement() {
  useEffect(() => {
    const decorate = () => {
      document.querySelectorAll<HTMLFormElement>(".storefront-cms-product form").forEach((form) => {
        const badgeInput = form.querySelector<HTMLInputElement>('input[name="badge"]');
        if (!badgeInput || badgeInput.dataset.bestSellerReady === "true") return;
        badgeInput.dataset.bestSellerReady = "true";

        const row = document.createElement("div");
        row.className = "storefront-best-seller-cms-row";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "storefront-best-seller-cms-toggle";
        const note = document.createElement("small");
        note.textContent = "Les produits sélectionnés ici apparaissent automatiquement dans le carrousel vertical Best sellers du site public.";

        const sync = () => {
          const active = isBestSeller(badgeInput.value);
          button.classList.toggle("active", active);
          button.textContent = active ? "★ Best seller sélectionné" : "☆ Ajouter aux Best sellers";
          button.setAttribute("aria-pressed", active ? "true" : "false");
        };

        button.addEventListener("click", () => {
          const active = isBestSeller(badgeInput.value);
          setNativeValue(badgeInput, active ? "" : "Best seller");
          sync();
        });
        badgeInput.addEventListener("input", sync);
        badgeInput.addEventListener("change", sync);
        sync();
        row.appendChild(button);
        row.appendChild(note);
        badgeInput.closest("label")?.insertAdjacentElement("afterend", row);
      });
    };

    const timer = window.setTimeout(decorate, 0);
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return null;
}
