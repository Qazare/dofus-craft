# PRD - Calculateur de craft Dofus, complément à duffus.fr

Statut : proposition, en attente de validation
Date : 2026-08-15
Forme retenue : page HTML locale unique, ouverte dans Zen Browser, à caler dans la moitié gauche du mode craft du projet fenêtres.
Métiers visés : tailleur, cordonnier, bijoutier.

---

## 1. Problème

duffus.fr répond à « quoi crafter pour monter le métier » et produit la liste de ressources. Il gère aussi des prix, mais trois frictions restent :

1. Les prix ne se sauvegardent qu'avec un compte connecté.
2. Les prix sont unitaires, alors qu'en HDV l'achat se fait par lot de 1, 10, 100 ou 1000, et que le meilleur prix au kama près n'est pas toujours sur le même lot selon la ressource. La conversion mentale est faite à la calculatrice, à chaque ressource, à chaque session.
3. Aucune vue par session multi-recettes : quand tu crafts trois objets différents dans la même séance, tu veux le coût global, et le résultat de chaque objet séparément.

## 2. Critères de succès

1. Saisir le prix d'une ressource en tapant ce qui est affiché en HDV, sans jamais diviser à la main.
2. Une session multi-recettes complète est chiffrée en moins de deux minutes une fois les prix connus.
3. Les prix sont mémorisés d'une session à l'autre, sans compte, sans connexion, sans réseau.
4. Lisible dans une fenêtre de moitié d'écran, utilisable au clavier seul.
5. Aucune dépendance à un service tiers qui puisse tomber ou changer.

## 3. Fonctionnalités

### 3.1 Saisie des prix par lot, la brique centrale

Pour chaque ressource, quatre champs facultatifs : prix du lot de 1, de 10, de 100, de 1000. Tu ne remplis que ce que tu vois en HDV.

L'outil en déduit le prix unitaire de chaque lot, retient **le moins cher**, signale lequel, et calcule la quantité à acheter en composant les lots. Exemple : besoin de 234 unités, le lot de 100 est le meilleur rapport, l'outil affiche « 2 lots de 100 + 3 lots de 10 + 4 à l'unité » avec le coût exact. C'est ce que tu fais de tête aujourd'hui.

Chaque prix est horodaté. Un prix saisi il y a plus de X jours s'affiche en atténué avec son âge, pour que tu saches ce qui mérite d'être revérifié avant de te fier au total.

### 3.2 Session multi-recettes

Une session est une liste de lignes : recette, quantité à crafter, prix de vente unitaire du craft. L'affichage donne :

- **Coût total de la session**, la somme à sortir avant de commencer.
- **Profit ou perte total**, une fois tout revendu.
- **Profit ou perte par objet**, ligne par ligne, pour repérer celui qui plombe la session.

Les ressources communes à plusieurs recettes sont agrégées dans une liste de courses unique, comme duffus le fait, mais chiffrée avec tes lots.

Note : je t'avais proposé le coût par point d'XP comme métrique principale, tu ne l'as pas retenue. Je peux la mettre en ligne secondaire discrète, elle est gratuite à calculer dès que l'XP de la recette est saisie. À trancher, ça ne change rien à la structure.

### 3.3 Recettes récupérées automatiquement via l'API DofusDude

Tu tapes le nom de l'objet, l'outil complète, et remplit seul les ingrédients avec leurs noms, leurs quantités et leurs icônes. Aucune saisie de recette, aucune bibliothèque à constituer.

Source : `api.dofusdu.de`, projet DofusDude, API publique sans clé, serveur sous licence GPL-3.0, sans clause restrictive sur l'IA. Vérifié sur ta recette : `Coiffe du Boufcoul`, niveau 89, retourne exactement Laine ×6, Corne ×3, Tresse ×3, Carapace ×3, Cervelle ×2, Substrat ×2, ce qui correspond au pixel près à ta capture duffus.

Appel type :
`https://api.dofusdu.de/dofus3/v1/fr/items/equipment/search?query=Coiffe%20du%20Boufcoul`

Réserve technique : depuis un fichier ouvert en `file://`, l'origine est `null` et l'API peut refuser la requête (CORS). C'est le premier point à tester en Phase 1, avant tout le reste. Solutions de repli par ordre de préférence : servir le dossier en local par une commande d'une ligne, ou télécharger une fois la base des trois métiers depuis l'outil lui-même et la stocker en local.

### 3.4 Taxe de vente

2 % du prix de vente, déduits du produit de la vente. Taux modifiable dans les réglages au cas où Ankama le change.

### 3.5 Persistance et sauvegarde

Stockage local du navigateur, plus un export et un import en JSON en un clic. L'export sert de sauvegarde et permet de passer la base de prix d'une machine à l'autre. C'est un fichier que tu peux poser dans ton Dropbox.

## 4. Hors périmètre

- Aucune récupération automatique des prix HDV. Dofus n'expose pas ces données, et tout ce qui irait les chercher dans le client relève de ce que tu m'as demandé d'exclure.
- Aucune interaction avec le jeu, aucune lecture d'écran, aucun compte à connecter.
- Pas de duplication du travail de duffus : ni simulateur d'XP, ni choix de la recette optimale, ni liste de progression. duffus décide quoi crafter, l'outil chiffre.
- Pas de serveur, pas d'hébergement, pas de compte. Un fichier, ouvert en local.

## 5. Contraintes et points bloquants identifiés

**DofusDB écarté pour raison de licence.** Sa licence LPNC-IA 1.0 interdit les projets dont le code ou le contenu est produit à plus de 50 % par des outils d'IA, ce qui est exactement notre cas. DofusDude est retenu à la place : API publique, sans clé, sans clause de ce type.

**D'où viennent les données de ces sites.** Le client Dofus embarque ses propres fichiers de données, au format `.d2o` pour les objets et `.d2i` pour les libellés. Des parseurs libres savent les lire depuis des années, et des projets comme `dofusdude/dofus3-main` publient le résultat en dumps versionnés à chaque mise à jour du jeu. Un site comme duffus n'a donc rien à saisir : il consomme un dump et le fige dans son build. C'est aussi pour ça que tous ces sites ont exactement les mêmes 305 recettes de Tailleur.

**Réseau du bac à sable.** Mon environnement d'exécution ne joint ni api.dofusdb.fr, ni api.dofapi.fr, ni api.dofusdu.de en direct. Je ne peux donc pas constituer de jeu de données ici. Sans conséquence sur le projet : c'est ton navigateur qui appellera l'API, pas moi.

**Stockage local.** C'est la raison pour laquelle l'outil est un fichier HTML posé sur ton disque et non un artefact Claude : les artefacts n'ont pas accès au stockage du navigateur, les prix seraient perdus à chaque ouverture.

## 6. Questions ouvertes

1. ~~Taxe de vente~~ **Tranchée : 2 % du prix de l'objet.**
2. **Vente du craft par lot.** Les objets crafts se vendent aussi par lot de 1, 10, 100. Faut-il la même mécanique multi-lots côté vente, ou un prix unitaire suffit-il ?
3. **Nombre de recettes** enchaînées dans une session type : trois lignes ou vingt, ce n'est pas la même mise en page.
4. **Coût par XP en ligne secondaire**, oui ou non. Gratuit à calculer, l'API donne le niveau de la recette et duffus l'XP.
5. **Où poser le fichier** sur ton disque, et faut-il l'inscrire au Studio OS.

## 7. Plan

**Phase 0, bloquante.** Un fichier HTML minimal de dix lignes qui appelle l'API et affiche le résultat. Tu l'ouvres, tu me dis si ça passe ou si la console crie au CORS. Tout le reste dépend de cette réponse, donc rien d'autre n'est écrit avant.

**Phase 1.** Moteur de calcul : normalisation des lots, choix du meilleur rapport, composition des achats, agrégation multi-recettes, taxe. Écrit avec des noms explicites, commenté, testable indépendamment de l'interface.

**Phase 2.** Interface : recherche de recette, grille des prix par lot, bandeau de résultats. Dimensionnée pour une demi-fenêtre.

**Phase 3.** Persistance des prix, horodatage, export et import JSON.

**Phase 4.** Vérification : jeu de cas chiffrés à la main, dont un cas piège où le lot de 100 revient plus cher à l'unité que le lot de 10, une quantité non ronde, et un contrôle de la taxe.
