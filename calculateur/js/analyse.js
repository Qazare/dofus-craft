/**
 * Analyse complète de la session : agrège les ressources de toutes les recettes,
 * chiffre l'achat groupé, puis répartit le coût entre les objets au prorata.
 *
 * Acheter en lot pour plusieurs recettes à la fois coûte moins cher que recette
 * par recette : c'est pour cela que l'agrégation précède le chiffrage, et que le
 * coût par objet est une quote-part et non un calcul isolé.
 *
 * LA CHAÎNE DE CRAFTS, ET CE QU'ELLE IMPOSE À L'ORDRE DES CALCULS
 *
 * Depuis que les crafts s'enchaînent, une ressource peut être produite sur
 * place au lieu d'être achetée. Deux règles en découlent, et l'ordre des étapes
 * n'est plus indifférent :
 *
 *   L'agrégation descend l'arbre. Un sous-craft ne connaît sa quantité qu'une
 *   fois celle de son parent résolue, donc les besoins ne peuvent pas être
 *   comptés avant que l'arbre ne le soit.
 *
 *   Le chiffrage le remonte. Le coût d'un craft est celui de ses ingrédients
 *   achetés PLUS celui de ses sous-crafts, qui doivent donc être chiffrés
 *   d'abord. C'est aussi ce qui garantit qu'un ingrédient produit sur place
 *   n'est compté qu'une fois : il sort de la liste de courses et entre par la
 *   branche, jamais par les deux.
 */
import { etatApplication, deduireLePrixMoyenUnitaire } from "./etat.js";
import { construireLArbreDesCrafts } from "./arbre-de-crafts.js";
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

  // --- Étape 0 : structure de la chaîne, et quantités qui en découlent ---
  //
  // Rien ne peut être compté avant cela : la quantité d'un sous-craft est celle
  // de son parent multipliée par ce que la recette en demande.
  const arbre = construireLArbreDesCrafts(etatApplication.craftsDeLaSession);

  // --- Étape 1 : agrégation des besoins, toutes recettes confondues ---
  const besoinsAgregesParRessource = {};

  for (const noeud of arbre.deLaRacineAuxFeuilles) {
    for (const ingredient of noeud.craft.ingredients) {
      const cle = ingredient.identifiantAnkama;
      if (!besoinsAgregesParRessource[cle]) {
        besoinsAgregesParRessource[cle] = {
          identifiantAnkama: cle,
          sousType: ingredient.sousType,
          nom: ingredient.nom,
          adresseIcone: ingredient.adresseIcone,
          // Ce que la session consomme en tout, produit sur place compris.
          quantiteTotaleNecessaire: 0,
          // Ce qu'il faut réellement sortir acheter. Les deux ne se confondent
          // qu'en l'absence de sous-craft, et c'est le second qui est chiffré :
          // compter à l'achat ce qu'un atelier va produire ferait payer deux
          // fois la même Planche de Surf.
          quantiteAAcheter: 0
        };
      }

      const quantiteDeCetteLigne = ingredient.quantiteParCraft * noeud.quantiteEffective;
      besoinsAgregesParRessource[cle].quantiteTotaleNecessaire += quantiteDeCetteLigne;
      if (!noeud.ingredientsProduitsSurPlace.has(cle)) {
        besoinsAgregesParRessource[cle].quantiteAAcheter += quantiteDeCetteLigne;
      }
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

    // Une ressource entièrement produite par un atelier n'a pas de panier
    // d'achat, et ne doit pas non plus compter parmi les prix manquants : son
    // prix de HDV reste utile pour comparer craft et achat, mais son absence
    // ne rend aucun total faux.
    const entierementProduiteSurPlace = besoin.quantiteAAcheter === 0
      && besoin.quantiteTotaleNecessaire > 0;

    const achatOptimal = entierementProduiteSurPlace
      ? null
      : calculerLApprovisionnementDUneRessource(besoin.quantiteAAcheter, {
          prixDeLotEffectifs,
          prixMoyenUnitaire: deduireLePrixMoyenUnitaire(fichePrix),
          modeEstimation: !!etatApplication.modeEstimationParPrixMoyen,
          prixUnitaireDeRepli: unitaireRetenu.prix
        });

    if (achatOptimal === null && !entierementProduiteSurPlace) nombreDeRessourcesSansPrix++;
    else if (achatOptimal !== null) coutTotalDesRessources += achatOptimal.coutTotal;

    lignesDeRessources.push({
      besoin,
      achatOptimal,
      entierementProduiteSurPlace,
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

  // --- Étape 3 : chiffrage des crafts, des feuilles vers les racines ---
  const coutUnitaireEffectifParRessource = {};
  const prixUnitaireDeMarcheParRessource = {};
  for (const ligne of lignesDeRessources) {
    coutUnitaireEffectifParRessource[ligne.besoin.identifiantAnkama] =
      ligne.achatOptimal ? ligne.achatOptimal.prixUnitaireEffectif : null;
    prixUnitaireDeMarcheParRessource[ligne.besoin.identifiantAnkama] =
      ligne.prixUnitaireRetenu || 0;
  }

  const bilansParLigne = new Map();

  // Coût de fabrication unitaire des objets produits sur place, renseigné au
  // fil du chiffrage et reporté ensuite sur la ligne de ressource. C'est la
  // moitié manquante de l'arbitrage « le crafter ou l'acheter » : sans lui, la
  // liste des craftées n'aurait qu'un prix de HDV à montrer.
  const coutDeFabricationParObjet = {};

  // À l'envers du parcours en largeur : les enfants d'abord, puisqu'un parent
  // additionne leur coût au sien.
  for (let rang = arbre.deLaRacineAuxFeuilles.length - 1; rang >= 0; rang--) {
    const noeud = arbre.deLaRacineAuxFeuilles[rang];
    const bilan = chiffrerUnCraft(noeud, bilansParLigne, tauxDeTaxe, {
      coutUnitaireEffectifParRessource, prixUnitaireDeMarcheParRessource
    });
    bilansParLigne.set(noeud.craft.identifiantDeLigne, bilan);

    // Seuls les sous-crafts alimentent ce relevé : un craft de tête n'est
    // l'ingrédient de personne, son coût n'a pas à s'afficher dans une liste
    // de ressources.
    if (bilan.estUnSousCraft && bilan.coutParObjet > 0) {
      coutDeFabricationParObjet[noeud.craft.identifiantAnkama] = bilan.coutParObjet;
    }
  }

  // --- Étape 4 : totaux de session, sur les seuls crafts de tête ---
  //
  // Un sous-craft n'a ni revenu ni destination : son coût est déjà dans celui
  // de son parent, l'ajouter au total le compterait deux fois. Son XP, elle,
  // est bien gagnée et se compte partout.
  let revenuBrutTotal = 0;
  let taxeTotale = 0;
  let coutAttribueTotal = 0;
  let experienceTotaleGagnee = 0;
  // Ce qui part chez les persos de Brice est compté à part. Le faire entrer
  // dans le résultat de la session peindrait en rouge une séance de craft
  // parfaitement saine : un objet gardé n'est pas une perte, c'est une
  // acquisition, et le seul arbitrage qui vaille est son prix au HDV.
  let coutDesCraftsPourUsagePersonnel = 0;

  for (const noeud of arbre.deLaRacineAuxFeuilles) {
    const bilan = bilansParLigne.get(noeud.craft.identifiantDeLigne);
    experienceTotaleGagnee += bilan.experienceGagnee;

    if (bilan.estUnSousCraft) continue;

    if (bilan.destination === DESTINATION_USAGE_PERSONNEL) {
      coutDesCraftsPourUsagePersonnel += bilan.coutDesRessources;
    } else {
      revenuBrutTotal += bilan.revenuBrut;
      taxeTotale += bilan.taxe;
      coutAttribueTotal += bilan.coutDesRessources;
    }
  }

  // Le report se fait ici et non pendant le chiffrage : les lignes de
  // ressources sont construites avant lui, puisque c'est leur prix qui le nourrit.
  for (const ligne of lignesDeRessources) {
    ligne.coutDeFabricationUnitaire =
      coutDeFabricationParObjet[ligne.besoin.identifiantAnkama] || 0;
  }

  return {
    arbre,
    lignesDeRessources,
    // Conservé sous forme de tableau : c'est la forme attendue par la vue et
    // par les tests, et l'ordre est celui du parcours de l'arbre.
    bilansParCraft: arbre.deLaRacineAuxFeuilles
      .map(noeud => bilansParLigne.get(noeud.craft.identifiantDeLigne)),
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
 * Bilan d'un craft : ce qu'il coûte, ce qu'il rapporte, et à quel prix il
 * cesserait d'être rentable.
 *
 * Appelée des feuilles vers la racine, elle lit dans `bilansParLigne` ceux de
 * ses enfants, qui y sont donc forcément déjà.
 */
function chiffrerUnCraft(noeud, bilansParLigne, tauxDeTaxe, prix) {
  const craft = noeud.craft;
  const estUnSousCraft = noeud.parent !== null;

  // --- Ce que ce craft achète pour son propre compte ---
  let coutDesRessources = 0;
  let auMoinsUnPrixManquant = false;

  for (const ingredient of craft.ingredients) {
    // Produit par un atelier de la session : son coût arrive par la branche,
    // pas par la liste de courses.
    if (noeud.ingredientsProduitsSurPlace.has(ingredient.identifiantAnkama)) continue;

    const coutUnitaire = prix.coutUnitaireEffectifParRessource[ingredient.identifiantAnkama];
    if (coutUnitaire === null || coutUnitaire === undefined) {
      auMoinsUnPrixManquant = true;
    } else {
      coutDesRessources += coutUnitaire * ingredient.quantiteParCraft * noeud.quantiteEffective;
    }
  }

  // --- Ce que ses sous-crafts lui coûtent ---
  //
  // Un prix manquant chez un enfant remonte : sans lui, le coût du parent est
  // sous-estimé tout autant, et ne rien dire à l'étage du dessus laisserait
  // croire à un chiffre complet.
  for (const enfant of noeud.enfants) {
    const bilanDeLEnfant = bilansParLigne.get(enfant.craft.identifiantDeLigne);
    if (!bilanDeLEnfant) continue;
    coutDesRessources += bilanDeLEnfant.coutDesRessources;
    if (bilanDeLEnfant.auMoinsUnPrixManquant) auMoinsUnPrixManquant = true;
  }

  const quantite = noeud.quantiteEffective;
  const coutParObjet = quantite > 0 ? coutDesRessources / quantite : 0;

  // Un sous-craft ne se vend pas : il est consommé par son parent. Lui prêter
  // une destination et un revenu ferait apparaître dans le résultat de session
  // une vente qui n'aura jamais lieu.
  const destination = estUnSousCraft ? null : (craft.destination || DESTINATION_PAR_DEFAUT);
  const vente = estUnSousCraft
    ? { revenuBrut: 0, venteOptimale: null, quantiteInvendue: 0 }
    : chiffrerLaVenteDUnCraft(craft, destination, quantite);

  const taxe = vente.revenuBrut * tauxDeTaxe;
  const profitTotal = vente.revenuBrut - taxe - coutDesRessources;

  return {
    identifiantDeLigne: craft.identifiantDeLigne,
    destination,
    estUnSousCraft,
    profondeur: noeud.profondeur,
    // Quantité réellement produite : saisie sur un craft de tête, déduite du
    // parent sur un sous-craft. C'est elle que la carte affiche.
    quantiteEffective: quantite,
    // Prix unitaire au HDV de l'objet produit, quand il est connu. Sur un
    // sous-craft, c'est la moitié manquante de l'arbitrage « le crafter ou
    // l'acheter » : le coût par objet ci-dessus est l'autre.
    prixUnitaireAuMarche: prix.prixUnitaireDeMarcheParRessource[craft.identifiantAnkama] || 0,
    // Découpage retenu pour écouler la production, en vente par lot. null
    // dans les autres destinations, où la question ne se pose pas.
    venteOptimale: vente.venteOptimale,
    quantiteInvendue: vente.quantiteInvendue,
    coutDesRessources,
    coutParObjet,
    revenuBrut: vente.revenuBrut,
    taxe,
    profitTotal,
    profitParObjet: quantite > 0 ? profitTotal / quantite : 0,
    experienceGagnee: (craft.experienceParCraft || 0) * quantite,
    prixDeVenteMinimalPourNePasPerdre:
      quantite > 0 && tauxDeTaxe < 1 ? coutParObjet / (1 - tauxDeTaxe) : 0,
    auMoinsUnPrixManquant
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

/**
 * Identifiants Ankama de tout ce que la session met en jeu : les ingrédients de
 * chaque recette, et les objets craftés eux-mêmes.
 *
 * Les objets craftés en font partie depuis la chaîne de crafts, et ce n'est pas
 * un excès de zèle : le prix de HDV d'un Substrat de Futaie est exactement ce
 * qui permet de dire s'il vaut mieux le crafter ou l'acheter. Sans lui,
 * l'arbitrage n'a qu'une moitié.
 */
export function listerLesIdentifiantsDesRessourcesDeLaSession() {
  const identifiants = [];
  for (const craft of etatApplication.craftsDeLaSession) {
    identifiants.push(craft.identifiantAnkama);
    for (const ingredient of craft.ingredients) identifiants.push(ingredient.identifiantAnkama);
  }
  return identifiants;
}
