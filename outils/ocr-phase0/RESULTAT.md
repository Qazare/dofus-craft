# Phase 0 de l'OCR du HDV, résultat

**Mesuré le 18 08 2026 sur le PC. Verdict : 95 % de lectures exactes au chiffre
près, 100 % avec liste blanche. Le seuil de construction du cahier des charges
est atteint. Le chantier peut démarrer.**

Le détail machine est dans `resultat-brut.txt`, régénérable par
`powershell -NoProfile -ExecutionPolicy Bypass -File mesurer.ps1`.

---

## Ce qui a été mesuré

Trois captures réelles du jeu, prises le 18 08 pendant une séance normale à
Astrub, en 3839 × 2118 :

| Capture | Contenu | Intérêt |
|---|---|---|
| `popup-moskito-4lots.png` | Ailes de Moskito, 4 lots, 994 → 780 000 | Trois ordres de grandeur, et un lot 1000 grisé au prix rouge |
| `popup-shinlarve-1lot.png` | Essence de la Shin Larve, lot unique, 1 486 | Popup à une seule ligne, pas de colonne à balayer |
| `fenetre-entiere.png` | Fenêtre entière, popup Scarafeuille Blanc + liste HDV | Le cas réel : fond de jeu texturé derrière, panneaux voisins |

Vingt zones de prix au total : 10 prix de lot, 3 prix moyens de popup, 7 prix
moyens de la liste, plus une ligne `-----` (Ailes cassées, aucune vente) qui
doit rester vide et le fait.

**Le cahier des charges demandait cinq captures, il y en a trois.** L'échantillon
est petit : 19 sur 20 veut dire que deux erreurs de plus feraient basculer sous
le seuil. Le chiffre est net mais il tient sur peu, à reconfirmer sur les
captures suivantes plutôt qu'à considérer comme acquis.

Les trois PNG du 15 08 qui traînaient dans le dossier de captures ne comptent
pas : ce sont des copies d'écran de duffus.fr, pas du jeu.

## Le résultat, par mode de pré-traitement

| Pré-traitement | Exactes | Avec liste blanche |
|---|---|---|
| Zone brute, taille native | 1 / 20, **5 %** | 5 % |
| **Agrandissement ×3** | **19 / 20, 95 %** | **20 / 20, 100 %** |
| Agrandissement ×3 + niveaux de gris | 19 / 20, 95 % | 20 / 20, 100 % |
| Agrandissement ×3 + seuillage à 110 | 18 / 20, 90 % | 90 % |

Moteur : `Windows.Media.Ocr`, profil `fr-FR`, déjà présent sur la machine. Rien
à installer, rien à empaqueter. Tesseract n'a pas été essayé et n'a plus de
raison de l'être : on ne remplace pas un moteur à 95 % qui coûte zéro.

## Les quatre choses apprises, qui décident de l'implémentation

1. **L'agrandissement ×3 n'est pas un réglage, c'est la condition.** Sans lui le
   moteur ne rend rien du tout sur une zone découpée : 5 %. Avec lui, 95 %. La
   police du HDV est trop fine à sa taille native pour un moteur entraîné sur du
   document.

2. **Le seuillage nuit, il ne sert pas.** Il fait perdre le `66` bleu clair du
   Tofu Maléfique, posé sur un fond texturé où la binarisation avale le trait.
   Le pré-traitement du cahier des charges — gris, ×3, seuil — est donc à
   corriger : **×3 seul**. Les niveaux de gris ne changent rien, ni en bien ni
   en mal, autant les retirer aussi.

3. **La seule erreur du lot est un `1` isolé lu `i`**, dans le `1 300` de la
   fenêtre entière : le chiffre des milliers, seul devant son espace fine, perd
   son identité une fois la zone découpée de son contexte. Sur l'image entière
   le même `1` était lu juste. C'est exactement ce que la liste blanche du
   cahier des charges corrige : dans un champ où seuls des chiffres peuvent
   figurer, `i`, `l`, `I` et `|` sont des `1`. `Windows.Media.Ocr` n'a pas de
   liste blanche, elle se fait donc **après coup, en normalisant les sosies**.
   C'est ce qui porte le taux à 100 %.

4. **Le symbole kama se colle au nombre**, lu `241K` ou `503K` selon la zone. Il
   ne gêne pas, on ne garde que les chiffres — mais ça condamne toute logique qui
   attendrait un nombre propre. Corollaire : ne jamais mapper une lettre vers un
   chiffre au-delà des sosies du `1`, sinon le kama fabriquera des prix.

L'espace fine des milliers, elle, n'a posé aucun problème : `129 900`, `780 000`,
`49 999`, `12 986` sont tous lus juste. C'était l'inquiétude principale du
cahier des charges, elle tombe.

## Décision

Grille du cahier des charges : ≥ 95 % → on construit tel que décrit. On y est,
au seuil exactement, et confortablement au-dessus une fois la liste blanche
posée. L'architecture retenue ne change pas. Deux corrections à y porter :

- pré-traitement = **agrandissement ×3, rien d'autre** ;
- **normalisation des sosies du `1`** après lecture, avant les contrôles de
  vraisemblance.

Le reste — capture déclenchée à la touche, contrôles de cohérence entre lots,
file d'attente, presse-papier, quarantaine et revue au clavier — reste tel quel.

## Ce qu'il y a dans ce dossier

| Fichier | Rôle |
|---|---|
| `ocr-winrt.ps1` | Passe une image, ou une zone d'image, à `Windows.Media.Ocr`. Options d'agrandissement, de gris, de seuillage. Sort le texte et la boîte de chaque mot. |
| `mesurer.ps1` | La mesure elle-même : les 20 zones, leur vérité terrain, les quatre modes, le comptage. |
| `captures/` | Les trois PNG du jeu. |
| `resultat-brut.txt` | La dernière sortie de `mesurer.ps1`, telle quelle. |

Rien ici ne touche au jeu : on ne lit que des PNG déjà posés sur le disque par
l'outil de capture de Windows. Aucune entrée envoyée, aucun fichier du client lu.
