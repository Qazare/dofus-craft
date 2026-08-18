/**
 * Moteur de calcul. Fonctions pures, sans état ni DOM : c'est ce qui rend ce
 * module testable directement sous Node.
 *
 * Cœur du problème : acheter N unités d'une ressource au meilleur prix, sachant
 * qu'on peut acheter par 1, 10, 100 ou 1000, et que le meilleur prix unitaire
 * n'est pas forcément sur le plus gros lot.
 *
 * Attention au piège : la solution gloutonne, qui prend toujours le lot au
 * meilleur prix unitaire, n'est pas optimale. Il faut 12 unités, le lot de 10
 * coûte 50 kamas et l'unité 100 : le glouton achète 1 lot de 10 puis 2 unités,
 * soit 250 kamas, alors que 2 lots de 10 en coûtent 100 pour 20 unités. Il faut
 * donc autoriser le surachat, ce que fait la programmation dynamique ci-dessous.
 */
import {
  TAILLES_DE_LOT_DISPONIBLES, QUANTITE_MAXIMALE_TRAITEE_PAR_PROGRAMMATION_DYNAMIQUE
} from "./config.js";

/**
 * Détermine la façon la moins chère d'obtenir AU MOINS la quantité demandée.
 *
 * @param {number} quantiteNecessaire
 * @param {Object} prixParTailleDeLot  taille de lot vers prix du lot
 * @returns {{coutTotal:number, compositionDesAchats:Object, prixUnitaireEffectif:number}|null}
 *          null si aucun prix n'est utilisable pour cette ressource
 */
export function calculerLAchatLeMoinsCher(quantiteNecessaire, prixParTailleDeLot) {
  const lotsUtilisables = TAILLES_DE_LOT_DISPONIBLES
    .map(taille => ({ taille, prix: prixParTailleDeLot ? (prixParTailleDeLot[taille] || 0) : 0 }))
    .filter(lot => lot.prix > 0);

  if (lotsUtilisables.length === 0) return null;
  if (quantiteNecessaire <= 0) {
    return { coutTotal: 0, compositionDesAchats: {}, prixUnitaireEffectif: 0 };
  }

  // Garde-fou : au-delà d'une certaine quantité on retombe sur une heuristique
  // gloutonne, le tableau de programmation dynamique deviendrait trop lourd.
  if (quantiteNecessaire > QUANTITE_MAXIMALE_TRAITEE_PAR_PROGRAMMATION_DYNAMIQUE) {
    return calculerLAchatParHeuristiqueGloutonne(quantiteNecessaire, lotsUtilisables);
  }

  // coutMinimalPourQuantite[q] = coût minimal pour obtenir au moins q unités.
  const coutMinimalPourQuantite = new Float64Array(quantiteNecessaire + 1);
  const dernierLotChoisiPourQuantite = new Int32Array(quantiteNecessaire + 1);

  for (let quantite = 1; quantite <= quantiteNecessaire; quantite++) {
    let meilleurCout = Infinity;
    let meilleureTailleDeLot = 0;

    for (const lot of lotsUtilisables) {
      const quantiteRestante = Math.max(0, quantite - lot.taille);
      const coutCandidat = lot.prix + coutMinimalPourQuantite[quantiteRestante];
      if (coutCandidat < meilleurCout) {
        meilleurCout = coutCandidat;
        meilleureTailleDeLot = lot.taille;
      }
    }

    coutMinimalPourQuantite[quantite] = meilleurCout;
    dernierLotChoisiPourQuantite[quantite] = meilleureTailleDeLot;
  }

  // Reconstitution du panier en remontant les choix enregistrés.
  const compositionDesAchats = {};
  let quantiteRestanteAReconstituer = quantiteNecessaire;
  while (quantiteRestanteAReconstituer > 0) {
    const tailleChoisie = dernierLotChoisiPourQuantite[quantiteRestanteAReconstituer];
    compositionDesAchats[tailleChoisie] = (compositionDesAchats[tailleChoisie] || 0) + 1;
    quantiteRestanteAReconstituer = Math.max(0, quantiteRestanteAReconstituer - tailleChoisie);
  }

  const coutTotal = coutMinimalPourQuantite[quantiteNecessaire];
  return {
    coutTotal,
    compositionDesAchats,
    prixUnitaireEffectif: coutTotal / quantiteNecessaire
  };
}

/** Repli pour les très grandes quantités : meilleur prix unitaire, puis complément. */
export function calculerLAchatParHeuristiqueGloutonne(quantiteNecessaire, lotsUtilisables) {
  const lotsTriesParPrixUnitaire = lotsUtilisables
    .slice().sort((a, b) => (a.prix / a.taille) - (b.prix / b.taille));

  const compositionDesAchats = {};
  let quantiteRestante = quantiteNecessaire;
  let coutTotal = 0;

  for (const lot of lotsTriesParPrixUnitaire) {
    const nombreDeLotsEntiers = Math.floor(quantiteRestante / lot.taille);
    if (nombreDeLotsEntiers > 0) {
      compositionDesAchats[lot.taille] = nombreDeLotsEntiers;
      coutTotal += nombreDeLotsEntiers * lot.prix;
      quantiteRestante -= nombreDeLotsEntiers * lot.taille;
    }
  }
  if (quantiteRestante > 0) {
    const lotLePlusPetit = lotsTriesParPrixUnitaire.reduce((a, b) => a.taille < b.taille ? a : b);
    const nombreDeLotsSupplementaires = Math.ceil(quantiteRestante / lotLePlusPetit.taille);
    compositionDesAchats[lotLePlusPetit.taille] =
      (compositionDesAchats[lotLePlusPetit.taille] || 0) + nombreDeLotsSupplementaires;
    coutTotal += nombreDeLotsSupplementaires * lotLePlusPetit.prix;
  }

  return {
    coutTotal,
    compositionDesAchats,
    prixUnitaireEffectif: coutTotal / quantiteNecessaire
  };
}

/**
 * Chiffre l'approvisionnement d'une ressource.
 *
 * Depuis que le prix communautaire est reconnu comme un vrai prix unitaire, il
 * entre dans le calcul d'achat par lots au lieu de rester cantonné à une
 * estimation linéaire : un ×1 venu de la base et un ×10 relevé par Brice se
 * combinent, et le surachat est arbitré normalement entre les deux. C'est le
 * gain principal de la correction de sémantique.
 *
 * @param {number} quantiteNecessaire
 * @param {Object} entrees
 * @param {Object} entrees.prixDeLotEffectifs   taille vers prix, ×1 pouvant venir de la base
 * @param {number} entrees.prixMoyenUnitaire    déduit du prix moyen saisi, 0 si absent
 * @param {boolean} entrees.modeEstimation      court-circuite les lots
 * @param {number} entrees.prixUnitaireDeRepli  unitaire à utiliser en estimation faute de prix moyen
 * @returns {{coutTotal:number, prixUnitaireEffectif:number,
 *            compositionDesAchats:Object|null, methodeDeCalcul:string}|null}
 */
export function calculerLApprovisionnementDUneRessource(quantiteNecessaire, entrees) {
  const options = entrees || {};
  const prixMoyenUnitaire = options.prixMoyenUnitaire || 0;
  const prixUnitaireDeRepli = options.prixUnitaireDeRepli || 0;

  const estimation = (prixUnitaire, methode) => ({
    coutTotal: prixUnitaire * quantiteNecessaire,
    prixUnitaireEffectif: prixUnitaire,
    compositionDesAchats: null,
    methodeDeCalcul: methode
  });

  if (options.modeEstimation) {
    if (prixMoyenUnitaire > 0) return estimation(prixMoyenUnitaire, "prix moyen");
    if (prixUnitaireDeRepli > 0) return estimation(prixUnitaireDeRepli, "prix unitaire");
  }

  const achatParLots = calculerLAchatLeMoinsCher(quantiteNecessaire, options.prixDeLotEffectifs);
  if (achatParLots !== null) {
    achatParLots.methodeDeCalcul = "lots";
    return achatParLots;
  }

  if (prixMoyenUnitaire > 0) return estimation(prixMoyenUnitaire, "prix moyen");
  return null;
}
