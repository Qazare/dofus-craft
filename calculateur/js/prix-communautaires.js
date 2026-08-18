/**
 * Lecture du cache des prix communautaires et détermination de la provenance
 * d'un prix unitaire. Aucun accès réseau ici : ce module doit rester pur, pour
 * que l'affichage et le calcul puissent l'appeler sans effet de bord.
 *
 * Le fait structurant, corrigé le 18 08 2026 : le prix de la base n'est pas une
 * moyenne, c'est le vrai prix unitaire relevé au HDV. Il a donc exactement le
 * même statut qu'une saisie dans la colonne ×1, et se compare à elle. Le traiter
 * comme un « prix moyen », ce que faisait la première intégration, revenait à
 * lui refuser le calcul d'achat par lots auquel il a droit.
 */
import { etatApplication } from "./etat.js";
import { TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE } from "./config.js";

/**
 * Relevé communautaire connu pour une ressource, ou null.
 * Point de lecture unique du cache.
 */
export function obtenirLePrixCommunautaire(identifiantAnkama) {
  const enCache = (etatApplication.prixCommunautairesParRessource || {})[identifiantAnkama];
  if (!enCache || !(enCache.prixUnitaire > 0)) return null;
  return enCache;
}

/** Identifiant interne dofus-calculator, seul accepté à l'écriture. */
export function obtenirLIdentifiantInterne(identifiantAnkama) {
  const enCache = (etatApplication.prixCommunautairesParRessource || {})[identifiantAnkama];
  return enCache && enCache.identifiantInterne ? enCache.identifiantInterne : null;
}

/** Prix ×1 saisi par Brice pour cette ressource, 0 s'il n'y en a pas. */
export function lirePrixUnitairePersonnel(fichePrix) {
  if (!fichePrix || !fichePrix.prixParTailleDeLot) return 0;
  return fichePrix.prixParTailleDeLot[TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE] || 0;
}

/**
 * Prix unitaire à retenir pour une ressource, et d'où il vient.
 *
 * Une seule règle de préséance dans toute l'application : ce que Brice a relevé
 * lui-même passe devant ce que la base propose. Le prix communautaire ne comble
 * qu'un vide, il ne conteste jamais une saisie.
 *
 * @returns {{prix:number, origine:"personnel"|"communautaire"|null}}
 */
export function determinerLePrixUnitaire(identifiantAnkama, fichePrix) {
  const prixPersonnel = lirePrixUnitairePersonnel(fichePrix);
  if (prixPersonnel > 0) return { prix: prixPersonnel, origine: "personnel" };

  const releve = obtenirLePrixCommunautaire(identifiantAnkama);
  if (releve) return { prix: releve.prixUnitaire, origine: "communautaire" };

  return { prix: 0, origine: null };
}

/**
 * Prix de lot effectivement utilisables par le moteur de calcul.
 *
 * Le ×1 peut venir de la base, les autres tailles ne peuvent venir que de Brice :
 * l'API ne connaît qu'un prix par ressource, celui de l'unité. Inventer un prix
 * de lot de 100 à partir de lui serait fabriquer une donnée que personne n'a
 * relevée, et le calcul de surachat perdrait tout son sens.
 */
export function construireLesPrixDeLotEffectifs(identifiantAnkama, fichePrix) {
  const prixEffectifs = Object.assign({}, fichePrix ? fichePrix.prixParTailleDeLot : null);
  const unitaire = determinerLePrixUnitaire(identifiantAnkama, fichePrix);
  if (unitaire.prix > 0) prixEffectifs[TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE] = unitaire.prix;
  return prixEffectifs;
}

/* ============================================================
   Suivi des publications
   ============================================================ */

/**
 * État d'envoi d'une ressource vers la base.
 * @returns {{etat:"jamais"|"envoi"|"publie"|"echec", message:string|null,
 *            prixEnvoye:number|null, horodatage:number|null}}
 */
export function lireLEtatDePublication(identifiantAnkama) {
  const suivi = (etatApplication.publicationParRessource || {})[identifiantAnkama];
  if (!suivi) return { etat: "jamais", message: null, prixEnvoye: null, horodatage: null };
  return suivi;
}

export function ecrireLEtatDePublication(identifiantAnkama, suivi) {
  if (!etatApplication.publicationParRessource) etatApplication.publicationParRessource = {};
  etatApplication.publicationParRessource[identifiantAnkama] =
    Object.assign(lireLEtatDePublication(identifiantAnkama), suivi, { horodatage: Date.now() });
}

/**
 * Vrai quand la base et Brice ne disent pas la même chose : il a un prix ×1, la
 * base en a un autre. Ce n'est pas une erreur, seulement une divergence à
 * signaler discrètement, le relevé de l'un ou de l'autre pouvant être le plus
 * frais. Le sien continue de primer.
 */
export function laBaseEstEnDesaccord(identifiantAnkama, fichePrix) {
  const prixPersonnel = lirePrixUnitairePersonnel(fichePrix);
  if (prixPersonnel <= 0) return null;

  const releve = obtenirLePrixCommunautaire(identifiantAnkama);
  if (!releve || releve.prixUnitaire === prixPersonnel) return null;

  return releve;
}
