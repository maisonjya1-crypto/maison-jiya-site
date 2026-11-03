# Correctifs de l'audit du 3 novembre 2026

Ces corrections ne changent ni l'interface ni la façon de travailler. Elles rendent le logiciel fiable quand le nombre de commandes augmente.

| Réf. audit | Problème | Correction | Fichiers |
| --- | --- | --- | --- |
| C3 | La sauvegarde quotidienne pouvait dépasser 2 Mo (limite D1) et empêcher d'ouvrir le logiciel | Sauvegarde découpée en morceaux dans la nouvelle table `daily_backup_chunks` ; photos boutique exclues de la sauvegarde quotidienne (elles restent dans l'export complet) ; un échec de sauvegarde automatique n'empêche plus l'ouverture | `db/backups.ts`, `app/api/data/route.ts`, `migrations/0018_daily_backup_chunks.sql` |
| C5 | Chaque modification de commande relançait le calcul du capital de toutes les commandes (2 requêtes par commande ; échec au-delà d'environ 500 commandes encaissées) | Seule la commande modifiée est recalculée ; le recalcul complet se fait en 3 lectures et des écritures groupées ; un échec après enregistrement n'affiche plus « L'enregistrement n'a pas abouti » | `db/allocations.ts`, `app/api/data/route.ts` |
| C2 | Import de 200 commandes : collision de références dans 99 % des cas | Nouvelle fonction `referenceWithPrefix()` (5 caractères d'horodatage + 6 aléatoires) utilisée pour toutes les références | `lib/reference.ts`, routes commandes |
| C4 | Plus de 100 commandes sélectionnées = erreur D1 | Sélection limitée à 90 commandes avec un message clair ; la purge automatique de la corbeille traite les commandes par paquets de 90 | `app/api/data/route.ts`, `db/backups.ts` |
| S1 | Une commande publique renommait un client existant | La fiche client n'est plus modifiée depuis la boutique ; le nom saisi, s'il est différent, est noté sur la commande | `app/api/storefront/orders/route.ts` |
| S2 | 5 tentatives par IP, fautes de frappe comprises | Seuls les formulaires valides comptent : 4 commandes par téléphone et 12 par IP toutes les 15 minutes | `app/api/storefront/orders/route.ts` |
| C1 | Un colis retourné ne revenait jamais en stock et son coût d'achat restait compté en perte | Nouveau statut « Retour reçu » : l'article est réintégré automatiquement (une ou plusieurs lignes), l'encaissement passe à « Non encaissé » ou « Remboursé », et seuls livraison, frais et coût de retour restent des pertes. « Retour » garde son sens actuel (colis en chemin du retour) | `app/api/data/route.ts`, `app/api/orders/multi/route.ts`, `app/dashboard-client.tsx`, `lib/finance.ts`, `lib/monthly-closing.ts`, `lib/accounting-dates.ts`, `lib/order-payment-lifecycle.ts` |
| C1 bis | Un transporteur qui annonce encore « retour » aurait fait repasser la commande de « Retour reçu » à « Retour » ; et une annulation annoncée par le transporteur ne remettait pas en stock une commande à un seul produit | « Retour reçu » n'est jamais remplacé par « Retour » ; le stock suit désormais le statut aussi lors de la synchronisation transporteur | `db/carriers.ts` |
| M4 | Chaque commande envoyait « Purchase » et « Lead » au Pixel | Un seul événement « Lead » par commande COD (identifiant `lead-<référence>`). « Purchase » est réservé aux commandes livrées (API Conversions à brancher) | `app/boutique/storefront-client-v3.tsx`, `app/storefront-cms-v2-enhancement.tsx` |

## Effets visibles

- Nouveau statut **« Retour reçu »** dans la liste des statuts : à choisir quand le colis est physiquement revenu au magasin. Le motif du retour reste obligatoire.

- Les nouvelles références ont 11 caractères après le préfixe (ex. `MJ-W3K9QZ7F2KQ1`). Les anciennes commandes gardent leur référence.
- Une restauration de sauvegarde quotidienne conserve les photos actuelles de la boutique.
- Les anciennes sauvegardes (avant ce correctif) restent lisibles et restaurables.

## Tests

`tests/audit-fixes-behaviour.test.mjs` teste le comportement réel sur une base SQLite en mémoire : grosse sauvegarde, ancienne sauvegarde, 1 200 commandes encaissées, 200 références dans la même milliseconde, corbeille de 250 commandes, commandes publiques, retours reçus (stock, webhook transporteur, bénéfice, clôture mensuelle). Ces tests échouent sur l'ancien code et passent sur le nouveau, sauf celui du trigger multi-produits qui confirme un comportement déjà correct.

## Déploiement

1. Fusionner sur une branche de test et lancer `npm ci && npm run typecheck && npm test`.
2. Le workflow de production applique automatiquement `migrations/0018_daily_backup_chunks.sql` avant le nouveau Worker.
3. Après déploiement : ouvrir le logiciel, puis Paramètres → Sauvegardes → « Vérifier » pour contrôler la sauvegarde du jour.
