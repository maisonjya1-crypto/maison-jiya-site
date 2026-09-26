# Migrations D1 — Maison Jiya

## Nouvelle règle

La base de production reste **maison-jiya-pilotage-db** et D1 reste la source de vérité.

À partir de ce baseline, le dossier **`migrations/`** est l’unique chaîne de migrations D1 de production. Le dossier **`drizzle/`** est figé après `0020_owner_admin_separation.sql` : il reste uniquement comme historique des anciennes évolutions.

## Pourquoi ne pas rejouer drizzle/0000…0020

La base existait avant l’activation du système de migrations D1 Cloudflare. Plusieurs tables et colonnes ont déjà été créées ou réparées au runtime. Rejouer toutes les anciennes migrations sur la production risquerait donc des erreurs « table/colonne existe déjà ».

`migrations/0000_production_baseline.sql` décrit le schéma courant avec des opérations idempotentes `CREATE ... IF NOT EXISTS`. Il établit le point de départ officiel sans supprimer ni réinitialiser les données existantes.

## Déploiement

Le workflow production suit désormais cet ordre :

1. typecheck ;
2. build ;
3. application des migrations D1 distantes ;
4. déploiement du Worker ;
5. vérification production.

Une migration en erreur empêche donc le nouveau Worker d’être déployé.

## Compatibilité historique

`db/schema-compat.ts` contient l’ancien bootstrap et les réparations nécessaires aux bases créées avant ce baseline.

Ce module est **en réduction uniquement** : aucune nouvelle table ou colonne ne doit y être ajoutée. Le contrôle CI `scripts/check-d1-migration-discipline.mjs` gèle les signatures DDL historiques et bloque les nouveaux `ALTER TABLE` / `CREATE TABLE` runtime.

## Prochaine modification de schéma

Pour toute nouvelle évolution :

1. mettre à jour `db/schema.ts` si Drizzle utilise l’objet ;
2. créer `migrations/0001_description.sql`, puis `0002_...`, etc. ;
3. ne pas ajouter de nouvel `ALTER TABLE` runtime ;
4. tester avec `npm run db:migrations:apply:local` ;
5. fusionner uniquement après la CI complète.
