import type { Metadata } from "next";
import "./storefront.css";
import "./storefront-cms-public.css";
import "./storefront-contact.css";
import "./storefront-fast.css";
import "./storefront-reliability.css";
import "./best-seller-vertical.css";
import "./storefront-responsive.css";
import "./storefront-v3.css";
import "./storefront-approved-design.css";
import "./storefront-reference-exact.css";
import "./storefront-reference-clean.css";
import "./storefront-final-hotfix.css";
import "./storefront-approved-cover.css";
import "./storefront-responsive-neutral.css";
import "./storefront-responsive-neutral-hotfix.css";
import "./storefront-mobile-hero-compact.css";
import "./storefront-mobile-hero-products.css";
import "./storefront-whatsapp-contact-hotfix.css";

export const metadata: Metadata = {
  title: "Maison Jiya — Boutique",
  description: "Montres, bijoux, portefeuilles et packs Maison Jiya. Commandez en ligne avec paiement à la livraison.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Maison Jiya — Boutique",
    description: "Découvrez la sélection Maison Jiya et commandez avec paiement à la livraison.",
    type: "website",
  },
};

export default function BoutiqueLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
