import type { Metadata } from "next";
import LegalPage from "../legal-page";

export const metadata: Metadata = { title: "Politique de confidentialité | Maison Jiya", description: "Comment Maison Jiya utilise les informations de commande et les cookies publicitaires." };

export default function Confidentialite() {
  return <LegalPage title="Politique de confidentialité" introduction="Nous expliquons quelles données sont utilisées lorsqu&apos;un client visite la boutique ou passe commande.">
    <section><h2>Responsable et contact</h2>
      <p>Le traitement des commandes est réalisé par l&apos;exploitant de Maison Jiya (Maroc). Pour toute question ou demande d&apos;accès, de rectification ou d&apos;opposition, utilisez le contact WhatsApp officiel figurant sur la boutique. L&apos;identification juridique complète de l&apos;exploitant doit être renseignée dans les <a href="/boutique/mentions-legales">mentions légales</a>.</p>
    </section>
    <section><h2>Informations collectées</h2>
      <p>Lors d&apos;une commande : nom, téléphone, ville, adresse de livraison, articles, quantités et éventuelle note facultative. Le site peut aussi conserver la source de campagne publicitaire ayant amené le client jusqu&apos;à la boutique. Aucune carte bancaire n&apos;est demandée : le paiement s&apos;effectue à la livraison.</p>
    </section>
    <section><h2>Finalités et destinataires</h2>
      <p>Ces données servent à enregistrer et confirmer la commande, vérifier la disponibilité, organiser la livraison, traiter les demandes et respecter les obligations administratives. Elles peuvent être utilisées par les personnes habilitées de Maison Jiya et les prestataires de livraison ou d&apos;hébergement nécessaires au service. Elles ne doivent pas être utilisées pour des messages marketing sans consentement approprié.</p>
    </section>
    <section><h2>Conservation et sécurité</h2>
      <p>Les informations sont conservées pendant les durées nécessaires au suivi des commandes et aux obligations légales applicables, puis supprimées ou archivées selon ces obligations. Les accès de gestion sont réservés aux personnes autorisées. La connexion à la boutique est chiffrée par HTTPS.</p>
    </section>
    <section><h2>Cookies et Pixel Meta</h2>
      <p>Le navigateur peut mémoriser la langue choisie et le panier pour faciliter la navigation. Lorsque le Pixel Meta est configuré, il ne doit être activé qu&apos;après le choix « Accepter » dans la bannière de préférences publicitaires. Le refus n&apos;empêche ni la consultation des produits ni l&apos;envoi d&apos;une commande. Vous pouvez modifier votre choix via « Cookies publicitaires » au bas de la boutique.</p>
      <p>En cas d&apos;acceptation, Meta peut recevoir des informations relatives à la visite et aux événements commerciaux de la boutique. Pour plus de détails sur l&apos;utilisation des données par Meta, consultez sa politique de confidentialité. Les données sont susceptibles d&apos;être traitées en dehors du Maroc.</p>
    </section>
    <section><h2>Vos droits et démarches CNDP</h2>
      <p>Conformément à la loi marocaine 09-08, vous pouvez notamment demander l&apos;accès ou la rectification de vos données et vous opposer à certains traitements dans les conditions légales. La notification du traitement auprès de la CNDP, lorsqu&apos;elle est requise, relève de la responsabilité de l&apos;exploitant. Aucun numéro de récépissé n&apos;est affiché tant qu&apos;il n&apos;a pas été confirmé.</p>
      <p><a href="https://www.cndp.ma/" target="_blank" rel="noopener noreferrer">Commission nationale de protection des données personnelles (CNDP)</a></p>
    </section>
  </LegalPage>;
}
