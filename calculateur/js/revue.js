/**
 * Revue de revalidation des prix anciens.
 *
 * Passe en revue, une ressource à la fois et en plein écran, les prix de la
 * session jamais renseignés ou trop vieux. Conçue pour être menée au clavier
 * seul, sans quitter le HDV des yeux plus que nécessaire :
 *
 *   Entrée  valide la ressource et passe à la suivante
 *   Échap   ferme la revue, ce qui a déjà été validé reste validé
 *
 * Confirmer un prix sans le modifier rafraîchit quand même son horodatage :
 * c'est l'acte de dire « j'ai regardé, il est toujours bon ».
 *
 * Depuis l'ouverture sur la base, le champ ×1 de la revue publie comme partout
 * ailleurs. C'est même le moment le plus utile pour le faire : Brice a le HDV
 * sous les yeux et relève des prix frais.
 */
import { TAILLES_DE_LOT_DISPONIBLES, TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE,
         TAILLE_DE_LOT_PAR_DEFAUT_POUR_LE_PRIX_MOYEN,
         NOMBRE_DE_JOURS_AVANT_PRIX_CONSIDERE_ANCIEN, NOM_DU_SERVEUR_SUIVI } from "./config.js";
import { etatApplication, sauvegarderEtat, obtenirOuCreerLaFichePrix,
         deduireLePrixMoyenUnitaire } from "./etat.js";
import { analyserLaSessionComplete } from "./analyse.js";
import { obtenirLePrixCommunautaire } from "./prix-communautaires.js";
import { formaterNombreSimple, interpreterSaisieDeMontant, calculerAgeEnJoursDepuis,
         formulerLAge, echapperPourHtml } from "./formats.js";
import { redessinerToutLEcran } from "./vue.js";
import { publierUnPrixUnitaire, laPublicationEstPossible } from "./api-prix.js";
import { annoncer } from "./journal.js";

let fileDesRessourcesARevoir = [];
let indexEnCours = 0;
let revueEnCours = false;
let voile = null;

/**
 * Ressources dont le prix mérite un nouveau coup d'oeil : jamais renseigné, ou
 * relevé il y a trop longtemps. Un prix frais n'est pas proposé.
 *
 * Un relevé communautaire récent ne dispense PAS de la revue : il vient de
 * quelqu'un d'autre, et le but de la revue est précisément que Brice vérifie
 * lui-même. Il apparaît en repère dans le champ, rien de plus.
 */
export function etablirLaListeDesRessourcesARevoir() {
  return analyserLaSessionComplete().lignesDeRessources.filter(ligne => {
    const fichePrix = etatApplication.basePrixDesRessources[ligne.besoin.identifiantAnkama];
    if (!fichePrix) return true;

    const aucunPrixPersonnel = deduireLePrixMoyenUnitaire(fichePrix) === 0
      && TAILLES_DE_LOT_DISPONIBLES.every(taille => !(fichePrix.prixParTailleDeLot || {})[taille]);
    if (aucunPrixPersonnel) return true;

    const age = calculerAgeEnJoursDepuis(fichePrix.horodatageDerniereMiseAJour);
    return age === null || age >= NOMBRE_DE_JOURS_AVANT_PRIX_CONSIDERE_ANCIEN;
  });
}

export function ouvrirLaRevue() {
  fileDesRessourcesARevoir = etablirLaListeDesRessourcesARevoir();

  if (fileDesRessourcesARevoir.length === 0) {
    alert("Tous les prix de la session sont récents, rien à revérifier.");
    return;
  }

  indexEnCours = 0;
  revueEnCours = true;

  voile = document.createElement("div");
  voile.className = "voile-revue";
  document.body.appendChild(voile);
  document.addEventListener("keydown", surTouche);

  dessinerLEtapeCourante();
}

export function fermerLaRevue() {
  revueEnCours = false;
  document.removeEventListener("keydown", surTouche);
  if (voile) {
    voile.remove();
    voile = null;
  }
  redessinerToutLEcran();
}

function surTouche(evenement) {
  if (!revueEnCours) return;
  if (evenement.key === "Escape") {
    evenement.preventDefault();
    fermerLaRevue();
  } else if (evenement.key === "Enter") {
    evenement.preventDefault();
    validerEtPasserALaSuivante();
  }
}

function dessinerLEtapeCourante() {
  const ligne = fileDesRessourcesARevoir[indexEnCours];
  const identifiant = ligne.besoin.identifiantAnkama;
  const fichePrix = etatApplication.basePrixDesRessources[identifiant];

  const prixMoyenDuLot = fichePrix ? (fichePrix.prixMoyenDuLot || 0) : 0;
  const tailleDuLotDuPrixMoyen = (fichePrix && fichePrix.tailleDuLotDuPrixMoyen)
    || TAILLE_DE_LOT_PAR_DEFAUT_POUR_LE_PRIX_MOYEN;

  const releveDeLaBase = obtenirLePrixCommunautaire(identifiant);
  const age = calculerAgeEnJoursDepuis(fichePrix ? fichePrix.horodatageDerniereMiseAJour : null);
  const mentionDeLAge = age === null ? "jamais renseigné" : "relevé il y a " + age + " jour(s)";

  const optionsDeTaille = TAILLES_DE_LOT_DISPONIBLES
    .map(taille => '<option value="' + taille + '"'
      + (taille === tailleDuLotDuPrixMoyen ? " selected" : "") + ">×" + taille + "</option>")
    .join("");

  let champsDesLots = "";
  for (const taille of TAILLES_DE_LOT_DISPONIBLES) {
    const prixDeCeLot = (fichePrix && fichePrix.prixParTailleDeLot)
      ? (fichePrix.prixParTailleDeLot[taille] || 0) : 0;
    const estLeChampPartage = taille === TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE;

    // Seul le ×1 porte un repère venu de la base, puisque c'est le seul prix
    // qu'elle connaisse.
    const repere = estLeChampPartage && prixDeCeLot <= 0 && releveDeLaBase
      ? formaterNombreSimple(releveDeLaBase.prixUnitaire) : "–";

    champsDesLots +=
      '<div class="champ-etiquete champ-revue"><label class="etiquette">Lot de ' + taille
      + (estLeChampPartage ? ' <span class="exposant">partagé</span>' : "") + "</label>"
      + '<input data-revue-taille-de-lot="' + taille + '"'
      + ' class="' + (estLeChampPartage
          ? (prixDeCeLot > 0 ? "prix-a-moi" : (releveDeLaBase ? "prix-de-la-base" : "")) : "") + '"'
      + ' value="' + (prixDeCeLot ? formaterNombreSimple(prixDeCeLot) : "")
      + '" placeholder="' + repere + '"></div>';
  }

  voile.innerHTML =
    '<div class="carte-revue">'
      + '<div class="avancement">Revue des prix · ' + (indexEnCours + 1)
        + " sur " + fileDesRessourcesARevoir.length + "</div>"
      + '<div class="identite-ressource">'
        + '<img src="' + echapperPourHtml(ligne.besoin.adresseIcone) + '" alt="">'
        + '<div><div class="nom-ressource-revue">' + echapperPourHtml(ligne.besoin.nom) + "</div>"
        + '<div class="attenue" style="font-size:11px">'
          + formaterNombreSimple(ligne.besoin.quantiteTotaleNecessaire)
          + " nécessaires · " + mentionDeLAge
          + (releveDeLaBase
              ? " · base " + NOM_DU_SERVEUR_SUIVI + " à "
                + formaterNombreSimple(releveDeLaBase.prixUnitaire) + " k, "
                + (formulerLAge(releveDeLaBase.horodatageDuReleve) || "date inconnue")
              : " · aucun relevé dans la base")
        + "</div></div>"
      + "</div>"
      + '<div class="grille-champs-revue">'
        + '<div class="champ-etiquete champ-revue"><label class="etiquette">Prix moyen du lot</label>'
          + '<div class="cellule-prix-moyen">'
            + '<input data-revue-prix-moyen="oui" value="'
            + (prixMoyenDuLot ? formaterNombreSimple(prixMoyenDuLot) : "") + '" placeholder="–">'
            + '<select class="selecteur-taille-lot" data-revue-taille-du-prix-moyen="oui">'
            + optionsDeTaille + "</select>"
          + "</div></div>"
        + champsDesLots
      + "</div>"
      + '<div class="aide-clavier"><kbd>Entrée</kbd> valider et passer au suivant · '
        + "<kbd>Tab</kbd> champ suivant · <kbd>Échap</kbd> fermer la revue"
        + (laPublicationEstPossible()
            ? ' · le <strong>lot de 1</strong> part vers la base' : "")
      + "</div>"
    + "</div>";

  // Le premier champ prend le focus pour que la frappe démarre sans souris.
  const premierChamp = voile.querySelector("input");
  if (premierChamp) {
    premierChamp.focus();
    premierChamp.select();
  }
}

/**
 * Enregistre ce qui a été saisi, rafraîchit l'horodatage, publie le ×1 si
 * besoin, puis avance dans la file.
 */
async function validerEtPasserALaSuivante() {
  const ligne = fileDesRessourcesARevoir[indexEnCours];
  const identifiant = ligne.besoin.identifiantAnkama;
  const fichePrix = obtenirOuCreerLaFichePrix(identifiant, ligne.besoin.nom);

  const ancienPrixUnitaire = fichePrix.prixParTailleDeLot[TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE] || 0;

  fichePrix.prixMoyenDuLot =
    interpreterSaisieDeMontant(voile.querySelector("[data-revue-prix-moyen]").value);
  fichePrix.tailleDuLotDuPrixMoyen =
    parseInt(voile.querySelector("[data-revue-taille-du-prix-moyen]").value, 10);

  for (const champ of voile.querySelectorAll("[data-revue-taille-de-lot]")) {
    const taille = parseInt(champ.getAttribute("data-revue-taille-de-lot"), 10);
    fichePrix.prixParTailleDeLot[taille] = interpreterSaisieDeMontant(champ.value);
  }

  // Confirmer sans rien changer reste un acte de vérification : l'horodatage est
  // rafraîchi dans tous les cas, sinon la ressource reviendrait à la prochaine
  // revue alors qu'elle vient d'être contrôlée.
  fichePrix.horodatageDerniereMiseAJour = Date.now();
  sauvegarderEtat();

  // Publication seulement si le prix unitaire a réellement bougé : revalider un
  // prix inchangé n'apprend rien à la base, et republier à l'identique ferait
  // passer pour un relevé du jour ce qui n'en est pas un.
  const nouveauPrixUnitaire = fichePrix.prixParTailleDeLot[TAILLE_DE_LOT_PARTAGEE_AVEC_LA_BASE] || 0;
  if (nouveauPrixUnitaire > 0 && nouveauPrixUnitaire !== ancienPrixUnitaire
      && laPublicationEstPossible()) {
    const resultat = await publierUnPrixUnitaire(identifiant, ligne.besoin.nom, nouveauPrixUnitaire);
    annoncer(resultat.message, resultat.publie ? "succes" : "echec");
  }

  indexEnCours++;
  if (indexEnCours >= fileDesRessourcesARevoir.length) {
    fermerLaRevue();
    return;
  }
  dessinerLEtapeCourante();
}
