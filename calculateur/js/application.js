/**
 * Démarrage et câblage. Seul module qui touche au document au chargement.
 */
import { etatApplication, chargerEtat, sauvegarderEtat } from "./etat.js";
import { installerLeJournal } from "./journal.js";
import { installerLaVue, redessinerToutLEcran } from "./vue.js";
import { installerLaRecherche } from "./recherche.js";
import { installerLaFenetreFlottante } from "./fenetre-flottante.js";
import { synchroniserLesPrixDeLaSession, synchroniserLesRecettesDeLaSession } from "./crafts.js";
import { ouvrirLaRevue } from "./revue.js";
import { ouvrirLesReglages } from "./reglages.js";
import { analyserUnCollageOcr } from "./ingestion-ocr.js";
import { mettreEnQuarantaine } from "./quarantaine.js";
import { listerLesIdentifiantsDesRessourcesDeLaSession } from "./analyse.js";
import { annoncer } from "./journal.js";

const element = identifiant => document.getElementById(identifiant);

installerLeJournal(element("journal"));

installerLaVue({
  bandeauResultats: element("bandeauResultats"),
  conteneurCrafts: element("conteneurCrafts"),
  conteneurRessources: element("conteneurRessources")
});

installerLaRecherche({
  champRecherche: element("champRechercheRecette"),
  listeSuggestions: element("listeSuggestions")
});

installerLaFenetreFlottante(element("boutonPictureInPicture"));

chargerEtat();

const champTauxDeTaxe = element("champTauxDeTaxe");
const caseModePrixMoyen = element("caseModePrixMoyen");

champTauxDeTaxe.value = etatApplication.tauxDeTaxeEnPourcent;
caseModePrixMoyen.checked = !!etatApplication.modeEstimationParPrixMoyen;

champTauxDeTaxe.addEventListener("change", () => {
  const taux = parseFloat(String(champTauxDeTaxe.value).replace(",", "."));
  etatApplication.tauxDeTaxeEnPourcent = isNaN(taux) ? 0 : taux;
  sauvegarderEtat();
  redessinerToutLEcran();
});

caseModePrixMoyen.addEventListener("change", () => {
  etatApplication.modeEstimationParPrixMoyen = caseModePrixMoyen.checked;
  sauvegarderEtat();
  redessinerToutLEcran();
});

element("boutonRevoirLesPrix").addEventListener("click", ouvrirLaRevue);
element("boutonSynchroniser").addEventListener("click", synchroniserLesPrixDeLaSession);
element("boutonReglages").addEventListener("click", ouvrirLesReglages);

/* ============================================================
   Collage des prix lus par l'OCR

   Seul endroit de l'application qui écoute le presse-papier, conformément au
   principe posé pour le reste : un seul module touche au document.

   Un collage sans la signature du format est ignoré SANS UN MOT. Ce n'est pas
   de la négligence : coller une adresse dans un champ, ou du texte n'importe où
   sur la page, est un geste ordinaire, et le signaler comme une erreur ferait
   du bruit à longueur de journée. La signature est ce qui distingue « ceci
   m'est destiné » de « ceci ne me regarde pas ».

   Ce qui entre va en quarantaine, et nulle part ailleurs. Aucun total ne bouge,
   rien n'est publiable, tant que Brice n'a pas cliqué une coche.
   ============================================================ */

document.addEventListener("paste", evenement => {
  const texteColle = evenement.clipboardData ? evenement.clipboardData.getData("text") : "";
  const collage = analyserUnCollageOcr(texteColle);
  if (!collage.reconnu) return;

  // Reconnu : on empêche le texte d'atterrir dans le champ qui avait le focus.
  evenement.preventDefault();

  if (collage.lignes.length === 0) {
    annoncer("Collage OCR reçu, mais aucune ligne exploitable"
      + (collage.rejets.length > 0 ? " (" + collage.rejets.length + " rejetée(s))" : "") + ".", "echec");
    return;
  }

  const bilan = mettreEnQuarantaine(collage.lignes);

  // Une ressource absente de la session ne s'affichera nulle part : elle
  // resterait en quarantaine sans qu'aucun écran ne la montre. Le dire vaut
  // mieux que de la faire disparaître en silence.
  const identifiantsDeLaSession = new Set(listerLesIdentifiantsDesRessourcesDeLaSession());
  const horsSession = collage.lignes
    .filter(ligne => !identifiantsDeLaSession.has(ligne.identifiantAnkama)).length;

  annoncer(bilan.nombreDeValeurs + " prix reçus de l'OCR sur "
    + bilan.nombreDeRessources + " ressource(s), à confirmer."
    + (bilan.nombreDeLignesDouteuses > 0
        ? " " + bilan.nombreDeLignesDouteuses + " à regarder en premier." : "")
    + (horsSession > 0 ? " " + horsSession + " hors session, ajoute la recette pour la voir." : "")
    + (collage.rejets.length > 0 ? " " + collage.rejets.length + " ligne(s) illisible(s)." : ""));

  redessinerToutLEcran();
});

redessinerToutLEcran();
element("champRechercheRecette").focus();

// Lecture des prix au démarrage. Non bloquante : la session s'affiche
// immédiatement sur le cache, et les chiffres se mettent à jour quand la réponse
// arrive. Hors ligne, rien ne casse.
synchroniserLesPrixDeLaSession();

// Métiers et recettes, même principe et même indifférence à l'échec. Le cache
// étant gardé d'une session à l'autre, une session déjà ouverte hier n'émet
// aucune requête ici : les pastilles sont là avant même que le réseau réponde.
synchroniserLesRecettesDeLaSession();
