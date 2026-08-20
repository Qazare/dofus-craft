/**
 * Rendu d'une carte de craft : son en-tête, sa pastille de métier, et la liste
 * de ses ingrédients avec ce qu'on peut en faire.
 *
 * Séparé de `vue.js` pour la même raison que `cellules-de-prix.js` et
 * `vente.js` le sont : une carte est devenue un objet composite, et la mêler au
 * pilotage du redessin rendrait les deux illisibles.
 *
 * CE QUE LA CARTE DOIT FAIRE COMPRENDRE D'UN COUP D'ŒIL
 *
 * Trois questions, et la carte y répond dans cet ordre :
 *
 *   Qui crafte ça ?        La pastille de métier, avec le niveau exigé. Sans
 *                          elle, rien ne dit qu'une chaîne passe du bûcheron à
 *                          l'alchimiste et retour — or c'est exactement ce qui
 *                          décide si la chaîne est faisable aujourd'hui.
 *   Ça sort d'où ?         Le décalage vers la droite et le liseré de gauche.
 *                          Un sous-craft est visiblement au service de la carte
 *                          qui le précède, et sa quantité est annoncée comme
 *                          déduite, pas saisie.
 *   Ça se crafte aussi ?   Le bouton « Crafter », sur les seuls ingrédients
 *                          que la table des métiers donne pour craftables.
 */
import { echapperPourHtml, formaterNombreSimple, formaterMontantEnKamas } from "./formats.js";
import { lireLaRecetteConnue } from "./metiers.js";
import { INTITULES_DES_DESTINATIONS } from "./config.js";

/**
 * Nom cliquable, qui se recopie dans le presse-papier.
 *
 * Le `data-copier` porte le texte à copier plutôt que de laisser la copie lire
 * le contenu de l'élément : celui-ci finit souvent entouré de pastilles et de
 * mentions, et c'est le nom seul qui doit atterrir dans la barre du HDV.
 */
export function construireLeNomCopiable(nom, classesSupplementaires = "") {
  const nomEchappe = echapperPourHtml(nom);
  return '<span class="nom-copiable ' + classesSupplementaires + '"'
    + ' data-copier="' + nomEchappe + '" role="button" tabindex="0"'
    + ' title="Cliquer pour copier « ' + nomEchappe + ' »">'
    + nomEchappe + "</span>";
}

/**
 * Pastille « Bûcheron 60 ».
 *
 * Muette tant que la table n'est pas chargée, et muette aussi quand l'objet ne
 * se crafte pas : une pastille « pas de métier » sur chaque ressource brute
 * remplirait le tableau de bruit pour ne rien apprendre.
 */
export function construireLaPastilleDeMetier(identifiantAnkama) {
  const recette = lireLaRecetteConnue(identifiantAnkama);
  if (!recette || !recette.craftable) return "";

  const intitule = echapperPourHtml(recette.metier)
    + (recette.niveauRequis > 0 ? " " + recette.niveauRequis : "");

  return '<span class="pastille pastille-metier" title="Recette de '
    + echapperPourHtml(recette.metier)
    + (recette.niveauRequis > 0 ? ", niveau de métier " + recette.niveauRequis + " requis" : "")
    + '">' + intitule + "</span>";
}

/**
 * En-tête d'une carte : icône, nom copiable, métier, et ce que le craft est.
 *
 * La quantité d'un sous-craft est annoncée ici et non dans un champ de saisie :
 * elle est déduite du parent, la rendre modifiable laisserait croire qu'on peut
 * en produire moins que ce que la recette du dessus consomme.
 */
export function construireLEnteteDeCraft(craft, bilan) {
  const roleDuCraft = bilan.estUnSousCraft
    ? '<span class="marque-sous-craft" title="Consommé par la recette du dessus,'
      + ' jamais vendu">sous-craft</span>'
    : '<span class="attenue">' + echapperPourHtml(INTITULES_DES_DESTINATIONS[bilan.destination] || "")
      + "</span>";

  return '<div class="entete-craft">'
    + '<img src="' + echapperPourHtml(craft.adresseIcone) + '" alt="">'
    + "<div>"
      + '<div class="nom-craft">' + construireLeNomCopiable(craft.nom)
        + construireLaPastilleDeMetier(craft.identifiantAnkama) + "</div>"
      + '<div class="niveau-craft">Niveau ' + craft.niveau + " · "
        + craft.ingredients.length + " ingrédients · " + roleDuCraft + "</div>"
    + "</div>"
    + '<button class="bouton-discret" data-action="supprimer">'
      + (bilan.estUnSousCraft ? "Acheter plutôt" : "Retirer") + "</button>"
    + "</div>";
}

/**
 * Liste des ingrédients d'un craft, avec le bouton de sous-craft.
 *
 * C'EST ICI QUE LA HIÉRARCHIE SE LIT
 *
 * Le tableau du bas reste la liste de courses : agrégée, triée par nom, faite
 * pour être suivie au HDV. Il ne peut pas dire « A et B servent à fabriquer X »,
 * puisqu'il a justement fondu toutes les recettes ensemble. Cette liste-ci le
 * dit, recette par recette, et c'est la raison de son existence.
 *
 * Un ingrédient produit sur place est marqué comme tel plutôt que retiré : le
 * voir disparaître de la recette donnerait l'impression d'une recette modifiée,
 * alors que seule sa provenance a changé.
 */
export function construireLaListeDesIngredients(craft, noeud, lignesDeRessources) {
  const lignesParRessource = new Map(
    lignesDeRessources.map(ligne => [ligne.besoin.identifiantAnkama, ligne]));

  const lignes = craft.ingredients.map(ingredient => {
    const produitSurPlace = noeud.ingredientsProduitsSurPlace.has(ingredient.identifiantAnkama);
    const quantiteTotale = ingredient.quantiteParCraft * noeud.quantiteEffective;
    const ligneDeRessource = lignesParRessource.get(ingredient.identifiantAnkama);
    const recette = lireLaRecetteConnue(ingredient.identifiantAnkama);

    // Le bouton n'apparaît que sur une recette connue. Tant que la table n'est
    // pas chargée, pas de bouton : en proposer un qui échouerait apprendrait à
    // ne plus lui faire confiance.
    const actionDeCraft = produitSurPlace
      ? '<span class="marque-produite" title="Fabriquée par un atelier de la session,'
        + ' donc absente de la liste de courses">craftée</span>'
      : (recette && recette.craftable
          ? '<button class="bouton-crafter" data-crafter-ingredient="'
            + ingredient.identifiantAnkama + '" title="Crafter cette ressource'
            + ' au lieu de l\'acheter">Crafter</button>'
          : "");

    return '<li class="ligne-ingredient' + (produitSurPlace ? " ingredient-produit" : "") + '">'
      + '<img src="' + echapperPourHtml(ingredient.adresseIcone) + '" alt="">'
      + '<span class="quantite-ingredient">' + formaterNombreSimple(quantiteTotale) + "</span>"
      + '<span class="nom-ingredient">' + construireLeNomCopiable(ingredient.nom)
        + construireLaPastilleDeMetier(ingredient.identifiantAnkama) + "</span>"
      + '<span class="cout-ingredient">' + decrireLeCoutDUnIngredient(
          ligneDeRessource, quantiteTotale, produitSurPlace) + "</span>"
      + actionDeCraft
      + "</li>";
  });

  return '<ul class="liste-ingredients">' + lignes.join("") + "</ul>";
}

/**
 * Ce que cet ingrédient coûte à cette recette, ou pourquoi la question ne se
 * pose pas.
 *
 * Le coût est une quote-part du panier groupé, pas un prix de ligne isolé : la
 * même ressource achetée pour trois recettes bénéficie d'un lot que ni l'une ni
 * l'autre n'aurait justifié seule.
 */
function decrireLeCoutDUnIngredient(ligneDeRessource, quantiteTotale, produitSurPlace) {
  if (produitSurPlace) return '<span class="attenue">–</span>';
  if (!ligneDeRessource || !ligneDeRessource.achatOptimal) {
    return '<span class="prix-manquant">prix à saisir</span>';
  }
  return formaterMontantEnKamas(
    ligneDeRessource.achatOptimal.prixUnitaireEffectif * quantiteTotale);
}

/**
 * Sur un sous-craft, l'arbitrage qui compte : le fabriquer ou l'acheter ?
 *
 * Le coût par objet et le prix de HDV sont les deux moitiés de la réponse, et
 * n'ont d'intérêt que côte à côte. Rien n'est affiché quand le prix de marché
 * manque : annoncer une économie sans savoir à quoi on la compare serait pire
 * que de se taire.
 */
export function construireLArbitrageCraftOuAchat(bilan) {
  if (!bilan.estUnSousCraft || bilan.prixUnitaireAuMarche <= 0 || bilan.coutParObjet <= 0) {
    return "";
  }

  const ecart = bilan.prixUnitaireAuMarche - bilan.coutParObjet;
  const avantageAuCraft = ecart > 0;

  return '<span title="Coût de fabrication comparé au prix relevé au HDV">'
    + (avantageAuCraft ? "Crafter fait gagner " : "Acheter fait gagner ")
    + '<strong class="' + (avantageAuCraft ? "gain" : "perte") + '">'
    + formaterMontantEnKamas(Math.abs(ecart)) + "</strong> par unité</span>";
}
