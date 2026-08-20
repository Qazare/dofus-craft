# À lire avant de répondre à quoi que ce soit

## 1. `git pull` AVANT la première réponse. Sans exception.

**Ce dépôt est travaillé depuis deux machines** — le MacBook Pro et le PC — et
GitHub est la seule passerelle entre elles. Le dossier local est presque
toujours en retard d'une session.

```bash
git fetch origin && git status -sb && git pull --ff-only
```

À lancer **avant de lire le code, avant de chercher une fonctionnalité, avant
d'annoncer qu'une chose existe ou n'existe pas.** Pas après avoir cherché, pas
« si ça semble utile » : en premier.

**Pourquoi cette règle existe.** Le 20 08 2026, une session PC a cherché la
fonction de montée de niveau, ne l'a pas trouvée, a conclu qu'elle n'existait
pas, et l'a réécrite de zéro. Elle existait — poussée depuis le Mac la veille,
en bien plus abouti. Une demi-journée de travail à jeter, et un `push` rejeté
qui a révélé le problème trop tard. Un `git pull` de trois secondes l'aurait
évitée.

**Si `git pull` ne passe pas en fast-forward**, ne force rien et n'invente pas
de fusion : dis-le, montre ce qui diverge des deux côtés, et laisse Brice
trancher.

## 2. Ce que ce dépôt contient

- `calculateur/` le site, seul dossier publié par GitHub Pages. Modules ES,
  donc **il se sert, il ne s'ouvre pas en `file://`** : `npm run servir`, puis
  `localhost:4173`.
- `outils/` les tests et les scripts, jamais publiés.
- `README.md` l'état du projet et le **journal des décisions**, tenu à jour à
  chaque changement de comportement. C'est lui qui dit pourquoi les choses sont
  comme elles sont — le lire avant de défaire quelque chose.
- `prd-*.md` les cahiers des charges, dont celui de l'OCR du HDV.

## 3. Avant de committer

```bash
npm test && npm run test:interface
```

Les deux doivent passer. Le second lance un vrai Chromium et n'appelle aucune
API réelle : un test qui publierait pour de vrai polluerait la base de prix
partagée par tous les joueurs du serveur.

Le journal du `README.md` se met à jour dans le même commit que le changement
qu'il décrit, jamais après coup.

## 4. Le push est manuel

`credential.helper=manager` ouvre le navigateur pour authentifier : une session
d'agent non interactive ne peut pas aller au bout. Prépare le commit, annonce-le,
et laisse Brice lancer le `git push`.
