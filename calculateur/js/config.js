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

export const VERSION_COURANTE_DU_SCHEMA = 4;
