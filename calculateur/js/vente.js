/**
 * Côté vente d'un craft : la destination, les champs de prix qui en découlent,
 * et la formulation du découpage retenu pour écouler la production.
 *
 * Séparé de `vue.js` pour la même raison que `cellules-de-prix.js` l'est : les
 * règles d'affichage d'un prix se corrigent à un seul endroit, sinon elles
 * dérivent d'une fenêtre à l'autre.
 *
 * TROIS DESTINATIONS, ET POURQUOI CE N'EST PAS UN DÉTAIL D'AFFICHAGE
 *
 *   usage           Ce qui part chez les persos de Brice n'a pas de revenu, et
 *                   n'en aura jamais. Lui coller un profit négatif serait dire
 *                   qu'une potion de rappel craftée est une perte, alors que
 *                   c'est une acquisition : la question utile est « moins cher
 *                   que de l'acheter au HDV ? », pas « combien j'ai perdu ? ».
 *   vente-unitaire  L'équipement. Le HDV le liste pièce par pièce, ses jets de
 *                   stats étant tous différents. Un prix, une ligne, pas de lot
 *                   possible — et ce n'est pas une limite de l'outil.
 *   vente-par-lot   Pains, potions, ressources de métier. Ils s'empilent au HDV
 *                   par 1, 10, 100 et 1000, donc la vente se chiffre par lots,
 *                   exactement comme l'achat. Sans ça, il faut diviser de tête
 *                   pour remplir un champ unitaire — le geste que toute la
 *                   colonne d'achat existe pour éviter.
 */
import {
  TAILLES_DE_LOT_DISPONIBLES, DESTINATION_USAGE_PERSONNEL, DESTINATION_VENTE_UNITAIRE,
  DESTINATION_VENTE_PAR_LOT, DESTINATION_PAR_DEFAUT, INTITULES_DES_DESTINATIONS
} from "./config.js";
import { formaterMontantEnKamas, formaterNombreSimple } from "./formats.js";
import { construireLArbitrageCraftOuAchat } from "./cartes-de-craft.js";

export function lireLaDestination(craft) {
  return craft.destination || DESTINATION_PAR_DEFAUT;
}

/** Sélecteur de destination, un par carte de craft. */
export function construireLeSelecteurDeDestination(craft) {
  const destinationCourante = lireLaDestination(craft);
  const options = Object.keys(INTITULES_DES_DESTINATIONS)
    .map(valeur => '<option value="' + valeur + '"'
      + (valeur === destinationCourante ? " selected" : "") + ">"
      + INTITULES_DES_DESTINATIONS[valeur] + "</option>")
    .join("");

  return '<div class="champ-etiquete"><label class="etiquette">Destination</label>'
    + '<select class="selecteur-destination" data-destination="oui">' + options + "</select></div>";
}

/**
 * Champs de prix de vente, qui dépendent de la destination.
 *
 * En usage personnel il n'y en a aucun, et c'est volontaire : un champ grisé
 * inviterait à le remplir « au cas où », et ce chiffre finirait par entrer dans
 * un total qu'il n'a rien à faire d'alimenter.
 */
export function construireLesChampsDeVente(craft) {
  const destination = lireLaDestination(craft);

  if (destination === DESTINATION_USAGE_PERSONNEL) return "";

  if (destination === DESTINATION_VENTE_UNITAIRE) {
    return '<div class="champ-etiquete"><label class="etiquette">Prix de vente unitaire</label>'
      + '<input data-champ="prixDeVenteUnitaire" value="'
      + (craft.prixDeVenteUnitaire ? formaterNombreSimple(craft.prixDeVenteUnitaire) : "")
      + '" placeholder="ex. 45k"></div>';
  }

  const prixParTailleDeLot = craft.prixDeVenteParTailleDeLot || {};
  let champs = "";
  for (const taille of TAILLES_DE_LOT_DISPONIBLES) {
    const prixDeCeLot = prixParTailleDeLot[taille] || 0;
    champs +=
      '<div class="champ-etiquete"><label class="etiquette">Vente ×' + taille + "</label>"
      + '<input class="champ-vente-lot" data-vente-taille-de-lot="' + taille + '"'
      + ' value="' + (prixDeCeLot ? formaterNombreSimple(prixDeCeLot) : "")
      + '" placeholder="–"></div>';
  }
  return champs;
}

/* ============================================================
   UN CHIFFRE FAUX EST PIRE QUE PAS DE CHIFFRE

   Le coût d'un craft se calcule sur les prix connus, et rien n'obligeait
   jusqu'ici à dire lesquels manquaient. Conséquence : une ressource sans prix
   comptait pour zéro kama, le coût sortait trop bas, et le profit trop haut —
   « crafter fait gagner 12 k par unité » s'affichait alors qu'aucune des trois
   ressources n'avait de prix. Le chiffre était non seulement faux, il était
   faux dans le sens qui pousse à crafter.

   Trois régimes, et la vue les traite différemment :

     tout est chiffré     le bilan s'affiche tel quel.
     une partie manque    les coûts sont MINORÉS et les gains MAJORÉS, donc
                          annoncés comme tels, avec « au moins » et « au plus ».
                          L'ordre de grandeur reste utile, le nombre exact non.
     rien n'est chiffré   il n'y a pas de calcul du tout. On le dit, et on
                          n'affiche aucun montant.
   ============================================================ */

/** Mention qui explique en un coup d'œil ce qui manque, ou chaîne vide. */
function construireLaMentionDePrixManquants(bilan) {
  if (!bilan.auMoinsUnPrixManquant) return "";
  const nombre = bilan.nombreDeCoutsManquants;
  return '<span class="prix-manquant" title="Une ressource sans prix compte pour'
    + " zéro dans le total : le coût est donc plus bas que la réalité, et le"
    + ' profit plus haut.">' + nombre + " ressource(s) sans prix</span>";
}

/**
 * Bilan d'un craft dont aucune ressource n'a de prix.
 *
 * Aucun montant n'y figure, pas même à zéro : un « coût par objet : 0 k » se
 * lit comme un craft gratuit, ce qui est exactement le contresens à éviter.
 */
function construireLeBilanIncalculable(bilan) {
  return '<div class="bilan-ligne bilan-incalculable">'
    + '<span class="prix-manquant">Calcul impossible : aucun prix saisi pour les '
    + bilan.nombreDeCoutsManquants + " ressource(s) de cette recette</span>"
    + '<span class="attenue">renseigne au moins un prix pour obtenir un ordre de grandeur</span>'
    + "</div>";
}

/**
 * Ligne de bilan d'un craft. Trois formulations, parce que trois questions
 * différentes : « combien ça me rapporte », « combien ça me coûte », et dans le
 * cas du lot « comment j'écoule tout ça ».
 */
export function construireLaLigneDeBilan(craft, bilan) {
  if (bilan.coutEntierementInconnu) return construireLeBilanIncalculable(bilan);

  // « au moins » sur un coût partiel : ce qui manque ne peut que l'alourdir.
  const auMoins = bilan.auMoinsUnPrixManquant ? "au moins " : "";
  const auPlus = bilan.auMoinsUnPrixManquant ? "au plus " : "";
  const mentionDeManque = construireLaMentionDePrixManquants(bilan);

  // Un sous-craft n'a ni destination ni revenu : il est consommé par son
  // parent. Les deux seuls chiffres qui le concernent sont ce qu'il coûte et
  // ce qu'il coûterait de l'acheter tout fait — l'arbitrage de la chaîne.
  if (bilan.estUnSousCraft) {
    return '<div class="bilan-ligne">'
      + "<span>Coût par objet <strong>" + auMoins
        + formaterMontantEnKamas(bilan.coutParObjet) + "</strong></span>"
      + "<span>Coût de la branche <strong>" + auMoins
        + formaterMontantEnKamas(bilan.coutDesRessources) + "</strong></span>"
      + construireLArbitrageCraftOuAchat(bilan)
      + mentionDeManque
      + "</div>";
  }

  const destination = lireLaDestination(craft);

  if (destination === DESTINATION_USAGE_PERSONNEL) {
    return '<div class="bilan-ligne">'
      + "<span>Coût par objet <strong>" + auMoins
        + formaterMontantEnKamas(bilan.coutParObjet) + "</strong></span>"
      + "<span>Coût total <strong>" + auMoins
        + formaterMontantEnKamas(bilan.coutDesRessources) + "</strong></span>"
      + '<span class="attenue">pour tes persos, hors résultat de session</span>'
      + mentionDeManque
      + "</div>";
  }

  const classeDuProfit = bilan.profitTotal >= 0 ? "gain" : "perte";
  const signeDuProfit = bilan.profitTotal >= 0 ? "+" : "";

  return '<div class="bilan-ligne">'
    + "<span>Coût par objet <strong>" + auMoins
      + formaterMontantEnKamas(bilan.coutParObjet) + "</strong></span>"
    + '<span>Profit par objet <strong class="' + classeDuProfit + '">' + auPlus + signeDuProfit
      + formaterMontantEnKamas(bilan.profitParObjet) + "</strong></span>"
    + '<span>Total ligne <strong class="' + classeDuProfit + '">' + auPlus + signeDuProfit
      + formaterMontantEnKamas(bilan.profitTotal) + "</strong></span>"
    + '<span class="attenue">Seuil de revente ' + auMoins
      + formaterMontantEnKamas(bilan.prixDeVenteMinimalPourNePasPerdre)
      + (destination === DESTINATION_VENTE_PAR_LOT ? " l'unité" : "") + "</span>"
    + decrireLEcoulement(destination, bilan)
    + mentionDeManque
    + "</div>";
}

/**
 * Comment la production s'écoule, en vente par lot.
 *
 * La mention d'invendu est la plus utile des trois : sans prix ×1, un reliquat
 * de 7 objets sur un lot de 10 ne se vend pas, et son revenu ne doit surtout
 * pas être supposé. Le dire ici évite de croire à une rentabilité qui repose
 * sur une vente impossible.
 */
function decrireLEcoulement(destination, bilan) {
  if (destination !== DESTINATION_VENTE_PAR_LOT) return "";

  if (!bilan.venteOptimale) {
    return '<span class="prix-manquant">aucun prix de vente saisi</span>';
  }

  const morceaux = TAILLES_DE_LOT_DISPONIBLES
    .slice().sort((a, b) => b - a)
    .filter(taille => bilan.venteOptimale.compositionDesVentes[taille])
    .map(taille => bilan.venteOptimale.compositionDesVentes[taille] + " × " + taille);

  const composition = morceaux.length > 0
    ? '<span class="mention-composition" title="Découpage en lots qui rapporte le plus">'
      + "vendre " + morceaux.join(" + ") + "</span>"
    : "";

  const invendu = bilan.quantiteInvendue > 0
    ? '<span class="prix-manquant" title="Aucun lot ne permet d\'écouler ce reliquat.'
      + ' Saisis un prix sur un lot plus petit, le ×1 en général.">'
      + formaterNombreSimple(bilan.quantiteInvendue) + " invendu(s)</span>"
    : "";

  return composition + invendu;
}
