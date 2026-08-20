/**
 * L'XP de métier au niveau de la session : où en est chaque métier, ce qu'une
 * recette rapporte aujourd'hui, et combien de crafts pour atteindre un objectif.
 *
 * Fait le lien entre `xp-metier.js`, qui est pur et ne connaît que des nombres,
 * et l'état de l'application. La séparation n'est pas décorative : c'est elle
 * qui permet de tester la formule et la montée de niveau sous Node, sans DOM ni
 * stockage local.
 *
 * LA COURBE D'XP EST EXACTE, ET NE COÛTE PLUS RIEN
 *
 * Elle tenait dans un fichier de données interpolé ; elle tient maintenant dans
 * `10 × L × (L − 1)`, mesuré et recoupé avec le jeu. Plus de chargement, plus
 * d'attente, plus de niveaux « approximatifs » — voir l'en-tête de
 * `xp-metier.js` sur la façon dont la forme a été établie.
 */
import { etatApplication, lireLObservationDXP, lireLExperienceDUnMetier } from "./etat.js";
import { lireLaRecetteConnue } from "./metiers.js";
import {
  deduireLExperienceDeBase, calculerLExperienceDUnCraft, calculerLeNiveauDepuisLXP,
  calculerLeSeuilDUnNiveau, calculerLesCraftsPourAtteindreUnNiveau,
  NIVEAU_MAXIMAL_DUN_METIER
} from "./xp-metier.js";

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
  const experienceTotale = lireLExperienceDUnMetier(identifiantDuMetier);
  const niveau = calculerLeNiveauDepuisLXP(experienceTotale);
  const seuilDuNiveau = calculerLeSeuilDUnNiveau(niveau);
  const seuilSuivant = niveau >= NIVEAU_MAXIMAL_DUN_METIER
    ? seuilDuNiveau
    : calculerLeSeuilDUnNiveau(niveau + 1);

  return {
    identifiantDuMetier,
    nom: nomDuMetier,
    experienceTotale,
    niveau,
    seuilDuNiveau,
    seuilSuivant,
    xpDansLePalier: experienceTotale - seuilDuNiveau,
    xpRestantePourLeNiveau: Math.max(0, seuilSuivant - experienceTotale),
    estAuNiveauMaximal: niveau >= NIVEAU_MAXIMAL_DUN_METIER
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
  if (!recette) return null;

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
    ? Math.min(situation.niveau + 1, NIVEAU_MAXIMAL_DUN_METIER)
    : niveauVise;

  const montee = calculerLesCraftsPourAtteindreUnNiveau({
    niveauActuel: situation.niveau,
    experienceActuelle: situation.experienceTotale,
    niveauVise: cible,
    xpDeBase,
    niveauDeLaRecette: recette.niveauRequis
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
