import type { Metadata } from "next";
import LegalPage from "../legal-page";

export const metadata: Metadata = { title: "Livraison et paiement | Maison Jiya", description: "Informations sur l'expédition et le paiement à la livraison chez Maison Jiya." };

export default function LivraisonRetours() {
  return <LegalPage title="Livraison et paiement" introduction="Consultez les modalités essentielles avant de confirmer votre commande Maison Jiya.">
    <section><h2>Livraison au Maroc</h2>
      <p>Maison Jiya propose la livraison au Maroc, sous réserve de la desserte de l&apos;adresse indiquée et de la disponibilité des produits. Après l&apos;envoi du formulaire, notre équipe vous contacte pour confirmer les articles et l&apos;adresse.</p>
      <p><strong>Frais et délais :</strong> ils doivent être annoncés au client avant la confirmation définitive de sa commande. Une livraison gratuite ne s&apos;applique que lorsqu&apos;elle est expressément et réellement proposée pour la commande concernée. Aucun délai fixe n&apos;est garanti ici sans vérification auprès du transporteur.</p>
    </section>
    <section><h2>Paiement à la réception</h2>
      <p>Aucune saisie de carte bancaire ni aucun paiement en ligne ne sont nécessaires sur cette boutique. Le montant à régler est confirmé avec le client avant l&apos;expédition.</p>
    </section>
  </LegalPage>;
}
