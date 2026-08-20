/**
 * Rendu de l'interface principale.
 *
 * Point d'entrée unique du rendu : toute modification de l'état passe par
 * `redessinerToutLEcran`, ce qui garantit que la fenêtre principale et la
 * fenêtre flottante ne peuvent pas afficher des chiffres différents.
 */
import { TAILLES_DE_LOT_DISPONIBLES, TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE,
         NOMBRE_DE_JOURS_AVANT_PRIX_CONSIDERE_ANCIEN } from "./config.js";
import { etatApplication, sauvegarderEtat, obtenirOuCreerLaFichePrix } from "./etat.js";
import { analyserLaSessionComplete } from "./analyse.js";
import { formaterMontantEnKamas, formaterNombreSimple, interpreterSaisieDeMontant,
         calculerAgeEnJoursDepuis, echapperPourHtml } from "./formats.js";
import { construireLaCelluleDuPrixUnitaire, construireLesCellulesDesGrosLots,
         construireLaCelluleDuPrixMoyen, construireLaPastilleDeProvenance,
         construireLaMentionDeDesaccord } from "./cellules-de-prix.js";
import { construireLeSelecteurDeDestination, construireLesChampsDeVente,
         construireLaLigneDeBilan } from "./vente.js";
import { construireLaPastilleDeQuarantaine } from "./cellules-de-prix.js";
import { construireLEnteteDeCraft, construireLaListeDesIngredients,
         construireLArbitrageCraftOuAchat, construireLeNomCopiable,
         construireLaPastilleDeMetier } from "./cartes-de-craft.js";
import { crafterUneRessourceSurPlace, retirerUnCraftEtSaDescendance } from "./crafts.js";
import { lireLaRecetteConnue } from "./metiers.js";
import { brancherLaCopieDesNoms } from "./presse-papier.js";
import { confirmerUnPrixEnQuarantaine, confirmerToutesLesValeursDUneRessource,
         oublierLaQuarantaine } from "./quarantaine.js";
import { publierUnPrixUnitaire, laPublicationEstPossible } from "./api-prix.js";
import { annoncer } from "./journal.js";

let bandeauResultats = null;
let conteneurCrafts = null;
let conteneurRessources = null;

/** Redessin de la fenêtre flottante, enregistré par elle pour éviter un cycle. */
let redessinerLaFenetreSecondaire = null;

export function installerLaVue(elements) {
  bandeauResultats = elements.bandeauResultats;
  conteneurCrafts = elements.conteneurCrafts;
  conteneurRessources = elements.conteneurRessources;
}

export function enregistrerLeRedessinSecondaire(fonction) {
  redessinerLaFenetreSecondaire = fonction;
}

export function redessinerToutLEcran() {
  const analyse = analyserLaSessionComplete();
  dessinerLeBandeauDeResultats(analyse);
  dessinerLesCraftsDeLaSession(analyse);
  dessinerLeTableauDesRessources(analyse);
  if (redessinerLaFenetreSecondaire) redessinerLaFenetreSecondaire();
}

/* ============================================================
   Bandeau de résultats
   ============================================================ */

function dessinerLeBandeauDeResultats(analyse) {
  const classeDuProfit = analyse.profitTotalDeLaSession >= 0 ? "gain" : "perte";
  const signeDuProfit = analyse.profitTotalDeLaSession >= 0 ? "+" : "";

  const mentionPrixManquants = analyse.nombreDeRessourcesSansPrix > 0
    ? '<div class="precision prix-manquant">' + analyse.nombreDeRessourcesSansPrix
      + " ressource(s) sans prix, total sous-estimé</div>"
    : "";

  // Ce qui est crafté pour les persos a sa propre case, hors du résultat de
  // session. Le mélanger au profit peindrait en rouge une séance saine : une
  // potion gardée n'est pas une perte, c'est une acquisition — reste à savoir
  // si elle revient moins cher qu'au HDV, et ça, c'est le coût par objet qui le
  // dit, ligne par ligne.
  const caseUsagePersonnel = analyse.coutDesCraftsPourUsagePersonnel > 0
    ? '<div class="case-resultat"><div class="intitule">Pour tes persos</div>'
      + '<div class="valeur">' + formaterMontantEnKamas(analyse.coutDesCraftsPourUsagePersonnel) + "</div>"
      + '<div class="precision">crafté pour toi, hors résultat</div></div>'
    : "";

  let caseExperience = "";
  if (analyse.experienceTotaleGagnee > 0) {
    const coutParPointDExperience = -analyse.profitTotalDeLaSession / analyse.experienceTotaleGagnee;
    caseExperience =
      '<div class="case-resultat"><div class="intitule">Coût par point d\'XP</div>'
      + '<div class="valeur">' + (coutParPointDExperience > 0
          ? formaterNombreSimple(coutParPointDExperience) + " k"
          : '<span class="gain">gain</span>') + "</div>"
      + '<div class="precision">' + formaterNombreSimple(analyse.experienceTotaleGagnee)
      + " XP au total</div></div>";
  }

  bandeauResultats.innerHTML =
    '<div class="case-resultat"><div class="intitule">Coût des ressources</div>'
      + '<div class="valeur">' + formaterMontantEnKamas(analyse.coutTotalDesRessources) + "</div>"
      + '<div class="precision">à sortir avant de commencer</div>' + mentionPrixManquants + "</div>"
    + '<div class="case-resultat"><div class="intitule">Revenu après taxe</div>'
      + '<div class="valeur">' + formaterMontantEnKamas(analyse.revenuBrutTotal - analyse.taxeTotale) + "</div>"
      + '<div class="precision">taxe de ' + formaterMontantEnKamas(analyse.taxeTotale) + " déduite</div></div>"
    + '<div class="case-resultat"><div class="intitule">Résultat de la session</div>'
      + '<div class="valeur ' + classeDuProfit + '">' + signeDuProfit
      + formaterMontantEnKamas(analyse.profitTotalDeLaSession) + "</div>"
      + '<div class="precision">' + etatApplication.craftsDeLaSession.length
      + " recette(s) en session</div></div>"
    + caseUsagePersonnel
    + caseExperience;
}

/* ============================================================
   Cartes de craft
   ============================================================ */

function dessinerLesCraftsDeLaSession(analyse) {
  if (etatApplication.craftsDeLaSession.length === 0) {
    conteneurCrafts.innerHTML =
      '<div class="texte-vide">Aucun craft. Tape le nom d\'un objet ci-dessus, '
      + "les ingrédients arrivent tout seuls.</div>";
    return;
  }

  conteneurCrafts.innerHTML = "";

  // L'arbre est parcouru dans l'ordre où il doit être lu : un parent, puis sa
  // branche entière, puis le parent suivant. C'est le parcours en profondeur
  // d'`arbre-de-crafts.js`, et c'est aussi la raison pour laquelle c'en est un.
  for (const noeud of analyse.arbre.deLaRacineAuxFeuilles) {
    const bilan = analyse.bilansParCraft
      .find(b => b.identifiantDeLigne === noeud.craft.identifiantDeLigne);
    conteneurCrafts.appendChild(dessinerUneCarteDeCraft(noeud, bilan, analyse));
  }

  brancherLaCopieDesNoms(conteneurCrafts);
}

function dessinerUneCarteDeCraft(noeud, bilan, analyse) {
  const craft = noeud.craft;

  const carte = document.createElement("div");
  carte.className = "carte-craft" + (bilan.estUnSousCraft ? " carte-sous-craft" : "");
  // La profondeur pilote le décalage en CSS plutôt qu'un style en ligne : c'est
  // la feuille de style qui décide de combien un étage s'enfonce, et elle peut
  // le faire dépendre de la largeur de l'écran.
  carte.style.setProperty("--profondeur", String(noeud.profondeur));

  carte.innerHTML =
    construireLEnteteDeCraft(craft, bilan)
    + '<div class="grille-champs-craft">'
      + construireLeChampDeQuantite(craft, bilan)
      + (bilan.estUnSousCraft ? "" : construireLeSelecteurDeDestination(craft))
      + '<div class="champ-etiquete"><label class="etiquette">XP par craft à ton niveau</label>'
        + '<input data-champ="experienceParCraft" value="'
        + (craft.experienceParCraft ? craft.experienceParCraft : "") + '" placeholder="ex. 1618"></div>'
      + (bilan.estUnSousCraft ? "" : construireLesChampsDeVente(craft))
    + "</div>"
    + construireLaListeDesIngredients(craft, noeud, analyse.lignesDeRessources)
    + construireLaLigneDeBilan(craft, bilan);

  brancherLesActionsDUneCarte(carte, craft, noeud);
  return carte;
}

/**
 * Quantité : saisissable sur un craft de tête, affichée sur un sous-craft.
 *
 * Un sous-craft produit exactement ce que son parent consomme. Offrir un champ
 * modifiable laisserait chiffrer une session où l'on fabrique deux Planches
 * pour trois Substrats — un plan qui ne s'exécute pas, et que rien à l'écran ne
 * viendrait contredire.
 */
function construireLeChampDeQuantite(craft, bilan) {
  if (!bilan.estUnSousCraft) {
    return '<div class="champ-etiquete"><label class="etiquette">Quantité</label>'
      + '<input data-champ="quantiteACrafter" value="' + craft.quantiteACrafter + '"></div>';
  }

  return '<div class="champ-etiquete"><label class="etiquette">Quantité déduite</label>'
    + '<div class="valeur-deduite" title="Ce que la recette du dessus consomme.'
    + ' Change avec la quantité du craft parent.">'
    + formaterNombreSimple(bilan.quantiteEffective) + "</div></div>";
}

function brancherLesActionsDUneCarte(carte, craft, noeud) {
  carte.querySelector('[data-action="supprimer"]').addEventListener("click", () => {
    const nombreRetire = retirerUnCraftEtSaDescendance(craft.identifiantDeLigne);
    // La cascade est silencieuse quand elle n'emporte que la carte cliquée, et
    // annoncée dès qu'elle en emporte d'autres : voir disparaître trois cartes
    // pour un clic mérite une explication.
    if (nombreRetire > 1) {
      annoncer(craft.nom + " retiré, avec les " + (nombreRetire - 1)
        + " sous-craft(s) qui le servaient.");
    }
    redessinerToutLEcran();
  });

  for (const bouton of carte.querySelectorAll("[data-crafter-ingredient]")) {
    bouton.addEventListener("click", async () => {
      const identifiant = parseInt(bouton.getAttribute("data-crafter-ingredient"), 10);
      // Désarmé le temps de l'appel : la recette part chercher sa composition
      // chez DofusDude, et deux clics pendant ce délai ajouteraient deux fois
      // le même sous-craft, la garde ne voyant encore ni l'un ni l'autre.
      bouton.disabled = true;
      annoncer("Ouverture de la recette…", "en-cours");

      const resultat = await crafterUneRessourceSurPlace(identifiant, craft.identifiantDeLigne);
      annoncer(resultat.message, resultat.ajoute ? "succes" : "echec");
      if (!resultat.ajoute) bouton.disabled = false;
      redessinerToutLEcran();
    });
  }

  const selecteurDeDestination = carte.querySelector("[data-destination]");
  // Changer la destination redessine la carte : les champs de vente ne sont pas
  // les mêmes d'un mode à l'autre. Les prix déjà saisis sont conservés des deux
  // côtés, on compare souvent l'unitaire et le lot avant de trancher.
  if (selecteurDeDestination) {
    selecteurDeDestination.addEventListener("change", evenement => {
      craft.destination = evenement.target.value;
      sauvegarderEtat();
      redessinerToutLEcran();
    });
  }

  for (const champ of carte.querySelectorAll("[data-vente-taille-de-lot]")) {
    champ.addEventListener("change", () => {
      const taille = parseInt(champ.getAttribute("data-vente-taille-de-lot"), 10);
      if (!craft.prixDeVenteParTailleDeLot) craft.prixDeVenteParTailleDeLot = {};
      craft.prixDeVenteParTailleDeLot[taille] = interpreterSaisieDeMontant(champ.value);
      sauvegarderEtat();
      redessinerToutLEcran();
    });
  }

  for (const champ of carte.querySelectorAll("[data-champ]")) {
    champ.addEventListener("change", () => {
      const nomDuChamp = champ.getAttribute("data-champ");
      const valeur = interpreterSaisieDeMontant(champ.value);
      craft[nomDuChamp] = valeur;
      // L'XP relevée est mémorisée pour que la recette revienne pré-remplie.
      // Elle dépend du niveau de métier, donc à corriger après chaque montée.
      if (nomDuChamp === "experienceParCraft") {
        etatApplication.memoireExperienceParRecette[craft.identifiantAnkama] = valeur;
      }
      sauvegarderEtat();
      redessinerToutLEcran();
    });
  }
}

/* ============================================================
   Tableau des ressources
   ============================================================ */

function dessinerLeTableauDesRessources(analyse) {
  if (analyse.lignesDeRessources.length === 0) {
    marquerLesChampsCommeObsoletes(conteneurRessources);
    conteneurRessources.innerHTML =
      '<div class="texte-vide">Les ressources apparaîtront ici dès qu\'un craft sera ajouté.</div>';
    return;
  }

  const tableau = document.createElement("table");
  tableau.className = "tableau-ressources";
  tableau.innerHTML =
    "<thead><tr>"
    + '<th>Ressource</th><th class="colonne-chiffre">Qté</th>'
    + '<th class="colonne-partagee">×1 <span class="exposant">partagé</span></th>'
    + "<th>×10</th><th>×100</th><th>×1000</th>"
    + "<th>Prix moyen</th>"
    + '<th>À acheter</th><th class="colonne-chiffre">Coût</th><th></th>'
    + "</tr></thead><tbody></tbody>";

  const corpsDuTableau = tableau.querySelector("tbody");

  for (const ligne of analyse.lignesDeRessources) {
    const rangee = document.createElement("tr");
    rangee.innerHTML =
      construireLaCelluleDuNom(ligne)
      + '<td class="colonne-chiffre">'
        + formaterNombreSimple(ligne.besoin.quantiteTotaleNecessaire) + "</td>"
      + construireLaCelluleDuPrixUnitaire(ligne)
      + construireLesCellulesDesGrosLots(ligne)
      + construireLaCelluleDuPrixMoyen(ligne)
      + "<td>" + decrireLePanier(ligne) + "</td>"
      + construireLaCelluleDuCout(ligne)
      + construireLaCelluleDAction(ligne, analyse);

    brancherLesSaisiesDePrixDUneRangee(rangee, ligne);
    brancherLeBoutonDeCraftDUneRangee(rangee);
    corpsDuTableau.appendChild(rangee);
  }

  // Les champs qui vont disparaître sont marqués avant d'être retirés : leur
  // `change` de sortie n'est pas une saisie de Brice et ne doit rien publier.
  marquerLesChampsCommeObsoletes(conteneurRessources);
  conteneurRessources.innerHTML = "";
  conteneurRessources.appendChild(tableau);
  brancherLaCopieDesNoms(conteneurRessources);
}

/**
 * Colonne d'action : crafter cette ressource plutôt que l'acheter.
 *
 * LE BOUTON A BESOIN DE SAVOIR POUR QUI IL CRAFTE
 *
 * Le tableau est agrégé : une même ressource peut servir trois recettes. Un
 * sous-craft, lui, se rattache à UN parent — c'est de lui qu'il tient sa
 * quantité. Quand plusieurs recettes réclament la ressource, le bouton seul ne
 * peut pas trancher, et un sélecteur dit laquelle servir.
 *
 * Le cas courant reste celui d'un seul consommateur, et il ne doit rien coûter :
 * un menu à une entrée serait une question dont la réponse est évidente.
 */
function construireLaCelluleDAction(ligne, analyse) {
  const recette = lireLaRecetteConnue(ligne.besoin.identifiantAnkama);
  if (!recette || !recette.craftable) return '<td class="colonne-action"></td>';

  const consommateurs = listerLesCraftsQuiConsomment(ligne.besoin.identifiantAnkama, analyse);
  if (consommateurs.length === 0) return '<td class="colonne-action"></td>';

  if (consommateurs.length === 1) {
    return '<td class="colonne-action"><button class="bouton-crafter" data-crafter-ressource="'
      + ligne.besoin.identifiantAnkama + '" data-pour-le-craft="'
      + echapperPourHtml(consommateurs[0].craft.identifiantDeLigne)
      + '" title="Crafter au lieu d\'acheter, pour '
      + echapperPourHtml(consommateurs[0].craft.nom) + '">Crafter</button></td>';
  }

  const options = consommateurs.map(noeud =>
    '<option value="' + echapperPourHtml(noeud.craft.identifiantDeLigne) + '">'
    + echapperPourHtml(noeud.craft.nom) + "</option>").join("");

  return '<td class="colonne-action"><div class="action-crafter-multiple">'
    + '<select class="selecteur-taille-lot" data-choix-du-parent="oui"'
    + ' title="Quelle recette ce craft doit-il servir ?">' + options + "</select>"
    + '<button class="bouton-crafter" data-crafter-ressource="'
    + ligne.besoin.identifiantAnkama + '">Crafter</button></div></td>';
}

/**
 * Crafts qui consomment cette ressource et ne la produisent pas déjà.
 *
 * Le filtre sur ce qui est déjà produit n'est pas de la coquetterie : proposer
 * « Crafter » pour une recette qui a déjà son atelier mènerait au refus poli de
 * `crafterUneRessourceSurPlace`, et un bouton qui ne fait que se justifier de
 * ne rien faire vaut mieux absent.
 */
function listerLesCraftsQuiConsomment(identifiantAnkama, analyse) {
  return analyse.arbre.deLaRacineAuxFeuilles.filter(noeud =>
    !noeud.ingredientsProduitsSurPlace.has(identifiantAnkama)
    && noeud.craft.ingredients.some(i => i.identifiantAnkama === identifiantAnkama));
}

function brancherLeBoutonDeCraftDUneRangee(rangee) {
  const bouton = rangee.querySelector("[data-crafter-ressource]");
  if (!bouton) return;

  bouton.addEventListener("click", async () => {
    const identifiant = parseInt(bouton.getAttribute("data-crafter-ressource"), 10);
    const selecteurDeParent = rangee.querySelector("[data-choix-du-parent]");
    const ligneDuParent = selecteurDeParent
      ? selecteurDeParent.value
      : bouton.getAttribute("data-pour-le-craft");

    // Même garde que sur la carte : la composition part chez DofusDude, et deux
    // clics pendant ce délai ajouteraient deux fois le même sous-craft.
    bouton.disabled = true;
    annoncer("Ouverture de la recette…", "en-cours");

    const resultat = await crafterUneRessourceSurPlace(identifiant, ligneDuParent);
    annoncer(resultat.message, resultat.ajoute ? "succes" : "echec");
    if (!resultat.ajoute) bouton.disabled = false;
    redessinerToutLEcran();
  });
}

function construireLaCelluleDuNom(ligne) {
  // Une seule mention d'âge à la fois : quand le prix vient de Brice, c'est
  // l'ancienneté de SON relevé qui compte ; quand il vient de la base, la
  // pastille de provenance porte déjà la date.
  let mentionDeLAge = "";
  if (ligne.origineDuPrixUnitaire === "personnel") {
    const age = calculerAgeEnJoursDepuis(ligne.horodatageDerniereMiseAJourDuPrix);
    if (age !== null && age >= NOMBRE_DE_JOURS_AVANT_PRIX_CONSIDERE_ANCIEN) {
      mentionDeLAge = ' <span class="prix-ancien" title="Prix saisi il y a ' + age
        + ' jours">⚠ ' + age + " j</span>";
    }
  }

  return '<td class="colonne-nom"><div class="cellule-nom-ressource">'
    + '<img src="' + echapperPourHtml(ligne.besoin.adresseIcone) + '" alt="">'
    + "<span>" + construireLeNomCopiable(ligne.besoin.nom)
    + construireLaPastilleDeMetier(ligne.besoin.identifiantAnkama)
    + construireLaPastilleDeProvenance(ligne)
    + construireLaPastilleDeQuarantaine(ligne)
    + construireLaMentionDeDesaccord(ligne)
    + mentionDeLAge
    + "</span></div></td>";
}

/** Formulation lisible du panier, par exemple « 2 × 100 + 3 × 10 + 4 × 1 ». */
function decrireLePanier(ligne) {
  // Produite par un atelier de la session : rien à acheter, et surtout pas un
  // « prix à saisir » en jaune, qui ferait croire à une lacune alors que c'est
  // un choix. Le prix de la ligne reste saisissable pour l'arbitrage.
  if (ligne.entierementProduiteSurPlace) {
    return '<span class="marque-produite" title="Fabriquée par un atelier de la session,'
      + ' donc hors de la liste de courses">craftée sur place</span>';
  }
  if (!ligne.achatOptimal) return '<span class="prix-manquant">prix à saisir</span>';

  if (ligne.achatOptimal.methodeDeCalcul !== "lots") {
    // En estimation, on n'annonce pas de panier : aucun lot n'est réellement
    // recommandé. Formuler cela en nombre de lots donnerait des « 0,06 lot de
    // 100 », qui se lisent comme un conseil d'achat alors que ce n'en est pas un.
    return '<span class="mention-composition">'
      + formaterNombreSimple(ligne.besoin.quantiteTotaleNecessaire) + " × "
      + formaterNombreSimple(ligne.achatOptimal.prixUnitaireEffectif) + "/u"
      + ' <span class="attenue">(' + ligne.achatOptimal.methodeDeCalcul + ")</span></span>";
  }

  const morceaux = TAILLES_DE_LOT_DISPONIBLES
    .slice().sort((a, b) => b - a)
    .filter(taille => ligne.achatOptimal.compositionDesAchats[taille])
    .map(taille => ligne.achatOptimal.compositionDesAchats[taille] + " × " + taille);

  const quantiteAchetee = TAILLES_DE_LOT_DISPONIBLES
    .reduce((somme, taille) =>
      somme + (ligne.achatOptimal.compositionDesAchats[taille] || 0) * taille, 0);
  const surplus = quantiteAchetee - ligne.besoin.quantiteTotaleNecessaire;

  return '<span class="mention-composition">' + morceaux.join(" + ")
    + (surplus > 0 ? ' <span class="attenue">(+' + surplus + " en trop)</span>" : "") + "</span>";
}

/**
 * Cellule de coût. Porte `colonne-cout` en plus de son alignement : depuis la
 * colonne d'action, elle n'est plus la dernière de la rangée, et la désigner
 * par sa position serait un piège pour le prochain qui ajoute une colonne.
 */
function construireLaCelluleDuCout(ligne) {
  if (!ligne.achatOptimal) return '<td class="colonne-cout colonne-chiffre attenue">–</td>';
  const estimee = ligne.achatOptimal.methodeDeCalcul !== "lots";
  return '<td class="colonne-cout colonne-chiffre' + (estimee ? " attenue" : "") + '">'
    + formaterMontantEnKamas(ligne.achatOptimal.coutTotal) + "</td>";
}

/* ============================================================
   Saisie des prix, et publication du ×1

   Le ×1 est le seul champ dont la saisie sort de la machine. Il part vers la
   base dès que le champ est quitté, et le bandeau d'état le dit. L'API n'impose
   aucune limite de fréquence, donc une faute de frappe se corrige par une
   simple ressaisie, immédiatement.
   ============================================================ */

/**
 * Neutralise les champs de prix d'un conteneur avant qu'il ne soit vidé.
 *
 * Retirer du DOM un input dont la valeur a été modifiée fait émettre un
 * `change` par le navigateur. Ce `change`-là n'exprime aucune intention : il
 * publierait une saisie en cours, et une saisie à moitié tapée est un faux prix
 * envoyé à tous les joueurs du serveur.
 */
export function marquerLesChampsCommeObsoletes(conteneur) {
  if (!conteneur) return;
  for (const champ of conteneur.querySelectorAll(
      "[data-taille-de-lot], [data-prix-moyen], [data-taille-du-prix-moyen]")) {
    champ.dataset.rangeeObsolete = "1";
  }
}

export function brancherLesSaisiesDePrixDUneRangee(rangee, ligne) {
  const identifiant = ligne.besoin.identifiantAnkama;
  const nomDeLaRessource = ligne.besoin.nom;

  brancherLesCochesDeQuarantaine(rangee, identifiant, nomDeLaRessource);

  const controles = rangee.querySelectorAll(
    "[data-taille-de-lot], [data-prix-moyen], [data-taille-du-prix-moyen]");

  for (const controle of controles) {
    controle.addEventListener("change", async () => {
      // Un input dont la valeur a été modifiée émet un `change` au moment où il
      // est retiré du DOM. Un redessin survenu pendant que Brice tape publierait
      // donc sa saisie en cours, éventuellement à moitié tapée. Le redessin
      // marque les champs qu'il s'apprête à jeter, et on les ignore ici.
      if (controle.dataset.rangeeObsolete) return;

      const fichePrix = obtenirOuCreerLaFichePrix(identifiant, nomDeLaRessource);
      let prixUnitaireAPublier = null;

      if (controle.hasAttribute("data-taille-du-prix-moyen")) {
        // Changer la taille du lot ne change pas le montant saisi : c'est le
        // même prix relevé, réinterprété sur un autre lot. Le coût bouge donc,
        // ce qui est le comportement voulu.
        fichePrix.tailleDuLotDuPrixMoyen = parseInt(controle.value, 10);

      } else if (controle.hasAttribute("data-prix-moyen")) {
        fichePrix.prixMoyenDuLot = interpreterSaisieDeMontant(controle.value);

      } else {
        const taille = parseInt(controle.getAttribute("data-taille-de-lot"), 10);
        const montant = interpreterSaisieDeMontant(controle.value);
        fichePrix.prixParTailleDeLot[taille] = montant;
        if (taille === TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE) prixUnitaireAPublier = montant;
      }

      fichePrix.horodatageDerniereMiseAJour = Date.now();
      sauvegarderEtat();
      redessinerToutLEcran();

      if (prixUnitaireAPublier !== null && prixUnitaireAPublier > 0) {
        await publierEtRendreCompte(identifiant, nomDeLaRessource, prixUnitaireAPublier);
      }
    });
  }
}

async function publierEtRendreCompte(identifiant, nomDeLaRessource, prixUnitaire) {
  if (!laPublicationEstPossible()) {
    annoncer(etatApplication.publicationAutomatiqueActive === false
      ? "Publication coupée : le prix reste local."
      : "Aucun jeton enregistré : le prix reste local. Réglages pour en ajouter un.");
    return;
  }

  annoncer("Publication de " + nomDeLaRessource + "…", "en-cours");
  redessinerToutLEcran();

  const resultat = await publierUnPrixUnitaire(identifiant, nomDeLaRessource, prixUnitaire);
  annoncer(resultat.message, resultat.publie ? "succes" : "echec");
  redessinerToutLEcran();
}

/* ============================================================
   Coches de confirmation de l'OCR

   Le seul chemin par lequel une valeur lue par la machine entre dans la base
   personnelle, et donc le seul par lequel elle devient publiable. Un clic sur
   la coche vaut « j'ai regardé ce chiffre ». À partir de là il est traité
   comme une saisie au clavier, sans distinction — c'est l'intention.
   ============================================================ */

function brancherLesCochesDeQuarantaine(rangee, identifiant, nomDeLaRessource) {
  for (const coche of rangee.querySelectorAll("[data-confirmer-ocr]")) {
    coche.addEventListener("click", async () => {
      const taille = parseInt(coche.getAttribute("data-confirmer-ocr"), 10);
      annoncer("Confirmation de " + nomDeLaRessource + " \u00d7" + taille + "\u2026", "en-cours");
      const resultat = await confirmerUnPrixEnQuarantaine(identifiant, nomDeLaRessource, taille);
      annoncer(resultat.message, resultat.publie ? "succes" : null);
      redessinerToutLEcran();
    });
  }

  const pastilleDeConfirmation = rangee.querySelector("[data-confirmer-toute-la-ligne]");
  if (pastilleDeConfirmation) {
    pastilleDeConfirmation.addEventListener("click", async () => {
      annoncer("Confirmation de " + nomDeLaRessource + "\u2026", "en-cours");
      const resultat = await confirmerToutesLesValeursDUneRessource(identifiant, nomDeLaRessource);
      annoncer(resultat.message, resultat.publie ? "succes" : null);
      redessinerToutLEcran();
    });
  }

  const pastilleDeRejet = rangee.querySelector("[data-oublier-quarantaine]");
  if (pastilleDeRejet) {
    pastilleDeRejet.addEventListener("click", () => {
      oublierLaQuarantaine(identifiant);
      annoncer("Lecture OCR de " + nomDeLaRessource + " jetée, rien n'est entré en base.");
      redessinerToutLEcran();
    });
  }
}
