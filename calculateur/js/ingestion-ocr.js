/**
 * Lecture du format d'échange de l'OCR du HDV.
 *
 * Module pur : aucun accès au DOM, aucun accès à l'état. Il transforme un texte
 * en lignes vérifiées, et rien d'autre. C'est ce qui le rend testable sous Node
 * dans `outils/test-moteur-calcul.js`, et c'est aussi ce qui garantit qu'un
 * collage ne peut rien écrire par lui-même : écrire est le travail d'un autre
 * module, sur des données que celui-ci a déjà validées.
 *
 * FORMAT, une ligne d'en-tête puis une ligne par ressource, tabulations :
 *
 *   #DOFUS-HDV/1  brial   2026-08-18T14:22:11
 *   289   Blé   125   1200   11000   98000   1250   10   0.93
 *
 *   1     dofusdb_id, l'identifiant Ankama
 *   2     nom lu, garde-fou seulement
 *   3-6   prix des lots ×1, ×10, ×100, ×1000, tels que le HDV les affiche
 *   7,8   prix moyen, et taille du lot sur lequel il est affiché
 *   9     confiance de la lecture, de 0 à 1
 *
 * L'EN-TÊTE MAGIQUE N'EST PAS DÉCORATIF. Le calculateur écoute le collage sur
 * toute la page ; sans signature, un Ctrl+V malheureux irait écrire dans
 * l'état. Un collage qui ne commence pas par la signature est ignoré sans un
 * mot — un collage ordinaire n'est pas une erreur, et le signaler serait du
 * bruit à chaque fois qu'on colle une adresse dans la barre du navigateur.
 *
 * Le format se tape aussi à la main, ce qui donne gratuitement une voie
 * d'import en masse depuis un tableur.
 */
import {
  SIGNATURE_DU_FORMAT_OCR, TAILLES_DE_LOT_DISPONIBLES,
  PRIX_MINIMAL_PLAUSIBLE, PRIX_MAXIMAL_PLAUSIBLE, TAILLE_DE_LOT_PAR_DEFAUT_POUR_LE_PRIX_MOYEN
} from "./config.js";

/**
 * Rapports entre lots admis avant de crier au chiffre perdu ou en trop.
 *
 * C'est le contrôle qui attrape l'erreur d'OCR la plus fréquente et la plus
 * coûteuse : un chiffre avalé ou dupliqué, qui divise ou multiplie le prix par
 * dix sans que rien n'ait l'air anormal. Hors des bornes, la ligne n'est pas
 * rejetée : elle est marquée, et passera en tête de la revue.
 *
 * La borne basse vaut un CINQUIÈME de la taille du lot, et non la taille
 * elle-même. Un lot de 10 moins cher que dix fois l'unité est la situation
 * normale au HDV — c'est même la raison d'acheter en lot. Des bornes calquées
 * sur la taille du lot signalaient à tort 490 l'unité contre 1 300 les dix,
 * relevé réel du 18 08 2026.
 */
const RAPPORTS_ADMIS_ENTRE_LOTS = {
  10: { minimal: 2, maximal: 30 },
  100: { minimal: 20, maximal: 300 },
  1000: { minimal: 200, maximal: 3000 }
};

const CONFIANCE_BASSE = 0.4;

/**
 * Analyse un collage.
 *
 * @param {string} texteColle
 * @returns {{reconnu:boolean, version:number|null, serveur:string|null,
 *            lignes:Array, rejets:Array}}
 *          `reconnu` faux signifie « ce collage ne me concerne pas », et
 *          l'appelant doit alors se taire, pas afficher une erreur.
 */
export function analyserUnCollageOcr(texteColle) {
  const rienDeReconnu = { reconnu: false, version: null, serveur: null, lignes: [], rejets: [] };

  const texte = String(texteColle || "");
  if (!texte.startsWith(SIGNATURE_DU_FORMAT_OCR)) return rienDeReconnu;

  const lignesBrutes = texte.split(/\r?\n/).filter(ligne => ligne.trim() !== "");
  if (lignesBrutes.length === 0) return rienDeReconnu;

  const enTete = lignesBrutes[0].split("\t");
  const version = parseInt(enTete[0].slice(SIGNATURE_DU_FORMAT_OCR.length), 10);
  if (!(version > 0)) return rienDeReconnu;

  const lignes = [];
  const rejets = [];

  for (let index = 1; index < lignesBrutes.length; index++) {
    const resultat = analyserUneLigne(lignesBrutes[index]);
    if (resultat.rejetee) rejets.push({ numero: index, brut: lignesBrutes[index], motif: resultat.motif });
    else lignes.push(resultat.ligne);
  }

  return {
    reconnu: true,
    version,
    serveur: (enTete[1] || "").trim() || null,
    lignes,
    rejets
  };
}

function analyserUneLigne(ligneBrute) {
  const colonnes = ligneBrute.split("\t");

  const identifiantAnkama = parseInt(String(colonnes[0] || "").trim(), 10);
  if (!(identifiantAnkama > 0)) {
    // Sans identifiant, impossible de savoir de quelle ressource on parle. Une
    // capture qui ne vise rien de connu n'a rien à faire en quarantaine : elle
    // y resterait sans jamais pouvoir être confirmée.
    return { rejetee: true, motif: "identifiant de ressource absent ou illisible" };
  }

  const prixParTailleDeLot = {};
  let auMoinsUnPrix = false;

  TAILLES_DE_LOT_DISPONIBLES.forEach((taille, rang) => {
    const lecture = lireUnMontant(colonnes[2 + rang]);
    if (lecture === null) return;
    prixParTailleDeLot[taille] = lecture;
    auMoinsUnPrix = true;
  });

  const prixMoyenDuLot = lireUnMontant(colonnes[6]);
  const tailleDuLotDuPrixMoyen = parseInt(String(colonnes[7] || "").trim(), 10);

  if (!auMoinsUnPrix && prixMoyenDuLot === null) {
    return { rejetee: true, motif: "aucun prix lisible sur la ligne" };
  }

  const confianceAnnoncee = parseFloat(String(colonnes[8] || "").replace(",", "."));
  const anomalies = releverLesIncoherencesEntreLots(prixParTailleDeLot);

  return {
    rejetee: false,
    ligne: {
      identifiantAnkama,
      nom: String(colonnes[1] || "").trim(),
      prixParTailleDeLot,
      prixMoyenDuLot: prixMoyenDuLot === null ? 0 : prixMoyenDuLot,
      tailleDuLotDuPrixMoyen: tailleDuLotDuPrixMoyen > 0
        ? tailleDuLotDuPrixMoyen : TAILLE_DE_LOT_PAR_DEFAUT_POUR_LE_PRIX_MOYEN,
      confiance: isNaN(confianceAnnoncee) ? 1 : Math.max(0, Math.min(1, confianceAnnoncee)),
      anomalies,
      // Une ligne de confiance basse passe en tête de revue : c'est celle qu'il
      // faut regarder en premier, pas celle qu'il faut cacher.
      confianceBasse: anomalies.length > 0
        || (!isNaN(confianceAnnoncee) && confianceAnnoncee < CONFIANCE_BASSE)
    }
  };
}

/**
 * Montant lu dans une colonne, ou null si la colonne est vide.
 *
 * Un champ absent du HDV à cet instant reste vide : un lot non proposé n'est
 * PAS un prix de zéro, et le confondre reviendrait à enregistrer une ressource
 * gratuite. Tout ce qui n'est ni chiffre ni espace est refusé — la liste
 * blanche du côté AHK a déjà fait son travail, celle-ci ne fait pas confiance
 * sur parole.
 */
export function lireUnMontant(colonneBrute) {
  const texte = String(colonneBrute === undefined || colonneBrute === null ? "" : colonneBrute)
    .replace(/[\s  ]/g, "")
    .trim();
  if (texte === "") return null;
  if (!/^[0-9]+$/.test(texte)) return null;

  const montant = parseInt(texte, 10);
  if (montant < PRIX_MINIMAL_PLAUSIBLE || montant > PRIX_MAXIMAL_PLAUSIBLE) return null;
  return montant;
}

/**
 * Compare les lots entre eux et signale ceux qui ne tiennent pas debout.
 * Ne rejette rien : marquer et faire remonter en tête de revue vaut mieux que
 * jeter une lecture qui serait peut-être la bonne.
 */
export function releverLesIncoherencesEntreLots(prixParTailleDeLot) {
  const prixUnitaire = prixParTailleDeLot[1] || 0;
  if (prixUnitaire <= 0) return [];

  const anomalies = [];
  for (const taille of Object.keys(RAPPORTS_ADMIS_ENTRE_LOTS)) {
    const prixDuLot = prixParTailleDeLot[taille] || 0;
    if (prixDuLot <= 0) continue;

    const rapport = prixDuLot / prixUnitaire;
    const bornes = RAPPORTS_ADMIS_ENTRE_LOTS[taille];
    if (rapport < bornes.minimal || rapport > bornes.maximal) {
      anomalies.push("le lot de " + taille + " vaut " + Math.round(rapport)
        + " fois le ×1, attendu entre " + bornes.minimal + " et " + bornes.maximal);
    }
  }
  return anomalies;
}
