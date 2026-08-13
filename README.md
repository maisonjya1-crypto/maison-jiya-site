# Maison Jiya — Pilotage

Plateforme responsive de gestion des commandes, colis, clients, achats, publicités, stock et capital de Maison Jiya.

## Accès sécurisé

- Connexion interne par nom d’utilisateur et mot de passe, sans compte ChatGPT.
- Rôles `admin`, `editor` et `viewer`.
- Mots de passe hachés avec PBKDF2-SHA256 et sel aléatoire.
- Sessions sécurisées de 12 heures et blocage temporaire après 5 essais incorrects.
- Au premier lancement, la page de connexion permet de créer le compte administrateur principal.

## Développement

```bash
npm ci
npm run dev
```

## Vérifications

```bash
npm run typecheck
npm run lint
npm test
npx wrangler deploy --dry-run
```

## Cloudflare

Le projet utilise Cloudflare Workers, les assets statiques et une base D1 liée sous le nom `DB`. Le fichier `wrangler.jsonc` permet à Cloudflare de créer ou de lier la base `maison-jiya-pilotage-db` lors du premier déploiement.

