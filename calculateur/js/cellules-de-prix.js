/**
 * Fabriques des cellules de prix, partagées par la fenêtre principale et par la
 * fenêtre flottante. Les construire ici plutôt que deux fois évite la dérive où
 * une règle d'affichage n'est corrigée que d'un côté.
 *
 * DEUX SIGNAUX VISUELS ORTHOGONAUX, à ne jamais mélanger :
 *
 *   la BORDURE du champ dit d'où vient le chiffre
 *     violet           relevé par Brice, et publié vers la base
 *     bleu pointillé   venu de la base, en repère, remplaçable à la frappe
 *     orange pointillé lu par l'OCR, en QUARANTAINE, non confirmé
 *     neutre           local, jamais partagé : lots de 10, 100, 1000 et prix moyen
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
import { lireLaQuarantaine, lireLeMontantEnQuarantaine } from "./quarantaine.js";
import { formaterNombreSimple, formulerLAge, calculerAgeEnJoursDepuis, echapperPourHtml } from "./formats.js";

/* ============================================================
   Quarantaine de l'OCR

   Une valeur lue par la machine s'affiche, mais n'est jamais le contenu du
   champ : elle occupe le texte de remplacement, en orange pointillé. Le champ
   reste donc vide, et une frappe part d'un champ propre — même règle que pour
   le repère communautaire, et pour la même raison.

   La coche est le seul passage vers la base personnelle. Un clic dessus écrit
   la valeur, la fait passer au violet, et l'envoie à dofus-calculator si c'est
   un ×1. Rien d'autre ne l'y fait entrer.

   Une cellule en quarantaine ne reçoit JAMAIS de fond de recommandation :
   recommander un achat sur un chiffre non vérifié serait le pire des deux
   mondes. Le calcul ne la voit d'ailleurs pas, elle n'est pas dans la base.
   ============================================================ */

/**
 * Enrobe un champ de sa coche de confirmation, quand une valeur d'OCR attend.
 * Sans valeur en attente, le champ est rendu tel quel : pas de bouton mort.
 */
function habillerDeLaCocheDeConfirmation(champHtml, tailleDeLot, montantEnAttente) {
  if (!(montantEnAttente > 0)) return champHtml;
  return '<div class="cellule-avec-coche">' + champHtml
    + '<button class="coche-ocr" data-confirmer-ocr="' + tailleDeLot + '"'
    + ' title="' + echapperPourHtml("Confirmer " + formaterNombreSimple(montantEnAttente)
        + " kamas lu par l'OCR"
        + (tailleDeLot === TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE
            ? ". Il passera au violet et partira vers la base." : ". Il restera local."))
    + '">\u2713</button></div>';
}

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
function construireLePrixUnitaire(ligne) {
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

  // La quarantaine passe devant le repère communautaire : c'est un relevé que
  // Brice vient de faire au HDV, l'autre vient de quelqu'un d'autre et date.
  const montantEnQuarantaine = prixPersonnel > 0
    ? 0 : lireLeMontantEnQuarantaine(identifiant, TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE);

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

  } else if (montantEnQuarantaine > 0) {
    classes += " prix-en-quarantaine";
    const ficheEnAttente = lireLaQuarantaine(identifiant);
    infoBulle = "Lu par l'OCR, non confirmé. Hors des totaux et impossible à publier "
      + "tant que tu ne l'as pas validé d'un clic sur la coche."
      + (ficheEnAttente && ficheEnAttente.anomalies && ficheEnAttente.anomalies.length > 0
          ? " À regarder de près : " + ficheEnAttente.anomalies.join(" ; ") + "." : "");

  } else if (proposerLeRepere) {
    classes += " prix-de-la-base";
    infoBulle = "Prix relevé par la communauté sur " + NOM_DU_SERVEUR_SUIVI + ", "
      + (formulerLAge(ligne.prixCommunautaire.horodatageDuReleve) || "date inconnue")
      + ". Saisis le tien pour le remplacer et le publier.";
  }

  const texteDeRemplacement = montantEnQuarantaine > 0
    ? formaterNombreSimple(montantEnQuarantaine)
    : (proposerLeRepere ? formaterNombreSimple(ligne.prixCommunautaire.prixUnitaire) : "–");

  const champ = '<input class="' + classes + '"'
    + ' data-taille-de-lot="' + TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE + '"'
    + (infoBulle ? ' title="' + echapperPourHtml(infoBulle) + '"' : "")
    + ' value="' + (prixPersonnel ? formaterNombreSimple(prixPersonnel) : "") + '"'
    + ' placeholder="' + texteDeRemplacement + '">';

  // Pas de fond de recommandation sur une cellule en quarantaine : le calcul ne
  // voit pas cette valeur, afficher un conseil d'achat dessus serait un mensonge.
  const habillage = montantEnQuarantaine > 0
    ? "" : habillerLaCelluleRecommandee(nombreDeLotsRetenus, TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE);

  return {
    habillage,
    contenu: habillerDeLaCocheDeConfirmation(
      champ, TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE, montantEnQuarantaine)
  };
}

/** La colonne ×1 d'un tableau. */
export function construireLaCelluleDuPrixUnitaire(ligne) {
  const cellule = construireLePrixUnitaire(ligne);
  return "<td" + cellule.habillage + ">" + cellule.contenu + "</td>";
}

/**
 * Le même champ ×1, hors d'un tableau.
 *
 * La liste de courses de la fenêtre flottante n'est plus un tableau, et un
 * `<td>` posé dans un `<li>` est purement et simplement supprimé par
 * l'analyseur HTML : le champ disparaîtrait, ou perdrait son habillage. Une
 * seule fabrique, deux enrobages — c'est la règle qui vaut déjà pour le reste
 * de ce module.
 */
export function construireLaCaseDuPrixUnitaire(ligne) {
  const cellule = construireLePrixUnitaire(ligne);
  return "<span" + (cellule.habillage
      ? cellule.habillage.replace('class="', 'class="case-prix-unitaire ')
      : ' class="case-prix-unitaire"')
    + ">" + cellule.contenu + "</span>";
}

/**
 * Les cellules des lots de 10, 100 et 1000. Purement locales : l'API ne sait
 * pas représenter un prix de lot, et en inventer un serait fabriquer une donnée
 * que personne n'a relevée.
 */
export function construireLesCellulesDesGrosLots(ligne) {
  const fichePrix = etatApplication.basePrixDesRessources[ligne.besoin.identifiantAnkama];
  const prixParTailleDeLot = fichePrix ? (fichePrix.prixParTailleDeLot || {}) : {};

  const identifiant = ligne.besoin.identifiantAnkama;

  let cellules = "";
  for (const taille of TAILLES_DE_LOT_DISPONIBLES) {
    if (taille === TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE) continue;
    const prixDeCeLot = prixParTailleDeLot[taille] || 0;
    const nombreDeLotsRetenus = compterLesLotsRetenus(ligne, taille);
    const montantEnQuarantaine = prixDeCeLot > 0 ? 0 : lireLeMontantEnQuarantaine(identifiant, taille);

    const champ = '<input class="champ-prix-lot'
      + (montantEnQuarantaine > 0 ? " prix-en-quarantaine" : "") + '"'
      + ' data-taille-de-lot="' + taille + '"'
      + (montantEnQuarantaine > 0
          ? ' title="' + echapperPourHtml("Lu par l'OCR, non confirmé. Hors des totaux tant "
              + "que la coche n'est pas cliquée.") + '"'
          : "")
      + ' value="' + (prixDeCeLot ? formaterNombreSimple(prixDeCeLot) : "") + '"'
      + ' placeholder="' + (montantEnQuarantaine > 0
          ? formaterNombreSimple(montantEnQuarantaine) : "–") + '">';

    cellules += "<td"
      + (montantEnQuarantaine > 0 ? "" : habillerLaCelluleRecommandee(nombreDeLotsRetenus, taille)) + ">"
      + habillerDeLaCocheDeConfirmation(champ, taille, montantEnQuarantaine)
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
export function construireLaPastilleDeQuarantaine(ligne) {
  const fiche = lireLaQuarantaine(ligne.besoin.identifiantAnkama);
  if (!fiche) return "";

  const nombreDeValeurs = Object.keys(fiche.prixParTailleDeLot || {}).length;
  if (nombreDeValeurs === 0 && !(fiche.prixMoyenDuLot > 0)) return "";

  const alerte = fiche.confianceBasse
    ? " À regarder en premier : " + (fiche.anomalies || []).join(" ; ") : "";

  return ' <span class="pastille pastille-quarantaine'
    + (fiche.confianceBasse ? " pastille-douteuse" : "") + '"'
    + ' data-confirmer-toute-la-ligne="oui" role="button" tabindex="0"'
    + ' title="' + echapperPourHtml(nombreDeValeurs + " prix lu(s) par l'OCR, en attente. "
      + "Clic pour tout confirmer d'un coup." + alerte) + '">'
    + "OCR " + nombreDeValeurs + " \u2713</span>"
    + ' <span class="pastille pastille-rejet" data-oublier-quarantaine="oui"'
    + ' role="button" tabindex="0"'
    + ' title="Jeter cette lecture sans la confirmer. Rien n\'entre en base.">\u00d7</span>';
}

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
