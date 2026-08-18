/**
 * Tests du moteur de calcul, de la migration de schéma et de la préséance des
 * prix. Exécutés sur les modules réellement livrés, importés tels quels : il n'y
 * a plus d'extraction de fonctions depuis un fichier HTML, donc plus de risque
 * que le test porte sur autre chose que le code en production.
 *
 *   node outils/test-moteur-calcul.js
 */
import { calculerLAchatLeMoinsCher, calculerLApprovisionnementDUneRessource }
  from "../calculateur/js/moteur.js";
import { interpreterSaisieDeMontant, formaterNombreSimple, calculerAgeEnJoursDepuis }
  from "../calculateur/js/formats.js";
import { etatApplication, remplacerLEtat, deduireLePrixMoyenUnitaire, obtenirOuCreerLaFichePrix }
  from "../calculateur/js/etat.js";
import { determinerLePrixUnitaire, construireLesPrixDeLotEffectifs, laBaseEstEnDesaccord }
  from "../calculateur/js/prix-communautaires.js";
import { analyserLaSessionComplete, listerLesIdentifiantsDesRessourcesDeLaSession }
  from "../calculateur/js/analyse.js";
import { VERSION_COURANTE_DU_SCHEMA } from "../calculateur/js/config.js";

let nombreDEchecs = 0;
function verifier(intitule, obtenu, attendu) {
  const conforme = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!conforme) nombreDEchecs++;
  console.log((conforme ? "  OK   " : "ECHEC  ") + intitule
    + (conforme ? "" : "\n         obtenu " + JSON.stringify(obtenu)
                     + " / attendu " + JSON.stringify(attendu)));
}

console.log("\n--- Interprétation des saisies de montants ---");
verifier("12k vaut 12000", interpreterSaisieDeMontant("12k"), 12000);
verifier("1,5m vaut 1500000", interpreterSaisieDeMontant("1,5m"), 1500000);
verifier("45 000 avec espace", interpreterSaisieDeMontant("45 000"), 45000);
verifier("saisie vide vaut 0", interpreterSaisieDeMontant(""), 0);
verifier("saisie absurde vaut 0", interpreterSaisieDeMontant("abc"), 0);

console.log("\n--- Achat au meilleur coût ---");

let resultat = calculerLAchatLeMoinsCher(6, { 1: 500 });
verifier("6 unités à 500 coûtent 3000", resultat.coutTotal, 3000);

resultat = calculerLAchatLeMoinsCher(234, { 1: 100, 10: 950, 100: 9000 });
// 2 lots de 100 à 9000, 3 lots de 10 à 950, 4 unités à 100.
verifier("234 unités, coût optimal", resultat.coutTotal, 21250);
verifier("234 unités, composition", resultat.compositionDesAchats, { 100: 2, 10: 3, 1: 4 });

// Cas piège : le gros lot est plus cher à l'unité que le petit.
resultat = calculerLAchatLeMoinsCher(150, { 10: 100, 100: 1500 });
verifier("le lot de 100 plus cher à l'unité est écarté", resultat.compositionDesAchats, { 10: 15 });
verifier("coût correspondant", resultat.coutTotal, 1500);

// Surachat rentable : acheter 20 coûte moins cher que 12 à la pièce.
resultat = calculerLAchatLeMoinsCher(12, { 1: 100, 10: 50 });
verifier("surachat rentable retenu", resultat.compositionDesAchats, { 10: 2 });
verifier("coût du surachat", resultat.coutTotal, 100);

verifier("aucun prix saisi donne null", calculerLAchatLeMoinsCher(10, {}), null);
verifier("dictionnaire absent donne null", calculerLAchatLeMoinsCher(10, null), null);

resultat = calculerLAchatLeMoinsCher(0, { 1: 100 });
verifier("quantité nulle coûte 0", resultat.coutTotal, 0);

resultat = calculerLAchatLeMoinsCher(100, { 100: 5000 });
verifier("prix unitaire effectif", resultat.prixUnitaireEffectif, 50);

const debutChronometre = Date.now();
resultat = calculerLAchatLeMoinsCher(50000, { 1: 120, 10: 1100, 100: 10500, 1000: 100000 });
console.log("\n  50 000 unités calculées en " + (Date.now() - debutChronometre) + " ms, coût "
  + formaterNombreSimple(resultat.coutTotal));

console.log("\n--- Prix moyen saisi au lot ---");
verifier("lot de 100 à 50 000 vaut 500 l'unité",
  deduireLePrixMoyenUnitaire({ prixMoyenDuLot: 50000, tailleDuLotDuPrixMoyen: 100 }), 500);
verifier("taille de lot absente retombe sur 1",
  deduireLePrixMoyenUnitaire({ prixMoyenDuLot: 500 }), 500);
verifier("aucun prix moyen vaut 0",
  deduireLePrixMoyenUnitaire({ prixMoyenDuLot: 0, tailleDuLotDuPrixMoyen: 100 }), 0);
verifier("fiche absente vaut 0", deduireLePrixMoyenUnitaire(null), 0);

console.log("\n--- Le prix de la base est un prix UNITAIRE, donc la colonne ×1 ---");

// C'est la correction du 18 08 2026. Le relevé communautaire n'est pas une
// moyenne : il entre dans le calcul d'achat par lots comme le ferait un ×1 saisi
// à la main, et se combine avec les lots relevés par Brice.
remplacerLEtat({
  versionDuSchema: VERSION_COURANTE_DU_SCHEMA,
  basePrixDesRessources: { 289: { prixParTailleDeLot: { 10: 900 }, prixMoyenDuLot: 0 } },
  prixCommunautairesParRessource: {
    289: { prixUnitaire: 100, identifiantInterne: 286, horodatageDuReleve: 1700000000000 }
  }
});

const prixEffectifs = construireLesPrixDeLotEffectifs(289, etatApplication.basePrixDesRessources[289]);
verifier("le ×1 de la base complète les lots de Brice", prixEffectifs, { 10: 900, 1: 100 });

const achatMixte = calculerLApprovisionnementDUneRessource(12, {
  prixDeLotEffectifs: prixEffectifs, prixMoyenUnitaire: 0, modeEstimation: false
});
// 1 lot de 10 à 900 puis 2 unités à 100 = 1100, contre 2 lots de 10 = 1800.
verifier("le calcul combine base et lots personnels", achatMixte.coutTotal, 1100);
verifier("composition mixte", achatMixte.compositionDesAchats, { 10: 1, 1: 2 });
verifier("méthode annoncée", achatMixte.methodeDeCalcul, "lots");

console.log("\n--- Préséance : le relevé de Brice passe devant celui de la base ---");

remplacerLEtat({
  versionDuSchema: VERSION_COURANTE_DU_SCHEMA,
  basePrixDesRessources: { 289: { prixParTailleDeLot: { 1: 130 } } },
  prixCommunautairesParRessource: { 289: { prixUnitaire: 100, identifiantInterne: 286 } }
});
let unitaire = determinerLePrixUnitaire(289, etatApplication.basePrixDesRessources[289]);
verifier("son ×1 est retenu même s'il est plus cher", unitaire.prix, 130);
verifier("l'origine est annoncée", unitaire.origine, "personnel");
verifier("le désaccord avec la base est signalé",
  laBaseEstEnDesaccord(289, etatApplication.basePrixDesRessources[289]).prixUnitaire, 100);

remplacerLEtat({
  versionDuSchema: VERSION_COURANTE_DU_SCHEMA,
  basePrixDesRessources: {},
  prixCommunautairesParRessource: { 289: { prixUnitaire: 100, identifiantInterne: 286 } }
});
unitaire = determinerLePrixUnitaire(289, undefined);
verifier("sans relevé personnel, la base prend le relais", unitaire.prix, 100);
verifier("l'origine est annoncée", unitaire.origine, "communautaire");
verifier("aucun désaccord quand il n'a rien saisi",
  laBaseEstEnDesaccord(289, undefined), null);

remplacerLEtat({ versionDuSchema: VERSION_COURANTE_DU_SCHEMA });
verifier("sans rien nulle part, aucun prix",
  determinerLePrixUnitaire(289, undefined), { prix: 0, origine: null });

console.log("\n--- Un relevé de base à zéro n'est pas un prix ---");
remplacerLEtat({
  versionDuSchema: VERSION_COURANTE_DU_SCHEMA,
  prixCommunautairesParRessource: { 289: { prixUnitaire: 0, identifiantInterne: 286 } }
});
verifier("prix nul ignoré", determinerLePrixUnitaire(289, undefined).origine, null);
verifier("et il ne crée pas de lot fantôme",
  construireLesPrixDeLotEffectifs(289, undefined), {});

console.log("\n--- Analyse de session, bout en bout ---");

remplacerLEtat({
  versionDuSchema: VERSION_COURANTE_DU_SCHEMA,
  tauxDeTaxeEnPourcent: 2,
  craftsDeLaSession: [{
    identifiantDeLigne: "ligne-1", identifiantAnkama: 1234, nom: "Coiffe", niveau: 89,
    quantiteACrafter: 2, prixDeVenteUnitaire: 10000, experienceParCraft: 100,
    ingredients: [
      { identifiantAnkama: 289, nom: "Laine", quantiteParCraft: 3, adresseIcone: "" },
      { identifiantAnkama: 290, nom: "Corne", quantiteParCraft: 1, adresseIcone: "" }
    ]
  }],
  basePrixDesRessources: { 289: { prixParTailleDeLot: { 1: 100 } } },
  prixCommunautairesParRessource: { 290: { prixUnitaire: 250, identifiantInterne: 300 } }
});

const analyse = analyserLaSessionComplete();
verifier("les deux ressources sont agrégées", analyse.lignesDeRessources.length, 2);
verifier("6 laines nécessaires",
  analyse.lignesDeRessources.find(l => l.besoin.identifiantAnkama === 289)
    .besoin.quantiteTotaleNecessaire, 6);
verifier("coût total, 6 laines à 100 plus 2 cornes à 250",
  analyse.coutTotalDesRessources, 1100);
verifier("la laine est marquée personnelle",
  analyse.lignesDeRessources.find(l => l.besoin.identifiantAnkama === 289).origineDuPrixUnitaire,
  "personnel");
verifier("la corne est marquée communautaire",
  analyse.lignesDeRessources.find(l => l.besoin.identifiantAnkama === 290).origineDuPrixUnitaire,
  "communautaire");
verifier("aucune ressource sans prix", analyse.nombreDeRessourcesSansPrix, 0);
verifier("revenu brut", analyse.revenuBrutTotal, 20000);
verifier("taxe de 2 %", analyse.taxeTotale, 400);
verifier("résultat de la session", analyse.profitTotalDeLaSession, 18500);
verifier("identifiants listés pour la synchronisation",
  listerLesIdentifiantsDesRessourcesDeLaSession(), [289, 290]);

console.log("\n--- Migrations de schéma ---");

// 1 vers 2 : un prix unitaire devient un prix de lot de taille 1, sans que le
// montant ni le coût calculé ne bougent.
remplacerLEtat({
  basePrixDesRessources: {
    289: { nom: "Laine", prixParTailleDeLot: { 10: 1100 }, prixMoyenUnitaire: 120,
           horodatageDerniereMiseAJour: 1700000000000 }
  }
});
let fiche = etatApplication.basePrixDesRessources[289];
verifier("le montant est préservé", fiche.prixMoyenDuLot, 120);
verifier("la taille de lot devient 1", fiche.tailleDuLotDuPrixMoyen, 1);
verifier("l'ancien champ est retiré", fiche.prixMoyenUnitaire, undefined);
verifier("les prix de lot ne bougent pas", fiche.prixParTailleDeLot, { 10: 1100 });
verifier("la version est marquée", etatApplication.versionDuSchema, VERSION_COURANTE_DU_SCHEMA);
verifier("l'unitaire déduit est identique à l'ancien unitaire",
  deduireLePrixMoyenUnitaire(fiche), 120);
verifier("le cache communautaire est créé vide",
  etatApplication.prixCommunautairesParRessource, {});
verifier("le suivi de publication est créé vide",
  etatApplication.publicationParRessource, {});

// Un état déjà à jour n'est pas écrasé.
remplacerLEtat({
  versionDuSchema: VERSION_COURANTE_DU_SCHEMA,
  basePrixDesRessources: {
    289: { nom: "Laine", prixParTailleDeLot: {}, prixMoyenDuLot: 50000, tailleDuLotDuPrixMoyen: 100 }
  }
});
fiche = etatApplication.basePrixDesRessources[289];
verifier("un état déjà migré est laissé intact", fiche.tailleDuLotDuPrixMoyen, 100);
verifier("son montant est laissé intact", fiche.prixMoyenDuLot, 50000);

// Les anciens ×1 ne sont surtout PAS publiés d'office par la migration : publier
// en masse des chiffres dont personne n'a revérifié la fraîcheur polluerait la
// base commune. Ils restent locaux jusqu'à ressaisie.
remplacerLEtat({
  versionDuSchema: 3,
  basePrixDesRessources: { 289: { prixParTailleDeLot: { 1: 700 } } }
});
verifier("les anciens ×1 restent en place", 
  etatApplication.basePrixDesRessources[289].prixParTailleDeLot[1], 700);
verifier("et ne sont marqués d'aucune publication",
  etatApplication.publicationParRessource, {});

remplacerLEtat({});
verifier("migration sur un état vierge", etatApplication.versionDuSchema, VERSION_COURANTE_DU_SCHEMA);

console.log("\n--- Création de fiche de prix ---");
remplacerLEtat({ versionDuSchema: VERSION_COURANTE_DU_SCHEMA });
const nouvelleFiche = obtenirOuCreerLaFichePrix(999, "Test");
verifier("une fiche neuve a tous ses champs",
  Object.keys(nouvelleFiche).sort(),
  ["horodatageDerniereMiseAJour", "nom", "prixMoyenDuLot", "prixParTailleDeLot",
   "tailleDuLotDuPrixMoyen"]);
verifier("appeler deux fois ne recrée pas la fiche",
  obtenirOuCreerLaFichePrix(999, "Test") === nouvelleFiche, true);

console.log("\n--- Âge d'un relevé ---");
verifier("horodatage absent donne null", calculerAgeEnJoursDepuis(null), null);
verifier("aujourd'hui vaut 0 jour", calculerAgeEnJoursDepuis(Date.now()), 0);
verifier("hier vaut 1 jour", calculerAgeEnJoursDepuis(Date.now() - 86400000), 1);

console.log("\n" + (nombreDEchecs === 0
  ? "Tous les tests passent."
  : nombreDEchecs + " test(s) en échec."));
process.exit(nombreDEchecs === 0 ? 0 : 1);
