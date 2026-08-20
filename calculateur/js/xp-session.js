/**
 * L'XP de métier au niveau de la session : où en est chaque métier, ce qu'une
 * recette rapporte aujourd'hui, et combien de crafts pour atteindre un objectif.
 *
 * Fait le lien entre `xp-metier.js`, qui est pur et ne connaît que des nombres,
 * et l'état de l'application. La séparation n'est pas décorative : c'est elle
 * qui permet de tester la formule et la montée de niveau sous Node, sans DOM ni
 * stockage local.
 *
 * LA TABLE D'XP EST DÉRIVÉE, ET L'INTERFACE DOIT POUVOIR LE DIRE
 *
 * Elle n'est relevée nulle part : le client de Dofus reçoit ses seuils du
 * serveur, aucune API ne les publie. Les niveaux pairs viennent de la table
 * officielle 1-100, recoupée par deux sources ; les impairs sont interpolés.
 * `leNiveauEstInterpole` existe pour que l'écran nuance ce qu'il affiche là où
 * ça compte, plutôt que de présenter comme sûr ce qui ne l'est pas.
 */
import { ADRESSE_DE_LA_TABLE_DXP } from "./config.js";
import { etatApplication, lireLObservationDXP, lireLExperienceDUnMetier } from "./etat.js";
import { lireLaRecetteConnue } from "./metiers.js";
import {
  deduireLExperienceDeBase, calculerLExperienceDUnCraft,
  deduireLeNiveauDepuisLExperience, lireLeSeuilDUnNiveau, lireLeNiveauMaximal,
  calculerLesCraftsPourAtteindreUnNiveau
} from "./xp-metier.js";

let tableDXP = null;
let niveauxInterpoles = [];
let chargementEnCours = null;

/**
 * Charge la table, une fois pour toute la vie de la page.
 *
 * Même mémoïsation que pour les métiers, et pour la même raison : le démarrage
 * et l'ajout d'une recette peuvent appeler à quelques millisecondes d'écart.
 */
export function chargerLaTableDXP() {
  if (chargementEnCours) return chargementEnCours;

  chargementEnCours = (async () => {
    try {
      const reponse = await fetch(ADRESSE_DE_LA_TABLE_DXP);
      if (!reponse.ok) throw new Error("code " + reponse.status);
      const contenu = await reponse.json();
      tableDXP = contenu.xpCumuleeParNiveau;
      niveauxInterpoles = contenu.niveauxInterpoles || [];
      return true;
    } catch (erreur) {
      console.debug("Table d'XP illisible, les objectifs resteront muets :", erreur);
      return false;
    }
  })();

  return chargementEnCours;
}

export function laTableDXPEstChargee() {
  return Array.isArray(tableDXP) && tableDXP.length > 0;
}

/** Vrai si le seuil de ce niveau est interpolé, donc à prendre avec réserve. */
export function leNiveauEstInterpole(niveau) {
  return niveauxInterpoles[niveau - 1] === 1;
}

export function lireLeNiveauMaximalDUnMetier() {
  return laTableDXPEstChargee() ? lireLeNiveauMaximal(tableDXP) : 200;
}

/* ============================================================
   Où en est un métier
   ============================================================ */

/**
 * Situation d'un métier : son XP cumulée, le niveau qui s'en déduit, et où l'on
 * en est dans le palier courant.
 *
 * @returns {{identifiantDuMetier:number, nom:string, experienceTotale:number,
 *            niveau:number, seuilDuNiveau:number, seuilSuivant:number,
 *            xpDansLePalier:number, xpRestantePourLeNiveau:number}|null}
 */
export function lireLaSituationDUnMetier(identifiantDuMetier, nomDuMetier) {
  if (!laTableDXPEstChargee()) return null;

  const experienceTotale = lireLExperienceDUnMetier(identifiantDuMetier);
  const niveau = deduireLeNiveauDepuisLExperience(experienceTotale, tableDXP);
  const seuilDuNiveau = lireLeSeuilDUnNiveau(niveau, tableDXP);
  const niveauMaximal = lireLeNiveauMaximal(tableDXP);
  const seuilSuivant = niveau >= niveauMaximal
    ? seuilDuNiveau
    : lireLeSeuilDUnNiveau(niveau + 1, tableDXP);

  return {
    identifiantDuMetier,
    nom: nomDuMetier,
    experienceTotale,
    niveau,
    seuilDuNiveau,
    seuilSuivant,
    xpDansLePalier: experienceTotale - seuilDuNiveau,
    xpRestantePourLeNiveau: Math.max(0, seuilSuivant - experienceTotale),
    estAuNiveauMaximal: niveau >= niveauMaximal
  };
}

/**
 * Les métiers que la session met en jeu, chacun une fois.
 *
 * Tirés des crafts eux-mêmes plutôt que d'une liste fixe : afficher les vingt
 * métiers de Dofus alors qu'on en travaille deux noierait l'information utile.
 */
export function listerLesMetiersDeLaSession() {
  const parIdentifiant = new Map();

  for (const craft of etatApplication.craftsDeLaSession) {
    const recette = lireLaRecetteConnue(craft.identifiantAnkama);
    if (!recette) continue;
    if (!parIdentifiant.has(recette.jobId)) {
      const situation = lireLaSituationDUnMetier(recette.jobId, recette.metier);
      if (situation) parIdentifiant.set(recette.jobId, situation);
    }
  }

  return [...parIdentifiant.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/* ============================================================
   Ce qu'une recette rapporte, et ce qu'elle peut encore faire monter
   ============================================================ */

/**
 * Bilan d'XP d'un craft : ce qu'il rapporte au niveau actuel du métier, et ce
 * qu'il faudrait en faire pour atteindre l'objectif visé.
 *
 * @param craft            la ligne de craft
 * @param {number|null} niveauVise  null vaut « le prochain niveau »
 * @returns {Object|null} null si le métier de la recette est inconnu
 */
export function chiffrerLXPDUnCraft(craft, niveauVise) {
  const recette = lireLaRecetteConnue(craft.identifiantAnkama);
  if (!recette || !laTableDXPEstChargee()) return null;

  const situation = lireLaSituationDUnMetier(recette.jobId, recette.metier);
  const observation = lireLObservationDXP(craft.identifiantAnkama);

  // Sans le niveau auquel l'XP a été vue, la régression ne peut pas être
  // défaite. On ne devine pas : le bilan le dit, et l'interface réclame le champ.
  const observationComplete = observation.xpObservee > 0
    && observation.niveauMetierObserve !== null && observation.niveauMetierObserve > 0;

  const xpDeBase = observationComplete
    ? deduireLExperienceDeBase(
        observation.xpObservee, observation.niveauMetierObserve, recette.niveauRequis)
    : 0;

  const xpParCraftMaintenant = calculerLExperienceDUnCraft(
    xpDeBase, situation.niveau, recette.niveauRequis);

  const cible = niveauVise === null || niveauVise === undefined
    ? Math.min(situation.niveau + 1, lireLeNiveauMaximal(tableDXP))
    : niveauVise;

  const montee = calculerLesCraftsPourAtteindreUnNiveau({
    niveauActuel: situation.niveau,
    experienceActuelle: situation.experienceTotale,
    niveauVise: cible,
    xpDeBase,
    niveauDeLaRecette: recette.niveauRequis,
    xpCumuleeParNiveau: tableDXP
  });

  return {
    recette,
    situation,
    observation,
    observationComplete,
    xpDeBase,
    xpParCraftMaintenant,
    niveauVise: cible,
    montee,
    // Le niveau à partir duquel cette recette cesse de rapporter. Ce que Brice
    // veut vraiment savoir : jusqu'où elle le mène avant de devoir en changer.
    niveauOuLaRecetteSEteint: recette.niveauRequis + 100
  };
}
