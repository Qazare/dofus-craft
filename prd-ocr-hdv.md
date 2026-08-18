# OCR des prix du HDV, cahier des charges

**État : plan validé sur le papier, phase 0 non faite. Rien n'est écrit tant
que la phase 0 n'a pas dit oui.**

Objectif : remplacer la saisie manuelle des quatre prix de lot par une touche.
Rien d'autre. Le calcul, l'arbitrage des lots et la publication ne changent pas.

---

## Ce que vaut la méthode proposée

L'analyse de départ est juste sur le fond, et sa ligne de partage est la bonne :
**lire des pixels que tu affiches déjà n'a rien à voir avec écouter le réseau du
jeu ou lui envoyer des clics.** Les CGU visent l'automatisation d'actions en jeu
et l'interception de protocole. Une capture d'écran ne fait ni l'un ni l'autre,
et c'est exactement la contrainte déjà posée en tête du README de ce dossier.

Trois points où elle reste trop optimiste, et qui décident de la faisabilité :

1. **Elle suppose que l'OCR lit bien.** Rien ne le garantit sur des chiffres
   fins, séparés par des espaces de milliers, posés sur un fond texturé. C'est
   la seule inconnue qui compte, et elle se tranche en une demi-heure sur cinq
   captures réelles. D'où la phase 0 ci-dessous : tout le reste du chantier en
   dépend et ne commence pas avant.
2. **Elle propose d'OCR le nom de l'objet.** À éviter. Reconnaître un nom propre
   en texte libre est le problème le plus dur du lot, et il est **inutile** :
   le calculateur sait déjà sur quelle ressource il attend un prix, sa revue
   avance ressource par ressource. C'est le site qui désigne la cible, pas
   l'OCR. Le nom n'est lu que comme garde-fou, et confronté à la liste fermée
   des ressources de la session, jamais au dictionnaire.
3. **Elle passe vite sur Tesseract.** Sous Windows 11, `Windows.Media.Ocr` est
   déjà installé, s'appelle depuis AHK et va plus vite, sans rien à empaqueter.
   Tesseract n'entre en jeu que si la phase 0 le classe nettement devant.

Ce qui reste écarté, et le reste définitivement : lecture des paquets, lecture
des fichiers du client, parcours automatique du HDV, tout envoi d'entrée au jeu.
Un scan qui feuillette les objets tout seul est un bot, même s'il ne lit que des
pixels.

---

## Phase 0, l'épreuve de vérité

Sans code d'intégration, sans AHK. Uniquement :

1. Cinq captures PNG du HDV en conditions réelles, prises pendant une séance
   normale, sur des ressources aux ordres de grandeur différents (un prix à
   trois chiffres, un à sept, un lot de 1000).
2. Passer les zones de prix à `Windows.Media.Ocr` et à Tesseract, avec
   pré-traitement : niveaux de gris, agrandissement ×3, seuillage, liste
   blanche `0123456789`, mode ligne unique.
3. Compter les lectures **exactes au chiffre près**. Pas « proche ».

| Résultat | Décision |
|---|---|
| ≥ 95 % exact | On construit tel que décrit plus bas. |
| 80 à 95 % | On construit quand même, mais en **mode proposition** : l'OCR pré-remplit la revue, Brice corrige au clavier. Même à 85 %, taper trois chiffres au lieu de sept reste un gain. |
| < 80 % | **Le chantier s'arrête.** Un OCR qu'il faut relire intégralement coûte plus cher que la saisie. |

Le seul livrable de cette phase est un chiffre et une décision, consignés dans
le journal du README.

---

## Architecture retenue

```
   Dofus, HDV affiché
          │
          │  (aucun envoi d'entrée, aucune lecture de fichier ou de paquet)
          ▼
   AHK v2 en tâche de fond ── capture des zones calibrées
          │
          ▼
   Windows.Media.Ocr ── chiffres seuls
          │
          ▼
   Contrôles de vraisemblance ──── échec ─► infobulle rouge, RIEN n'est mis en file
          │ succès
          ▼
   File d'attente locale ── infobulle verte, les chiffres lus sont affichés
          │
          │  (Brice bascule sur le calculateur quand il le décide)
          ▼
   Presse-papier ── un seul Ctrl+V pour toute la file
          │
          ▼
   Calculateur ── zone de quarantaine, hors des totaux
          │
          ▼
   Revue au clavier ── Entrée confirme ─► entre dans la base, et alors seulement
```

**La bascule de fenêtre reste manuelle, volontairement.** Un script qui vole le
focus pour coller dans le navigateur marcherait, mais interromprait le jeu à
chaque touche. Mettre en file et tout ingérer d'un coup colle à l'usage réel :
on relève six ressources, puis on va voir le résultat.

---

## Côté Windows, le script AHK

Un script v2 unique, à fusionner à terme avec `Dof.ahk` du chantier 2 — deux
scripts AHK qui se disputent des touches est une source de bugs gratuite.

| Élément | Décision |
|---|---|
| Déclenchement | Une touche, **active seulement quand la fenêtre Dofus est au premier plan** (`#HotIf WinActive`). Choisir une touche non liée en jeu : AHK l'intercepte, le jeu ne la reçoit plus. Les boutons latéraux de souris, déjà réservés au chantier 2, sont les meilleurs candidats. |
| Calibration | Une fois par résolution. Un mode « calibrer » affiche la capture, on trace les quatre rectangles de prix, ils sont enregistrés en pourcentage de la fenêtre du client, pas en pixels absolus. |
| OCR | `Windows.Media.Ocr`, appelé depuis AHK. Pré-traitement identique à celui validé en phase 0. |
| Retour visuel | Une infobulle près du curseur, **toujours**, avec les quatre nombres lus. C'est le premier filtre, et le plus efficace : Brice voit le chiffre avant qu'il n'existe ailleurs. |
| File | En mémoire, recopiée dans le presse-papier à chaque ajout. Une touche pour la vider, une pour retirer la dernière entrée. |
| Journal | Chaque capture écrit le PNG de la zone et le texte brut dans un dossier local. Sans ça, aucune régression d'OCR n'est diagnosticable. |

### Contrôles de vraisemblance, avant la file

Un rejet ici ne coûte rien : Brice reprend la capture ou tape à la main. Un
mauvais chiffre accepté, lui, contamine un calcul.

- Champ vide, ou contenant autre chose que des chiffres et des espaces → rejet.
- Prix nul ou négatif → rejet.
- Prix hors de `[1, 100 000 000]` → rejet.
- **Cohérence entre lots** : le prix d'un lot de 10 doit tomber entre 3 et 30
  fois le ×1, celui d'un lot de 100 entre 30 et 300 fois. Hors bornes, la ligne
  passe en `confiance basse` — elle est mise en file, mais marquée, et la revue
  la présentera en premier. C'est le contrôle qui attrape le chiffre perdu ou en
  trop, l'erreur d'OCR la plus fréquente et la plus coûteuse.
- Les champs absents du HDV à cet instant restent vides. Un lot non proposé
  n'est pas un prix de zéro.

---

## Le format d'échange

Une ligne d'en-tête magique, puis une ligne par ressource, séparateurs
tabulation. Champ vide pour un prix absent.

```
#DOFUS-HDV/1	brial	2026-08-18T14:22:11
289	Blé	125	1200	11000	98000	1250	10	0.93
```

| Colonne | Contenu |
|---|---|
| 1 | `dofusdb_id`, l'identifiant Ankama. Vide si la capture ne vise aucune ressource connue. |
| 2 | Nom lu, garde-fou seulement. |
| 3 à 6 | Prix des lots ×1, ×10, ×100, ×1000, tels que le HDV les affiche. |
| 7, 8 | Prix moyen et taille du lot sur lequel il est affiché. |
| 9 | Confiance, de 0 à 1. |

**L'en-tête magique n'est pas décoratif.** Le calculateur écoute le collage sur
toute la page ; sans signature, un Ctrl+V malheureux irait écrire dans l'état.
Un collage qui ne commence pas par `#DOFUS-HDV/` est ignoré sans un mot.

Le format se tape aussi à la main, ce qui donne gratuitement une voie d'import
en masse depuis un tableur.

---

## Côté site, l'intégration

### La garantie est structurelle, pas déclarative

Un prix issu de l'OCR **n'entre pas dans `basePrixDesRessources`**. Il est rangé
dans `prixOcrEnAttente`, un dictionnaire à part, exactement comme
`prixCommunautairesParRessource` l'est déjà — et pour la même raison, énoncée le
18 08 : un prix emprunté ne doit à aucun moment pouvoir se faire passer pour un
prix vérifié.

La conséquence est la réponse à la question « comment éviter de publier de
mauvaises valeurs » : `api-prix.js` publie depuis la base personnelle et depuis
elle seule. Tant qu'une valeur d'OCR n'y est pas, **elle est inatteignable par la
publication**. Aucun drapeau à ne pas oublier de tester, aucun chemin d'appel à
auditer. Le seul passage de la quarantaine vers la base est la confirmation
humaine dans la revue.

Même raisonnement pour les totaux : `analyse.js` et `moteur.js` lisent la base.
Ils ne voient donc rien de la quarantaine, sans une ligne de code modifiée.

### Modules touchés

| Module | Modification |
|---|---|
| `ingestion-ocr.js` **(nouveau)** | Parseur pur du format, vérification de la signature, contrôles de vraisemblance rejoués côté site. Sans DOM, donc testable dans `outils/test-moteur-calcul.js`. |
| `etat.js` | Schéma 5 : apparition de `prixOcrEnAttente`. Migration vide, comme celle du schéma 3. Exclu de l'export JSON, au même titre que le jeton : une quarantaine n'a pas à voyager. |
| `application.js` | Écoute du collage, appel du parseur, annonce au journal. Seul point de contact avec le document, conformément à l'architecture. |
| `cellules-de-prix.js` | Un quatrième état de bordure, **orange pointillé, valeur OCR non confirmée**, à côté du violet plein, du bleu pointillé et du neutre. La valeur s'affiche en gris dans le champ, jamais comme contenu saisi. |
| `revue.js` | Les ressources en quarantaine passent en tête de file, la valeur OCR pré-remplit le champ, sélectionnée. Entrée confirme et l'écrit en base ; toute frappe la remplace ; Échap la laisse en quarantaine. Les lignes de confiance basse passent avant les autres. |
| `journal.js` | « 6 prix reçus de l'OCR, 6 à confirmer. » Rien n'arrive en silence, comme pour le réseau. |

Aucune modification de `moteur.js`, `analyse.js`, `api-prix.js`. C'est le signe
que le découpage tient.

### Une seule règle d'affichage nouvelle

Le codage existant reste intact : la bordure dit la provenance, le fond dit la
recommandation d'achat. L'orange pointillé s'ajoute au vocabulaire des bordures,
puisque c'est bien une provenance. Une cellule en quarantaine **ne reçoit jamais
de fond de recommandation** : recommander un achat sur un chiffre non vérifié
serait le pire des deux mondes.

---

## Découpage

| Phase | Contenu | Fin quand |
|---|---|---|
| **0** | Cinq captures, mesure du taux de lecture exacte. | Un chiffre au journal, et une décision go / mode proposition / arrêt. |
| **1** | AHK : calibration, capture, OCR, contrôles, infobulle, file, presse-papier. | Une touche produit une ligne correcte dans le presse-papier, vérifiée à l'œil. |
| **2** | Site : parseur, quarantaine, schéma 5, affichage orange, revue. | Un Ctrl+V remplit six ressources sans qu'aucun total ne bouge avant confirmation. |
| **3** | Confort : retrait de la dernière entrée, relecture à deux seuillages pour la confiance, fusion avec `Dof.ahk`. | Au fil de l'usage. |

Les phases 1 et 2 sont indépendantes : le format d'échange se tape à la main,
donc le site se développe et se teste sur le Mac, sans AHK ni Dofus.

---

## Ce qui reste à trancher

1. **La touche.** Dépend des binds en jeu, déjà bloquant pour le chantier 2.
2. **Le mode d'achat du HDV** affiche-t-il les quatre tailles de lot
   simultanément, ou faut-il un onglet par taille ? Si c'est un onglet par
   taille, une capture ne peut pas rendre les quatre prix, et le geste devient
   une touche par onglet. Cela ne remet pas le chantier en cause, mais change
   l'ergonomie. À vérifier sur la première capture de la phase 0.
3. **L'identifiant de la ressource.** Le plus simple est que la file n'en porte
   aucun et que la revue applique les lignes dans l'ordre de sa propre file.
   Plus fragile dès qu'une capture est ratée. À arbitrer une fois qu'on sait ce
   que le nom OCR vaut réellement.
