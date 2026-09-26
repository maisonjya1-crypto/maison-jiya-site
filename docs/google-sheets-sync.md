# Synchronisation Google Sheets durable

## Source de vérité

La base D1 `maison-jiya-pilotage-db` reste la source principale. Une panne Google ne fait jamais échouer une commande, une vente, un achat, une dépense, un mouvement de stock ou une autre saisie déjà validée dans D1.

Le classeur existant reste inchangé : `https://docs.google.com/spreadsheets/d/1hQIwOKBBhhZIQN6AsmVwUCH_7T-WE8GlsCfrmb2H7Us/edit`.

Les jeux de données servis par l’endpoint de sauvegarde sont : commandes, produits, colis, clients, achats, dépenses, publicités, capital, mouvements de stock, agences, partenaires et paramètres. Les onglets de configuration et d’installation existants ne sont pas recréés.

## Flux

1. La modification métier est enregistrée dans D1.
2. Un trigger D1 incrémente atomiquement la version à synchroniser dans `google_sheets_sync_state`.
3. Le Worker tente Apps Script en arrière-plan immédiatement après la requête.
4. Une réussite avance `synced_version` et crée/met à jour une ligne de journal.
5. Un échec conserve la version en attente, l’erreur lisible et la date du prochain essai.
6. Le cron `*/5 * * * *` reprend les travaux échoués avec backoff exponentiel, sans nombre maximal arbitraire de tentatives.

Les modifications rapprochées sont volontairement regroupées : le Sheet relit un instantané complet et stable depuis D1 au lieu de recevoir plusieurs copies partielles. Cela évite les appels Google inutiles.

Le Worker suit la redirection officielle de Google Content Service et n’accepte comme confirmation qu’une réponse finale HTTP 2xx provenant de `script.google.com` ou `script.googleusercontent.com`.

Lorsqu’une version récente réussit, les anciennes tentatives qu’elle contient sont marquées « incluses » dans le journal. Elles ne restent donc pas affichées à tort comme encore en échec.

## Idempotence

Chaque livraison utilise l’identifiant stable `maison-jiya-google-sheets-v<version>` dans le corps JSON et dans `X-Idempotency-Key`. Une reprise réutilise le même identifiant. Les exports exposent également les identifiants techniques stables des enregistrements. Le modèle de synchronisation actuel reconstruit les jeux de données depuis D1 : rejouer une version ne crée donc pas une deuxième commande dans la source Maison Jiya.

## Authentification

- La clé privée du classeur n’est stockée qu’en hash dans D1.
- La file ne déclare une réussite que si l’URL Apps Script et le hash de cette clé sont tous les deux configurés.
- L’endpoint d’export Google accepte `Authorization: Bearer` en priorité.
- Le paramètre historique `?key=` reste temporairement accepté pour ne pas casser l’Apps Script déjà installé.
- L’URL Apps Script reste une valeur serveur `security_backup_webhook_url` et n’est exposée qu’au compte administrateur dans le logiciel privé.
- Aucun secret n’est écrit dans GitHub, le frontend, les exports ou le journal.

## Journal et reprise

Le panneau Paramètres → Google Sheets affiche : dernière réussite, modifications en attente, tentatives, prochain essai, dernière erreur et historique récent. Le bouton « Réessayer maintenant » force une nouvelle version et une tentative immédiate ; il ne modifie aucune donnée métier.

## Portabilité

L’administrateur peut télécharger :

- un export JSON complet ;
- une archive ZIP contenant un CSV par table.

Les exports incluent les données métier, les réglages non secrets, la configuration de la boutique, ses médias, le journal d’actions et le journal Google Sheets. Ils excluent les mots de passe, sels, sessions et secrets.

## Limites externes

Google Apps Script et Google Sheets appliquent leurs propres quotas et peuvent être temporairement indisponibles. Dans ce cas, Maison Jiya continue de fonctionner sur D1 et la file reprend automatiquement plus tard. Le temps exact d’actualisation de Google ne peut pas être garanti à la seconde.

Limites publiées, vérifiées le 20 septembre 2026 :

- D1 n’impose pas de limite de lignes par table, mais la taille totale d’une base est limitée par Cloudflare à 500 Mo sur Workers Free ou 10 Go sur Workers Paid : https://developers.cloudflare.com/d1/platform/limits/.
- Cloudflare autorise 5 Cron Triggers par compte Free et 250 par compte Paid. Maison Jiya en utilise trois au total, dont un pour la reprise Google Sheets : https://developers.cloudflare.com/workers/platform/limits/.
- Pour un compte Google grand public, Apps Script publie notamment 6 minutes par exécution, 90 minutes quotidiennes de runtime de triggers et 20 000 appels URL Fetch par jour. Ces quotas peuvent changer : https://developers.google.com/apps-script/guides/services/quotas.

Ces plafonds appartiennent aux fournisseurs. Le code Maison Jiya n’ajoute aucune limite de produits, commandes, clients ou tentatives de synchronisation.
