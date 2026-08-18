/**
 * Interprétation des saisies et mise en forme des nombres.
 * Aucune dépendance : ce module doit rester testable seul.
 */

/**
 * Interprète une saisie de prix tolérante : "12k", "1,5m", "45 000" ou "3200".
 * @returns {number} le montant en kamas, 0 si la saisie est vide ou illisible
 */
export function interpreterSaisieDeMontant(saisieBrute) {
  if (saisieBrute === null || saisieBrute === undefined) return 0;

  const texteNettoye = String(saisieBrute)
    .toLowerCase()
    .replace(/\s| /g, "")   // espaces, y compris insécables
    .replace(",", ".");

  if (texteNettoye === "") return 0;

  const correspondance = texteNettoye.match(/^([0-9]*\.?[0-9]+)([km])?$/);
  if (!correspondance) return 0;

  const valeurNumerique = parseFloat(correspondance[1]);
  const suffixeMultiplicateur = correspondance[2];

  if (suffixeMultiplicateur === "k") return Math.round(valeurNumerique * 1000);
  if (suffixeMultiplicateur === "m") return Math.round(valeurNumerique * 1000000);
  return Math.round(valeurNumerique);
}

export function formaterMontantEnKamas(montant) {
  return formaterNombreSimple(montant) + " k";
}

export function formaterNombreSimple(valeur) {
  return Math.round(valeur || 0).toLocaleString("fr-FR").replace(/ | /g, " ");
}

export function calculerAgeEnJoursDepuis(horodatageMillisecondes) {
  if (!horodatageMillisecondes) return null;
  return Math.floor((Date.now() - horodatageMillisecondes) / 86400000);
}

/** « aujourd'hui », « il y a 3 jours », ou null si la date est inconnue. */
export function formulerLAge(horodatageMillisecondes) {
  const ageEnJours = calculerAgeEnJoursDepuis(horodatageMillisecondes);
  if (ageEnJours === null) return null;
  if (ageEnJours === 0) return "aujourd'hui";
  if (ageEnJours === 1) return "hier";
  return "il y a " + ageEnJours + " jours";
}

/** Échappe un texte destiné à être injecté dans du HTML construit à la main. */
export function echapperPourHtml(texte) {
  return String(texte === null || texte === undefined ? "" : texte)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
