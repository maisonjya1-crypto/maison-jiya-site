import type { Metadata } from "next";
import "./storefront.css";
import "./storefront-cms-public.css";

export const metadata: Metadata = {
  title: "Maison Jiya — Boutique",
  description: "Montres, bijoux, wallets, électronique et packs Maison Jiya. Commandez en ligne avec paiement à la livraison.",
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
