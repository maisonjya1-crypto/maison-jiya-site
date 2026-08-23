"use client";

import { useEffect } from "react";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setSelectValue(element: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function filterGender(gender: "homme" | "femme") {
  const select = document.querySelector(".storefront-v3-tools select") as HTMLSelectElement | null;
  let exactGenderCategory = false;

  if (select) {
    const entries = Array.from(select.options) as HTMLOptionElement[];
    const genderTerms = gender === "homme"
      ? ["homme", "men", "male", "رجال", "رجالي"]
      : ["femme", "women", "female", "نساء", "نسائي"];
    const watchTerms = ["montre", "watch", "ساعة", "ساعات"];

    const exact = entries.find((entry) => {
      const haystack = normalize(`${entry.value} ${entry.textContent || ""}`);
      return watchTerms.some((term) => haystack.includes(normalize(term)))
        && genderTerms.some((term) => haystack.includes(normalize(term)));
    });

    const generic = entries.find((entry) => {
      const haystack = normalize(`${entry.value} ${entry.textContent || ""}`);
      return watchTerms.some((term) => haystack.includes(normalize(term)));
    });

    const option = exact || generic;
    exactGenderCategory = Boolean(exact);
    if (option) setSelectValue(select, option.value);
  }

  const input = document.querySelector(".storefront-v3-tools input") as HTMLInputElement | null;
  if (input) setInputValue(input, exactGenderCategory ? "" : gender);

  window.setTimeout(() => {
    document.querySelector("#catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" });
    input?.focus({ preventScroll: true });
  }, 90);
}

export default function StorefrontCoverInteractions() {
  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let cleanupHotspots: (() => void) | undefined;

    const mount = () => {
      if (stopped) return;
      const hero = document.querySelector(".mj-native-hero") as HTMLElement | null;
      if (!hero) {
        timer = window.setTimeout(mount, 60);
        return;
      }
      if (hero.querySelector(".mj-cover-hotspot-men")) return;

      const makeHotspot = (className: string, label: string, gender: "homme" | "femme") => {
        const link = document.createElement("a");
        link.href = "#catalogue";
        link.className = `mj-cover-hotspot ${className}`;
        link.setAttribute("aria-label", label);
        link.textContent = label;
        link.addEventListener("click", (event) => {
          event.preventDefault();
          filterGender(gender);
        });
        hero.appendChild(link);
        return link;
      };

      const men = makeHotspot("mj-cover-hotspot-men", "Voir les montres homme", "homme");
      const women = makeHotspot("mj-cover-hotspot-women", "Voir les montres femme", "femme");
      cleanupHotspots = () => {
        men.remove();
        women.remove();
      };
    };

    mount();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      cleanupHotspots?.();
    };
  }, []);

  return null;
}
