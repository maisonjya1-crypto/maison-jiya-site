import type { Metadata } from "next";
import LegalPage from "../legal-page";

export const metadata: Metadata = { title: "Livraison et retours | Maison Jiya", description: "Informations sur l'expédition, le paiement à la livraison et les demandes de retour chez Maison Jiya." };

export default function LivraisonRetours() {
  return <LegalPage title="Livraison et retours" introduction="Consultez les modalités essentielles avant de confirmer votre commande Maison Jiya.">
    <section><h2>Livraison au Maroc</h2>
      <p>Maison Jiya propose la livraison au Maroc, sous réserve de la desserte de l&apos;adresse indiquée et de la disponibilité des produits. Après l&apos;envoi du formulaire, notre équipe vous contacte pour confirmer les articles et l&apos;adresse.</p>
      <p><strong>Frais et délais :</strong> ils doivent être annoncés au client avant la confirmation définitive de sa commande. Une livraison gratuite ne s&apos;applique que lorsqu&apos;elle est expressément et réellement proposée pour la commande concernée. Aucun délai fixe n&apos;est garanti ici sans vérification auprès du transporteur.</p>
    </section>
    <section><h2>Paiement à la réception</h2>
      <p>Aucune saisie de carte bancaire ni aucun paiement en ligne ne sont nécessaires sur cette boutique. Le montant à régler est confirmé avec le client avant l&apos;expédition.</p>
    </section>
    <section><h2>Retours, rétractation et article non conforme</h2>
      <p>Dans les conditions prévues par la loi marocaine n° 31-08 pour les contrats à distance, le consommateur peut bénéficier d&apos;un droit de rétractation de 7 jours, sous réserve des exceptions légales. Les droits en cas d&apos;article défectueux ou non conforme restent applicables.</p>
      <p>Pour signaler un problème ou demander un retour, contactez Maison Jiya depuis la boutique en précisant la référence de commande. Notre équipe vous indiquera la procédure et les modalités de prise en charge conformément à la loi applicable.</p>
    </section>
  </LegalPage>;
}
