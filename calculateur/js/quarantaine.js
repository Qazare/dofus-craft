/**
 * Quarantaine des prix lus par OCR.
 *
 * LA GARANTIE EST STRUCTURELLE, PAS DÉCLARATIVE
 *
 * Un prix lu par une machine n'entre pas dans `basePrixDesRessources`. Il est
 * rangé dans `prixOcrEnAttente`, un dictionnaire à part, exactement comme
 * `prixCommunautairesParRessource` l'est déjà, et pour la même raison : une
 * valeur non vérifiée ne doit à aucun moment pouvoir se faire passer pour une
 * valeur vérifiée.
 *
 * Deux conséquences, et ce sont elles qui font tout le travail :
 *
 *   `api-prix.js` publie depuis la base personnelle et depuis elle seule. Tant
 *   qu'une valeur d'OCR n'y est pas, elle est INATTEIGNABLE par la publication.
 *   Aucun drapeau à ne pas oublier de tester, aucun chemin d'appel à auditer.
 *
 *   `analyse.js` et `moteur.js` lisent la base. Ils ne voient donc rien de la
 *   quarantaine, sans une ligne de code modifiée : aucun total ne peut bouger
 *   sur un chiffre que Brice n'a pas regardé.
 *
 * Le seul passage de la quarantaine vers la base est la confirmation humaine,
 * ici. Elle se fait d'une coche dans le tableau, ou d'une validation dans la
 * revue au clavier.
 */
import { TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE, TAILLES_DE_LOT_DISPONIBLES } from "./config.js";
import { etatApplication, sauvegarderEtat, obtenirOuCreerLaFichePrix } from "./etat.js";
import { publierUnPrixUnitaire, laPublicationEstPossible } from "./api-prix.js";

function laQuarantaine() {
  if (!etatApplication.prixOcrEnAttente) etatApplication.prixOcrEnAttente = {};
  return etatApplication.prixOcrEnAttente;
}

/* ============================================================
   Entrée en quarantaine
   ============================================================ */

/**
 * Range les lignes d'un collage validé par `ingestion-ocr.js`.
 *
 * Un second collage sur la même ressource écrase le premier : c'est le
 * comportement voulu, une relecture corrige une lecture.
 *
 * @returns {{nombreDeRessources:number, nombreDeValeurs:number, nombreDeLignesDouteuses:number}}
 */
export function mettreEnQuarantaine(lignesAnalysees) {
  const attente = laQuarantaine();
  let nombreDeValeurs = 0;
  let nombreDeLignesDouteuses = 0;

  for (const ligne of lignesAnalysees) {
    attente[ligne.identifiantAnkama] = {
      nom: ligne.nom,
      prixParTailleDeLot: ligne.prixParTailleDeLot,
      prixMoyenDuLot: ligne.prixMoyenDuLot,
      tailleDuLotDuPrixMoyen: ligne.tailleDuLotDuPrixMoyen,
      confiance: ligne.confiance,
      anomalies: ligne.anomalies,
      confianceBasse: ligne.confianceBasse,
      horodatageDeLaLecture: Date.now()
    };
    nombreDeValeurs += Object.keys(ligne.prixParTailleDeLot).length;
    if (ligne.confianceBasse) nombreDeLignesDouteuses++;
  }

  sauvegarderEtat();
  return {
    nombreDeRessources: lignesAnalysees.length,
    nombreDeValeurs,
    nombreDeLignesDouteuses
  };
}

/* ============================================================
   Lecture
   ============================================================ */

/** Fiche en attente pour une ressource, ou null. Point de lecture unique. */
export function lireLaQuarantaine(identifiantAnkama) {
  const fiche = laQuarantaine()[identifiantAnkama];
  return fiche || null;
}

/** Montant lu par l'OCR pour une taille de lot, 0 s'il n'y en a pas. */
export function lireLeMontantEnQuarantaine(identifiantAnkama, tailleDeLot) {
  const fiche = lireLaQuarantaine(identifiantAnkama);
  if (!fiche) return 0;
  return (fiche.prixParTailleDeLot || {})[tailleDeLot] || 0;
}

export function compterLesRessourcesEnQuarantaine() {
  return Object.keys(laQuarantaine()).length;
}

/* ============================================================
   Sortie de quarantaine, par confirmation humaine
   ============================================================ */

/**
 * Confirme une seule valeur : elle entre dans la base personnelle, quitte la
 * quarantaine, et part vers dofus-calculator si c'est un ×1.
 *
 * Une valeur confirmée est indiscernable d'une valeur tapée à la main, et c'est
 * exactement l'intention : à partir de cet instant, Brice l'a regardée.
 *
 * @returns {Promise<{message:string, publie:boolean}>}
 */
export async function confirmerUnPrixEnQuarantaine(identifiantAnkama, nomDeLaRessource, tailleDeLot) {
  const montant = lireLeMontantEnQuarantaine(identifiantAnkama, tailleDeLot);
  if (!(montant > 0)) return { message: "rien à confirmer", publie: false };

  const fichePrix = obtenirOuCreerLaFichePrix(identifiantAnkama, nomDeLaRessource);
  fichePrix.prixParTailleDeLot[tailleDeLot] = montant;
  fichePrix.horodatageDerniereMiseAJour = Date.now();

  retirerUneValeurDeLaQuarantaine(identifiantAnkama, tailleDeLot);
  sauvegarderEtat();

  if (tailleDeLot === TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE && laPublicationEstPossible()) {
    const resultat = await publierUnPrixUnitaire(identifiantAnkama, nomDeLaRessource, montant);
    return { message: resultat.message, publie: resultat.publie };
  }

  return {
    message: nomDeLaRessource + " ×" + tailleDeLot + " confirmé"
      + (tailleDeLot === TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE
          ? ", non publié faute de jeton" : ", local"),
    publie: false
  };
}

/** Confirme d'un coup toutes les valeurs en attente d'une ressource. */
export async function confirmerToutesLesValeursDUneRessource(identifiantAnkama, nomDeLaRessource) {
  const fiche = lireLaQuarantaine(identifiantAnkama);
  if (!fiche) return { message: "rien à confirmer", publie: false };

  const taillesEnAttente = TAILLES_DE_LOT_DISPONIBLES
    .filter(taille => (fiche.prixParTailleDeLot || {})[taille] > 0);

  // Le prix moyen suit la ligne : il n'est ni publiable ni partagé, mais il a
  // été lu dans la même capture et n'a aucune raison de rester en arrière.
  if (fiche.prixMoyenDuLot > 0) {
    const fichePrix = obtenirOuCreerLaFichePrix(identifiantAnkama, nomDeLaRessource);
    fichePrix.prixMoyenDuLot = fiche.prixMoyenDuLot;
    fichePrix.tailleDuLotDuPrixMoyen = fiche.tailleDuLotDuPrixMoyen;
    fichePrix.horodatageDerniereMiseAJour = Date.now();
  }

  let dernierMessage = "";
  let auMoinsUnePublication = false;
  for (const taille of taillesEnAttente) {
    const resultat = await confirmerUnPrixEnQuarantaine(identifiantAnkama, nomDeLaRessource, taille);
    dernierMessage = resultat.message;
    if (resultat.publie) auMoinsUnePublication = true;
  }

  oublierLaQuarantaine(identifiantAnkama);

  return {
    message: taillesEnAttente.length > 1
      ? nomDeLaRessource + " : " + taillesEnAttente.length + " prix confirmés. " + dernierMessage
      : dernierMessage,
    publie: auMoinsUnePublication
  };
}

/**
 * Jette une lecture sans la confirmer. Sortie normale et non exceptionnelle :
 * une capture ratée doit pouvoir disparaître sans laisser de trace, sinon la
 * quarantaine se remplit de chiffres qu'on n'ose ni valider ni supprimer.
 */
export function oublierLaQuarantaine(identifiantAnkama) {
  delete laQuarantaine()[identifiantAnkama];
  sauvegarderEtat();
}

export function viderTouteLaQuarantaine() {
  etatApplication.prixOcrEnAttente = {};
  sauvegarderEtat();
}

function retirerUneValeurDeLaQuarantaine(identifiantAnkama, tailleDeLot) {
  const fiche = lireLaQuarantaine(identifiantAnkama);
  if (!fiche) return;
  delete fiche.prixParTailleDeLot[tailleDeLot];

  // Une fiche vidée de tous ses prix n'a plus de raison d'être : la laisser
  // ferait subsister une bordure orange sur une ligne qui n'a plus rien en attente.
  const ilResteDesPrix = Object.keys(fiche.prixParTailleDeLot || {}).length > 0;
  if (!ilResteDesPrix && !(fiche.prixMoyenDuLot > 0)) {
    delete laQuarantaine()[identifiantAnkama];
  }
}
