# PRD - Gestion de fenêtres Dofus 3 sur écran unique 4K

Statut : proposition, en attente de validation
Date : 2026-08-15
Contexte : Dofus 3 (client Unity), 4 clients, Windows 11, un seul écran 32" 4K à 150 % de mise à l'échelle, plus Ganymède et Zen Browser.

---

## 1. Problème

Sur un écran unique, le coût de bascule entre fenêtres est le vrai goulot d'étranglement, pas la disposition elle-même.

- Alt+Tab est non déterministe : l'ordre dépend de l'historique de focus, donc on ne sait jamais sur quel perso on va tomber.
- Alt+Échap parcourt tout, y compris Ganymède et le navigateur, donc c'est pire dès qu'on jongle à 6 fenêtres.
- Le script actuel gère bien la géométrie (2x2 et maximisé) mais pas la sélection : passer au perso 3 reste manuel.
- Les phases hors combat (quêtes avec Ganymède, craft avec un onglet web) n'ont aucune disposition dédiée.

## 2. Critères de succès

1. Activer un perso précis en une action, de façon déterministe, sans jamais viser une vignette à la souris.
2. Trois dispositions atteignables en une touche : 2x2, solo plein écran, craft (jeu à droite / navigateur à gauche).
3. Zéro action envoyée au jeu : aucune touche, aucun clic, aucune lecture de la mémoire ou de l'écran du client.
4. Le script reste lisible et modifiable dans six mois : configuration groupée en tête, noms explicites, commentaires.
5. Aucune régression sur F8 et F9, dont le comportement actuel est conservé à l'identique.

## 3. Périmètre

### Dans le périmètre
- Manipulation de fenêtres via l'API Windows uniquement : `WinMove`, `WinActivate`, `WinRestore`, `WinMaximize`, `WinMinimize`, `WinGetPos`.
- Raccourcis globaux AutoHotkey v2 sur F5 à F9 et boutons latéraux souris.
- Réglages hors script : options du client Dofus, barre des tâches, éventuellement PowerToys.

### Hors périmètre, définitivement
- Toute simulation d'entrée vers une fenêtre Dofus (`Send`, `ControlSend`, `Click`, `MouseMove` piloté).
- Toute diffusion d'une même touche vers plusieurs clients (le fameux multi-broadcast, c'est exactement ce qui fait bannir).
- Lecture de pixels, lecture mémoire, hook sur le process du jeu, modification de fichiers du jeu ou d'un fichier de configuration du client.
- Toute forme d'automatisation temporisée : pas de boucle, pas de timer qui agit à ma place, pas d'enchaînement conditionnel.

## 4. Contraintes

**Anti-ban.** Le règlement Ankama interdit les logiciels tiers qui automatisent des actions de jeu ou qui donnent un avantage sur les autres joueurs. Déplacer, redimensionner ou mettre au premier plan une fenêtre est une opération du gestionnaire de fenêtres de Windows : rien n'entre dans le process du jeu, et le client ne peut pas distinguer une fenêtre déplacée par un script d'une fenêtre déplacée à la souris. C'est la même catégorie que Snap Layouts ou FancyZones. Le risque est faible mais je ne peux pas le déclarer nul à ta place : le règlement ne liste pas explicitement la gestion de fenêtres comme autorisée, et c'est Ankama qui arbitre. La ligne rouge que je m'impose dans ce projet : le script ne produit jamais un événement clavier ou souris consommable par le jeu.

**Technique.**
- 150 % de mise à l'échelle : les coordonnées doivent être des pixels physiques. À vérifier empiriquement plutôt qu'en supposant, ton script actuel semble déjà correct sur ce point.
- Client Unity : après un `WinRestore`, la fenêtre ignore parfois le premier `WinMove`. Prévoir une confirmation de position.
- Les raccourcis AHK sont globaux : ils volent la touche à toutes les applications. F11 et F12 sont donc à éviter, elles servent dans le navigateur.
- Une fenêtre plein écran exclusif ne se laisse pas déplacer proprement. Le client doit être en fenêtré ou fenêtré sans bordure.

## 5. Audit du script existant

Le script est correct, ces points relèvent de la robustesse et pas du bug bloquant.

| # | Point | Gravité | Correctif proposé |
|---|---|---|---|
| 1 | `MsgBox` bloquante et abandon total si un seul perso manque. Si tu joues à 3, plus rien ne fonctionne. | Moyenne | Disposer les fenêtres trouvées, signaler les manquantes par un ToolTip non bloquant. |
| 2 | `isMaximized` se désynchronise dès que tu maximises une fenêtre à la main. | Moyenne | Déduire l'état réel via `WinGetMinMax` au lieu de le mémoriser. |
| 3 | `(right - left) / 2` produit un flottant. | Faible | Division entière `//`. |
| 4 | `MonitorGetWorkArea(1)` vise l'écran d'index 1, qui n'est pas forcément le principal. | Faible | `MonitorGetPrimary()`. |
| 5 | `TitleMatchMode` non déclaré explicitement, donc dépendant du contexte d'exécution. | Faible | `SetTitleMatchMode(2)` en tête de script. |
| 6 | Ordre de disposition figé sur l'ordre du tableau `characters`. | Faible | Conserver, mais documenter que l'ordre du tableau est l'ordre des quadrants et du cycle. |
| 7 | Les quatre blocs `WinMove` sont dupliqués. | Faible | Une fonction `PlacerFenetreDansQuadrant()` et une table de quadrants. |

Le bidouillage `overlapX` qui fait déborder les fenêtres pour masquer les bordures est conservé tel quel. L'alternative propre serait de retirer le style `WS_CAPTION` de la fenêtre du jeu, mais ça modifie le style d'une fenêtre appartenant au client : je ne le propose pas, vu ta consigne de risque zéro.

## 6. Raccourcis proposés

À valider contre tes binds en jeu avant implémentation.

| Touche | Action |
|---|---|
| Bouton latéral souris arrière | Perso précédent dans l'ordre du tableau, activation seule, sans toucher à la disposition |
| Bouton latéral souris avant | Perso suivant, idem |
| F5 | Solo plein écran : le perso actif passe en grand, les trois autres restent derrière, non minimisés |
| F6 | Mode craft : le perso actif occupe la moitié droite, Zen Browser la moitié gauche |
| F7 | Ramener Zen Browser ou Ganymède au premier plan sans casser la disposition Dofus |
| F8 | 2x2, comportement actuel inchangé |
| F9 | Bascule maximisé / 2x2, comportement actuel inchangé |
| Pause | Suspendre tous les raccourcis du script, pour le cas où l'un d'eux gêne une autre application |

Le cycle par boutons latéraux est le vrai remplaçant d'Alt+Tab : l'ordre est fixe et connu, donc au bout de deux jours tu sais où tu atterris sans regarder.

## 7. Plan par phases

**Phase 0 - Sauvegarde.** Le fichier d'origine n'est jamais écrasé. Je livre `Dofus_Windows_v2.ahk` comme nouveau fichier, tu gardes `Dof.ahk` intact à côté. Rien n'est écrit sur ton disque sans que tu me dises où.

**Phase 1 - Consolidation.** Refonte interne du script : bloc de configuration en tête, correctifs 1 à 7, fonctions nommées explicitement, commentaires. F8 et F9 se comportent exactement comme aujourd'hui. Test avant d'aller plus loin.

**Phase 2 - Sélection.** Cycle avant/arrière et activation directe. Uniquement `WinActivate`.

**Phase 3 - Dispositions.** Modes solo et craft, construits sur les mêmes primitives que le 2x2.

**Phase 4 - Hors script.** Les gains qui ne demandent pas une ligne de code :
- Dans les options Dofus : mode fenêtré sans bordure, et surtout limitation du framerate quand la fenêtre n'a pas le focus, ce qui allège trois clients sur quatre.
- Barre des tâches : désactiver le regroupement des fenêtres pour que les quatre clients apparaissent séparément.
- PowerToys si tu veux aller plus loin : `Workspaces` lance et positionne d'un coup les 4 clients, Ganymède et Zen, ce qui remplace la mise en place manuelle du début de session. À évaluer seulement si la Phase 3 ne suffit pas, réutiliser vaut mieux que réinventer.

**Phase 5 - Vérification.** Relecture ligne à ligne pour confirmer qu'aucun appel n'envoie d'entrée vers le jeu, plus une checklist de test manuelle : 4 clients, 3 clients, un client minimisé, une fenêtre déjà maximisée.

## 8. État de l'art, outils existants (recherche du 15 08 2026)

### Organizers Dofus

Constat central : **aucun des organizers ne fait de disposition géométrique**. Tous font de la sélection de fenêtre, aucun ne pose les quatre clients aux quatre coins ni ne gère un mode craft. Ils ne remplacent donc pas ton script, ils remplacent seulement la Phase 2 que je n'ai pas encore écrite.

| Outil | Ce qu'il fait | Disposition | Licence | Verdict |
|---|---|---|---|---|
| ROrganizer | Détection auto des clients, raccourci par compte (jusqu'à 8), cycle précédent/suivant, ordre par glisser-déposer, exe unique sans installeur | Non | Open source, gratuit | Le plus propre. Revendique de ne pas interagir avec le jeu |
| Dosoft | Bascule instantanée, roue de personnages, split multi-écrans | Non | Apache 2.0, gratuit | Solide, mais la roue et le split visent le multi-écran |
| Multixi | Raccourcis de bascule, auto-focus, overlay transparent et always-on-top | Non | Open source, gratuit | Overlay intéressant pour la Phase Ganymède |
| DofusMultiOrganizer (Madgique) | Cycle suivant/précédent, détection `UnityWndClass`, WinUI 3 | Non, explicitement | Non précisée | Jeune, 6 commits, dernière version mars 2026 |
| organizer-dofus.com | **À éviter** | Non | Open source | Voir ci-dessous |

**Alerte sur organizer-dofus.com.** Le site annonce suivi automatique, acceptation automatique des combats, gestion automatique des tours, clics automatisés pour les quêtes, validation automatique des échanges, et se revendique « indétectable par conception ». C'est exactement la catégorie qui fait bannir, et l'argument « indétectable » est un aveu. À ne pas installer, même en n'activant que la partie fenêtres.

**Recommandation.** Ne rien installer côté Dofus. La bascule entre personnages représente une vingtaine de lignes dans le script que tu fais déjà tourner, et ajouter un binaire tiers avec des raccourcis globaux à côté d'un compte de jeu auquel tu tiens ajoute une surface de confiance pour un gain nul. Si tu préfères quand même une interface graphique et zéro maintenance de code, ROrganizer est le bon choix, et le script AHK garde alors uniquement les dispositions.

### Gestionnaires de fenêtres génériques

| Outil | Intérêt pour ton cas | Coût |
|---|---|---|
| PowerToys FancyZones | Zones personnalisées, snap au glisser, et surtout `Workspaces` pour lancer et positionner les 4 clients plus Ganymède et Zen d'un coup en début de session | Gratuit, Microsoft |
| Stardock Groupy 2 | Regroupe des fenêtres en onglets dans un seul cadre. Fusionner Ganymède et Zen en une fenêtre à onglets libère une zone entière de ton écran | Payant |
| DisplayFusion | Profils de position de fenêtres et règles déclenchées par titre, capable de reproduire ton 2x2 sans code | Payant |
| AquaSnap | Tiling léger, transparence, épinglage au premier plan | Version gratuite |
| WindowTop | Always-on-top, transparence, mode mini. À garder pour l'overlay Ganymède si tu y reviens | Version gratuite |
| GlazeWM, komorebi | Tiling dynamique piloté au clavier. Déconseillé : ces gestionnaires reflowent en permanence et se battent avec un client de jeu | Gratuit |

Le seul de cette liste qui apporte quelque chose que le script ne peut pas faire est Groupy, parce que la fusion en onglets n'est pas de la géométrie. Les autres se recouvrent avec ce que tu as déjà.

## 9. Questions ouvertes

1. ~~Géométrie du mode craft~~ **Tranché le 15 08 2026 : moitié droite pleine hauteur, le client Unity se redimensionne bien.**
2. **Nom d'exécutable de Zen Browser** (probablement `zen.exe`) et de Ganymède, il me les faut pour cibler les fenêtres.
3. **Mode craft sur le perso actif ou sur Aalessa ?** Tu as dit perso actif, avec Aalessa en repli si trop compliqué. Le perso actif est simple à faire, je pars là-dessus sauf avis contraire.
4. **Touches F réellement libres** dans tes binds Dofus, en particulier F5, F6, F7.
5. **Où vit le script sur ton disque ?** Pour te livrer la v2 au bon endroit, ou simplement te la donner en pièce jointe si tu préfères la placer toi-même.
6. **Les trois autres clients pendant le mode solo :** derrière la fenêtre active, ou réduits dans la barre des tâches ?
