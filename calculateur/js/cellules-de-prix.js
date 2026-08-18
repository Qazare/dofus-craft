/**
 * Fabriques des cellules de prix, partagées par la fenêtre principale et par la
 * fenêtre flottante. Les construire ici plutôt que deux fois évite la dérive où
 * une règle d'affichage n'est corrigée que d'un côté.
 *
 * DEUX SIGNAUX VISUELS ORTHOGONAUX, à ne jamais mélanger :
 *
 *   la BORDURE du champ dit d'où vient le chiffre
 *     violet         relevé par Brice, et publié vers la base
 *     bleu pointillé venu de la base, en repère, remplaçable à la frappe
 *     neutre         local, jamais partagé : lots de 10, 100, 1000 et prix moyen
 *
 *   le FOND de la cellule dit ce que le calcul recommande d'acheter
 *     teinté, barre à gauche   ce lot fait partie du panier retenu
 *     neutre                   ce lot n'est pas retenu pour cette quantité
 *
 * C'est la raison du changement : le vert d'entourage servait autrefois à la
 * recommandation, il entrait désormais en conflit avec le codage de provenance.
 * Une bordure ne peut pas dire deux choses à la fois.
 */
import {
  TAILLES_DE_LOT_DISPONIBLES, TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE,
  TAILLE_DE_LOT_PAR_DEFAUT_POUR_LE_PRIX_MOYEN, NOM_DU_SERVEUR_SUIVI,
  NOMBRE_DE_JOURS_AVANT_PRIX_CONSIDERE_ANCIEN
} from "./config.js";
import { etatApplication, deduireLePrixMoyenUnitaire } from "./etat.js";
import { formaterNombreSimple, formulerLAge, calculerAgeEnJoursDepuis, echapperPourHtml } from "./formats.js";

/** Nombre de lots de cette taille retenus par le calcul, 0 si aucun. */
function compterLesLotsRetenus(ligne, taille) {
  if (!ligne.achatOptimal || ligne.achatOptimal.methodeDeCalcul !== "lots") return 0;
  return (ligne.achatOptimal.compositionDesAchats || {})[taille] || 0;
}

/** Attributs de la cellule quand le calcul recommande d'acheter par ce lot. */
function habillerLaCelluleRecommandee(nombreDeLots, taille) {
  if (nombreDeLots <= 0) return "";
  return ' class="cellule-recommandee" title="Le calcul retient ' + nombreDeLots
    + " lot(s) de " + taille + '"';
}

/**
 * Cellule du prix unitaire, la colonne ×1.
 *
 * Colonne à part depuis l'ouverture sur la base : c'est le seul prix qui existe
 * ailleurs que sur cette machine. La base ne connaît qu'un prix par ressource et
 * par serveur, le vrai prix relevé au HDV, et c'est celui-là.
 */
export function construireLaCelluleDuPrixUnitaire(ligne) {
  const identifiant = ligne.besoin.identifiantAnkama;
  const fichePrix = etatApplication.basePrixDesRessources[identifiant];
  const prixPersonnel = fichePrix && fichePrix.prixParTailleDeLot
    ? (fichePrix.prixParTailleDeLot[TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE] || 0) : 0;

  const nombreDeLotsRetenus = compterLesLotsRetenus(ligne, TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE);

  // Le repère communautaire n'occupe que le texte de remplacement : le champ
  // reste vide, donc rien n'est enregistré au nom de Brice et la première frappe
  // part d'un champ propre.
  const proposerLeRepere = prixPersonnel <= 0 && ligne.prixCommunautaire
    && ligne.prixCommunautaire.prixUnitaire > 0;

  let classes = "champ-prix-lot";
  let infoBulle = "";

  if (prixPersonnel > 0) {
    classes += " prix-a-moi";
    const suivi = ligne.publication || {};
    if (suivi.etat === "envoi") classes += " publication-en-cours";
    else if (suivi.etat === "echec") classes += " publication-en-echec";
    else if (suivi.etat === "publie") classes += " publication-faite";

    infoBulle = suivi.etat === "publie"
      ? "Ton relevé, publié sur " + NOM_DU_SERVEUR_SUIVI + " " + (formulerLAge(suivi.horodatage) || "")
      : suivi.etat === "echec"
        ? "Ton relevé, NON publié : " + (suivi.message || "échec inconnu")
        : suivi.etat === "envoi"
          ? "Publication en cours…"
          : "Ton relevé, pas encore publié";

  } else if (proposerLeRepere) {
    classes += " prix-de-la-base";
    infoBulle = "Prix relevé par la communauté sur " + NOM_DU_SERVEUR_SUIVI + ", "
      + (formulerLAge(ligne.prixCommunautaire.horodatageDuReleve) || "date inconnue")
      + ". Saisis le tien pour le remplacer et le publier.";
  }

  return "<td" + habillerLaCelluleRecommandee(nombreDeLotsRetenus, TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE) + ">"
    + '<input class="' + classes + '"'
    + ' data-taille-de-lot="' + TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE + '"'
    + (infoBulle ? ' title="' + echapperPourHtml(infoBulle) + '"' : "")
    + ' value="' + (prixPersonnel ? formaterNombreSimple(prixPersonnel) : "") + '"'
    + ' placeholder="' + (proposerLeRepere
        ? formaterNombreSimple(ligne.prixCommunautaire.prixUnitaire) : "–") + '">'
    + "</td>";
}

/**
 * Les cellules des lots de 10, 100 et 1000. Purement locales : l'API ne sait
 * pas représenter un prix de lot, et en inventer un serait fabriquer une donnée
 * que personne n'a relevée.
 */
export function construireLesCellulesDesGrosLots(ligne) {
  const fichePrix = etatApplication.basePrixDesRessources[ligne.besoin.identifiantAnkama];
  const prixParTailleDeLot = fichePrix ? (fichePrix.prixParTailleDeLot || {}) : {};

  let cellules = "";
  for (const taille of TAILLES_DE_LOT_DISPONIBLES) {
    if (taille === TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE) continue;
    const prixDeCeLot = prixParTailleDeLot[taille] || 0;
    const nombreDeLotsRetenus = compterLesLotsRetenus(ligne, taille);

    cellules += "<td" + habillerLaCelluleRecommandee(nombreDeLotsRetenus, taille) + ">"
      + '<input class="champ-prix-lot" data-taille-de-lot="' + taille + '"'
      + ' value="' + (prixDeCeLot ? formaterNombreSimple(prixDeCeLot) : "") + '" placeholder="–">'
      + "</td>";
  }
  return cellules;
}

/**
 * Cellule du prix moyen : le montant du lot tel que le HDV l'affiche, et la
 * taille du lot sur lequel il a été relevé. L'unitaire est déduit, jamais saisi,
 * et rappelé en info-bulle.
 *
 * Locale elle aussi. Le prix moyen affiché par le jeu n'est pas un prix de vente
 * réel, il n'a rien à faire dans une base de prix de HDV.
 */
export function construireLaCelluleDuPrixMoyen(ligne) {
  const fichePrix = etatApplication.basePrixDesRessources[ligne.besoin.identifiantAnkama];

  const prixMoyenDuLot = fichePrix ? (fichePrix.prixMoyenDuLot || 0) : 0;
  const tailleDuLot = (fichePrix && fichePrix.tailleDuLotDuPrixMoyen)
    || TAILLE_DE_LOT_PAR_DEFAUT_POUR_LE_PRIX_MOYEN;
  const unitaireDeduit = deduireLePrixMoyenUnitaire(fichePrix);

  const leCoutVientDuPrixMoyen =
    ligne.achatOptimal && ligne.achatOptimal.methodeDeCalcul === "prix moyen";

  const optionsDeTaille = TAILLES_DE_LOT_DISPONIBLES
    .map(taille => '<option value="' + taille + '"'
      + (taille === tailleDuLot ? " selected" : "") + ">×" + taille + "</option>")
    .join("");

  const infoBulle = unitaireDeduit > 0
    ? ' title="soit ' + formaterNombreSimple(unitaireDeduit) + " kamas l'unité\""
    : "";

  return "<td" + (leCoutVientDuPrixMoyen ? ' class="cellule-recommandee"'
                                          + ' title="Le coût repose sur ce prix moyen"' : "") + ">"
    + '<div class="cellule-prix-moyen"' + infoBulle + ">"
    + '<input class="champ-prix-lot" data-prix-moyen="oui" value="'
    + (prixMoyenDuLot ? formaterNombreSimple(prixMoyenDuLot) : "") + '" placeholder="–">'
    + '<select class="selecteur-taille-lot" data-taille-du-prix-moyen="oui">'
    + optionsDeTaille + "</select></div></td>";
}

/* ============================================================
   Mentions affichées à côté du nom de la ressource
   ============================================================ */

/**
 * Pastille de provenance et de fraîcheur.
 *
 * La fraîcheur compte autant que le montant : la base contient des relevés du
 * jour à côté de relevés de plusieurs mois, et un prix sans sa date y est
 * trompeur. La pastille vire à l'orange passé le seuil d'ancienneté, le même
 * que pour les relevés de Brice.
 */
export function construireLaPastilleDeProvenance(ligne) {
  if (ligne.origineDuPrixUnitaire === "communautaire" && ligne.prixCommunautaire) {
    const age = calculerAgeEnJoursDepuis(ligne.prixCommunautaire.horodatageDuReleve);
    const estAncien = age === null || age >= NOMBRE_DE_JOURS_AVANT_PRIX_CONSIDERE_ANCIEN;
    return ' <span class="pastille pastille-base' + (estAncien ? " pastille-ancienne" : "") + '"'
      + ' title="' + echapperPourHtml("Prix communautaire " + NOM_DU_SERVEUR_SUIVI + ", "
        + formaterNombreSimple(ligne.prixCommunautaire.prixUnitaire) + " kamas l'unité, "
        + (formulerLAge(ligne.prixCommunautaire.horodatageDuReleve) || "date inconnue")) + '">'
      + "base" + (age === null ? "" : " " + age + " j") + "</span>";
  }

  if (ligne.origineDuPrixUnitaire === "personnel") {
    const suivi = ligne.publication || {};
    if (suivi.etat === "echec") {
      return ' <span class="pastille pastille-echec" title="'
        + echapperPourHtml("Non publié : " + (suivi.message || "échec inconnu")) + '">non publié</span>';
    }
    if (suivi.etat === "envoi") {
      return ' <span class="pastille pastille-envoi">envoi…</span>';
    }
    if (suivi.etat === "publie") {
      return ' <span class="pastille pastille-a-moi" title="'
        + echapperPourHtml("Ton relevé, publié " + (formulerLAge(suivi.horodatage) || "")) + '">publié</span>';
    }
    return ' <span class="pastille pastille-a-moi" title="Ton relevé, local">à moi</span>';
  }

  return "";
}

/**
 * Signale que la base dit autre chose que Brice sur le prix unitaire. Ni erreur
 * ni conflit à trancher : l'un des deux relevés est simplement plus frais. Le
 * sien continue de primer, la mention n'est qu'une invitation à regarder.
 */
export function construireLaMentionDeDesaccord(ligne) {
  if (!ligne.desaccordAvecLaBase) return "";
  return ' <span class="pastille pastille-desaccord" title="'
    + echapperPourHtml("La base annonce "
      + formaterNombreSimple(ligne.desaccordAvecLaBase.prixUnitaire) + " kamas, "
      + (formulerLAge(ligne.desaccordAvecLaBase.horodatageDuReleve) || "date inconnue")
      + ". Ton prix reste retenu. Vide le champ pour adopter celui de la base.") + '">base '
    + formaterNombreSimple(ligne.desaccordAvecLaBase.prixUnitaire) + "</span>";
}
