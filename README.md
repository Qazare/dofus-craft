# Dofus, outils personnels

Deux chantiers indépendants, réunis parce qu'ils servent la même séance de jeu :
rendre le multi-compte tenable sur un écran unique, et arrêter de calculer la
rentabilité des crafts à la calculatrice.

Contrainte commune, non négociable : **rien ne touche aux fichiers du jeu, rien
n'envoie d'entrée clavier ou souris au client, aucune automatisation d'action en
jeu.** Tout ce qui est ici manipule des fenêtres au niveau de Windows ou calcule
dans un navigateur, hors du jeu.

---

## `git pull` en ouvrant, toujours

Ce dépôt est travaillé depuis deux machines, et GitHub est la seule passerelle
entre elles : **le dossier local est presque toujours en retard d'une session.**

```bash
git fetch origin && git status -sb && git pull --ff-only
```

Avant de lire le code, avant de chercher une fonctionnalité, avant de conclure
qu'une chose manque. Le 20 08 2026, faute de ce réflexe, la montée de niveau par
les crafts a été réécrite de zéro alors qu'elle existait déjà, poussée du Mac la
veille et plus aboutie. La règle complète, à destination des agents comme de
Brice, est dans `CLAUDE.md`.

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
- **Chaîne de sous-crafts.** Tout ingrédient qui a lui-même une recette porte un
  bouton `Crafter`, dans la carte de la recette comme dans le tableau. Un clic et
  il n'est plus acheté mais fabriqué : une carte en retrait apparaît sous celle
  qu'elle sert, et ce sont ses propres ingrédients qui entrent dans la liste de
  courses. Trois conséquences, dont aucune n'est cosmétique. Sa **quantité est
  déduite**, jamais saisie : trois Substrats qui demandent chacun une Planche,
  ce sont trois Planches, et rien ne permet d'en chiffrer deux. L'ingrédient
  **sort du panier** du parent, sinon son coût serait compté deux fois, une fois
  à l'achat et une fois par la chaîne. Et il **n'a pas de destination** : un
  maillon intermédiaire ne se vend pas, son coût remonte jusqu'à la tête, qui
  est la seule à porter un prix de vente. Sur chaque sous-craft, l'écart entre
  son coût de fabrication et son prix au HDV donne l'arbitrage *le crafter ou
  l'acheter*. Une ressource déjà produite plus haut dans la même branche est
  refusée, ce qui ferme la porte aux chaînes sans fin — Dofus a des recettes qui
  se citent en cascade.
- **Métier et niveau requis**, en pastille à côté de chaque objet craftable. Ce
  qui dit qu'une chaîne passe du bûcheron à l'alchimiste et revient, donc si elle
  est faisable aujourd'hui. Servi par un fichier du dépôt, pas par une API — voir
  la section des sources ci-dessous.
- **Cliquer un nom le copie.** Dans les cartes, dans le tableau, dans la fenêtre
  flottante. Le nom part tel quel dans la barre de recherche du HDV, où une faute
  d'accent ne renvoie rien. Le nom seul, sans les pastilles qui l'entourent.
- **Largeur bornée.** L'interface est en colonne unique et plafonnée à `150ch`,
  environ 1 320 px. Sur un 4K, une page étirée de bord à bord rend le tableau
  illisible : l'œil perd la ligne entre le nom d'une ressource et son coût.
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
- **Trois destinations par craft, et trois façons de compter.** *Pour mes persos* :
  aucun revenu, aucune taxe, et le coût compté à part — un objet gardé n'est pas
  une perte, c'est une acquisition, et le seul arbitrage qui vaille est son prix
  au HDV. *Revente à l'unité* : l'équipement, que le HDV liste pièce par pièce
  puisque ses jets de stats diffèrent tous. *Revente par lot* : pains, potions,
  ressources de métier, qui s'empilent au HDV par 1, 10, 100 et 1000. La
  destination est proposée d'après la famille de l'objet, et reste modifiable.
- **Écoulement de la production, en vente par lot.** Le revenu vient du meilleur
  découpage en lots, par la même programmation dynamique que l'achat mais
  retournée. Avec une asymétrie qui change tout : à l'achat on peut prendre plus
  que nécessaire, à la vente on ne peut pas vendre plus qu'on n'a crafté. Le
  partitionnement est donc exact, et ce qu'aucun lot ne permet d'écouler est
  annoncé **invendu** plutôt que supposé vendu — sans prix ×1, un reliquat de 7
  sur un lot de 10 ne rapporte rien, et le dire évite de croire à une
  rentabilité qui repose sur une vente impossible.
- **Recherche dans trois familles d'objets.** Équipements, consommables et
  ressources, interrogés ensemble. Chercher un pain ne renvoyait rien jusqu'ici,
  alors que c'est un craft de paysan ordinaire.
- **Quarantaine des prix lus par OCR.** Un chiffre venu de la machine se range
  dans `prixOcrEnAttente`, jamais dans `basePrixDesRessources`. Il est donc
  invisible des totaux et inatteignable par la publication, sans qu'aucun
  drapeau n'ait à être testé nulle part. Une coche est son seul passage vers la
  base : un clic, il devient violet et part vers dofus-calculator si c'est un ×1.
- **Deux listes de ressources, pas une.** « À acheter » est la liste de courses,
  celle qu'on suit au HDV ; ce qu'un atelier de la session produit n'y a rien à
  faire, il ferait acheter ce qu'on fabrique. Ces objets passent dans « craftées
  sur place », où les champs de prix restent saisissables — ce prix-là est celui
  auquel l'objet se vend, donc la moitié de l'arbitrage *le crafter ou l'acheter*,
  l'autre moitié étant son coût de fabrication, affiché à côté.
- **L'XP par craft est calculée, il n'y a plus rien à relever.** C'est la formule
  du client Dofus, recopiée de `Item.getCraftXpByJobLevel` :
  `floor(20 × niveauRecette / (écart^1,1 / 10 + 1) × ratio / 100)`. Le `ratio`
  est le `craftXpRatio` des fichiers du jeu, porté par l'objet ou, à défaut, par
  son type, et il voyage désormais dans `metiers-par-recette.json`. Ajoute une
  recette, saisis ton XP cumulée de métier, le chiffre est là.
  - C'est ce ratio qui manquait quand on avait conclu qu'**aucune formule ne
    donnerait l'XP de base**. L'Essence de Batofu est une « Essence de gardien de
    donjon », à 20 % ; la Potion de Soin est une « Potion », à 5 %. Quatre fois
    moins, exactement le rapport de 160 à 40 qu'on ne savait pas expliquer.
  - Il apprend aussi ce qu'aucun relevé n'aurait donné sans crafter pour rien :
    **87 recettes ont un ratio nul** et ne rapportent jamais d'XP.
  - Le champ « XP par craft » **reste, en secours** : laissé vide l'XP est
    calculée, un chiffre saisi prime. Le calibrage par deux relevés d'XP cumulée
    fonctionne toujours et remplit ce champ.
- **Objectif en niveaux à gagner, et la quantité se remplit toute seule.** `+1`,
  `+10`, `+20` : le compte de crafts se fait **palier par palier**, en
  recalculant l'XP à chaque niveau gagné, puis **il est écrit dans la quantité du
  craft** — donc dans la liste de courses, donc dans le coût. Le compte par
  paliers n'est pas un raffinement : diviser l'XP restante par l'XP d'un craft
  donne toujours une réponse trop optimiste, puisque la recette rapporte moins à
  chaque niveau. La ligne annonce aussi le niveau où la recette s'éteint. Taper
  une quantité à la main reprend la main sur l'objectif.
- **Aucun chiffre inventé quand un prix manque.** Une ressource sans prix
  comptait pour zéro : le coût sortait trop bas, le profit trop haut, et
  « crafter fait gagner 12 k par unité » s'affichait sur une recette dont rien
  n'était chiffré. Désormais, un coût partiel est annoncé comme tel — « au moins »
  sur les coûts, « au plus » sur les gains — et l'arbitrage *crafter ou acheter*
  se tait plutôt que de comparer une moitié de coût à un prix de HDV. Quand aucun
  prix n'est connu, il n'y a plus de chiffre du tout, seulement « calcul
  impossible ».
- **La fenêtre PIP est une liste de courses.** Une ligne par ressource : la case
  à cocher, la quantité, le nom copiable, **le panier tel qu'il se tape au HDV**
  (`2 × 100 + 1 × 10`, surachat compris), le prix ×1 saisissable et le coût. Le
  compte de ce qui reste et les kamas à sortir sont en haut. Les cases cochées ne
  survivent pas à la fermeture : une liste de courses vaut pour une sortie.
- **Taxe HDV de 2 %**, modifiable.
- **Mémoire locale.** Prix, XP par recette et cache des noms d'objets restent
  dans le navigateur, avec export et import JSON. Aucun compte, aucun serveur.

### Les deux API appelées

| API | Sert à | Clé |
|---|---|---|
| **DofusDude** `api.dofusdu.de` | Recettes, noms, icônes | aucune |
| **dofus-calculator.fr** `/api` | Prix HDV relevés par les joueurs, lecture et écriture | aucune en lecture, jeton en écriture |

Et un fichier du dépôt, `calculateur/donnees/metiers-par-recette.json`, pour ce
qu'aucune API ne donne : le métier et le niveau requis d'une recette.
DofusDB reste écarté, y compris pour le métier : sa licence LPNC-IA interdit les
projets majoritairement produits par une IA.

**Le métier ne vient donc d'aucune API, mais d'un fichier du dépôt.** Aucune de
celles qui sont joignables ne porte la donnée, et ce n'est pas une supposition :
le schéma `Recipe` officiel de DofusDude ne compte que trois champs — identifiant
de l'ingrédient, sous-type, quantité — et ni `/jobs` ni `/recipes` n'existent
chez lui ; Dofapi n'a pas le renseignement non plus, et son hôte refuse les
connexions. `calculateur/donnees/metiers-par-recette.json` est extrait de
**[Datafus](https://github.com/bot4dofus/Datafus)**, la base de Dofus tirée des
fichiers du jeu et publiée sous **licence MIT**. Fabriqué par
`outils/extraire-les-metiers.js`, versionné, à rejouer à chaque extension qui
ajoute des recettes : 4 402 recettes pour 70 Ko.

Trois bénéfices que l'appel réseau n'avait pas. Le fichier est servi par le même
hébergeur que le reste du site, donc il ne peut pas tomber tout seul, et ne pose
ni question de CORS ni de quota. Il est complet dès le premier chargement, là où
un appel ne renseignait que les ressources déjà en session. Et il fonctionne
hors ligne.

La composition d'un craft, elle, continue de venir intégralement de DofusDude,
qui porte seul les `item_subtype` sans lesquels un ingrédient n'est ni nommable
ni illustrable. Le fichier dit **qu'il** y a une recette, jamais laquelle : une
source par question, jamais deux sources pour la même.

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
| `arbre-de-crafts.js` | Structure de la chaîne, quantités déduites, ordre de calcul. Pur. |
| `xp-metier.js` | Formule d'XP, régression, montée palier par palier. Pur. |
| `xp-session.js` | Ce que l'XP devient une fois branchée sur l'état de la session, calibrage par écart de deux relevés compris. |
| `analyse.js` | Agrégation de la session et quote-part par objet. |
| `api-dofusdude.js`, `api-prix.js`, `metiers.js` | Les trois accès réseau, et eux seuls. |
| `journal.js` | Bandeau d'état. Rien ne part au réseau en silence. |
| `cellules-de-prix.js` | Fabriques de cellules, partagées par les deux fenêtres. |
| `vente.js` | Destination d'un craft, champs de vente, écoulement par lot. |
| `cartes-de-craft.js` | En-tête, pastille de métier, liste des ingrédients d'une recette. |
| `presse-papier.js` | Copie d'un nom, avec repli et retour visuel. |
| `ingestion-ocr.js` | Lecture du format d'échange de l'OCR. Pur, sans DOM. |
| `quarantaine.js` | `prixOcrEnAttente`, et l'unique passage vers la base personnelle. |
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
1. ~~**Vente par lot.**~~ Réglé le 18 08 2026, avec la destination du craft.
1 bis. ~~**Dépendance à dofusdb pour le métier.**~~ Réglé le 20 08 2026 : la
   donnée vient de Datafus, en MIT, figée dans un fichier du dépôt. Aucun appel
   à un tiers, et la question de licence ne se pose plus.
2. ~~**Formule d'XP de craft.**~~ Réglée pour de bon le 21 08 2026, non par un
   raisonnement mais par **la source** : `Item.getCraftXpByJobLevel`, dans le
   client Dofus décompilé.

   ```
   basicXp = 20 × niveauRecette / (écart^1,1 / 10 + 1)
   xp      = floor(basicXp × craftXpRatio / 100)
   ```

   Les six relevés de Brice tombent tous EXACTEMENT, au point près, alors
   qu'aucun n'a servi à l'établir. Le `craftXpRatio` se lit sur l'objet, se
   replie sur son type, et vaut 100 à défaut.

   **Ce que cet épisode apprend.** On avait écrit ici qu'aucune formule ne
   donnerait l'XP de base, parce que trois recettes de niveau 40 du même métier
   rapportaient 160, 40 et 80 XP. Le raisonnement était juste, la prémisse était
   incomplète : il manquait une colonne du schéma `Items`, que l'extraction allait
   déjà chercher pour autre chose. « Aucune formule ne peut donner ce chiffre »
   se déduisait de trois mesures et d'un schéma lu à moitié — et une conclusion
   d'impossibilité mérite d'être vérifiée contre la source avant d'être écrite.

   Le calibrage par relevé n'est pas jeté pour autant : il **prime** sur le
   calcul quand il existe. La formule vient d'un client décompilé, une mise à
   jour du jeu peut l'écarter, et une mesure réelle doit pouvoir reprendre la
   main. Ce qui déduit un **ratio** et non une XP figée : le ratio ne dépend pas
   du niveau, donc l'observation continue de se projeter juste.

2 bis. ~~**La table d'XP par niveau de métier.**~~ Réglée le 20 08 2026, et par
   la mesure. Un palier coûte `20 × niveau`, donc atteindre le niveau L demande
   `10 × L × (L−1)` XP en tout : 16 400 pour le 41, 398 000 pour le 200. Vérifié
   sur le simulateur de duffus (20 au niveau 1, 800 au 40, 1 000 au 50, 2 000 au
   100, 3 000 au 150, 3 980 au 199) et recoupé avec le jeu : Alchimiste 40 avec
   15 769 XP, niveau 41 annoncé à 16 400.

   La table dérivée à la main de la table historique 1-100 et du devblog de la
   refonte annonçait 8 347 XP au niveau 40 là où le jeu en demande 15 600. Le
   raisonnement était défendable et il était faux — rien ne remplace une mesure.
   Plus de fichier de données ni d'interpolation : deux multiplications.

2 ter. ~~**Le coefficient de régression.**~~ Tranché le 21 08 2026, par la même
   source. Ce n'est **pas** la linéaire `1 − écart/100` qu'on appliquait, c'est
   `1 / (écart^1,1 / 10 + 1)` — l'autre formule du forum, celle qu'on avait
   écartée. L'écart n'est pas cosmétique : à trente niveaux, la linéaire annonce
   70 % de l'XP là où le jeu en donne 19 %. Tout le chiffrage d'une montée sur
   plusieurs paliers en était faussé, et toujours dans le sens optimiste.

   L'argument qui avait fait retenir la linéaire — la régularité des XP de base
   déduites des trois relevés du métier 89 — reposait sur une coïncidence, comme
   on le soupçonnait déjà. Il reposait en plus sur un niveau de métier noté d'un
   cran à côté : ces relevés sont au métier 90, seule lecture qui les rende tous
   exacts, l'autre exigeant un écart négatif.

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
| 21 08 2026 | **L'XP par craft ne se relève plus : elle se calcule, avec la formule du jeu.** `Item.getCraftXpByJobLevel`, dans le client décompilé, donne `floor(20 × niveauRecette / (écart^1,1 / 10 + 1) × craftXpRatio / 100)`. Les six relevés de Brice y tombent tous au point près sans qu'aucun ait servi à l'établir. Le `craftXpRatio` — un champ des fichiers du jeu, porté par l'objet ou par son type — est ce qui manquait quand on avait conclu qu'aucune formule ne donnerait l'XP de base : l'Essence de Batofu est à 20 %, la Potion de Soin à 5 %, et voilà le rapport de 160 à 40 qu'on croyait inexplicable. `extraire-les-metiers.js` lit maintenant `Items` et `ItemTypes` en plus de `Recipes` et écrit le ratio en troisième élément, omis quand il vaut 100 : +4 Ko sur un fichier de 73. **Deux corrections de fond.** La régression n'était pas la linéaire `1 − écart/100` mais `1 / (écart^1,1 / 10 + 1)` — à trente niveaux d'écart, 19 % de l'XP et non 70 %, donc toute montée sur plusieurs paliers était chiffrée trop optimiste. Et 87 recettes ont un ratio nul : elles ne rapportent jamais rien, ce qu'aucun relevé n'aurait appris sans crafter pour rien. Le calibrage manuel reste, en secours, et prime sur le calcul ; il déduit désormais un ratio et non une XP figée, ce qui le rend projetable. |
| 21 08 2026 | **Les objectifs `+1`/`+10`/`+20` ne remplissaient la quantité que par le chemin automatique.** Le champ « Vue au niveau » restait vide tant qu'aucune XP n'était enregistrée, avec pour seul indice de saisie le niveau de la RECETTE. Taper l'XP par craft et valider — le geste évident — enregistrait donc une observation sans niveau, que rien ne peut projeter : la recette restait « pas encore calibrée » et l'objectif n'écrivait aucune quantité, sans que le champ coupable soit désigné nulle part. Le niveau est maintenant pré-rempli avec celui du métier maintenant, écrit et non suggéré, et un champ vidé y retombe plutôt que de s'enregistrer à `null`. Le test d'interface ne couvrait que le calibrage par deux relevés, qui remplit les deux champs et masquait le défaut ; il couvre désormais le chemin manuel. |
| 20 08 2026 | **L'XP par craft ne se saisit plus, elle se mesure. Schéma 8.** L'écart entre deux relevés d'XP cumulée, divisé par le nombre de crafts faits entre les deux, EST l'XP par craft : `dernierReleveDXPParMetier` garde l'avant-dernier relevé, la carte du métier propose d'attribuer le gain, un clic calibre la recette. C'est la réponse à « comment le jeu fait-il ? » — il ne fait rien de plus que compter l'XP totale, c'est nous qui devions apprendre à la lire. Les objectifs deviennent des niveaux À GAGNER, `+1`, `+10`, `+20`, et **remplissent la quantité du craft** — ils l'affichaient sans jamais l'écrire, donc ils ne servaient à rien. Un prix manquant n'est plus compté pour zéro en silence : coûts annoncés « au moins », gains « au plus », arbitrage crafter-ou-acheter muet plutôt que faux, et « calcul impossible » quand aucun prix n'est connu. La fenêtre PIP devient une liste de courses cochable, avec le panier à taper au HDV. Au passage, un défaut hérité du schéma 7 : `experienceParCraft` avait disparu de l'état mais était encore multiplié dans l'analyse, ce qui donnait `NaN` et faisait disparaître la case « coût par point d'XP ». |
| 20 08 2026 | XP de métier : XP de base calibrée par un relevé unique plutôt que devinée — les relevés d'Alchimiste montrent qu'elle est propre à chaque recette et qu'aucune formule ne la donnera. Objectifs de niveau comptés palier par palier. Courbe des niveaux mesurée, `10 × L × (L−1)`, qui remplace une table dérivée à la main et fausse d'un facteur deux. Coefficient de régression toujours non confirmé, et signalé comme tel. Les ressources craftées sur place quittent la liste de courses pour une liste à part, prix toujours saisissables. |
| 20 08 2026 | Chaîne de sous-crafts, avec quantités déduites et coût qui remonte la branche. Métier et niveau requis extraits de Datafus, en MIT, dans un fichier versionné plutôt que par un appel — aucune API ne porte cette donnée, DofusDB reste écarté. Largeur bornée à `150ch`, et copie d'un nom au clic. |
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
| 18 08 2026 | **Trois destinations par craft plutôt qu'un prix de vente unique.** Un objet crafté pour ses persos n'a pas de revenu et ne doit pas peindre la session en rouge : son coût est compté à part. L'équipement se vend à l'unité, le HDV le listant pièce par pièce puisque ses jets de stats diffèrent. Pains, potions et ressources de métier se vendent par lot, comme ils s'achètent. La destination est proposée d'après la famille de l'objet, jamais imposée. |
| 18 08 2026 | **La vente par lot n'est pas l'achat en miroir exact.** À l'achat, prendre plus que nécessaire reste une ressource gardée, d'où le surachat. À la vente, on ne peut pas vendre plus qu'on n'a crafté : le partitionnement est exact et le reliquat reste invendu. Le calcul l'annonce au lieu de l'arrondir au lot supérieur — un revenu supposé sur une vente impossible fausserait la décision de crafter. |
| 18 08 2026 | Recherche étendue aux consommables et aux ressources, à côté des équipements. La vente par lot n'aurait rien eu à calculer autrement : ce qui s'empile au HDV, ce sont précisément les objets que la recherche ne trouvait pas. Les trois appels partent ensemble, une famille en échec est ignorée plutôt que de faire échouer la recherche. |
| 18 08 2026 | **Quarantaine de l'OCR, schéma 5.** Un prix lu par la machine va dans `prixOcrEnAttente`, jamais dans la base personnelle. La garantie est structurelle et non déclarative : la publication et les totaux lisent la base, ils ne voient donc rien de la quarantaine sans une ligne de code modifiée. Le seul passage est la confirmation humaine — une coche dans le tableau, ou Entrée dans la revue. Exclue de l'export JSON, au même titre que le jeton. |
| 18 08 2026 | **Phase 1 de l'OCR : pas de calibration, des ancres.** Le cahier des charges prévoyait quatre rectangles réglés une fois par résolution. On repère plutôt le popup par la paire d'en-têtes « Lot » et « prix », puis chaque rangée par son libellé de lot. Un rectangle figé se décale dès que l'interface bouge d'un pixel ; une ancre suit le popup où qu'il soit, et rien n'est à refaire en changeant d'écran. Vérifié sur les trois captures réelles : les quatre prix, le prix moyen et le nom sont lus juste, fenêtre entière comprise. |
| 18 08 2026 | **Deux passes d'OCR, et la seconde n'est pas un luxe.** La première lit l'image entière et sert seulement à trouver le popup. La seconde le relit seul, agrandi ×3 : sur une capture de fenêtre entière, la passe large rate les libellés de lot les plus fins — `1` et `10` absents, `100` et `1 000` présents — et la moitié des prix se perdait avec eux. |
| 18 08 2026 | **Bornes de cohérence entre lots corrigées, elles criaient au loup.** Un lot de 10 valant moins de dix fois l'unité est la situation normale au HDV, c'est même la raison d'acheter en lot : 490 l'unité contre 1 300 les dix, relevé réel. La borne basse vaut donc un cinquième de la taille du lot et non la taille elle-même. Bornes rejouées à l'identique côté site et côté script. |
| 18 08 2026 | Touches de la relève fixées à `F6` et `F7`, avec `Maj` et `Ctrl` pour les variantes. `F8` et `F9` gèrent les affichages, `F1` appartient à Windows. Actives seulement quand Dofus est au premier plan : ailleurs les touches retrouvent leur comportement normal. |
| 20 08 2026 | **L'identifiant de ressource devient facultatif dans le relevé OCR, et c'est le cas courant.** Le script de relève lit des pixels, il ne connaît pas la base d'objets d'Ankama : il laisse la colonne vide. L'exiger faisait rejeter en bloc toutes les lignes réelles. C'est le nom qui désigne alors la ressource, confronté à la liste FERMÉE des ressources de la session — quelques dizaines de noms, jamais un dictionnaire. Un nom ambigu n'est pas tranché au hasard : deux candidates, on n'attribue rien plutôt que de coller un prix sur la mauvaise ressource. |
| 20 08 2026 | Bande de collage visible au-dessus des résultats. Le `Ctrl+V` global fonctionnait, mais rien ne le disait : un raccourci invisible n'est pas une interface. Sa zone de repli sert quand un champ avale le collage. |
| 20 08 2026 | **Rappel des crafts dans la fenêtre flottante, au-dessus de la liste de courses.** La liste agrège les ressources de toutes les recettes — c'est ce qu'il faut devant le HDV, mais elle perd ce qu'on est venu faire : trois pains différents se partagent le blé. Le rappel redit chaque recette et sa quantité, trié par niveau croissant. L'ordre n'est pas décoratif : la surcharge de poids interdit de porter toutes les ressources d'un coup, il faut faire les crafts dans un ordre, et l'ordre utile est celui des niveaux. |
| 20 08 2026 | **Un `git pull` manquant a fait réécrire de zéro une fonctionnalité qui existait.** La montée de niveau par les crafts a été refaite côté PC, moins bien, alors que le Mac l'avait poussée la veille. Le `push` rejeté l'a révélé trop tard. D'où `CLAUDE.md` à la racine : tirer avant de répondre, avant même de chercher. Seule consolation, les deux versions s'accordaient sur la courbe d'XP, `10 × n × (n−1)`. |
