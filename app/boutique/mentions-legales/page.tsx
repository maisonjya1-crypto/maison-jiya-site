import type { Metadata } from "next";
import LegalPage from "../legal-page";

export const metadata: Metadata = { title: "Mentions légales | Maison Jiya", description: "Informations sur l'éditeur et le fonctionnement de la boutique Maison Jiya." };

export default function MentionsLegales() {
  return <LegalPage title="Mentions légales" introduction="Informations d&apos;identification et contacts de la boutique Maison Jiya.">
    <section><h2>Éditeur de la boutique</h2>
      <p><strong>Nom commercial :</strong> Maison Jiya.</p>
      <p><strong>Activité :</strong> vente à distance de montres, bijoux, portefeuilles et packs, au Maroc.</p>
      <p><strong>Contact client :</strong> le WhatsApp indiqué dans la rubrique Contact de la boutique.</p>
      <p><strong>Identification professionnelle :</strong> la dénomination juridique de l&apos;exploitant, son adresse professionnelle et ses identifiants d&apos;immatriculation lorsqu&apos;ils sont applicables doivent être communiqués de façon complète par l&apos;exploitant. Ces mentions restent à compléter avant le lancement des campagnes publicitaires.</p>
    </section>
    <section><h2>Hébergement et fonctionnement</h2>
      <p>La boutique est diffusée par une infrastructure Cloudflare. Les commandes sont enregistrées afin d&apos;être confirmées par l&apos;équipe Maison Jiya et exécutées avec paiement à la livraison.</p>
    </section>
    <section><h2>Produits et marques</h2>
      <p>Les photographies, appellations, descriptions et promotions doivent représenter fidèlement les articles réellement proposés. Une marque tierce affichée sur un produit ne signifie pas que Maison Jiya est partenaire ou revendeur agréé de cette marque.</p>
    </section>
  </LegalPage>;
}
