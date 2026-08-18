/**
 * Démarrage et câblage. Seul module qui touche au document au chargement.
 */
import { etatApplication, chargerEtat, sauvegarderEtat } from "./etat.js";
import { installerLeJournal } from "./journal.js";
import { installerLaVue, redessinerToutLEcran } from "./vue.js";
import { installerLaRecherche } from "./recherche.js";
import { installerLaFenetreFlottante } from "./fenetre-flottante.js";
import { synchroniserLesPrixDeLaSession } from "./crafts.js";
import { ouvrirLaRevue } from "./revue.js";
import { ouvrirLesReglages } from "./reglages.js";

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

redessinerToutLEcran();
element("champRechercheRecette").focus();

// Lecture des prix au démarrage. Non bloquante : la session s'affiche
// immédiatement sur le cache, et les chiffres se mettent à jour quand la réponse
// arrive. Hors ligne, rien ne casse.
synchroniserLesPrixDeLaSession();
