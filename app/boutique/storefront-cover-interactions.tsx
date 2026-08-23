"use client";

import { useEffect } from "react";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function setNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLInputElement ? "input" : "change", { bubbles: true }));
  if (element instanceof HTMLInputElement) element.dispatchEvent(new Event("change", { bubbles: true }));
}

function filterGender(gender: "homme" | "femme") {
  const select = document.querySelector<HTMLSelectElement>(".storefront-v3-tools select");
  let exactGenderCategory = false;
  if (select) {
    const entries = Array.from(select.options);
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
    if (option) setNativeValue(select, option.value);
  }

  const input = document.querySelector<HTMLInputElement>(".storefront-v3-tools input");
  if (input) setNativeValue(input, exactGenderCategory ? "" : gender);

  window.setTimeout(() => {
    document.querySelector("#catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" });
    input?.focus({ preventScroll: true });
  }, 90);
}

export default function StorefrontCoverInteractions() {
  useEffect(() => {
    let stopped = false;
    let timer = 0;

    const mount = () => {
      if (stopped) return;
      const hero = document.querySelector<HTMLElement>(".mj-native-hero");
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

      return () => {
        men.remove();
        women.remove();
      };
    };

    const cleanup = mount();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      cleanup?.();
    };
  }, []);

  return null;
}
