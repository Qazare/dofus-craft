# Relève des prix du HDV

Phase 1 du chantier OCR : une touche, et les quatre prix de lot du popup ouvert
partent dans le presse-papier. Le calculateur les récupère d'un Ctrl+V.

**Rien ici ne touche au jeu.** Aucune entrée clavier ou souris envoyée, aucun
fichier du client lu, aucun paquet réseau intercepté, aucun parcours automatique
du HDV. On lit des pixels déjà affichés à l'écran, et c'est tout. La ligne est
posée en tête de `prd-ocr-hdv.md`, elle ne bouge pas.

---

## Mise en route

1. **AutoHotkey v2** installé (<https://www.autohotkey.com>). La v1 ne lit pas
   ce script.
2. Double-clic sur `hdv-ocr.ahk`. Une icône apparaît près de l'horloge.
3. Dofus au premier plan, un popup d'objet ouvert au HDV, puis `F6`.

Aucune calibration. Aucun réglage par résolution.

## Les touches

| Touche | Effet |
|---|---|
| `F6` | Lit le popup affiché et l'ajoute à la file |
| `Maj+F6` | Retire la dernière entrée |
| `Ctrl+F6` | Vide la file |
| `F7` | Affiche la file |

L'infobulle reste **7 secondes**. Trop courte pour relire ? `F7` réaffiche toute
la file, prix compris, autant de fois que tu veux — rien n'est perdu si tu la
manques.

**Actives seulement quand Dofus est au premier plan.** Ailleurs, `F6` et `F7`
retrouvent leur comportement normal. `F8` et `F9` sont laissées à la gestion des
affichages, `F1` à Windows. Pour en changer, tout est en haut du `.ahk`.

Le presse-papier est reconstruit à **chaque** changement de file : il n'y a pas
de touche « copier » à ne pas oublier avant de basculer sur le navigateur.

## Ce qui se passe quand tu appuies

```
   Popup d'objet affiché au HDV
          │
          ▼  F6
   AHK capture la fenêtre du jeu, telle qu'elle est à l'écran
          │
          ▼
   lire-le-hdv.ps1
     1. OCR de l'image entière, à sa taille réelle  ──► trouve le popup
        par ses en-têtes « Lot » et « prix »
     2. recadrage sur le popup, agrandissement ×3, second OCR
        ──► lit les chiffres fins que la première passe rate
     3. liste blanche : i, l, I et | deviennent des 1
     4. contrôles de vraisemblance entre lots
          │
          ▼
   Infobulle avec les quatre nombres  ── le premier filtre, et le meilleur :
          │                              tu vois le chiffre avant qu'il n'existe
          │                              ailleurs
          ▼
   File + presse-papier
          │
          ▼  Ctrl+V dans le calculateur, quand tu le décides
   Quarantaine — hors des totaux, non publiable, jusqu'à ta confirmation
```

**Pourquoi deux passes d'OCR.** La première sert à *trouver* le popup, pas à le
lire : ses en-têtes sortent sans difficulté. La seconde relit le popup seul,
agrandi trois fois, parce que sur une capture de fenêtre entière les libellés de
lot les plus fins manquent à l'appel — mesuré le 18 08 : `1` et `10` absents,
`100` et `1 000` présents, et la moitié des prix perdue avec eux.

**Pourquoi pas de calibration.** Le cahier des charges prévoyait des rectangles
réglés une fois par résolution. Les ancres font mieux : elles suivent le popup où
qu'il soit, et rien n'est à refaire quand l'interface bouge d'un pixel ou quand
tu changes d'écran.

## Le format produit

Une ligne d'en-tête, puis une ligne par ressource, tabulations :

```
#DOFUS-HDV/1	brial	2026-08-18T14:22:11
	Ailes de Moskito	994	8998	49999	780000	368	1	0.95
```

| Colonne | Contenu |
|---|---|
| 1 | Identifiant Ankama. **Toujours vide ici** : c'est le calculateur qui sait sur quelle ressource il attend un prix, sa revue avance ressource par ressource. |
| 2 | Nom lu, garde-fou seulement |
| 3 à 6 | Prix des lots ×1, ×10, ×100, ×1000 |
| 7, 8 | Prix moyen, et taille du lot sur lequel il s'affiche |
| 9 | Confiance, de 0 à 1 |

Le format se tape aussi à la main : voie d'import en masse depuis un tableur,
gratuite.

## Les contrôles avant la file

Un rejet ne coûte rien — tu reprends la capture ou tu tapes à la main. Un mauvais
chiffre accepté, lui, contamine un calcul.

- Tout ce qui n'est ni chiffre ni espace est écarté, après la liste blanche.
- Prix hors de `[1, 100 000 000]` : refusé.
- **Cohérence entre lots.** Un lot de 10 doit valoir entre 2 et 30 fois le ×1,
  un lot de 100 entre 20 et 300 fois. Hors bornes, la ligne part quand même mais
  en `confiance basse`, l'infobulle le dit, et la revue du calculateur la
  présentera en premier. C'est le contrôle qui attrape le chiffre perdu ou en
  trop, l'erreur d'OCR la plus fréquente et la plus coûteuse.
- Un champ vide reste vide. **Un lot non proposé par le HDV n'est pas un prix de
  zéro.**

La borne basse est un cinquième de la taille du lot, pas la taille : un lot de 10
moins cher que dix fois l'unité est la situation normale au HDV, c'est même la
raison d'acheter en lot.

## Essayer sans le jeu

Le lecteur tourne sur n'importe quel PNG, ce qui rend toute régression
reproductible :

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File outils/hdv/lire-le-hdv.ps1 -Image outils/ocr-phase0/captures/fenetre-entiere.png -Detaille
```

Chaque capture réelle est aussi écrite dans `journal/`. Sans ça, aucune
régression d'OCR n'est diagnosticable.

## Trois pièges déjà payés

- **`lire-le-hdv.ps1` doit rester en UTF-8 avec BOM.** PowerShell 5.1 lit un
  `.ps1` sans BOM comme de l'ANSI, et le moindre caractère accentué casse alors
  l'analyse syntaxique — avec un message d'erreur qui désigne une ligne parfaitement
  saine, trente lignes plus loin.
- **`HotIf()` en fonction, pas la directive `#HotIf`.** Les raccourcis sont posés
  par `Hotkey()` à l'exécution, et celui-ci ne connaît que le critère fonctionnel.
  Mélanger les deux donne des touches actives partout, navigateur compris.
- **Un minuteur d'infobulle doit passer par une fonction nommée.** Avec une
  fonction anonyme, chaque appel crée un nouvel objet fonction donc un *nouveau*
  minuteur : celui du « Lecture… » survit et vient effacer le résultat une
  seconde plus tard. Symptôme : les prix s'affichent puis disparaissent trop vite
  pour être lus, d'autant plus vite que la lecture a été longue.
- **`file` est un nom réservé en AHK v2**, celui de la classe `File`. Le script
  refuse de se charger, avant même la première touche, sur un message qui ne dit
  pas que le nom est pris : *This Class cannot be used as an output variable*.
  D'où `fileDAttente`. Même prudence avec `Gui`, `Menu`, `Map`, `Object`, `Error`.
