/**
 * État de l'application, persistance et migrations de schéma.
 *
 * `etatApplication` est exporté comme liaison vivante : les modules qui
 * l'importent voient les réaffectations faites ici, notamment celle de l'import
 * JSON. C'est ce qui permet de garder un état unique, partagé par la fenêtre
 * principale et par la fenêtre flottante.
 */
import {
  CLE_STOCKAGE_DE_LA_SESSION, CLE_STOCKAGE_DU_JETON, VERSION_COURANTE_DU_SCHEMA,
  TAILLE_DE_LOT_PAR_DEFAUT_POUR_LE_PRIX_MOYEN, TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE,
  DESTINATION_PAR_DEFAUT
} from "./config.js";

/**
 * Version du schéma de l'état sauvegardé.
 *
 * 1 : prix moyen stocké en prix UNITAIRE, champ `prixMoyenUnitaire`.
 * 2 : prix moyen stocké tel que le HDV l'affiche, prix du LOT ENTIER, champ
 *     `prixMoyenDuLot`, avec `tailleDuLotDuPrixMoyen`.
 * 3 : apparition de `prixCommunautairesParRessource`, cache des prix relevés
 *     par les joueurs. Rangé à part de `basePrixDesRessources` et jamais
 *     fusionné avec elle.
 * 4 : le prix communautaire est reconnu pour ce qu'il est, un vrai prix
 *     unitaire de HDV, donc l'équivalent de la colonne ×1 et non du prix moyen.
 *     Apparition de `publicationParRessource`, qui suit ce qui a été envoyé
 *     vers la base, et de `publicationAutomatiqueActive`.
 * 5 : un craft porte une `destination` — usage personnel, revente à l'unité ou
 *     revente par lot — et, dans ce dernier cas, ses propres prix de vente par
 *     taille de lot. Apparition aussi de `prixOcrEnAttente`, la quarantaine des
 *     prix lus par OCR, rangée à part de `basePrixDesRessources` exactement
 *     comme `prixCommunautairesParRessource` l'est déjà.
 * 6 : un craft peut en nourrir un autre. Il porte `identifiantDuCraftParent`,
 *     qui vaut null pour un craft de tête et l'identifiant de ligne du craft
 *     servi pour un sous-craft.
 *
 *     Rien n'est ajouté ici pour les métiers : la table qui les porte est un
 *     fichier servi avec le site, complet et identique pour tout le monde. La
 *     recopier dans l'état sauvegardé alourdirait chaque écriture du stockage
 *     local de soixante-dix kilo-octets qui ne sont propres à personne.
 * 7 : l'XP de métier. `experienceParMetier` retient où Brice en est dans chaque
 *     métier, et `memoireExperienceParRecette` cesse d'être un simple nombre
 *     pour devenir une OBSERVATION datée d'un niveau : `{ xpObservee,
 *     niveauMetierObserve }`. Sans le niveau, le chiffre ne vaut qu'à ce
 *     niveau-là et ne peut être projeté nulle part.
 *
 * Toute évolution du format incrémente ce numéro et ajoute son étape dans
 * `migrerLEtatVersLeSchemaCourant`.
 */
export let etatApplication = construireUnEtatVierge();

export function construireUnEtatVierge() {
  return {
    versionDuSchema: VERSION_COURANTE_DU_SCHEMA,
    tauxDeTaxeEnPourcent: 2,
    // Quand ce mode est actif, le coût est estimé à partir du prix moyen affiché
    // par le jeu, sans tenir compte des prix de lot. Sert à dégrossir vite.
    modeEstimationParPrixMoyen: false,
    // Publication des prix ×1 vers la base communautaire. Coupable à tout moment
    // depuis les réglages, sans perdre le jeton.
    publicationAutomatiqueActive: true,
    craftsDeLaSession: [],
    // Mémoire longue des prix relevés par Brice, indexée par identifiant Ankama.
    basePrixDesRessources: {},
    // Prix venus de la base communautaire, indexés par identifiant Ankama.
    // Conservés d'une session à l'autre pour rester utilisable hors ligne, et
    // porteurs de l'identifiant interne, seul accepté à l'écriture.
    prixCommunautairesParRessource: {},
    // Suivi des envois vers la base : ce qui est parti, ce qui a échoué.
    publicationParRessource: {},
    // Quarantaine des prix lus par OCR, indexée par identifiant Ankama. Rangée
    // ici et NON dans `basePrixDesRessources` : c'est ce qui rend ces valeurs
    // structurellement invisibles des totaux et inatteignables par la
    // publication, sans qu'aucun drapeau n'ait à être testé nulle part.
    prixOcrEnAttente: {},
    cacheDesObjets: {},
    // Où en est chaque métier, indexé par `jobId`. La clé est l'XP cumulée :
    // le niveau s'en déduit, l'inverse serait faux puisqu'un niveau ne dit pas
    // où l'on en est dans le palier.
    experienceParMetier: {},
    // Observations d'XP par recette : `{ xpObservee, niveauMetierObserve }`.
    // Le niveau d'observation est ce qui rend le chiffre projetable, la
    // régression se déduisant de l'écart entre ce niveau et celui de la recette.
    memoireExperienceParRecette: {}
  };
}

/* ============================================================
   Persistance
   ============================================================ */

/** Vrai dans un navigateur, faux sous Node : les tests importent ce module. */
function leStockageLocalEstDisponible() {
  return typeof localStorage !== "undefined";
}

export function sauvegarderEtat() {
  if (!leStockageLocalEstDisponible()) return;
  try {
    localStorage.setItem(CLE_STOCKAGE_DE_LA_SESSION, JSON.stringify(etatApplication));
  } catch (erreur) {
    console.warn("Sauvegarde impossible dans le stockage local :", erreur);
  }
}

export function chargerEtat() {
  if (!leStockageLocalEstDisponible()) return;
  try {
    const contenuBrut = localStorage.getItem(CLE_STOCKAGE_DE_LA_SESSION);
    if (!contenuBrut) return;
    remplacerLEtat(JSON.parse(contenuBrut));
  } catch (erreur) {
    console.warn("État sauvegardé illisible, on repart d'un état vierge :", erreur);
  }
}

/**
 * Remplace l'état courant par celui fourni, en complétant les champs absents et
 * en migrant au besoin. Point d'entrée unique du chargement et de l'import.
 */
export function remplacerLEtat(nouvelEtat) {
  const etatFourni = nouvelEtat || {};

  // La version se lit sur l'état FOURNI, avant toute fusion avec les valeurs par
  // défaut. Fusionner d'abord ferait hériter le numéro de version courant à un
  // fichier qui ne le porte pas, et la migration serait sautée en silence : ses
  // prix moyens de schéma 1 seraient alors lus comme des prix de lot manquants,
  // donc ignorés sans le moindre message. Un export sans numéro est par
  // construction antérieur au schéma 2, où le champ est apparu.
  const versionFournie = Number(etatFourni.versionDuSchema) || 1;

  etatApplication = Object.assign(construireUnEtatVierge(), etatFourni,
    { versionDuSchema: versionFournie });
  migrerLEtatVersLeSchemaCourant();
}

/* ============================================================
   Jeton d'écriture

   Rangé sous sa propre clé, jamais dans l'état de session : l'export JSON
   circule entre machines, un secret n'a rien à y faire. Il n'est pas non plus
   dans le code source, qui est servi en clair par l'hébergeur.
   ============================================================ */

export function lireLeJetonDEcriture() {
  if (!leStockageLocalEstDisponible()) return "";
  try {
    return localStorage.getItem(CLE_STOCKAGE_DU_JETON) || "";
  } catch (erreur) {
    return "";
  }
}

export function enregistrerLeJetonDEcriture(jeton) {
  if (!leStockageLocalEstDisponible()) return;
  try {
    const jetonNettoye = String(jeton || "").trim();
    if (jetonNettoye === "") localStorage.removeItem(CLE_STOCKAGE_DU_JETON);
    else localStorage.setItem(CLE_STOCKAGE_DU_JETON, jetonNettoye);
  } catch (erreur) {
    console.warn("Jeton non enregistré :", erreur);
  }
}

/* ============================================================
   Migrations
   ============================================================ */

/**
 * Met l'état chargé au format attendu par la version courante du code.
 * Appelée au démarrage comme après un import, puisqu'un fichier exporté par une
 * version antérieure porte l'ancien format.
 *
 * Idempotente : la relancer sur un état déjà à jour ne fait rien.
 */
export function migrerLEtatVersLeSchemaCourant() {
  const versionDeLEtatCharge = etatApplication.versionDuSchema || 1;
  if (versionDeLEtatCharge >= VERSION_COURANTE_DU_SCHEMA) {
    etatApplication.versionDuSchema = VERSION_COURANTE_DU_SCHEMA;
    return;
  }

  // --- 1 vers 2 : le prix moyen devient un prix de lot ---
  //
  // Les valeurs de la version 1 sont des prix unitaires. Les convertir en prix
  // de lot de taille 1 préserve leur montant exact et leur signification, sans
  // qu'aucun chiffre affiché ne bouge. Migration à effet nul sur les totaux,
  // ce qui est le but.
  if (versionDeLEtatCharge < 2) {
    for (const identifiant of Object.keys(etatApplication.basePrixDesRessources || {})) {
      const fichePrix = etatApplication.basePrixDesRessources[identifiant];
      if (!fichePrix) continue;
      const ancienPrixUnitaire = fichePrix.prixMoyenUnitaire || 0;
      if (fichePrix.prixMoyenDuLot === undefined) {
        fichePrix.prixMoyenDuLot = ancienPrixUnitaire;
        fichePrix.tailleDuLotDuPrixMoyen = 1;
      }
      delete fichePrix.prixMoyenUnitaire;
    }
    console.info("Schéma 1 vers 2 : les prix moyens unitaires sont devenus des prix de lot de taille 1.");
  }

  // --- 2 vers 3 : cache des prix communautaires ---
  if (versionDeLEtatCharge < 3 && !etatApplication.prixCommunautairesParRessource) {
    etatApplication.prixCommunautairesParRessource = {};
  }

  // --- 3 vers 4 : suivi des publications ---
  //
  // Rien à convertir non plus. Les prix ×1 déjà relevés par Brice restent où ils
  // sont et ne sont surtout PAS publiés d'office : publier en masse des chiffres
  // dont personne n'a revérifié la fraîcheur polluerait la base commune. Ils
  // partiront un par un, quand il les ressaisira.
  if (versionDeLEtatCharge < 4 && !etatApplication.publicationParRessource) {
    etatApplication.publicationParRessource = {};
  }

  // --- 4 vers 5 : destination des crafts, et quarantaine de l'OCR ---
  //
  // Tous les crafts existants passent en revente à l'unité : c'est ce que le
  // calcul faisait jusqu'ici, la migration ne doit déplacer aucun chiffre. Le
  // prix de vente unitaire déjà saisi est recopié dans le lot de 1, pour qu'un
  // basculement vers la vente par lot ne parte pas d'un écran vide.
  if (versionDeLEtatCharge < 5) {
    for (const craft of etatApplication.craftsDeLaSession || []) {
      normaliserUnCraft(craft);
    }
    if (!etatApplication.prixOcrEnAttente) etatApplication.prixOcrEnAttente = {};
    console.info("Schéma 4 vers 5 : les crafts existants passent en revente à l'unité.");
  }

  // --- 5 vers 6 : la chaîne de crafts ---
  //
  // Tous les crafts existants deviennent des crafts de tête, ce qu'ils étaient
  // déjà faute d'alternative. Aucun chiffre ne bouge : un craft sans parent et
  // sans enfant se calcule exactement comme avant.
  if (versionDeLEtatCharge < 6) {
    for (const craft of etatApplication.craftsDeLaSession || []) {
      if (craft.identifiantDuCraftParent === undefined) craft.identifiantDuCraftParent = null;
    }
    console.info("Schéma 5 vers 6 : les crafts existants deviennent des crafts de tête.");
  }

  // --- 6 vers 7 : l'XP relevée devient une observation située ---
  //
  // Les anciennes valeurs sont de simples nombres, sans le niveau de métier
  // auquel elles ont été vues. Ce niveau ne s'invente pas : sans lui, la
  // régression ne peut pas être défaite, et projeter la valeur à un autre
  // niveau donnerait un chiffre faux présenté comme sûr. Le champ est donc
  // laissé à null, et l'interface le réclame — une case à remplir vaut mieux
  // qu'une extrapolation muette.
  if (versionDeLEtatCharge < 7) {
    const memoire = etatApplication.memoireExperienceParRecette || {};
    for (const identifiant of Object.keys(memoire)) {
      if (typeof memoire[identifiant] === "number") {
        memoire[identifiant] = { xpObservee: memoire[identifiant], niveauMetierObserve: null };
      }
    }
    if (!etatApplication.experienceParMetier) etatApplication.experienceParMetier = {};
    console.info("Schéma 6 vers 7 : les XP relevées attendent leur niveau d'observation.");
  }

  etatApplication.versionDuSchema = VERSION_COURANTE_DU_SCHEMA;
  sauvegarderEtat();
}

/* ============================================================
   Observations d'XP et niveaux de métier
   ============================================================ */

/** Observation d'XP enregistrée pour une recette, jamais null. */
export function lireLObservationDXP(identifiantAnkama) {
  const memoire = etatApplication.memoireExperienceParRecette || {};
  const observation = memoire[identifiantAnkama];
  if (!observation) return { xpObservee: 0, niveauMetierObserve: null };
  // Une valeur de schéma 6 peut encore traîner si l'état vient d'un import non
  // migré. La lire ici plutôt que de supposer que la migration est passée.
  if (typeof observation === "number") {
    return { xpObservee: observation, niveauMetierObserve: null };
  }
  return observation;
}

export function enregistrerLObservationDXP(identifiantAnkama, xpObservee, niveauMetierObserve) {
  if (!etatApplication.memoireExperienceParRecette) {
    etatApplication.memoireExperienceParRecette = {};
  }
  etatApplication.memoireExperienceParRecette[identifiantAnkama] = {
    xpObservee: xpObservee || 0,
    niveauMetierObserve: niveauMetierObserve || null
  };
}

/** XP cumulée dans un métier, 0 tant que Brice ne l'a pas renseignée. */
export function lireLExperienceDUnMetier(identifiantDuMetier) {
  const parMetier = etatApplication.experienceParMetier || {};
  return parMetier[identifiantDuMetier] || 0;
}

export function enregistrerLExperienceDUnMetier(identifiantDuMetier, experienceTotale) {
  if (!etatApplication.experienceParMetier) etatApplication.experienceParMetier = {};
  etatApplication.experienceParMetier[identifiantDuMetier] = Math.max(0, experienceTotale || 0);
}

/**
 * Complète un craft des champs apparus au schéma 5. Point de passage unique,
 * appelé par la migration comme par l'ajout d'une recette : aucun craft ne peut
 * donc exister sans destination.
 */
export function normaliserUnCraft(craft) {
  if (!craft.destination) craft.destination = DESTINATION_PAR_DEFAUT;
  // Champ du schéma 6. `undefined` et `null` disent la même chose ici, mais
  // seul `null` survit à un aller-retour JSON : un craft de tête resterait
  // sinon indistinguable d'un craft dont le parent a été perdu.
  if (craft.identifiantDuCraftParent === undefined) craft.identifiantDuCraftParent = null;
  if (!craft.prixDeVenteParTailleDeLot) {
    craft.prixDeVenteParTailleDeLot = {};
    if (craft.prixDeVenteUnitaire > 0) {
      craft.prixDeVenteParTailleDeLot[TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE] = craft.prixDeVenteUnitaire;
    }
  }
  return craft;
}

/* ============================================================
   Accès aux fiches de prix
   ============================================================ */

/**
 * Fiche de prix d'une ressource, créée vide si elle n'existe pas encore.
 * Point de création unique : tableau principal, revue et fenêtre flottante
 * passent tous par ici, donc aucune fiche ne naît avec un champ manquant.
 */
export function obtenirOuCreerLaFichePrix(identifiantAnkama, nomDeLaRessource) {
  if (!etatApplication.basePrixDesRessources[identifiantAnkama]) {
    etatApplication.basePrixDesRessources[identifiantAnkama] = {
      nom: nomDeLaRessource,
      prixParTailleDeLot: {},
      prixMoyenDuLot: 0,
      tailleDuLotDuPrixMoyen: TAILLE_DE_LOT_PAR_DEFAUT_POUR_LE_PRIX_MOYEN,
      horodatageDerniereMiseAJour: null
    };
  }
  return etatApplication.basePrixDesRessources[identifiantAnkama];
}

/**
 * Prix unitaire déduit du prix moyen saisi, quelle que soit la taille du lot sur
 * lequel il a été relevé. Point de passage unique : aucun autre endroit du code
 * ne divise un prix moyen par une taille de lot.
 */
export function deduireLePrixMoyenUnitaire(fichePrix) {
  if (!fichePrix) return 0;
  const prixDuLot = fichePrix.prixMoyenDuLot || 0;
  const tailleDuLot = fichePrix.tailleDuLotDuPrixMoyen || TAILLE_DE_LOT_PAR_DEFAUT_POUR_LE_PRIX_MOYEN;
  if (prixDuLot <= 0 || tailleDuLot <= 0) return 0;
  return prixDuLot / tailleDuLot;
}

/* ============================================================
   Export

   Deux choses ne sortent jamais d'ici : le jeton, rangé sous sa propre clé, et
   la quarantaine de l'OCR. La seconde pour la même raison que le premier est
   exclu — un export circule entre machines, et une valeur non confirmée qui
   voyage finit tôt ou tard par être prise pour une valeur vérifiée.
   ============================================================ */

export function construireLExportPartageable() {
  const copie = Object.assign({}, etatApplication);
  delete copie.prixOcrEnAttente;
  return copie;
}
