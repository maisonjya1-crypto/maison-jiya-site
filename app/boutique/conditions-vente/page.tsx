import type { Metadata } from "next";
import LegalPage from "../legal-page";

export const metadata: Metadata = { title: "Conditions de vente | Maison Jiya", description: "Conditions de commande et de paiement de la boutique Maison Jiya." };

export default function ConditionsVente() {
  return <LegalPage title="Conditions de vente" introduction="Les conditions essentielles applicables aux commandes envoyées depuis la boutique Maison Jiya.">
    <section><h2>1. Produits et prix</h2>
      <p>La boutique présente des articles avec leurs caractéristiques et leur prix en dirhams marocains (DH). Les offres ne se cumulent pas lorsque cela est précisé. Les photographies doivent correspondre aux produits effectivement proposés. La disponibilité est vérifiée avant confirmation par notre équipe.</p>
    </section>
    <section><h2>2. Envoi et confirmation</h2>
      <p>L&apos;envoi du formulaire enregistre une demande de commande. Maison Jiya contacte ensuite le client pour confirmer la disponibilité, le prix total, les éventuels frais et le délai estimé de livraison. Le client peut demander des précisions avant de confirmer définitivement.</p>
    </section>
    <section><h2>3. Paiement et livraison</h2>
      <p>Le paiement est effectué à la livraison. La zone desservie, les frais et les délais applicables sont communiqués avant confirmation. Aucune carte bancaire n&apos;est recueillie par le site.</p>
    </section>
    <section><h2>4. Retours et réclamations</h2>
      <p>Les droits du consommateur prévus par la loi marocaine n° 31-08 s&apos;appliquent, notamment les droits liés à la vente à distance et à la conformité, selon les conditions et exceptions légales. Pour organiser un retour ou signaler un litige, contactez-nous avec la référence de commande. Voir <a href="/boutique/livraison-retours">Livraison et retours</a>.</p>
    </section>
    <section><h2>5. Données personnelles</h2>
      <p>Les renseignements fournis lors d&apos;une commande sont utilisés pour son traitement. Consultez notre <a href="/boutique/confidentialite">politique de confidentialité</a> pour connaître vos droits et les traitements réalisés.</p>
    </section>
  </LegalPage>;
}
