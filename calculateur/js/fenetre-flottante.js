/**
 * Fenêtre flottante, mode PIP.
 *
 * Vue compacte qui reste au premier plan pendant que le jeu est en plein écran.
 * Elle contient le bandeau de résultats et les prix, rien d'autre : la recherche
 * de recette et les réglages ne servent pas quand on est au HDV.
 *
 * Principe structurel : ce n'est pas un clone. Les deux fenêtres partagent le
 * même état et les mêmes fonctions, la fenêtre PIP étant un document du même
 * contexte JavaScript. Une saisie faite ici est écrite en base et redessine les
 * deux fenêtres, et réciproquement — publication vers dofus-calculator comprise.
 *
 * Disponibilité : l'API Document Picture-in-Picture est présente sur Chrome,
 * Edge, et sur Firefox depuis la version 151, donc sur Zen. Si elle manque, on
 * se rabat sur une popup ordinaire, sans premier plan garanti mais préférable à
 * un bouton mort.
 */
import { analyserLaSessionComplete } from "./analyse.js";
import { formaterMontantEnKamas, formaterNombreSimple, echapperPourHtml } from "./formats.js";
import { construireLeNomCopiable } from "./cartes-de-craft.js";
import { brancherLaCopieDesNoms } from "./presse-papier.js";
import { construireLaCelluleDuPrixUnitaire, construireLesCellulesDesGrosLots,
         construireLaPastilleDeProvenance, construireLaPastilleDeQuarantaine } from "./cellules-de-prix.js";
import { brancherLesSaisiesDePrixDUneRangee, enregistrerLeRedessinSecondaire,
         marquerLesChampsCommeObsoletes } from "./vue.js";

const LARGEUR_INITIALE = 520;
const HAUTEUR_INITIALE = 520;

let fenetreFlottante = null;
let boutonDeBascule = null;

export function installerLaFenetreFlottante(bouton) {
  boutonDeBascule = bouton;
  bouton.addEventListener("click", ouvrirOuFermer);
  enregistrerLeRedessinSecondaire(dessinerLaVueCompacte);
}

function lAPIEstDisponible() {
  return typeof window.documentPictureInPicture !== "undefined"
    && typeof window.documentPictureInPicture.requestWindow === "function";
}

async function ouvrirOuFermer() {
  // Bascule : un second clic referme la fenêtre déjà ouverte.
  if (fenetreFlottante && !fenetreFlottante.closed) {
    fenetreFlottante.close();
    fenetreFlottante = null;
    mettreAJourLIntituleDuBouton();
    return;
  }

  try {
    if (lAPIEstDisponible()) {
      fenetreFlottante = await window.documentPictureInPicture.requestWindow({
        width: LARGEUR_INITIALE, height: HAUTEUR_INITIALE
      });
    } else {
      fenetreFlottante = window.open("", "calculateur-craft-pip",
        "width=" + LARGEUR_INITIALE + ",height=" + HAUTEUR_INITIALE + ",menubar=no,toolbar=no");
      if (!fenetreFlottante) {
        alert("La fenêtre flottante a été bloquée par le navigateur. Autorise les popups pour ce site.");
        return;
      }
    }
  } catch (erreur) {
    console.warn("Ouverture de la fenêtre flottante impossible :", erreur);
    alert("Fenêtre flottante indisponible : " + erreur.message);
    return;
  }

  preparerLeDocumentFlottant();
  dessinerLaVueCompacte();

  fenetreFlottante.addEventListener("pagehide", () => {
    fenetreFlottante = null;
    mettreAJourLIntituleDuBouton();
  });

  mettreAJourLIntituleDuBouton();
}

/**
 * Copie la feuille de style dans le document flottant et y installe le
 * conteneur. La fenêtre PIP démarre sur un document vide, sans style hérité :
 * sans cette copie, la vue s'afficherait en Times New Roman sur fond blanc.
 */
function preparerLeDocumentFlottant() {
  const documentFlottant = fenetreFlottante.document;
  documentFlottant.head.innerHTML = "";

  for (const feuille of document.styleSheets) {
    try {
      const regles = Array.from(feuille.cssRules).map(regle => regle.cssText).join("\n");
      const style = documentFlottant.createElement("style");
      style.textContent = regles;
      documentFlottant.head.appendChild(style);
    } catch (erreur) {
      // Une feuille d'origine étrangère refuse la lecture de ses règles. Sans
      // objet ici, la feuille du site étant servie depuis le même domaine.
      console.debug("Feuille de style non copiable, ignorée :", erreur);
    }
  }

  const titre = documentFlottant.createElement("title");
  titre.textContent = "Calculateur de craft";
  documentFlottant.head.appendChild(titre);

  documentFlottant.body.innerHTML =
    '<div id="bandeauResultatsCompact" class="bandeau-resultats"></div>'
    + '<div id="conteneurRessourcesCompact"></div>';
  documentFlottant.body.style.padding = "10px";
}

/**
 * Vue compacte : bandeau réduit, puis les colonnes de prix utiles devant le HDV.
 * Les champs y sont pleinement modifiables, c'est tout l'intérêt d'avoir la
 * fenêtre devant le jeu. Le prix moyen est le seul absent : il ne se relève pas
 * au HDV, il se lit dans l'interface de craft.
 */
export function dessinerLaVueCompacte() {
  if (!fenetreFlottante || fenetreFlottante.closed) return;

  const documentFlottant = fenetreFlottante.document;
  const analyse = analyserLaSessionComplete();

  const classeDuProfit = analyse.profitTotalDeLaSession >= 0 ? "gain" : "perte";
  const signeDuProfit = analyse.profitTotalDeLaSession >= 0 ? "+" : "";

  documentFlottant.getElementById("bandeauResultatsCompact").innerHTML =
    '<div class="case-resultat"><div class="intitule">Coût des ressources</div>'
      + '<div class="valeur">' + formaterMontantEnKamas(analyse.coutTotalDesRessources) + "</div>"
      + (analyse.nombreDeRessourcesSansPrix > 0
          ? '<div class="precision prix-manquant">' + analyse.nombreDeRessourcesSansPrix
            + " sans prix</div>" : "") + "</div>"
    + '<div class="case-resultat"><div class="intitule">Résultat</div>'
      + '<div class="valeur ' + classeDuProfit + '">' + signeDuProfit
      + formaterMontantEnKamas(analyse.profitTotalDeLaSession) + "</div></div>";

  const conteneur = documentFlottant.getElementById("conteneurRessourcesCompact");

  if (analyse.lignesDeRessources.length === 0) {
    conteneur.innerHTML = '<div class="texte-vide">Aucune ressource en session.</div>';
    return;
  }

  const tableau = documentFlottant.createElement("table");
  tableau.className = "tableau-ressources";
  tableau.innerHTML =
    '<thead><tr><th>Ressource</th><th class="colonne-chiffre">Qté</th>'
    + '<th class="colonne-partagee">×1</th><th>×10</th><th>×100</th><th>×1000</th>'
    + '<th class="colonne-chiffre">Coût</th></tr></thead><tbody></tbody>';

  const corps = tableau.querySelector("tbody");

  for (const ligne of analyse.lignesDeRessources) {
    const rangee = documentFlottant.createElement("tr");
    rangee.innerHTML =
      '<td class="colonne-nom"><div class="cellule-nom-ressource">'
        + '<img src="' + echapperPourHtml(ligne.besoin.adresseIcone) + '" alt="">'
        + "<span>" + construireLeNomCopiable(ligne.besoin.nom)
        + construireLaPastilleDeProvenance(ligne)
        + construireLaPastilleDeQuarantaine(ligne) + "</span></div></td>"
      // La quantité annoncée est celle À ACHETER, pas celle consommée. C'est
      // cette fenêtre-là qui est ouverte devant le HDV, la main sur les achats :
      // y afficher un besoin dont une partie sort d'un atelier ferait acheter
      // ce que la session produit déjà.
      + '<td class="colonne-chiffre">'
        + (ligne.entierementProduiteSurPlace
            ? '<span class="marque-produite" title="Craftée sur place">craftée</span>'
            : formaterNombreSimple(ligne.besoin.quantiteAAcheter)) + "</td>"
      + construireLaCelluleDuPrixUnitaire(ligne)
      + construireLesCellulesDesGrosLots(ligne)
      + '<td class="colonne-chiffre">'
        + (ligne.achatOptimal ? formaterMontantEnKamas(ligne.achatOptimal.coutTotal)
                              : '<span class="attenue">–</span>') + "</td>";

    // Même branchement que dans la fenêtre principale, donc même redessin des
    // deux fenêtres et même publication : la valeur saisie ici part vers la base
    // et apparaît immédiatement dans l'autre fenêtre.
    brancherLesSaisiesDePrixDUneRangee(rangee, ligne);
    corps.appendChild(rangee);
  }

  marquerLesChampsCommeObsoletes(conteneur);
  conteneur.innerHTML = "";
  conteneur.appendChild(tableau);
  // Copier un nom depuis la fenêtre posée devant le jeu est même son usage le
  // plus direct : le nom part droit dans la barre de recherche du HDV.
  brancherLaCopieDesNoms(conteneur);
}

function mettreAJourLIntituleDuBouton() {
  if (!boutonDeBascule) return;
  const ouverte = fenetreFlottante && !fenetreFlottante.closed;
  boutonDeBascule.textContent = ouverte ? "Fermer le PIP" : "PIP";
}
