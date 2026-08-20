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
import {
  etatApplication, lireLObservationDXP, lireLExperienceDUnMetier,
  lireLeReleveDXPPrecedent, oublierLeReleveDXPPrecedent, enregistrerLObservationDXP
} from "./etat.js";
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
 * @param {number|null} niveauxAGagner  nombre de niveaux visés, 1 par défaut
 * @returns {Object|null} null si le métier de la recette est inconnu
 */
export function chiffrerLXPDUnCraft(craft, niveauxAGagner) {
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

  // L'objectif est un NOMBRE DE NIVEAUX À GAGNER, pas un palier absolu : c'est
  // la question qu'on se pose devant l'écran, et elle reste valable quel que
  // soit le niveau courant. Le palier visé s'en déduit ici, une fois pour toutes.
  const niveauxVises = Math.max(1, niveauxAGagner || 1);
  const cible = Math.min(situation.niveau + niveauxVises, NIVEAU_MAXIMAL_DUN_METIER);

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
    niveauxVises,
    montee,
    // Le niveau à partir duquel cette recette cesse de rapporter. Ce que Brice
    // veut vraiment savoir : jusqu'où elle le mène avant de devoir en changer.
    niveauOuLaRecetteSEteint: recette.niveauRequis + 100
  };
}

/* ============================================================
   CALIBRAGE AUTOMATIQUE PAR L'XP TOTALE DU MÉTIER

   Ce que le jeu donne gratuitement, c'est l'XP CUMULÉE du métier — un seul
   nombre, lisible dans l'interface, que Brice saisit déjà. Ce qu'il ne donne
   nulle part, c'est l'XP de base d'une recette. Réclamer une saisie « XP vue
   par craft » revenait à faire faire à la main une soustraction que la machine
   peut faire seule.

   Le principe tient en une ligne : DEUX RELEVÉS D'XP TOTALE ENCADRANT UN LOT DE
   CRAFTS SUFFISENT. Le gain divisé par le nombre de crafts est l'XP par craft,
   observée au niveau du premier relevé — exactement la mesure que le calibrage
   attend, mais obtenue sans rien taper de plus.

   Deux précautions, et elles ne sont pas décoratives :

     Le gain est attribué À UNE recette, choisie explicitement quand la session
     en contient plusieurs pour le même métier. Répartir au prorata inventerait
     une hypothèse sur des chiffres qu'on cherche justement à mesurer.

     Le relevé précédent est OUBLIÉ une fois le gain attribué. Un même gain
     attribué deux fois donnerait une seconde mesure qui n'en est pas une.
   ============================================================ */

/**
 * Le gain d'XP en attente d'attribution pour un métier, et à quoi l'attribuer.
 *
 * @returns {{gain:number, niveauAuReleve:number, craftsCandidats:Array}|null}
 *          null quand il n'y a pas deux relevés, ou aucun gain
 */
export function decrireLeGainDXPAAttribuer(identifiantDuMetier) {
  const precedent = lireLeReleveDXPPrecedent(identifiantDuMetier);
  if (!precedent) return null;

  const experienceActuelle = lireLExperienceDUnMetier(identifiantDuMetier);
  const gain = experienceActuelle - (precedent.experienceTotale || 0);
  if (!(gain > 0)) return null;

  const craftsCandidats = etatApplication.craftsDeLaSession
    .map(craft => ({ craft, recette: lireLaRecetteConnue(craft.identifiantAnkama) }))
    .filter(entree => entree.recette && entree.recette.jobId === identifiantDuMetier);

  return {
    gain,
    // Le niveau où le lot a été crafté, donc celui auquel la mesure vaut. Pris
    // au relevé de DÉPART : c'est là que les crafts ont commencé.
    niveauAuReleve: calculerLeNiveauDepuisLXP(precedent.experienceTotale || 0),
    craftsCandidats
  };
}

/**
 * Attribue un gain d'XP à une recette, et en déduit son calibrage.
 *
 * @returns {{xpParCraft:number}|null} null si le compte de crafts est absurde
 */
export function calibrerUneRecetteParLeGain(
    identifiantDuMetier, identifiantAnkama, gain, nombreDeCrafts, niveauAuReleve) {
  if (!(gain > 0) || !(nombreDeCrafts > 0)) return null;

  const xpParCraft = Math.round(gain / nombreDeCrafts);
  if (!(xpParCraft > 0)) return null;

  enregistrerLObservationDXP(identifiantAnkama, xpParCraft, niveauAuReleve);
  oublierLeReleveDXPPrecedent(identifiantDuMetier);
  return { xpParCraft };
}
