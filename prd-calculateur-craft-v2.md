# PRD v2 - Calculateur de craft Dofus, évolution

Statut : proposition, en attente de validation
Date : 17 08 2026
Base : `calculateur-craft-dofus.html`, état fonctionnel en usage.

Trois évolutions demandées, indépendantes les unes des autres. La troisième
est bloquée par une contrainte technique, détaillée en section 5.

---

## 1. Problème

1. **Le champ Prix moyen ment sur son unité.** Il attend un prix unitaire alors
   que le HDV affiche un prix de lot. La division mentale que l'outil devait
   supprimer, on la refait sur cette colonne précise.
2. **La saisie reste fastidieuse.** Cinq champs par ressource, dix à quinze
   ressources par session, tapés à la main à chaque revérification de prix.
3. **Pas de vue flottante.** L'outil vit dans une moitié de fenêtre. Pendant
   qu'on est dans le HDV plein écran, il disparaît.

## 2. Critères de succès

1. Aucun calcul mental sur aucun champ de prix, quelle que soit la colonne.
2. Une session dont tous les prix datent est revérifiée en moins d'une minute.
3. La saisie de prix est possible sans quitter le jeu des yeux plus de deux
   secondes d'affilée.

---

## 3. Chantier A, prix moyen par lot

**Décision retenue :** le champ Prix moyen reçoit le montant du lot tel
qu'affiché, accompagné d'un sélecteur de taille de lot (1, 10, 100, 1000) sur
la même cellule. L'outil divise seul pour obtenir l'unitaire d'estimation.

### Modèle de données

`basePrixDesRessources[id]` passe de :

```
{ prixMoyenUnitaire: 500 }
```

à :

```
{ prixMoyenDuLot: 50000, tailleDuLotDuPrixMoyen: 100 }
```

### Migration

Les prix déjà en base sont des unitaires. Au chargement, toute fiche portant
`prixMoyenUnitaire` sans `prixMoyenDuLot` est convertie en
`{ prixMoyenDuLot: <valeur>, tailleDuLotDuPrixMoyen: 1 }`, ce qui préserve la
valeur à l'identique. Conversion faite une fois, marquée par un numéro de
version dans l'état, `versionDuSchema: 2`.

**Irréversible côté navigateur** une fois la sauvegarde écrite. Recommandation :
un export JSON avant de remplacer le fichier. C'est le seul point de cette
évolution qui ne se rejoue pas en arrière.

### Affichage

La colonne Coût, en mode estimation, affiche le coût du lot total nécessaire,
et non plus un montant dérivé d'un unitaire invisible. Le prix unitaire déduit
reste lisible en info-bulle, pour comparer avec les colonnes de lot.

**Hors périmètre :** le prix moyen ne participe pas à la programmation
dynamique. Il reste une estimation de repli, comme aujourd'hui.

---

## 4. Chantier B, alternatives à la saisie

### B1, revalidation en masse des prix anciens

Retenu, sans réserve technique. Un bouton `Revérifier les prix` passe en revue
les ressources de la session dont le prix dépasse le seuil d'ancienneté, une à
la fois, en grand, au clavier : `Entrée` confirme le prix tel quel et rafraîchit
son horodatage, une saisie chiffrée le corrige, `Échap` sort. Rien d'autre à
l'écran pendant ce passage.

C'est la moitié du gain visé, pour un dixième du risque de B2.

### B2, coller une capture du HDV et laisser un OCR remplir

Retenu sur le principe, **bloqué techniquement**, voir section 5.

Fonctionnement visé : `Ctrl+V` d'une capture du HDV n'importe où dans la page.
L'image est découpée, les couples quantité/prix sont lus, et les champs
correspondants sont pré-remplis **en attente de validation**, jamais écrits
directement en base. Une ligne mal lue se corrige à la frappe.

Contrainte de conception non négociable : un OCR se trompe. Toute valeur issue
de l'OCR est affichée dans un état visuellement distinct tant qu'elle n'est pas
confirmée, et n'entre dans aucun total avant confirmation. Un prix faux et
silencieux coûte plus cher que pas de prix du tout.

### Écartées

- **Coller un bloc de texte** : le HDV n'est pas sélectionnable, il faudrait
  retaper le texte, donc aucun gain sur la saisie directe.
- **Navigation clavier optimisée** : partiellement absorbée par B1, et le vrai
  goulot est la lecture à l'écran, pas la frappe.

---

## 5. Point bloquant sur B2

Tesseract.js, le seul OCR sérieux qui tourne dans un navigateur sans serveur,
s'exécute dans un Web Worker. **Firefox refuse de créer un Web Worker depuis une
page ouverte en `file://`**, l'origine y étant `null`. L'outil étant précisément
un fichier ouvert depuis le disque, l'OCR ne peut pas démarrer en l'état.

Trois issues, par ordre de préférence :

1. **Servir le dossier en local.** Un raccourci qui lance
   `python3 -m http.server` sur le dossier et ouvre `http://localhost:8000/`.
   L'outil devient une page servie, les workers passent, le stockage local
   change d'origine et **les prix déjà enregistrés en `file://` ne suivent pas** :
   il faut exporter avant, importer après. Coût : un raccourci à double-cliquer
   au lieu du fichier, une fois par session de jeu.
2. **Reporter B2** et livrer A, B1 et C maintenant. B2 reste écrit, à décider
   plus tard.
3. **Abandonner B2.** La revalidation en masse couvre déjà l'essentiel de la
   gêne, sans dépendance ni faux positifs.

Ce choix t'appartient, je ne le tranche pas à ta place. Il change la façon dont
tu ouvres l'outil tous les jours, ce n'est pas un détail d'implémentation.

Deuxième réserve, indépendante de la première : la fiabilité de l'OCR sur les
captures réelles du HDV n'est pas démontrée. Avant d'écrire une ligne de B2, il
me faut **deux ou trois captures d'écran réelles** de l'interface d'achat du HDV,
à ta résolution, pour vérifier que les chiffres sont lisibles. Si ce n'est pas
concluant sur ces captures, B2 s'arrête là.

---

## 6. Chantier C, mode PIP

**Correction d'une erreur de ma part :** j'ai avancé que Firefox n'avait pas
l'API Document Picture-in-Picture. C'est faux depuis Firefox 151, qui l'a
livrée. Zen en hérite, ce qui explique que le PIP de duffus fonctionne chez toi.
L'API native est donc utilisable directement.

Un bouton `PIP` ouvre une fenêtre flottante, toujours au premier plan, contenant
une **vue compacte** : le bandeau de résultats et le tableau des ressources
réduit aux colonnes nom, quantité, prix, coût. La recherche de recette, les
cartes de craft et les réglages restent dans la fenêtre principale.

Point structurel : la vue PIP n'est pas un clone. Elle partage le même état et
les mêmes fonctions de calcul, un seul rendu alimente les deux fenêtres. Une
valeur saisie dans le PIP est écrite en base et se reflète immédiatement dans
la fenêtre principale, et l'inverse.

Repli : si `documentPictureInPicture` est absent, le bouton ouvre une popup
`window.open` classique, sans premier plan garanti, plutôt que de ne rien faire.

**Question ouverte :** les champs de prix doivent-ils être éditables dans le
PIP, ou la vue est-elle en lecture seule ? Éditable est plus utile et double la
surface de bugs de synchronisation. Mon avis : éditable, c'est tout l'intérêt
d'avoir la fenêtre devant le HDV.

---

## 7. Plan

| Phase | Contenu | Dépend de |
|---|---|---|
| A | Prix moyen par lot, migration, tests du moteur mis à jour | rien |
| B1 | Revalidation en masse des prix anciens | rien |
| C | Mode PIP, vue compacte, état partagé | A |
| B2 | OCR de capture HDV | décision section 5 + captures réelles |

Vérification à chaque phase : `node outils/test-moteur-calcul.js` passe, plus un
cas de migration chiffré à la main sur une base de prix existante.

## 8. Questions ouvertes

1. Issue retenue en section 5, parmi les trois.
2. Champs éditables ou non dans le PIP.
3. Le sélecteur de taille de lot du prix moyen : mémorisé par ressource, ou un
   réglage global unique pour toute la session ? Par ressource est plus juste,
   global est plus rapide à saisir.
