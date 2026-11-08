import type { Metadata } from "next";
import LegalPage from "../legal-page";
import TrackForm from "./track-form";

export const metadata: Metadata = {
  title: "Suivre ma commande",
  description: "Suivez l’avancement de votre commande Maison Jiya avec sa référence et votre numéro de téléphone.",
  robots: { index: false, follow: true },
};

export default function SuiviCommande() {
  return <LegalPage title="Suivre ma commande" introduction="Entrez la référence reçue après votre commande et le numéro de téléphone utilisé.">
    <TrackForm />
  </LegalPage>;
}
