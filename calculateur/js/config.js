/**
 * Constantes de configuration, sans aucune dépendance.
 *
 * Rien de secret ici : ce fichier est servi tel quel au navigateur, comme tout
 * le reste du site. Le jeton d'écriture n'y figure donc pas, et n'y figurera
 * jamais. Il est saisi par Brice dans les réglages et rangé dans le stockage
 * local du navigateur, propre à chaque machine.
 */

/* ---- API des recettes ---- */

export const ADRESSE_BASE_API_DOFUSDUDE = "https://api.dofusdu.de/dofus3/v1/fr";

/**
 * Familles d'objets fouillées par la recherche de recette.
 *
 * L'équipement seul ne suffit plus depuis que la vente par lot existe : ce qui
 * se vend empilé, ce sont les pains, les potions et les ressources travaillées,
 * qui vivent dans `consumables` et `resources`. Chercher dans les trois est la
 * condition pour que le mode « vente par lot » ait quelque chose à calculer.
 *
 * La famille sert aussi de subtype dans l'URL de détail d'un objet, et décide
 * de la destination proposée par défaut à un craft neuf.
 */
export const FAMILLES_DOBJETS_CRAFTABLES = ["equipment", "consumables", "resources"];
export const NOMBRE_DE_SUGGESTIONS_PAR_FAMILLE = 6;

/* ---- Métiers et niveaux requis ----

   Servis par un fichier du dépôt, pas par une API. Aucune de celles qui sont
   joignables ne porte la donnée : le schéma `Recipe` officiel de DofusDude ne
   compte que trois champs, ni `/jobs` ni `/recipes` n'existent chez lui, et
   Dofapi n'a pas le renseignement non plus. dofusdb l'a, mais sa licence
   LPNC-IA écarte les projets majoritairement produits par une IA — le motif
   pour lequel il avait déjà été refusé comme source de recettes.

   `donnees/metiers-par-recette.json` vient donc de Datafus, la base de Dofus
   extraite des fichiers du jeu et publiée sous licence MIT. Fabriqué par
   `outils/extraire-les-metiers.js`, versionné, à rejouer à chaque extension
   du jeu qui ajoute des recettes.

   Format volontairement compact, `{ identifiantAnkama: [jobId, niveau] }` :
   le fichier est téléchargé par le navigateur, et nommer les champs
   triplerait son poids pour une lisibilité dont seul l'outil a besoin. ---- */

export const ADRESSE_DES_METIERS_PAR_RECETTE = "donnees/metiers-par-recette.json";

/**
 * Table d'XP par niveau de métier, fabriquée par `outils/extraire-la-table-dxp.js`.
 *
 * Dérivée et non relevée : le client de Dofus reçoit ses seuils du serveur, et
 * aucune API ne les expose. Les niveaux PAIRS viennent de la table officielle
 * 1-100, recoupée par deux sources ; les IMPAIRS sont interpolés, le devblog
 * d'Ankama disant seulement que 200 niveaux ont remplacé 100 sans coûter plus
 * d'expérience. Le fichier porte le drapeau de ce qui est interpolé, et
 * l'interface le dit là où ça compte.
 */
export const ADRESSE_DE_LA_TABLE_DXP = "donnees/xp-par-niveau-de-metier.json";

/**
 * Objectifs proposés sur une carte de craft.
 *
 * `null` vaut « le prochain niveau », qui n'est pas un nombre fixe puisqu'il
 * dépend du niveau courant. Les autres sont les paliers ronds où l'on décide
 * habituellement de changer de recette.
 */
export const OBJECTIFS_DE_NIVEAU_PROPOSES = [null, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200];

/**
 * Métiers de Dofus, indexés par le `jobId` des fichiers du jeu. Recopiés plutôt
 * que dérivés : la liste tient en vingt lignes, ne bouge qu'à une extension, et
 * l'avoir ici évite de faire porter au fichier de données un nom répété quatre
 * mille fois.
 */
export const NOMS_DES_METIERS = {
  1: "Base", 2: "Bûcheron", 11: "Forgeron", 13: "Sculpteur", 15: "Cordonnier",
  16: "Bijoutier", 24: "Mineur", 26: "Alchimiste", 27: "Tailleur", 28: "Paysan",
  36: "Pêcheur", 41: "Chasseur", 44: "Forgemage", 48: "Sculptemage",
  60: "Façonneur", 62: "Cordomage", 63: "Joaillomage", 64: "Costumage",
  65: "Bricoleur", 74: "Façomage", 75: "Parchomage", 78: "Bestiologue",
  79: "Éleveur"
};

/**
 * Profondeur maximale de la chaîne de sous-crafts.
 *
 * Une chaîne Dofus réelle dépasse rarement trois étages. La borne n'est pas là
 * pour brider un usage légitime mais pour qu'une recette qui se contiendrait
 * elle-même, par une donnée fausse en amont, ne déroule pas un arbre infini.
 */
export const PROFONDEUR_MAXIMALE_DE_SOUS_CRAFT = 6;

/* ---- API des prix communautaires ----

   dofus-calculator.fr. Lecture ouverte, écriture avec jeton.

   Deux identifiants à ne jamais confondre, la nuance coûte cher :

     `dofusdb_id`  identifiant Ankama, celui de DofusDude. Sert à LIRE,
                   via le filtre `dofusdb_id=in:...`.
     `id`          clé primaire interne de dofus-calculator. Seule acceptée
                   par l'écriture, dans le champ `item_id`. Vérifié : poster
                   un `dofusdb_id` valide mais absent de la table interne se
                   fait refuser en 422.

   La lecture renvoie les deux, donc la correspondance s'établit toute seule au
   premier chargement des prix. Une ressource jamais lue ne peut pas être
   publiée, faute de connaître son identifiant interne. ---- */

export const ADRESSE_BASE_API_PRIX = "https://dofus-calculator.fr/api";
export const IDENTIFIANT_DU_SERVEUR_SUIVI = 22;
export const NOM_DU_SERVEUR_SUIVI = "Brial";
export const NOMBRE_MAXIMAL_DE_RESSOURCES_PAR_APPEL_DE_LECTURE = 100;
export const NOMBRE_MAXIMAL_DE_PRIX_PAR_ENVOI = 500;

/* ---- Destination d'un craft ----

   Trois usages qui ne se chiffrent pas de la même façon, et qu'il serait faux
   de traiter par un seul champ de prix de vente :

     usage           crafté pour soi, jamais revendu. Aucun revenu, aucune taxe.
                     Ce n'est pas une perte, c'est un coût d'acquisition — le
                     comparer à un achat au HDV est le seul arbitrage qui vaille.
     vente-unitaire  l'équipement. Le HDV le liste pièce par pièce, ses jets de
                     stats étant tous différents : un prix, une ligne.
     vente-par-lot   les pains, potions et ressources de métier. Ils s'empilent
                     au HDV par 1, 10, 100 et 1000, exactement comme à l'achat.
   ---- */

export const DESTINATION_USAGE_PERSONNEL = "usage";
export const DESTINATION_VENTE_UNITAIRE = "vente-unitaire";
export const DESTINATION_VENTE_PAR_LOT = "vente-par-lot";

export const DESTINATION_PAR_DEFAUT = DESTINATION_VENTE_UNITAIRE;

/**
 * Destination proposée à l'ajout, selon la famille de l'objet. Une proposition,
 * pas une contrainte : le sélecteur reste libre sur chaque ligne.
 */
export const DESTINATION_PAR_DEFAUT_SELON_LA_FAMILLE = {
  equipment: DESTINATION_VENTE_UNITAIRE,
  consumables: DESTINATION_VENTE_PAR_LOT,
  resources: DESTINATION_VENTE_PAR_LOT
};

export const INTITULES_DES_DESTINATIONS = {
  [DESTINATION_USAGE_PERSONNEL]: "Pour mes persos",
  [DESTINATION_VENTE_UNITAIRE]: "Revente à l'unité",
  [DESTINATION_VENTE_PAR_LOT]: "Revente par lot"
};

/* ---- Modèle de prix ---- */

export const TAILLES_DE_LOT_DISPONIBLES = [1, 10, 100, 1000];

/**
 * Le lot de taille 1 a un statut à part depuis l'ouverture sur la base
 * communautaire : c'est le seul prix qui ait un sens hors de cette machine.
 *
 * La base ne connaît qu'un prix unitaire par ressource et par serveur, le vrai
 * prix relevé au HDV. C'est exactement la colonne ×1. Les lots de 10, 100 et
 * 1000, comme le prix moyen, n'existent que localement : rien dans l'API ne
 * permet de les représenter, et les inventer serait mentir à la base.
 */
export const TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE = 1;

export const TAILLE_DE_LOT_PAR_DEFAUT_POUR_LE_PRIX_MOYEN = 1;
export const NOMBRE_DE_JOURS_AVANT_PRIX_CONSIDERE_ANCIEN = 7;
export const QUANTITE_MAXIMALE_TRAITEE_PAR_PROGRAMMATION_DYNAMIQUE = 200000;

/* ---- Stockage local ---- */

export const CLE_STOCKAGE_DE_LA_SESSION = "calculateur-craft-dofus-v1";

/**
 * Le jeton est rangé sous sa propre clé, à l'écart de l'état de session.
 * Conséquence voulue : il ne part pas dans l'export JSON, qui circule entre
 * machines et pourrait finir n'importe où.
 */
export const CLE_STOCKAGE_DU_JETON = "calculateur-craft-dofus-jeton";

export const VERSION_COURANTE_DU_SCHEMA = 7;

/* ---- Format d'échange de l'OCR ----

   L'en-tête magique n'est pas décoratif : le calculateur écoute le collage sur
   toute la page, et sans signature un Ctrl+V malheureux irait écrire dans
   l'état. Un collage qui ne commence pas par cette chaîne est ignoré sans un
   mot, ce qui est le comportement voulu — un collage ordinaire n'est pas une
   erreur à signaler. ---- */

export const SIGNATURE_DU_FORMAT_OCR = "#DOFUS-HDV/";
export const VERSION_DU_FORMAT_OCR = 1;

/** Bornes de vraisemblance, rejouées côté site et non simplement supposées. */
export const PRIX_MINIMAL_PLAUSIBLE = 1;
export const PRIX_MAXIMAL_PLAUSIBLE = 100000000;
