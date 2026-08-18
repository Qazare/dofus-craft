/**
 * Recherche de recette et liste de suggestions, pleinement navigable au clavier.
 *
 * Flèches haut et bas parcourent la liste en boucle, Entrée ajoute la suggestion
 * mise en avant, Échap referme. Le parcours en boucle est volontaire : sur huit
 * résultats au plus, revenir au premier après le dernier coûte une pression de
 * touche là où un arrêt en butée en coûterait sept.
 */
import { rechercherDesObjetsCraftablesParNom } from "./api-dofusdude.js";
import { ajouterUnCraftALaSession } from "./crafts.js";
import { echapperPourHtml } from "./formats.js";

const DUREE_AVANT_RECHERCHE_MS = 280;
const LONGUEUR_MINIMALE_DE_RECHERCHE = 3;

let champRecherche = null;
let listeSuggestions = null;
let minuteurDeRechercheDifferee = null;

/**
 * Suggestions proposées, et celle qui est mise en avant. L'index vaut -1 tant
 * qu'aucune flèche n'a été pressée : la première flèche bas doit atteindre le
 * premier résultat, pas le deuxième.
 */
let suggestionsAffichees = [];
let indexMisEnAvant = -1;

export function installerLaRecherche(elements) {
  champRecherche = elements.champRecherche;
  listeSuggestions = elements.listeSuggestions;

  champRecherche.addEventListener("input", surSaisie);
  champRecherche.addEventListener("keydown", surTouche);
  champRecherche.addEventListener("blur", () => {
    // Délai court pour laisser le clic sur une suggestion se produire.
    setTimeout(viderLesSuggestions, 180);
  });
}

function surSaisie() {
  clearTimeout(minuteurDeRechercheDifferee);
  const terme = champRecherche.value.trim();

  if (terme.length < LONGUEUR_MINIMALE_DE_RECHERCHE) {
    viderLesSuggestions();
    return;
  }

  // Recherche différée pour ne pas interroger l'API à chaque frappe.
  minuteurDeRechercheDifferee = setTimeout(async () => {
    try {
      afficherLesSuggestions(await rechercherDesObjetsCraftablesParNom(terme));
    } catch (erreur) {
      suggestionsAffichees = [];
      indexMisEnAvant = -1;
      listeSuggestions.innerHTML = '<div class="ligne-suggestion"><span class="details">Erreur : '
        + echapperPourHtml(erreur.message) + "</span></div>";
    }
  }, DUREE_AVANT_RECHERCHE_MS);
}

function surTouche(evenement) {
  if (suggestionsAffichees.length === 0) return;

  if (evenement.key === "ArrowDown") {
    evenement.preventDefault();
    deplacerLaMiseEnAvant(+1);

  } else if (evenement.key === "ArrowUp") {
    evenement.preventDefault();
    deplacerLaMiseEnAvant(-1);

  } else if (evenement.key === "Enter") {
    // Sans sélection explicite, Entrée prend le premier résultat : c'est ce que
    // fait la main quand on tape un nom complet et qu'on valide sans regarder.
    evenement.preventDefault();
    retenirLaSuggestion(indexMisEnAvant >= 0 ? indexMisEnAvant : 0);

  } else if (evenement.key === "Escape") {
    evenement.preventDefault();
    viderLesSuggestions();
  }
}

function viderLesSuggestions() {
  if (!listeSuggestions) return;
  listeSuggestions.innerHTML = "";
  suggestionsAffichees = [];
  indexMisEnAvant = -1;
}

function deplacerLaMiseEnAvant(pas) {
  const nombre = suggestionsAffichees.length;
  if (pas > 0) {
    // Depuis l'état « rien de choisi », qui vaut -1, on arrive bien sur 0.
    indexMisEnAvant = (indexMisEnAvant + 1) % nombre;
  } else {
    indexMisEnAvant = indexMisEnAvant <= 0 ? nombre - 1 : indexMisEnAvant - 1;
  }
  appliquerLaMiseEnAvant();
}

/** Reporte la mise en avant et ramène la ligne dans la partie visible. */
function appliquerLaMiseEnAvant() {
  listeSuggestions.querySelectorAll(".ligne-suggestion").forEach((ligne, index) => {
    const miseEnAvant = index === indexMisEnAvant;
    ligne.classList.toggle("survolee", miseEnAvant);
    if (miseEnAvant) ligne.scrollIntoView({ block: "nearest" });
  });
}

async function retenirLaSuggestion(index) {
  const objetChoisi = suggestionsAffichees[index];
  if (!objetChoisi) return;
  viderLesSuggestions();
  champRecherche.value = "";
  await ajouterUnCraftALaSession(objetChoisi);
  champRecherche.focus();
}

function afficherLesSuggestions(resultatsDeLApi) {
  listeSuggestions.innerHTML = "";
  indexMisEnAvant = -1;
  suggestionsAffichees = resultatsDeLApi.filter(objet => objet.recipe && objet.recipe.length > 0);

  if (suggestionsAffichees.length === 0) {
    listeSuggestions.innerHTML =
      '<div class="ligne-suggestion"><span class="details">Aucun objet craftable trouvé.</span></div>';
    return;
  }

  suggestionsAffichees.forEach((objet, index) => {
    const element = document.createElement("div");
    element.className = "ligne-suggestion";
    element.innerHTML =
      '<img src="' + echapperPourHtml(objet.image_urls ? objet.image_urls.icon : "") + '" alt="">'
      + "<div><div>" + echapperPourHtml(objet.name) + "</div>"
      + '<div class="details">Niveau ' + objet.level + " · "
      + objet.recipe.length + " ingrédients"
      + (objet.type && objet.type.name ? " · " + echapperPourHtml(objet.type.name) : "")
      + (objet.familleDObjet && objet.familleDObjet !== "equipment"
          ? ' <span class="marque-empilable" title="Se vend empilé au HDV,'
            + ' la revente par lot est proposée par défaut">empilable</span>' : "")
      + "</div></div>";

    element.addEventListener("mousedown", evenement => {
      evenement.preventDefault();
      retenirLaSuggestion(index);
    });

    // Le survol souris et la mise en avant clavier désignent la même ligne,
    // sinon Entrée validerait autre chose que ce qui paraît choisi.
    element.addEventListener("mouseenter", () => {
      indexMisEnAvant = index;
      appliquerLaMiseEnAvant();
    });

    listeSuggestions.appendChild(element);
  });
}
