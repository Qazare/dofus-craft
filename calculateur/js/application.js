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
import { analyserUnCollageOcr, resoudreLesRessources } from "./ingestion-ocr.js";
import { mettreEnQuarantaine } from "./quarantaine.js";
import { listerLesRessourcesDeLaSession } from "./analyse.js";
import { annoncer } from "./journal.js";

const element = identifiant => document.getElementById(identifiant);

installerLeJournal(element("journal"));

installerLaVue({
  bandeauResultats: element("bandeauResultats"),
  conteneurCrafts: element("conteneurCrafts"),
  conteneurRessources: element("conteneurRessources"),
  conteneurRessourcesCraftees: element("conteneurRessourcesCraftees"),
  conteneurMetiers: element("conteneurMetiers")
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

/**
 * Ingère un texte de relevé. Rend faux si le texte n'est pas un relevé du tout,
 * auquel cas l'appelant doit se taire et laisser le collage suivre son cours.
 */
function ingererUnReleveOcr(texte) {
  const collage = analyserUnCollageOcr(texte);
  if (!collage.reconnu) return false;

  if (collage.lignes.length === 0) {
    annoncer("Relevé OCR reçu, mais aucune ligne exploitable"
      + (collage.rejets.length > 0
          ? " : " + collage.rejets.map(rejet => rejet.motif).join(", ") : "") + ".", "echec");
    return true;
  }

  // Le relevé ne DÉSIGNE pas les ressources, il propose des noms : le script de
  // relève lit des pixels, il ne connaît pas la base d'objets d'Ankama. C'est
  // ici que les noms sont confrontés à la liste fermée des ressources de la
  // session, et nulle part ailleurs.
  const attribution = resoudreLesRessources(collage.lignes, listerLesRessourcesDeLaSession());

  if (attribution.resolues.length === 0) {
    annoncer("Relevé OCR reçu, mais aucun nom ne correspond à une ressource de la session : "
      + attribution.nonResolues.map(ligne => ligne.nom || "sans nom").join(", ")
      + ". Ajoute la recette qui en a besoin, puis recolle.", "echec");
    return true;
  }

  const bilan = mettreEnQuarantaine(attribution.resolues);

  annoncer(bilan.nombreDeValeurs + " prix reçus de l'OCR sur "
    + bilan.nombreDeRessources + " ressource(s), à confirmer d'une coche."
    + (bilan.nombreDeLignesDouteuses > 0
        ? " " + bilan.nombreDeLignesDouteuses + " à regarder en premier." : "")
    // Une ligne non attribuée ne s'afficherait nulle part : la nommer vaut mieux
    // que de la faire disparaître en silence, Brice vient de faire la capture.
    + (attribution.nonResolues.length > 0
        ? " Hors session, donc ignoré : "
          + attribution.nonResolues.map(ligne => ligne.nom || "sans nom").join(", ") + "." : "")
    + (collage.rejets.length > 0 ? " " + collage.rejets.length + " ligne(s) illisible(s)." : ""));

  redessinerToutLEcran();
  return true;
}

// Ctrl+V n'importe où sur la page. Un collage reconnu est intercepté avant
// d'atterrir dans le champ qui avait le focus ; un collage ordinaire passe.
document.addEventListener("paste", evenement => {
  const texteColle = evenement.clipboardData ? evenement.clipboardData.getData("text") : "";
  if (ingererUnReleveOcr(texteColle)) evenement.preventDefault();
});

/* ---- Zone de collage visible ----

   Le Ctrl+V global fonctionne, mais rien ne le disait : « où est-ce que je
   colle ? » est la première question qu'on se pose devant l'écran, et un
   raccourci invisible n'est pas une interface. La bande le dit, et sa zone de
   repli sert quand le focus est ailleurs ou qu'un champ avale le collage. ---- */

const zoneDeCollage = element("zoneDeCollageOcr");
const champDeCollage = element("champDeCollageOcr");

element("boutonZoneDeCollage").addEventListener("click", () => {
  const ouverte = zoneDeCollage.hasAttribute("hidden");
  if (ouverte) {
    zoneDeCollage.removeAttribute("hidden");
    champDeCollage.value = "";
    champDeCollage.focus();
  } else {
    zoneDeCollage.setAttribute("hidden", "");
  }
});

champDeCollage.addEventListener("input", () => {
  // Ingère dès que le texte arrive : le collage dans un champ dédié n'a pas
  // besoin d'un bouton « valider » de plus.
  if (ingererUnReleveOcr(champDeCollage.value)) {
    champDeCollage.value = "";
    zoneDeCollage.setAttribute("hidden", "");
  }
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
