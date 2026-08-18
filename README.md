# Dofus, outils personnels

Deux chantiers indépendants, réunis parce qu'ils servent la même séance de jeu :
rendre le multi-compte tenable sur un écran unique, et arrêter de calculer la
rentabilité des crafts à la calculatrice.

Contrainte commune, non négociable : **rien ne touche aux fichiers du jeu, rien
n'envoie d'entrée clavier ou souris au client, aucune automatisation d'action en
jeu.** Tout ce qui est ici manipule des fenêtres au niveau de Windows ou calcule
dans un navigateur, hors du jeu.

---

## Où ça vit

| | |
|---|---|
| Site en ligne | <https://qazare.github.io/dofus-craft/> |
| Dépôt | <https://github.com/Qazare/dofus-craft>, public |
| Sur le Mac | `_BVA_/Dev/dofus-craft`, hors coffre Obsidian et hors Dropbox |
| Sur le PC | un `git clone`, où tu veux, hors dossier synchronisé |

Le déploiement part au push sur `main`, workflow dans `.github/workflows/`. Seul
`calculateur/` est publié ; les PRD et les tests restent dans le dépôt sans être
servis. Git est la synchro entre les deux machines, et il n'y en a pas d'autre :
deux machines écrivant dans le même `.git` finiraient par le corrompre.

Ne sont pas synchronisés, et c'est assumé : le jeton d'écriture et tes prix, qui
vivent dans le stockage local de chaque navigateur. L'export JSON est là pour
les transporter à la main si besoin.

---

## Contenu du dossier

| Chemin | Rôle |
|---|---|
| `calculateur/` | Le site. HTML, CSS, modules ES, aucun build. C'est l'outil. |
| `calculateur/DEPLOIEMENT.md` | Serveur local, étanchéité du jeton, comparaison des hébergeurs. |
| `calculateur/js/` | Un module par responsabilité, voir la table plus bas. |
| `outils/servir.js` | Serveur statique local sans dépendance. `node outils/servir.js`, puis localhost:4173. |
| `outils/test-moteur-calcul.js` | Tests du calcul, des migrations et de la préséance des prix. `npm test` |
| `outils/verifier-les-api.js` | Joignabilité des deux API et contrôle du contrat d'identifiants. `npm run test:api` |
| `outils/verifier-interface.js` | Test de bout en bout dans un vrai navigateur, réseau intercepté. Nécessite Playwright. |
| `archive/` | L'ancien fichier unique, figé. |
| `prd-calculateur-craft.md`, `prd-calculateur-craft-v2.md` | Cahiers des charges du calculateur. |
| `prd-gestion-fenetres.md` | Cahier des charges de la gestion de fenêtres, audit du script AHK. |
| `prd-ocr-hdv.md` | Cahier des charges de l'OCR des prix du HDV. Plan validé, phase 0 non faite. |
| `reference/Dof.ahk` | Copie intacte du script d'origine, jamais modifiée. |

---

## Chantier 1, calculateur de craft

**État : fonctionnel, en usage.**

Complète duffus.fr plutôt que de le remplacer. duffus décide quoi crafter pour
l'XP, le calculateur chiffre l'opération. Ce qu'il fait et que duffus ne fait pas :

- **Prix par lot.** Quatre champs par ressource, 1, 10, 100, 1000. On saisit ce
  que le HDV affiche, sans jamais diviser de tête. Le calcul choisit la
  combinaison la moins chère et dit quoi acheter.
- **Le surachat quand il est rentable.** Prendre systématiquement le lot au
  meilleur prix unitaire n'est pas optimal. Pour 12 unités, avec un lot de 10 à
  50 kamas et l'unité à 100, deux lots de 10 coûtent 100 kamas là où l'approche
  intuitive en dépense 250. Résolu par programmation dynamique, pas par heuristique.
- **Prix moyen saisi au lot.** On tape le montant du lot tel que le HDV
  l'affiche, et on choisit la taille du lot juste à côté. L'unitaire est déduit,
  jamais saisi, et rappelé en info-bulle. Une case bascule toute la session en
  estimation rapide, pour savoir en trente secondes si on est dans le vert.
- **Revue de revalidation.** Le bouton `Revérifier les prix` passe en revue, une
  ressource à la fois et au clavier seul, tous les prix jamais renseignés ou
  vieux de plus de sept jours. Entrée valide et enchaîne, Échap sort. Confirmer
  sans rien changer rafraîchit quand même la date : c'est l'acte de dire « j'ai
  regardé, il est toujours bon ».
- **Mode PIP.** Le bouton `PIP` détache une vue compacte qui reste au premier
  plan pendant que le jeu est en plein écran. Ce n'est pas un clone : les deux
  fenêtres partagent le même état, une saisie faite dans l'une apparaît
  immédiatement dans l'autre. Via l'API Document Picture-in-Picture, disponible
  sur Chrome, Edge et Firefox depuis la version 151, donc sur Zen. Repli en
  popup ordinaire si elle manque.
- **Session multi-recettes.** Ressources agrégées entre recettes, coût groupé,
  puis quote-part au prorata pour connaître le résultat objet par objet.
- **La base communautaire comme source de prix, pas comme béquille.** Les prix
  de dofus-calculator.fr, filtrés sur Brial, sont lus au démarrage et à chaque
  recette ajoutée. Ce que la base contient est un **vrai prix unitaire relevé au
  HDV**, donc l'équivalent exact de la colonne ×1 — et non un prix moyen, ce que
  la première intégration avait supposé à tort. Il entre par conséquent dans le
  calcul d'achat par lots comme n'importe quel ×1 : un ×1 venu de la base et un
  ×10 relevé à la main se combinent, et le surachat est arbitré entre les deux.
- **Publication de tes relevés.** Saisir un ×1 l'envoie vers la base, avec le
  jeton. C'est la seule colonne qui sorte de la machine, parce que c'est la seule
  que l'API sache représenter : lots de 10, 100, 1000 et prix moyen restent
  strictement locaux. L'envoi est automatique, annoncé dans le bandeau d'état, et
  corrigeable par simple ressaisie — l'API n'impose aucune limite de fréquence.
  Interrupteur global dans les réglages pour tout couper.
- **Recherche navigable au clavier.** Flèches haut et bas parcourent les
  suggestions en boucle, Entrée ajoute celle qui est mise en avant, Échap
  referme. Sans sélection explicite, Entrée prend le premier résultat. Le survol
  souris et la mise en avant clavier désignent toujours la même ligne.
- **Taxe HDV de 2 %**, modifiable.
- **Mémoire locale.** Prix, XP par recette et cache des noms d'objets restent
  dans le navigateur, avec export et import JSON. Aucun compte, aucun serveur.

### Les deux API appelées

| API | Sert à | Clé |
|---|---|---|
| **DofusDude** `api.dofusdu.de` | Recettes, noms, icônes | aucune |
| **dofus-calculator.fr** `/api` | Prix HDV relevés par les joueurs, lecture et écriture | aucune en lecture, jeton en écriture |

DofusDB a été écarté comme source de recettes : sa licence LPNC-IA interdit les
projets majoritairement produits par une IA.

**Deux identifiants à ne jamais confondre**, la nuance coûte cher :

- **`dofusdb_id`** est l'identifiant Ankama, celui que DofusDude nomme
  `ankama_id`. Vérifié sur plusieurs ressources, le Blé vaut 289 des deux côtés.
  C'est lui qui sert à **lire**, via le filtre `dofusdb_id=in:…`.
- **`id`** est la clé primaire interne de dofus-calculator. C'est la seule
  acceptée à l'**écriture**, dans le champ `item_id`. Vérifié par deux sondes
  sans effet : poster un `dofusdb_id` valide mais absent de la table interne se
  fait refuser en 422.

Conséquence de conception : **on ne peut publier que ce qu'on a d'abord lu**,
puisque c'est la lecture qui rapatrie l'identifiant interne. C'est un garde-fou
plutôt qu'une gêne. `outils/verifier-les-api.js` contrôle que ce contrat tient
toujours ; le jour où il vire au rouge, le calculateur écrirait sur les
mauvaises ressources.

**Le serveur est en dur sur Brial**, `server_id` 22. Un prix d'un autre serveur
n'a aucun sens ici. `GET /servers` donne la liste si un second devenait utile.

**Le jeton d'écriture n'est jamais dans le dépôt.** Il est saisi dans les
réglages, rangé dans le stockage local du navigateur, et absent de l'export
JSON. Le site peut donc être public sans que personne ne puisse publier en ton
nom. Revers assumé : il faut le ressaisir une fois sur la seconde machine.

### Convention d'affichage à connaître

Deux signaux, deux canaux, et surtout jamais le même canal pour les deux.

**La bordure d'un champ dit d'où vient le chiffre.**

| | |
|---|---|
| **violet plein** | ton relevé, parti vers la base communautaire |
| **bleu pointillé** | relevé de la communauté, affiché en repère dans le texte de remplacement. Le champ est vide : la première frappe part d'un champ propre et rien n'est enregistré en ton nom tant que tu n'as pas saisi. |
| **neutre** | strictement local. Lots de 10, 100, 1000 et prix moyen. |

**Le fond d'une cellule dit ce que le calcul recommande d'acheter.** Teinté avec
une barre à gauche : ce lot fait partie du panier retenu. Et non « ce lot a le
meilleur prix unitaire » : un lot avantageux à l'unité mais inutile pour la
quantité voulue reste éteint. À coût égal, la solution qui achète le moins de
surplus est retenue.

C'est la raison du changement du 18 08 : le vert d'entourage portait autrefois la
recommandation, il serait entré en conflit avec le codage de provenance. Une
bordure ne peut pas dire deux choses à la fois.

**Une pastille à côté du nom** rappelle la provenance et l'âge : `base 149 j` en
orange pour un relevé communautaire périmé, `publié` en violet pour le tien.
Quand la base et toi divergez sur le ×1, une pastille `base 1 200` le signale
sans rien imposer : ton chiffre continue de primer, vide le champ pour adopter
le sien.

### Architecture

Site statique sans build, un module par responsabilité. Le graphe de
dépendances est acyclique par construction, ce qui n'est pas un raffinement :
c'est ce qui permet aux tests d'importer le moteur sans traîner le DOM derrière.

| Module | Responsabilité |
|---|---|
| `config.js` | Constantes. Aucune dépendance, aucun secret. |
| `formats.js` | Saisies tolérantes, mise en forme, âges. Aucune dépendance. |
| `etat.js` | État, persistance, migrations de schéma, jeton. |
| `moteur.js` | Programmation dynamique de l'achat. Pur, sans état ni DOM. |
| `prix-communautaires.js` | Lecture du cache et préséance des prix. Pur. |
| `analyse.js` | Agrégation de la session et quote-part par objet. |
| `api-dofusdude.js`, `api-prix.js` | Les deux accès réseau, et eux seuls. |
| `journal.js` | Bandeau d'état. Rien ne part au réseau en silence. |
| `cellules-de-prix.js` | Fabriques de cellules, partagées par les deux fenêtres. |
| `vue.js`, `recherche.js`, `revue.js`, `reglages.js`, `fenetre-flottante.js` | Interface. |
| `crafts.js` | Ajout de recette et synchronisation qui en découle. |
| `application.js` | Démarrage et câblage. Seul module à toucher au document. |

Le fichier unique a été abandonné : à 2 000 lignes, la duplication entre la
fenêtre principale et le PIP devenait le principal risque de bug. Le coût du
changement est réel et assumé — `file://` ne charge pas les modules ES, il faut
donc servir le dossier, d'où `outils/servir.js`.

### Questions encore ouvertes

0. **Anciens prix ×1 jamais publiés.** Les ×1 relevés avant le 18 08 sont restés
   locaux : la migration ne les envoie pas d'office, publier en masse des
   chiffres dont personne n'a revérifié la fraîcheur polluerait la base commune.
   Ils partiront un par un, à la ressaisie. Une revue complète au HDV réglerait
   la question en une séance.
1. **Vente par lot.** Le prix de vente est aujourd'hui unitaire. Si la revente se
   fait par 10 ou 100, il faut la même mécanique côté vente.
2. **Formule d'XP de craft.** Non résolue, et volontairement pas devinée. L'API
   DofusDude ne l'expose pas, le forum officiel refuse la lecture automatisée, et
   les chiffres relevés (niveau 89 : recette 90 → 1800 XP, 89 → 1618, 88 → 1449)
   ne suivent ni une progression linéaire ni une progression géométrique propre.
   En attendant, l'XP se saisit une fois par recette et reste mémorisée, à
   corriger après chaque montée de niveau. Pour trancher : relever les XP
   affichées par duffus sur trois ou quatre recettes, à deux niveaux de métier
   différents, et ajuster la courbe sur ces données.
3. **Emplacement final** du dépôt git, hors de toute synchro de fichiers, et
   choix de l'hébergeur. Comparaison dans `calculateur/DEPLOIEMENT.md`.
   Cloudflare Pages avec Access est le seul moyen gratuit d'avoir une URL qui ne
   s'ouvre que pour toi ; GitHub Pages est le plus court chemin mais toujours
   public.
4. **OCR des captures du HDV.** Débloqué par l'hébergement, mais pas commencé :
   il faut d'abord vérifier sur des captures réelles que les chiffres du HDV
   sont lisibles par Tesseract. Si ce n'est pas concluant, le chantier s'arrête.
   Contrainte de conception déjà fixée : une valeur issue de l'OCR reste dans un
   état visuellement distinct et n'entre dans aucun total avant confirmation.

---

## Chantier 2, gestion de fenêtres

**État : PRD validé sur le fond, implémentation pas commencée.**

Le script `Dof.ahk` existant place les 4 clients en 2×2 (F8) et bascule en
maximisé (F9). Il fonctionne. Le manque n'est pas la géométrie mais la
**sélection** : arriver sur un personnage précis reste tributaire d'Alt+Tab, qui
n'est pas déterministe.

Constat de la recherche : **aucun organizer Dofus existant ne fait de disposition
géométrique.** ROrganizer, Dosoft, Multixi, DofusMultiOrganizer font tous de la
bascule de fenêtre uniquement. Ils ne remplacent donc pas le script, seulement la
partie qui reste à écrire, laquelle tient en une vingtaine de lignes.
Recommandation : ne rien installer.

**À éviter absolument : organizer-dofus.com**, qui annonce suivi automatique,
acceptation automatique des combats et clics automatisés, et se revendique
« indétectable par conception ».

Seul outil tiers réellement complémentaire : **Groupy 2**, qui fusionne des
fenêtres en onglets, ce qu'un script de géométrie ne sait pas faire. Utile pour
réunir Ganymède et Zen dans un seul cadre. Payant.

### Ce qui bloque le démarrage

- Nom d'exécutable de Zen Browser et de Ganymède.
- Touches F réellement libres dans les binds en jeu, notamment F5, F6, F7.
- Emplacement de `Dof.ahk` sur le disque.

Décisions déjà prises : mode craft en moitié droite pleine hauteur, écran unique
32 pouces 4K à 150 % de mise à l'échelle, raccourcis sur F5 à F9 et boutons
latéraux de souris, cycle avant/arrière entre personnages comme remplaçant
d'Alt+Tab.

---

## Journal des décisions

| Date | Décision |
|---|---|
| 15 08 2026 | Mode craft en moitié droite pleine hauteur, le client Unity se redimensionne correctement. |
| 15 08 2026 | Aucun organizer Dofus installé, la bascule de personnage sera ajoutée au script existant. |
| 15 08 2026 | DofusDB écarté pour cause de licence LPNC-IA, DofusDude retenu. |
| 15 08 2026 | Taxe HDV fixée à 2 % du prix de vente. |
| 15 08 2026 | Le calculateur est un fichier local et non un artefact, pour garder le stockage navigateur. |
| 15 08 2026 | Le vert du tableau suit la recommandation d'achat, pas le meilleur prix unitaire. |
| 15 08 2026 | La formule d'XP n'est pas devinée tant qu'elle n'est pas vérifiable. |
| 17 08 2026 | Le prix moyen se saisit au lot entier, plus jamais à l'unité. Schéma de données passé en version 2, migration automatique et idempotente des anciens prix en lot de taille 1. |
| 17 08 2026 | Champs de prix modifiables dans le PIP, et non en lecture seule : c'est tout l'intérêt d'avoir la fenêtre devant le HDV. |
| 17 08 2026 | La taille du lot du prix moyen est mémorisée par ressource, pas en réglage global. |
| 17 08 2026 | Correction d'une affirmation antérieure : Firefox 151 a livré l'API Document Picture-in-Picture, Zen en hérite. Le PIP est donc natif, pas un contournement. |
| 17 08 2026 | Hébergement retenu : GitHub Pages, déploiement automatique au push. Débloque l'OCR, que `file://` interdisait. |
| 17 08 2026 | Le dépôt git ne doit vivre dans aucun dossier synchronisé, Dropbox comme rclone : deux machines écrivant dans le même `.git` finissent par le corrompre. Git est la synchro, une seconde couche n'apporte que le risque. |
| 17 08 2026 | Prix non synchronisés entre Mac et PC, assumé : le jeu tourne quasi exclusivement sur le PC. |
| 18 08 2026 | Prix communautaires de dofus-calculator.fr intégrés en lecture seule, serveur Brial uniquement. Ils remplissent les trous, jamais la base personnelle : un prix emprunté ne doit à aucun moment pouvoir se faire passer pour un prix vérifié, ni l'écraser. |
| 18 08 2026 | La fraîcheur d'un prix communautaire est affichée au même titre que son montant. La base contient des relevés de plusieurs mois, un chiffre sans sa date y est trompeur. |
| 18 08 2026 | Le vert « lot retenu » reste réservé aux prix saisis par Brice. Un coût assis sur le communautaire se signale en bleu pointillé, jamais en vert : superposer les deux signaux rendrait le tableau illisible. |
| 18 08 2026 | Fichier unique conservé malgré la croissance. Un découpage en modules ES casserait l'ouverture en `file://`, qui reste le mode d'usage courant. Le nettoyage a porté sur la duplication réelle, les cellules de prix étant désormais fabriquées une seule fois pour les deux fenêtres. |
| 18 08 2026 | **Décision précédente renversée le même jour.** Le fichier unique est abandonné au profit d'un site statique en modules ES, l'objectif d'usage entre Mac et PC passant par une URL commune. `file://` ne charge pas les modules, d'où `outils/servir.js` pour le développement local. L'ancien fichier est figé dans `archive/`. |
| 18 08 2026 | **Correction de sémantique.** Le prix de dofus-calculator est un vrai prix unitaire de HDV, pas une moyenne. Il alimente donc la colonne ×1 et entre dans le calcul d'achat par lots, au lieu de rester cantonné à une estimation linéaire. La première intégration se trompait. |
| 18 08 2026 | Seule la colonne ×1 est publiée. L'API ne sait représenter qu'un prix par ressource et par serveur ; fabriquer un prix de lot à partir de lui serait inventer une donnée que personne n'a relevée. |
| 18 08 2026 | Publication automatique à la saisie, et non sur bouton. Justifiée par l'absence de toute limite de fréquence côté API : ni en-tête `RateLimit`, ni 429 documenté. Une faute de frappe se corrige donc immédiatement par ressaisie. Interrupteur global dans les réglages. |
| 18 08 2026 | Le jeton d'écriture n'entre jamais dans le dépôt ni dans l'export JSON. Il vit dans le stockage local, saisi une fois par machine. C'est ce qui autorise un hébergement public : sans jeton, personne ne publie au nom de Brice. |
| 18 08 2026 | La provenance passe par la bordure des champs, la recommandation d'achat par le fond des cellules. Le vert d'entourage est abandonné pour la recommandation : une bordure ne peut pas porter deux significations. |
| 18 08 2026 | La migration ne publie pas les anciens prix ×1. Republier en masse des chiffres non revérifiés serait polluer une base partagée. |
| 18 08 2026 | Défaut corrigé, hérité de la v1 : un export sans `versionDuSchema` héritait du numéro courant lors de la fusion avec l'état par défaut, et sa migration était sautée en silence. La version se lit désormais sur l'objet fourni, avant toute fusion. |
| 18 08 2026 | Publié sur GitHub Pages depuis un dépôt public, <https://qazare.github.io/dofus-craft/>. Le dépôt vit dans `_BVA_/Dev/`, aux côtés des autres projets de code, hors coffre et hors Dropbox. Public assumé : Pages n'existe pas autrement sur un compte gratuit, et rien ici n'est sensible — le jeton n'est pas dans le dépôt. |
| 18 08 2026 | Chantier OCR cadré, voir `prd-ocr-hdv.md`. Deux partis pris : le nom de l'objet n'est pas reconnu par l'OCR, c'est le site qui désigne la ressource attendue ; et une valeur lue est rangée hors de `basePrixDesRessources`, ce qui la rend structurellement inatteignable par la publication et invisible des totaux, sans drapeau à tester nulle part. Rien ne s'écrit avant la mesure du taux de lecture exacte sur cinq captures réelles. |
| 18 08 2026 | **Bug corrigé, publication d'une saisie en cours.** Retirer du DOM un input modifié fait émettre un `change` par le navigateur. Tout redessin survenu pendant la frappe publiait donc la valeur à demi tapée vers la base commune : « 1500 » interrompu après deux touches partait à 15 kamas, cent fois trop bas, visible par tous les joueurs de Brial. Les champs sont désormais marqués obsolètes avant que leur conteneur ne soit vidé, et leur `change` de sortie est ignoré. Trouvé par le test d'interface Playwright, qui signalait deux POST identiques là où un seul était attendu — le doublon n'était que la face visible. |
| 18 08 2026 | **Phase 0 de l'OCR passée : 95 % de lectures exactes au chiffre près, 100 % avec liste blanche. Le chantier démarre.** Mesure sur 20 zones de prix découpées dans 3 captures réelles, détail dans `outils/ocr-phase0/RESULTAT.md`. Trois corrections au cahier des charges : l'agrandissement ×3 est la condition du fonctionnement et non un réglage (sans lui, 5 %) ; le seuillage est retiré, il fait perdre les chiffres clairs sur fond texturé ; la liste blanche se fait après lecture, `Windows.Media.Ocr` n'en ayant pas, et se limite aux sosies du `1` — le symbole kama se collant au nombre, toute autre lettre mappée vers un chiffre fabriquerait des prix. L'espace fine des milliers, principale inquiétude, ne pose aucun problème. Échantillon plus petit que les 5 captures demandées : le chiffre est net mais tient sur peu, à reconfirmer. |
