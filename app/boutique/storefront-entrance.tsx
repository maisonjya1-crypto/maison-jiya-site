"use client";

import { useEffect, useState } from "react";

const SESSION_KEY = "maison-jiya-storefront-intro-v1";

export default function StorefrontEntrance() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === "1") {
        setVisible(false);
        return;
      }
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // L'animation reste fonctionnelle même si le stockage navigateur est indisponible.
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.classList.add("mj-entry-lock");

    if (reducedMotion) {
      const reducedTimer = window.setTimeout(() => setVisible(false), 120);
      return () => {
        window.clearTimeout(reducedTimer);
        document.documentElement.classList.remove("mj-entry-lock");
      };
    }

    const leaveTimer = window.setTimeout(() => setLeaving(true), 1650);
    const hideTimer = window.setTimeout(() => setVisible(false), 2250);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
      document.documentElement.classList.remove("mj-entry-lock");
    };
  }, []);

  if (!visible) return null;

  function skip() {
    setLeaving(true);
    window.setTimeout(() => setVisible(false), 360);
  }

  return (
    <div className={`mj-entry-screen${leaving ? " is-leaving" : ""}`} aria-label="Introduction Maison Jiya">
      <div className="mj-entry-glow" aria-hidden="true" />
      <div className="mj-entry-ring mj-entry-ring-one" aria-hidden="true" />
      <div className="mj-entry-ring mj-entry-ring-two" aria-hidden="true" />
      <div className="mj-entry-content">
        <span className="mj-entry-kicker">Boutique officielle</span>
        <div className="mj-entry-brand" aria-label="Maison Jiya">
          <strong>MAISON</strong>
          <em>Jiya</em>
        </div>
        <span className="mj-entry-line" aria-hidden="true" />
        <p>Élégance · Détails · Signature</p>
      </div>
      <button type="button" className="mj-entry-skip" onClick={skip}>Passer</button>
    </div>
  );
}
