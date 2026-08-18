# Déployer le calculateur

Site statique, sans build : du HTML, une feuille de style et des modules ES.
N'importe quel hébergeur de fichiers statiques convient, et le choix se change
en cinq minutes puisqu'il n'y a rien à compiler.

## En local, pendant le développement

Le passage en modules ES a un coût : `file://` ne les charge pas, la politique
d'origine les refuse. Il faut donc servir le dossier.

```bash
node outils/servir.js
```

Puis <http://localhost:4173>. Aucune dépendance à installer, le serveur tient en
cinquante lignes de Node.

## Ce que le jeton change, et ne change pas

**Le jeton d'écriture n'est jamais dans le dépôt.** Il est saisi dans les
réglages et rangé dans le stockage local du navigateur. Conséquences directes :

- le site peut être public sans risque, personne ne peut publier de prix en ton
  nom sans ton jeton ;
- il faut le ressaisir sur la seconde machine, une fois, dans les réglages ;
- il ne part pas non plus dans l'export JSON, qui circule entre les machines.

Si tu le colles un jour dans un fichier du dépôt, considère-le comme brûlé et
régénère-le sur <https://dofus-calculator.fr/api-tokens>.

## Les hébergeurs, points forts et points faibles

| | Points forts | Points faibles |
|---|---|---|
| **GitHub Pages** | Gratuit, déjà retenu dans ton journal du 17 08. Déploiement au push. Rien à configurer d'autre que le workflow. | **Toujours public sur un compte gratuit**, même depuis un dépôt privé. Aucune protection par mot de passe possible. Pas d'en-têtes HTTP personnalisés, donc le `noindex` ne tient que par la balise meta et `robots.txt`. |
| **Netlify** | Déploiement au push. En-têtes personnalisés via `netlify.toml`, déjà écrit. Mot de passe sur tout le site, mais à partir de l'offre payante. Rollback en un clic. | Offre gratuite généreuse mais limitée en bande passante. Un compte de plus à gérer. |
| **Cloudflare Pages** | Le plus rapide des trois, et **Cloudflare Access permet de restreindre l'accès à ton adresse e-mail, gratuitement jusqu'à 50 utilisateurs**. C'est la seule option qui rend le site réellement privé sans payer. | Configuration d'Access à faire une fois, une dizaine de minutes. Un compte Cloudflare de plus. |
| **Vercel** | Déploiement au push, très simple. | Orienté applications, surdimensionné ici. La protection par mot de passe est réservée aux offres payantes. |
| **Tailscale sur une machine à toi** | Rien de public du tout, le site n'existe que sur ton réseau privé. | Il faut que la machine qui sert soit allumée. Ton PC l'est souvent, ton Mac moins. Fragile pour un outil qu'on veut ouvrir sans y penser. |

**Recommandation.** Si tu tiens à ce que ça reste vraiment pour toi, prends
**Cloudflare Pages avec Access** : c'est le seul moyen gratuit d'avoir une URL
qui ne s'ouvre que pour toi. Si tu t'en moques — et il n'y a objectivement rien
de sensible ici, ni prix personnels ni jeton —, **GitHub Pages** est le plus
court chemin et correspond à ta décision du 17 08.

## GitHub Pages

Le dépôt ne doit vivre dans aucun dossier synchronisé, Dropbox comme Obsidian :
deux machines écrivant dans le même `.git` finissent par le corrompre. Copie
donc `calculateur/` dans un dépôt situé ailleurs sur le disque.

`.nojekyll` est déjà là : sans lui, GitHub Pages ignore silencieusement tout
fichier ou dossier commençant par un souligné.

Workflow à poser dans `.github/workflows/deploiement.yml` du dépôt :

```yaml
name: Déploiement
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deployer:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploiement.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - id: deploiement
        uses: actions/deploy-pages@v4
```

## Netlify

`netlify.toml` est déjà écrit. Connecte le dépôt, ne renseigne aucune commande
de build, et laisse le dossier de publication sur la racine.

## Cloudflare Pages

Connecte le dépôt, aucune commande de build, dossier de sortie `/`. Puis, dans
Zero Trust, ajoute une application Access sur le domaine du site avec une règle
« e-mail unique » sur ton adresse. Le site demande alors un code envoyé par
e-mail avant de s'ouvrir.
