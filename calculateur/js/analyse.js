/**
 * Analyse complète de la session : agrège les ressources de toutes les recettes,
 * chiffre l'achat groupé, puis répartit le coût entre les objets au prorata.
 *
 * Acheter en lot pour plusieurs recettes à la fois coûte moins cher que recette
 * par recette : c'est pour cela que l'agrégation précède le chiffrage, et que le
 * coût par objet est une quote-part et non un calcul isolé.
 */
import { etatApplication, deduireLePrixMoyenUnitaire } from "./etat.js";
import { calculerLApprovisionnementDUneRessource, calculerLaVenteLaPlusRentable } from "./moteur.js";
import {
  DESTINATION_USAGE_PERSONNEL, DESTINATION_VENTE_PAR_LOT, DESTINATION_PAR_DEFAUT
} from "./config.js";
import {
  construireLesPrixDeLotEffectifs, determinerLePrixUnitaire,
  obtenirLePrixCommunautaire, laBaseEstEnDesaccord, lireLEtatDePublication
} from "./prix-communautaires.js";

export function analyserLaSessionComplete() {
  const tauxDeTaxe = (etatApplication.tauxDeTaxeEnPourcent || 0) / 100;

  // --- Étape 1 : agrégation des besoins, toutes recettes confondues ---
  const besoinsAgregesParRessource = {};

  for (const craft of etatApplication.craftsDeLaSession) {
    const quantiteACrafter = Math.max(0, craft.quantiteACrafter || 0);
    for (const ingredient of craft.ingredients) {
      const cle = ingredient.identifiantAnkama;
      if (!besoinsAgregesParRessource[cle]) {
        besoinsAgregesParRessource[cle] = {
          identifiantAnkama: cle,
          sousType: ingredient.sousType,
          nom: ingredient.nom,
          adresseIcone: ingredient.adresseIcone,
          quantiteTotaleNecessaire: 0
        };
      }
      besoinsAgregesParRessource[cle].quantiteTotaleNecessaire +=
        ingredient.quantiteParCraft * quantiteACrafter;
    }
  }

  // --- Étape 2 : chiffrage de l'achat groupé, ressource par ressource ---
  const lignesDeRessources = [];
  let coutTotalDesRessources = 0;
  let nombreDeRessourcesSansPrix = 0;

  for (const cle of Object.keys(besoinsAgregesParRessource)) {
    const besoin = besoinsAgregesParRessource[cle];
    const fichePrix = etatApplication.basePrixDesRessources[cle];

    const prixDeLotEffectifs = construireLesPrixDeLotEffectifs(cle, fichePrix);
    const unitaireRetenu = determinerLePrixUnitaire(cle, fichePrix);

    const achatOptimal = calculerLApprovisionnementDUneRessource(besoin.quantiteTotaleNecessaire, {
      prixDeLotEffectifs,
      prixMoyenUnitaire: deduireLePrixMoyenUnitaire(fichePrix),
      modeEstimation: !!etatApplication.modeEstimationParPrixMoyen,
      prixUnitaireDeRepli: unitaireRetenu.prix
    });

    if (achatOptimal === null) nombreDeRessourcesSansPrix++;
    else coutTotalDesRessources += achatOptimal.coutTotal;

    lignesDeRessources.push({
      besoin,
      achatOptimal,
      // Provenance du ×1 : « personnel » si Brice l'a relevé, « communautaire »
      // s'il vient de la base, null s'il n'y en a aucun. C'est ce champ qui
      // pilote la couleur du champ à l'écran, jamais une déduction refaite là-bas.
      origineDuPrixUnitaire: unitaireRetenu.origine,
      prixUnitaireRetenu: unitaireRetenu.prix,
      prixCommunautaire: obtenirLePrixCommunautaire(cle),
      desaccordAvecLaBase: laBaseEstEnDesaccord(cle, fichePrix),
      publication: lireLEtatDePublication(cle),
      horodatageDerniereMiseAJourDuPrix: fichePrix ? fichePrix.horodatageDerniereMiseAJour : null
    });
  }

  lignesDeRessources.sort((a, b) => a.besoin.nom.localeCompare(b.besoin.nom, "fr"));

  // --- Étape 3 : répartition du coût groupé sur chaque objet, au prorata ---
  const coutUnitaireEffectifParRessource = {};
  for (const ligne of lignesDeRessources) {
    coutUnitaireEffectifParRessource[ligne.besoin.identifiantAnkama] =
      ligne.achatOptimal ? ligne.achatOptimal.prixUnitaireEffectif : null;
  }

  const bilansParCraft = [];
  let revenuBrutTotal = 0;
  let taxeTotale = 0;
  let coutAttribueTotal = 0;
  let experienceTotaleGagnee = 0;
  // Ce qui part chez les persos de Brice est compté à part. Le faire entrer
  // dans le résultat de la session peindrait en rouge une séance de craft
  // parfaitement saine : un objet gardé n'est pas une perte, c'est une
  // acquisition, et le seul arbitrage qui vaille est son prix au HDV.
  let coutDesCraftsPourUsagePersonnel = 0;

  for (const craft of etatApplication.craftsDeLaSession) {
    const quantiteACrafter = Math.max(0, craft.quantiteACrafter || 0);

    let coutDesRessourcesDeCeCraft = 0;
    let auMoinsUnPrixManquantDansCeCraft = false;

    for (const ingredient of craft.ingredients) {
      const coutUnitaire = coutUnitaireEffectifParRessource[ingredient.identifiantAnkama];
      if (coutUnitaire === null || coutUnitaire === undefined) {
        auMoinsUnPrixManquantDansCeCraft = true;
      } else {
        coutDesRessourcesDeCeCraft += coutUnitaire * ingredient.quantiteParCraft * quantiteACrafter;
      }
    }

    const destination = craft.destination || DESTINATION_PAR_DEFAUT;
    const vente = chiffrerLaVenteDUnCraft(craft, destination, quantiteACrafter);

    const revenuBrutDeCeCraft = vente.revenuBrut;
    const taxeDeCeCraft = revenuBrutDeCeCraft * tauxDeTaxe;
    const profitDeCeCraft = revenuBrutDeCeCraft - taxeDeCeCraft - coutDesRessourcesDeCeCraft;
    const experienceDeCeCraft = (craft.experienceParCraft || 0) * quantiteACrafter;

    if (destination === DESTINATION_USAGE_PERSONNEL) {
      coutDesCraftsPourUsagePersonnel += coutDesRessourcesDeCeCraft;
    } else {
      revenuBrutTotal += revenuBrutDeCeCraft;
      taxeTotale += taxeDeCeCraft;
      coutAttribueTotal += coutDesRessourcesDeCeCraft;
    }
    experienceTotaleGagnee += experienceDeCeCraft;

    bilansParCraft.push({
      identifiantDeLigne: craft.identifiantDeLigne,
      destination,
      // Découpage retenu pour écouler la production, en vente par lot. null
      // dans les deux autres destinations, où la question ne se pose pas.
      venteOptimale: vente.venteOptimale,
      quantiteInvendue: vente.quantiteInvendue,
      coutDesRessources: coutDesRessourcesDeCeCraft,
      coutParObjet: quantiteACrafter > 0 ? coutDesRessourcesDeCeCraft / quantiteACrafter : 0,
      revenuBrut: revenuBrutDeCeCraft,
      taxe: taxeDeCeCraft,
      profitTotal: profitDeCeCraft,
      profitParObjet: quantiteACrafter > 0 ? profitDeCeCraft / quantiteACrafter : 0,
      prixDeVenteMinimalPourNePasPerdre:
        quantiteACrafter > 0 && tauxDeTaxe < 1
          ? (coutDesRessourcesDeCeCraft / quantiteACrafter) / (1 - tauxDeTaxe)
          : 0,
      auMoinsUnPrixManquant: auMoinsUnPrixManquantDansCeCraft
    });
  }

  return {
    lignesDeRessources,
    bilansParCraft,
    coutTotalDesRessources,
    revenuBrutTotal,
    taxeTotale,
    profitTotalDeLaSession: revenuBrutTotal - taxeTotale - coutAttribueTotal,
    coutDesCraftsPourUsagePersonnel,
    experienceTotaleGagnee,
    nombreDeRessourcesSansPrix
  };
}

/**
 * Revenu attendu d'un craft, selon ce qu'on compte en faire.
 *
 * @returns {{revenuBrut:number, venteOptimale:Object|null, quantiteInvendue:number}}
 */
function chiffrerLaVenteDUnCraft(craft, destination, quantiteACrafter) {
  if (destination === DESTINATION_USAGE_PERSONNEL) {
    return { revenuBrut: 0, venteOptimale: null, quantiteInvendue: 0 };
  }

  if (destination === DESTINATION_VENTE_PAR_LOT) {
    const vente = calculerLaVenteLaPlusRentable(
      quantiteACrafter, craft.prixDeVenteParTailleDeLot);
    if (vente === null) return { revenuBrut: 0, venteOptimale: null, quantiteInvendue: quantiteACrafter };
    return {
      revenuBrut: vente.revenuBrut,
      venteOptimale: vente,
      quantiteInvendue: vente.quantiteInvendue
    };
  }

  return {
    revenuBrut: (craft.prixDeVenteUnitaire || 0) * quantiteACrafter,
    venteOptimale: null,
    quantiteInvendue: 0
  };
}

/** Identifiants Ankama de toutes les ressources présentes dans la session. */
export function listerLesIdentifiantsDesRessourcesDeLaSession() {
  const identifiants = [];
  for (const craft of etatApplication.craftsDeLaSession) {
    for (const ingredient of craft.ingredients) identifiants.push(ingredient.identifiantAnkama);
  }
  return identifiants;
}
