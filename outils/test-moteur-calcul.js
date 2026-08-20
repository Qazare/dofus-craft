/**
 * Tests du moteur de calcul, de la migration de schéma et de la préséance des
 * prix. Exécutés sur les modules réellement livrés, importés tels quels : il n'y
 * a plus d'extraction de fonctions depuis un fichier HTML, donc plus de risque
 * que le test porte sur autre chose que le code en production.
 *
 *   node outils/test-moteur-calcul.js
 */
import { calculerLAchatLeMoinsCher, calculerLApprovisionnementDUneRessource,
         calculerLaVenteLaPlusRentable }
  from "../calculateur/js/moteur.js";
import { analyserUnCollageOcr, lireUnMontant, releverLesIncoherencesEntreLots }
  from "../calculateur/js/ingestion-ocr.js";
import { DESTINATION_USAGE_PERSONNEL, DESTINATION_VENTE_PAR_LOT, DESTINATION_VENTE_UNITAIRE }
  from "../calculateur/js/config.js";
import { interpreterSaisieDeMontant, formaterNombreSimple, calculerAgeEnJoursDepuis }
  from "../calculateur/js/formats.js";
import { etatApplication, remplacerLEtat, deduireLePrixMoyenUnitaire, obtenirOuCreerLaFichePrix }
  from "../calculateur/js/etat.js";
import { determinerLePrixUnitaire, construireLesPrixDeLotEffectifs, laBaseEstEnDesaccord }
  from "../calculateur/js/prix-communautaires.js";
import { analyserLaSessionComplete, listerLesIdentifiantsDesRessourcesDeLaSession }
  from "../calculateur/js/analyse.js";
import { construireLArbreDesCrafts, listerLesObjetsDeLaBranche }
  from "../calculateur/js/arbre-de-crafts.js";
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
// L'objet crafté figure dans la liste au même titre que ses ingrédients : son
// prix de HDV est ce qui permet de trancher entre le crafter et l'acheter, une
// question qui se pose à chaque maillon d'une chaîne de sous-crafts.
verifier("identifiants listés pour la synchronisation",
  listerLesIdentifiantsDesRessourcesDeLaSession(), [1234, 289, 290]);

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

console.log("\n--- Vente par lot ---");

// Miroir de l'achat, avec l'asymétrie qui compte : on ne peut pas vendre plus
// qu'on n'a crafté, donc le partitionnement est exact et le reliquat reste
// invendu au lieu d'être arrondi au lot supérieur.
let vente = calculerLaVenteLaPlusRentable(100, { 100: 12000, 1: 100 });
verifier("100 unités partent en un lot de 100", vente.revenuBrut, 12000);
verifier("et rien ne reste invendu", vente.quantiteInvendue, 0);

vente = calculerLaVenteLaPlusRentable(100, { 10: 1500, 1: 100 });
verifier("10 lots de 10 valent mieux que 100 unités", vente.revenuBrut, 15000);
verifier("le découpage retenu est bien 10 × 10", vente.compositionDesVentes, { 10: 10 });

vente = calculerLaVenteLaPlusRentable(17, { 10: 1500 });
verifier("sans prix ×1, seuls 10 des 17 se vendent", vente.revenuBrut, 1500);
verifier("les 7 autres sont annoncés invendus", vente.quantiteInvendue, 7);

// Le ×1 est ici moins rentable à l'unité que le lot de 10, mais il reste le
// seul moyen d'écouler le reliquat : le calcul doit mélanger les deux.
vente = calculerLaVenteLaPlusRentable(17, { 10: 1500, 1: 100 });
verifier("avec un ×1, le reliquat s'écoule", vente.revenuBrut, 1500 + 7 * 100);
verifier("le découpage mélange les deux tailles", vente.compositionDesVentes, { 10: 1, 1: 7 });
verifier("et plus rien n'est invendu", vente.quantiteInvendue, 0);

// Le piège symétrique de celui de l'achat : le meilleur prix unitaire n'est pas
// forcément le meilleur découpage, il faut essayer les combinaisons.
vente = calculerLaVenteLaPlusRentable(20, { 10: 900, 1: 100 });
verifier("20 unités à 100 rapportent plus que 2 lots de 10 à 900", vente.revenuBrut, 2000);

verifier("aucun prix de vente donne null", calculerLaVenteLaPlusRentable(10, {}), null);
verifier("quantité nulle rapporte zéro",
  calculerLaVenteLaPlusRentable(0, { 1: 100 }).revenuBrut, 0);

console.log("\n--- Destination d'un craft ---");

remplacerLEtat({
  versionDuSchema: 4,
  craftsDeLaSession: [{
    identifiantDeLigne: "l1", identifiantAnkama: 1, nom: "Test", niveau: 1,
    quantiteACrafter: 10, prixDeVenteUnitaire: 500, ingredients: []
  }]
});
verifier("un craft migré passe en revente à l'unité",
  etatApplication.craftsDeLaSession[0].destination, DESTINATION_VENTE_UNITAIRE);
verifier("son prix unitaire est recopié dans le lot de 1",
  etatApplication.craftsDeLaSession[0].prixDeVenteParTailleDeLot, { 1: 500 });
verifier("la quarantaine apparaît vide", etatApplication.prixOcrEnAttente, {});

let bilanDeSession = analyserLaSessionComplete();
verifier("le revenu suit le prix unitaire", bilanDeSession.revenuBrutTotal, 5000);

etatApplication.craftsDeLaSession[0].destination = DESTINATION_USAGE_PERSONNEL;
bilanDeSession = analyserLaSessionComplete();
verifier("en usage personnel, aucun revenu", bilanDeSession.revenuBrutTotal, 0);
verifier("et aucune taxe", bilanDeSession.taxeTotale, 0);

etatApplication.craftsDeLaSession[0].destination = DESTINATION_VENTE_PAR_LOT;
etatApplication.craftsDeLaSession[0].prixDeVenteParTailleDeLot = { 10: 8000 };
bilanDeSession = analyserLaSessionComplete();
verifier("en vente par lot, le revenu vient du découpage", bilanDeSession.revenuBrutTotal, 8000);

console.log("\n--- Lecture du format d'échange de l'OCR ---");

verifier("un collage sans signature n'est pas reconnu",
  analyserUnCollageOcr("bonjour").reconnu, false);
verifier("un collage vide non plus", analyserUnCollageOcr("").reconnu, false);
verifier("une signature seule mais valide est reconnue",
  analyserUnCollageOcr("#DOFUS-HDV/1\tbrial\t2026-08-18T14:22:11").reconnu, true);

const collage = analyserUnCollageOcr(
  "#DOFUS-HDV/1\tbrial\t2026-08-18T14:22:11\n"
  + "289\tBlé\t125\t1200\t11000\t98000\t1250\t10\t0.93\n"
  + "290\tHoublon\t\t\t\t\t\t\t\n"
  + "\tSansIdentifiant\t100\t\t\t\t\t\t");

verifier("le serveur est lu dans l'en-tête", collage.serveur, "brial");
verifier("une seule ligne exploitable sur trois", collage.lignes.length, 1);
verifier("les deux autres sont rejetées", collage.rejets.length, 2);
verifier("les quatre prix de lot sont lus",
  collage.lignes[0].prixParTailleDeLot, { 1: 125, 10: 1200, 100: 11000, 1000: 98000 });
verifier("le prix moyen et sa taille de lot aussi",
  [collage.lignes[0].prixMoyenDuLot, collage.lignes[0].tailleDuLotDuPrixMoyen], [1250, 10]);
verifier("aucune incohérence sur cette ligne", collage.lignes[0].anomalies, []);

// Un champ vide n'est PAS un prix de zéro : un lot non proposé par le HDV à cet
// instant ne doit pas devenir une ressource gratuite.
verifier("une colonne vide vaut null, pas zéro", lireUnMontant(""), null);
verifier("une colonne non numérique vaut null", lireUnMontant("12a"), null);
verifier("les espaces de milliers sont absorbés", lireUnMontant("129 900"), 129900);
verifier("un prix hors bornes est refusé", lireUnMontant("999999999"), null);

// Le contrôle qui attrape l'erreur d'OCR la plus coûteuse : un chiffre perdu ou
// en trop, qui divise ou multiplie le prix par dix sans rien casser d'apparent.
verifier("des lots cohérents ne signalent rien",
  releverLesIncoherencesEntreLots({ 1: 125, 10: 1200 }), []);
verifier("un lot de 10 cent fois trop cher est signalé",
  releverLesIncoherencesEntreLots({ 1: 125, 10: 12000 }).length, 1);
verifier("un lot de 10 moins cher que le ×1 aussi",
  releverLesIncoherencesEntreLots({ 1: 125, 10: 120 }).length, 1);

const collageDouteux = analyserUnCollageOcr(
  "#DOFUS-HDV/1\tbrial\t2026-08-18T14:22:11\n289\tBlé\t125\t12000\t\t\t\t\t1");
verifier("une ligne incohérente est marquée, pas rejetée",
  [collageDouteux.lignes.length, collageDouteux.lignes[0].confianceBasse], [1, true]);


console.log("\n--- Chaîne de sous-crafts ---");

/*
 * La session de l'exemple, celle qui a motivé toute la chaîne :
 *
 *   3 Substrats de Futaie, revendus à l'unité 5 000 pièce
 *     ├─ 1 Planche de Surf par substrat, craftée sur place
 *     │    └─ 10 Bois par planche, achetés 100 l'unité
 *     └─ 1 Potion de Souvenir par substrat, achetée 800 l'unité
 *
 * Les chiffres attendus, à la main :
 *   Bois        3 planches × 10 = 30 unités à 100 = 3 000
 *   Potions     3 unités à 800 = 2 400
 *   Coût total  5 400, et le Bois est la seule ligne du panier avec la Potion
 *   Revenu      3 × 5 000 = 15 000, taxe 2 % = 300
 *   Résultat    15 000 - 300 - 5 400 = 9 300
 */
const SESSION_EN_CHAINE = {
  versionDuSchema: VERSION_COURANTE_DU_SCHEMA,
  tauxDeTaxeEnPourcent: 2,
  craftsDeLaSession: [
    {
      identifiantDeLigne: "substrat", identifiantAnkama: 2540, nom: "Substrat de Futaie",
      niveau: 60, quantiteACrafter: 3, identifiantDuCraftParent: null,
      destination: DESTINATION_VENTE_UNITAIRE, prixDeVenteUnitaire: 5000,
      ingredients: [
        { identifiantAnkama: 16492, nom: "Planche de Surf", quantiteParCraft: 1 },
        { identifiantAnkama: 7652, nom: "Potion de Souvenir", quantiteParCraft: 1 }
      ]
    },
    {
      identifiantDeLigne: "planche", identifiantAnkama: 16492, nom: "Planche de Surf",
      niveau: 60, quantiteACrafter: 1, identifiantDuCraftParent: "substrat",
      destination: DESTINATION_VENTE_UNITAIRE, prixDeVenteUnitaire: 0,
      ingredients: [{ identifiantAnkama: 460, nom: "Bois", quantiteParCraft: 10 }]
    }
  ],
  basePrixDesRessources: {
    460: { prixParTailleDeLot: { 1: 100 } },
    7652: { prixParTailleDeLot: { 1: 800 } },
    // La Planche a un prix de HDV, et c'est volontaire : elle est craftée sur
    // place, donc ce prix ne doit RIEN coûter à la session. Il ne sert qu'à
    // l'arbitrage « la crafter ou l'acheter ».
    16492: { prixParTailleDeLot: { 1: 9999 } }
  }
};

remplacerLEtat(JSON.parse(JSON.stringify(SESSION_EN_CHAINE)));
const chaine = analyserLaSessionComplete();

const ligneDuBois = chaine.lignesDeRessources.find(l => l.besoin.identifiantAnkama === 460);
const ligneDeLaPlanche = chaine.lignesDeRessources.find(l => l.besoin.identifiantAnkama === 16492);

verifier("la quantité du sous-craft est déduite du parent",
  chaine.bilansParCraft.find(b => b.identifiantDeLigne === "planche").quantiteEffective, 3);
verifier("le besoin en bois suit la chaîne", ligneDuBois.besoin.quantiteTotaleNecessaire, 30);
verifier("la planche est produite sur place", ligneDeLaPlanche.entierementProduiteSurPlace, true);
verifier("donc elle n'a aucun panier d'achat", ligneDeLaPlanche.achatOptimal, null);
verifier("et son prix de HDV n'entre dans aucun total", chaine.coutTotalDesRessources, 5400);
verifier("une ressource produite ne compte pas comme prix manquant",
  chaine.nombreDeRessourcesSansPrix, 0);

const bilanDuSubstrat = chaine.bilansParCraft.find(b => b.identifiantDeLigne === "substrat");
verifier("le coût du parent absorbe celui de la branche", bilanDuSubstrat.coutDesRessources, 5400);
verifier("coût par substrat", bilanDuSubstrat.coutParObjet, 1800);
verifier("le sous-craft ne rapporte rien",
  chaine.bilansParCraft.find(b => b.identifiantDeLigne === "planche").revenuBrut, 0);
verifier("son coût n'est pas compté deux fois dans la session",
  chaine.profitTotalDeLaSession, 9300);
verifier("le prix de marché du sous-craft est rapporté, pour l'arbitrage",
  chaine.bilansParCraft.find(b => b.identifiantDeLigne === "planche").prixUnitaireAuMarche, 9999);

// Un prix manquant à la feuille doit remonter jusqu'à la tête : sans lui, le
// coût du substrat est sous-estimé tout autant que celui de la planche.
const sessionSansPrixDeBois = JSON.parse(JSON.stringify(SESSION_EN_CHAINE));
delete sessionSansPrixDeBois.basePrixDesRessources[460];
remplacerLEtat(sessionSansPrixDeBois);
const chaineTrouee = analyserLaSessionComplete();
verifier("un prix manquant chez l'enfant remonte au parent",
  chaineTrouee.bilansParCraft.find(b => b.identifiantDeLigne === "substrat").auMoinsUnPrixManquant,
  true);

console.log("\n--- Structure de l'arbre ---");

const arbre = construireLArbreDesCrafts(SESSION_EN_CHAINE.craftsDeLaSession);
verifier("un seul craft de tête", arbre.racines.length, 1);
verifier("le parent précède l'enfant dans l'ordre de parcours",
  arbre.deLaRacineAuxFeuilles.map(n => n.craft.identifiantDeLigne), ["substrat", "planche"]);
verifier("la branche remonte jusqu'à la tête",
  listerLesObjetsDeLaBranche(arbre.noeudsParLigne.get("planche")), [16492, 2540]);

// Un état importé tronqué peut désigner un parent absent. La branche doit
// rester visible à la racine plutôt que de disparaître de l'écran.
const arbreOrphelin = construireLArbreDesCrafts([
  { identifiantDeLigne: "orphelin", identifiantAnkama: 1, quantiteACrafter: 2,
    identifiantDuCraftParent: "parti-en-fumee", ingredients: [] }
]);
verifier("un craft dont le parent a disparu remonte à la racine",
  arbreOrphelin.racines.length, 1);
verifier("et sa quantité saisie est reprise",
  arbreOrphelin.racines[0].quantiteEffective, 2);

console.log("\n" + (nombreDEchecs === 0
  ? "Tous les tests passent."
  : nombreDEchecs + " test(s) en échec."));
process.exit(nombreDEchecs === 0 ? 0 : 1);
