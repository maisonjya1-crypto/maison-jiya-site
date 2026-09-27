# Reprise après incident — Maison Jiya

## Principe

D1 reste la source de vérité du logiciel. La stratégie de continuité utilise plusieurs couches qui n’ont pas le même rôle.

### 1. Sauvegarde restaurable dans D1

Une sauvegarde métier complète est créée chaque jour et conservée 90 jours dans `daily_backups`.

Elle contient les données commerciales nécessaires à la restauration, mais pas :
- les mots de passe ;
- les sessions ;
- les secrets Cloudflare ;
- les clés privées de sauvegarde.

Avant une remise à zéro commerciale ou une restauration, une sauvegarde de sécurité supplémentaire est créée.

### 2. Contrôle quotidien non destructif

Après la sauvegarde quotidienne, `verifyLatestBackup()` vérifie :
- que le JSON est lisible ;
- que la version est reconnue ;
- que toutes les tables obligatoires sont présentes sous forme de listes ;
- que les tables optionnelles, si présentes, ont une forme valide ;
- que la date est valide ;
- que le nombre d’enregistrements calculé correspond au compteur enregistré.

Ce contrôle n’efface et ne restaure rien dans la production.

### 3. Test réel du chemin de restauration

La CI exécute les tests de `restoreDailyBackup()` sur une base isolée. Les tests vérifient notamment qu’une erreur tardive annule l’ensemble de la restauration au lieu de laisser une base partiellement restaurée.

On ne fait pas de « test de restauration » destructif sur la base de production.

### 4. Copie indépendante hors D1

Google Sheets constitue la copie opérationnelle indépendante de D1 :
- les modifications D1 sont mises en file ;
- un snapshot complet est synchronisé vers Apps Script ;
- les erreurs sont conservées et retentées ;
- les secrets ne sont pas exportés.

Cette copie est destinée à garder les données lisibles même si le Worker ou D1 deviennent temporairement indisponibles. Elle ne remplace pas à elle seule une restauration applicative complète.

### 5. Exports portables et réimportation

Le propriétaire principal peut télécharger :
- un export JSON complet, réimportable par Maison Jiya ;
- une archive CSV destinée à la lecture et au contrôle externe.

L’import JSON complet :
- vérifie la version, la date, les tables, les doublons et les références avant toute suppression ;
- crée une sauvegarde de sécurité de l’état courant avant l’opération ;
- restaure les données métier et la configuration de la boutique dans un seul batch D1 atomique ;
- conserve les comptes, mots de passe, sessions, e-mail principal, secrets et clés d’intégration actuels ;
- ne rejoue pas l’ancien journal de synchronisation Google Sheets et programme une nouvelle synchronisation après restauration.

Pour une conservation hors plateforme, ces fichiers doivent être stockés dans un emplacement indépendant du compte Cloudflare.

## Procédure de reprise

### Suppression ou modification métier accidentelle
1. Ouvrir Paramètres → Sauvegardes.
2. Vérifier la date et le nombre d’enregistrements de la sauvegarde.
3. Utiliser « Restaurer » sur la copie appropriée.
4. Le logiciel crée d’abord une sauvegarde de sécurité de l’état courant.
5. La restauration est appliquée dans un seul batch D1 : une erreur annule l’opération entière.

### Incident D1 majeur
1. Recréer/appliquer le schéma avec la chaîne `migrations/`.
2. Se connecter avec le compte propriétaire actuel.
3. Ouvrir Paramètres → Sauvegardes → Réimportation complète.
4. Sélectionner le dernier fichier `maison-jiya-export-AAAA-MM-JJ.json`.
5. Vérifier l’aperçu puis confirmer en tapant `RESTAURER`.
6. Contrôler ensuite les produits, commandes, stock, achats, capital et la boutique, puis laisser la synchronisation Google Sheets se refaire.
7. Ne jamais réintroduire les secrets depuis un export : les secrets Cloudflare et mots de passe restent gérés séparément.

## Limites actuelles connues

- L’archive CSV est un format de consultation et n’est pas utilisée pour une restauration complète automatique.
- Les anciens fichiers Excel/Google Sheets de produits ou commandes passent encore par les imports CSV/TSV dédiés. Leur migration doit rester séparée d’une restauration JSON complète afin d’éviter les doublons et les fausses ventes historiques.
- Les comptes utilisateurs exportés à titre informatif ne remplacent jamais les comptes actuels, car les mots de passe et sessions ne font pas partie des exports.
