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
import { etatApplication } from "./etat.js";
import { formaterMontantEnKamas, formaterNombreSimple, echapperPourHtml } from "./formats.js";
import { construireLeNomCopiable } from "./cartes-de-craft.js";
import { brancherLaCopieDesNoms } from "./presse-papier.js";
import { construireLaCaseDuPrixUnitaire, construireLaPastilleDeProvenance,
         construireLaPastilleDeQuarantaine } from "./cellules-de-prix.js";
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
    + '<div id="rappelDesCraftsCompact"></div>'
    + '<div id="conteneurRessourcesCompact"></div>';
  documentFlottant.body.style.padding = "10px";
}

/* ============================================================
   LA FENÊTRE FLOTTANTE EST UNE LISTE DE COURSES, PAS UN TABLEUR

   Elle reprenait le tableau de la fenêtre principale, en plus étroit : dix
   colonnes de prix devant un HDV où l'on fait une seule chose, acheter ligne
   par ligne. Ce n'est pas la question qu'on se pose là : la question est
   « qu'est-ce qu'il me reste à acheter, en quelle quantité, et sous quelle
   forme ». Trois réponses, une ligne chacune.

   Ce qui apparaît donc, et rien d'autre :

     la case à cocher   ce qui est acheté sort du chemin. C'est la seule chose
                        qu'une liste de courses doit savoir faire, et le
                        tableau ne la faisait pas.
     le panier          « 2 × 100 + 1 × 10 » se tape tel quel dans le HDV. Le
                        moteur le calcule déjà, il n'était affiché nulle part.
     le prix ×1         seul champ conservé : c'est celui qu'on relève en
                        passant, et il manque souvent. Les gros lots se
                        saisissent dans la fenêtre principale, au calme.

   Les cases cochées ne sont PAS sauvegardées. Une liste de courses vaut pour
   une sortie au HDV ; la retrouver à moitié cochée le lendemain ferait sauter
   des achats.
   ============================================================ */

const ressourcesDejaAchetees = new Set();

/**
 * Vue compacte : ce qu'il reste à acheter, dans l'ordre où on le fait.
 *
 * Une saisie de prix faite ici est écrite en base et redessine les deux
 * fenêtres, publication comprise : c'est le même branchement que dans la
 * fenêtre principale, pas une copie.
 */
export function dessinerLaVueCompacte() {
  if (!fenetreFlottante || fenetreFlottante.closed) return;

  const documentFlottant = fenetreFlottante.document;
  const analyse = analyserLaSessionComplete();

  // Ce qui se crafte sur place n'a rien à faire dans une liste de courses :
  // l'afficher au HDV ferait acheter ce que la session produit.
  const aAcheter = analyse.lignesDeRessources.filter(ligne => !ligne.entierementProduiteSurPlace);
  const restantes = aAcheter.filter(
    ligne => !ressourcesDejaAchetees.has(ligne.besoin.identifiantAnkama));

  const coutRestant = restantes.reduce(
    (total, ligne) => total + (ligne.achatOptimal ? ligne.achatOptimal.coutTotal : 0), 0);
  const nombreSansPrix = restantes.filter(ligne => !ligne.achatOptimal).length;

  documentFlottant.getElementById("bandeauResultatsCompact").innerHTML =
    '<div class="case-resultat"><div class="intitule">Reste à acheter</div>'
      + '<div class="valeur">' + (aAcheter.length - restantes.length) + " / "
      + aAcheter.length + "</div>"
      + '<div class="precision">ressource(s) cochées</div></div>'
    + '<div class="case-resultat"><div class="intitule">Kamas à sortir</div>'
      + '<div class="valeur">' + (nombreSansPrix > 0 ? "au moins " : "")
      + formaterMontantEnKamas(coutRestant) + "</div>"
      + (nombreSansPrix > 0
          ? '<div class="precision prix-manquant">' + nombreSansPrix + " sans prix</div>"
          : '<div class="precision">pour ce qui reste</div>') + "</div>";

  dessinerLeRappelDesCrafts(documentFlottant);

  const conteneur = documentFlottant.getElementById("conteneurRessourcesCompact");

  if (aAcheter.length === 0) {
    marquerLesChampsCommeObsoletes(conteneur);
    conteneur.innerHTML = '<div class="texte-vide">'
      + (analyse.lignesDeRessources.length === 0
          ? "Aucune ressource en session."
          : "Rien à acheter : tout est crafté sur place.") + "</div>";
    return;
  }

  const liste = documentFlottant.createElement("ul");
  liste.className = "liste-de-courses";

  for (const ligne of aAcheter) {
    liste.appendChild(construireUneLigneDeCourses(documentFlottant, ligne));
  }

  marquerLesChampsCommeObsoletes(conteneur);
  conteneur.innerHTML = "";
  conteneur.appendChild(liste);
  // Copier un nom depuis la fenêtre posée devant le jeu est même son usage le
  // plus direct : le nom part droit dans la barre de recherche du HDV.
  brancherLaCopieDesNoms(conteneur);
}

/**
 * Rappel des crafts, juste au-dessus de la liste de courses.
 *
 * La liste de courses agrège les ressources de toutes les recettes, et c'est ce
 * qu'il faut devant le HDV. Mais elle perd au passage ce qu'on est venu faire :
 * trois sortes de pain se partagent le blé, et rien ne dit plus combien de
 * chacune. Ce rappel le redit, sans rien retirer des totaux au-dessus.
 *
 * Trié par niveau de recette croissant. Ce n'est pas décoratif : la surcharge de
 * poids interdit de porter toutes les ressources d'un coup, il faut donc faire
 * les crafts dans un ordre, et l'ordre utile est celui des niveaux — on monte
 * par le bas.
 *
 * Le nom est copiable, comme dans la liste : il part droit dans la barre de
 * recherche du HDV ou dans l'atelier.
 */
function dessinerLeRappelDesCrafts(documentFlottant) {
  const conteneur = documentFlottant.getElementById("rappelDesCraftsCompact");

  const craftsAFaire = etatApplication.craftsDeLaSession
    .filter(craft => (craft.quantiteACrafter || 0) > 0)
    .slice()
    .sort((a, b) => (a.niveau || 0) - (b.niveau || 0));

  if (craftsAFaire.length === 0) {
    conteneur.innerHTML = "";
    return;
  }

  conteneur.innerHTML = '<div class="rappel-des-crafts">'
    + craftsAFaire.map(craft =>
        '<div class="craft-rappele">'
          + '<img src="' + echapperPourHtml(craft.adresseIcone) + '" alt="">'
          + construireLeNomCopiable(craft.nom)
          + '<span class="attenue petit">niv. ' + craft.niveau + "</span>"
          + '<span class="quantite">×' + formaterNombreSimple(craft.quantiteACrafter) + "</span>"
        + "</div>").join("")
    + "</div>";

  brancherLaCopieDesNoms(conteneur);
}

function construireUneLigneDeCourses(documentFlottant, ligne) {
  const identifiant = ligne.besoin.identifiantAnkama;
  const achetee = ressourcesDejaAchetees.has(identifiant);

  const element = documentFlottant.createElement("li");
  element.className = "ligne-de-courses" + (achetee ? " ligne-achetee" : "");
  element.innerHTML =
    '<input type="checkbox" class="coche-achat" data-coche-achat="oui"'
      + (achetee ? " checked" : "") + ' title="Acheté">'
    + '<span class="quantite-de-courses">' + formaterNombreSimple(ligne.besoin.quantiteAAcheter)
      + "</span>"
    + '<img src="' + echapperPourHtml(ligne.besoin.adresseIcone) + '" alt="">'
    + '<span class="nom-de-courses">' + construireLeNomCopiable(ligne.besoin.nom)
      + construireLaPastilleDeProvenance(ligne)
      + construireLaPastilleDeQuarantaine(ligne) + "</span>"
    + '<span class="panier-de-courses">' + decrireLePanier(ligne) + "</span>"
    + construireLaCaseDuPrixUnitaire(ligne)
    + '<span class="cout-de-courses">'
      + (ligne.achatOptimal ? formaterMontantEnKamas(ligne.achatOptimal.coutTotal)
                            : '<span class="prix-manquant">prix à saisir</span>') + "</span>";

  element.querySelector("[data-coche-achat]").addEventListener("change", evenement => {
    if (evenement.target.checked) ressourcesDejaAchetees.add(identifiant);
    else ressourcesDejaAchetees.delete(identifiant);
    dessinerLaVueCompacte();
  });

  // Le même branchement que dans la fenêtre principale : la valeur saisie ici
  // part vers la base et apparaît immédiatement dans l'autre fenêtre.
  brancherLesSaisiesDePrixDUneRangee(element, ligne);
  return element;
}

/**
 * Le panier, tel qu'il se tape au HDV : « 2 × 100 + 1 × 10 ».
 *
 * C'est le résultat du calcul d'achat le moins cher, qui autorise le surachat
 * — deux lots de 10 valent souvent mieux qu'un lot de 10 et deux unités. Il
 * était calculé depuis toujours et n'apparaissait nulle part, alors que c'est
 * exactement le geste à reproduire devant l'étal.
 */
function decrireLePanier(ligne) {
  if (!ligne.achatOptimal || !ligne.achatOptimal.compositionDesAchats) {
    return '<span class="attenue">–</span>';
  }

  const composition = ligne.achatOptimal.compositionDesAchats;
  const morceaux = Object.keys(composition)
    .map(taille => parseInt(taille, 10))
    .sort((a, b) => b - a)
    .map(taille => composition[taille] + " × " + taille);

  if (morceaux.length === 0) return '<span class="attenue">–</span>';

  const total = Object.keys(composition)
    .reduce((somme, taille) => somme + composition[taille] * parseInt(taille, 10), 0);
  // Le surachat est annoncé : acheter 20 pour en utiliser 12 est un choix du
  // moteur, pas une erreur de saisie, et le voir sans explication ferait douter
  // du chiffre au moment de payer.
  const surplus = total - ligne.besoin.quantiteAAcheter;
  const mentionDeSurplus = surplus > 0
    ? ' <span class="attenue" title="Le lot supplémentaire revient moins cher que'
      + ' l\'appoint à l\'unité. Le surplus reste en banque.">+' + surplus + "</span>"
    : "";

  return morceaux.join(" + ") + mentionDeSurplus;
}

function mettreAJourLIntituleDuBouton() {
  if (!boutonDeBascule) return;
  const ouverte = fenetreFlottante && !fenetreFlottante.closed;
  boutonDeBascule.textContent = ouverte ? "Fermer le PIP" : "PIP";
}
