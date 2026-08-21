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
import { INTITULES_DES_DESTINATIONS, OBJECTIFS_DE_NIVEAU_PROPOSES } from "./config.js";

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

  // LE PIÈGE, ET LA RAISON DE CE GARDE-FOU
  //
  // Le coût de fabrication se calcule sur les prix connus. Qu'il en manque un
  // seul, et il sort trop bas — donc l'écart avec le prix de HDV trop haut, et
  // toujours du même côté : « crafter fait gagner tant ». Un conseil faux et
  // orienté vaut moins que pas de conseil, et une comparaison ne se fait pas à
  // moitié. On se tait, et on dit pourquoi.
  if (bilan.auMoinsUnPrixManquant) {
    return '<span class="prix-manquant" title="Le coût de fabrication est'
      + " incomplet, la comparaison avec le prix de HDV n'aurait aucun sens.\">"
      + "comparaison impossible, " + bilan.nombreDeCoutsManquants
      + " prix manquant(s)</span>";
  }

  const ecart = bilan.prixUnitaireAuMarche - bilan.coutParObjet;
  const avantageAuCraft = ecart > 0;

  return '<span title="Coût de fabrication comparé au prix relevé au HDV">'
    + (avantageAuCraft ? "Crafter fait gagner " : "Acheter fait gagner ")
    + '<strong class="' + (avantageAuCraft ? "gain" : "perte") + '">'
    + formaterMontantEnKamas(Math.abs(ecart)) + "</strong> par unité</span>";
}

/* ============================================================
   EXPÉRIENCE DE MÉTIER

   CE QUE LE JEU DONNE, ET CE QU'IL FAUT EN FAIRE

   Dofus n'affiche jamais l'XP de base d'une recette. Il affiche une seule chose
   de façon fiable et permanente : L'XP CUMULÉE DU MÉTIER. Tout le système est
   donc bâti là-dessus, et la conséquence est agréable — il n'y a plus rien à
   taper à la main.

     Brice saisit l'XP cumulée du métier, ce qu'il faisait déjà.
     Il craft, puis ressaisit l'XP cumulée.
     L'écart divisé par le nombre de crafts EST l'XP par craft, mesurée au
     niveau du premier relevé. La carte du métier propose l'attribution, un
     clic la valide, et la recette est calibrée pour toujours.

   Les deux champs ci-dessous restent, mais deviennent un aveu de secours : ils
   servent à un relevé fait de mémoire, ou à corriger un calibrage. Le chemin
   normal ne les touche pas.
   ============================================================ */

/**
 * Les deux champs de calibrage, repliés tant qu'ils ne servent pas.
 *
 * Un relevé suffit pour toute la vie de la recette : l'XP de base s'en déduit,
 * et la régression la projette à n'importe quel niveau.
 */
export function construireLeCalibrageDXP(craft, bilanDXP) {
  if (!bilanDXP) return "";

  const { observation } = bilanDXP;
  // Le niveau d'observation est pré-rempli à celui du métier tel qu'il est
  // maintenant : c'est de loin le cas le plus courant, Brice relevant l'XP au
  // moment où il craft.
  //
  // ET IL EST ÉCRIT MÊME QUAND L'XP EST ENCORE VIDE. Le laisser vide derrière un
  // simple indice de saisie avait un effet dévastateur : taper l'XP par craft et
  // valider enregistrait une observation SANS niveau, donc incalibrable, donc
  // les objectifs +1/+10/+20 ne remplissaient jamais la quantité — et rien à
  // l'écran ne disait que le champ d'à côté était le coupable.
  const niveauPropose = observation.niveauMetierObserve || bilanDXP.situation.niveau;

  return '<div class="champ-etiquete"><label class="etiquette" title="Se remplit'
    + " tout seul quand tu ressaisis l'XP cumulée du métier après un lot de"
    + ' crafts. À taper à la main seulement pour corriger.">XP par craft</label>'
    + '<input data-xp-observee="oui" value="'
    + (observation.xpObservee ? observation.xpObservee : "")
    + '" placeholder="auto"></div>'
    + '<div class="champ-etiquete"><label class="etiquette" title="Le niveau de métier'
    + ' auquel cette XP a été relevée. Sans lui, le chiffre ne vaut qu\'à ce'
    + ' niveau-là et ne peut être projeté nulle part.">Vue au niveau</label>'
    + '<input data-niveau-observation="oui" value="' + niveauPropose
    + '" placeholder="' + niveauPropose + '"></div>';
}

/**
 * La ligne d'objectif : ce que la recette rapporte maintenant, et combien il en
 * faudrait pour gagner les niveaux visés.
 *
 * Quatre états, parce que quatre situations bien distinctes : le calibrage
 * manque, la recette est éteinte, l'objectif est hors d'atteinte, ou le compte
 * tombe juste — et dans ce dernier cas la quantité du craft a déjà été remplie.
 */
export function construireLaLigneDXP(craft, bilanDXP, niveauxVisesChoisis,
                                     quantitePiloteeParLObjectif) {
  if (!bilanDXP) return "";

  const { situation, recette, montee, xpParCraftMaintenant } = bilanDXP;
  const selecteur = construireLeSelecteurDObjectif(niveauxVisesChoisis, situation.niveau);

  if (!bilanDXP.observationComplete) {
    return '<div class="ligne-xp">'
      + '<span class="attenue">' + echapperPourHtml(recette.metier) + " "
        + situation.niveau + "</span>"
      + '<span class="prix-manquant" title="Saisis l\'XP cumulée du métier'
        + " ci-dessus, fais tes crafts, ressaisis-la : la carte du métier"
        + ' proposera alors de calibrer cette recette en un clic.">'
        + "pas encore calibrée — un lot de crafts et deux relevés d'XP suffisent</span>"
      + selecteur + "</div>";
  }

  // Quand le relevé date d'un autre niveau, le chiffre affiché est PROJETÉ par
  // la régression, pas observé. La nuance compte : la courbe de niveau est
  // exacte, le coefficient de régression ne l'est pas encore, et un relevé frais
  // vaut mieux qu'une longue projection. Le dire invite à en refaire un.
  const ecartDObservation = Math.abs(
    (bilanDXP.observation.niveauMetierObserve || situation.niveau) - situation.niveau);
  const mentionDeProjection = ecartDObservation > 0
    ? ' <span class="attenue" title="Ton relevé date du niveau '
      + bilanDXP.observation.niveauMetierObserve
      + '. Ce chiffre est projeté par la régression ; refais un relevé pour le'
      + ' caler exactement.">(projeté depuis le niveau '
      + bilanDXP.observation.niveauMetierObserve + ")</span>"
    : "";

  const resume = "<span>" + echapperPourHtml(recette.metier) + " "
    + situation.niveau + " · <strong>" + formaterNombreSimple(xpParCraftMaintenant)
    + "</strong> XP par craft" + mentionDeProjection + "</span>";

  if (xpParCraftMaintenant <= 0) {
    return '<div class="ligne-xp">' + resume
      + '<span class="prix-manquant">ne rapporte plus rien à ce niveau</span>'
      + selecteur + "</div>";
  }

  if (!montee.atteignable) {
    return '<div class="ligne-xp">' + resume
      + '<span class="prix-manquant">s\'éteint au niveau ' + montee.niveauDeBlocage
      + ", objectif hors d'atteinte avec cette recette</span>"
      + selecteur + "</div>";
  }

  // Le détail palier par palier vit dans l'info-bulle : à l'écran, c'est le
  // total qui décide, et le détail sert à comprendre où la recette s'essouffle.
  const detail = montee.paliers
    .map(p => p.niveau + " → " + p.versLeNiveau + " : " + formaterNombreSimple(p.nombreDeCrafts)
      + " crafts à " + formaterNombreSimple(p.xpParCraft) + " XP")
    .join("\n");

  return '<div class="ligne-xp">' + resume
    + '<span title="' + echapperPourHtml(detail) + '">Jusqu\'au niveau '
      + bilanDXP.niveauVise + ' : <strong class="accentue">'
      + formaterNombreSimple(montee.nombreDeCrafts) + "</strong> crafts</span>"
    + (quantitePiloteeParLObjectif
        ? '<span class="pastille pastille-objectif" title="La quantité du craft a été'
          + ' mise à ce compte. Tape une quantité toi-même pour reprendre la main.">'
          + "quantité remplie</span>"
        : "")
    + '<span class="attenue" title="Au-delà de cent niveaux d\'écart, la régression'
      + ' annule le gain">s\'éteint au niveau ' + bilanDXP.niveauOuLaRecetteSEteint + "</span>"
    + selecteur + "</div>";
}

function construireLeSelecteurDObjectif(niveauxVisesChoisis, niveauActuel) {
  const choisi = niveauxVisesChoisis || 1;
  const options = OBJECTIFS_DE_NIVEAU_PROPOSES
    // Un objectif qui dépasserait le niveau maximal reste proposé : il est
    // simplement plafonné au calcul, et le retirer ferait disparaître la liste
    // entière à l'approche du 200.
    .map(niveaux => '<option value="' + niveaux + '"'
      + (niveaux === choisi ? " selected" : "") + ">+" + niveaux
      + (niveaux === 1 ? " niveau" : " niveaux") + "</option>")
    .join("");

  return '<select class="selecteur-objectif" data-objectif-xp="oui"'
    + ' title="Combien de niveaux gagner avec cette recette. La quantité à'
    + ' crafter se remplit toute seule.">' + options + "</select>";
}
