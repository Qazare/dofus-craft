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
export function construireLEnteteDeCraft(craft, bilan, bilanDXP) {
  const roleDuCraft = bilan.estUnSousCraft
    ? '<span class="marque-sous-craft" title="Consommé par la recette du dessus,'
      + ' jamais vendu">sous-craft</span>'
    : '<span class="attenue">' + echapperPourHtml(INTITULES_DES_DESTINATIONS[bilan.destination] || "")
      + "</span>";

  return '<div class="entete-craft">'
    + '<img src="' + echapperPourHtml(craft.adresseIcone) + '" alt="">'
    + "<div>"
      + '<div class="nom-craft">' + construireLeNomCopiable(craft.nom)
        + construireLaPastilleDeMetier(craft.identifiantAnkama)
        + construireLaMarqueDeCraftabilite(bilanDXP) + "</div>"
      + '<div class="niveau-craft">Niveau ' + craft.niveau + " · "
        + craft.ingredients.length + " ingrédients · " + roleDuCraft + "</div>"
    + "</div>"
    + '<button class="bouton-discret" data-action="supprimer">'
      + (bilan.estUnSousCraft ? "Acheter plutôt" : "Retirer") + "</button>"
    + "</div>";
}

/**
 * La marque « pas encore craftable », quand le métier n'est pas au niveau.
 *
 * ELLE SIGNALE, ELLE NE BLOQUE PAS
 *
 * Ajouter une recette qu'on ne peut pas encore faire est un usage tout à fait
 * normal, et souvent le but : on regarde ce que coûtera la montée, on compare
 * deux paliers, on décide vers quoi tendre. Retirer la carte, griser ses champs
 * ou refuser le calcul reviendrait à interdire la question la plus utile qu'on
 * pose à cet écran.
 *
 * Ce qui serait fâcheux, c'est de partir au HDV acheter les ressources d'une
 * recette qu'on ne peut pas lancer. D'où la marque, et le nombre de niveaux qui
 * manquent — la seule chose qu'on veuille savoir ensuite.
 */
function construireLaMarqueDeCraftabilite(bilanDXP) {
  if (!bilanDXP || bilanDXP.craftable) return "";

  const manquants = bilanDXP.niveauxManquantsPourCrafter;
  return '<span class="marque-non-craftable" title="Ton métier '
    + echapperPourHtml(bilanDXP.recette.metier) + " est niveau "
    + bilanDXP.situation.niveau + ", la recette en demande "
    + bilanDXP.recette.niveauRequis + ". Elle reste chiffrée : c'est fait pour"
    + ' comparer ce vers quoi monter.">pas encore craftable · '
    + manquants + (manquants > 1 ? " niveaux" : " niveau") + "</span>";
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

   PLUS AUCUN CHAMP : L'XP SE CALCULE

   Deux champs vivaient ici, « XP par craft » et « Vue au niveau ». Ils étaient
   la conséquence d'une conclusion fausse — qu'aucune formule ne donnerait l'XP
   d'une recette — et ils n'ont plus d'objet depuis que le `craftXpRatio` du jeu
   voyage dans le fichier des métiers : le chiffre est connu dès l'ajout de la
   recette, sans qu'on ait rien à crafter ni à relever.

   Le relevé reste possible par la carte du métier, qui mesure l'écart entre
   deux XP cumulées sans rien faire taper. Il PRIME toujours sur le calcul, et
   la ligne d'XP porte alors de quoi l'oublier — c'est le service que les deux
   champs rendaient aussi, accessoirement, et qu'il ne fallait pas perdre avec
   eux.
   ============================================================ */

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

  // Le chiffre vient du fichier de données, donc du jeu, et il n'y a plus rien à
  // calibrer. Un relevé de Brice le remplace quand il en a fait un, et c'est le
  // seul cas où la provenance mérite d'être dite : les deux ne se valent pas.
  const mentionDeProvenance = bilanDXP.ratioVientDUnReleve
    ? ' <button class="bouton-lien" data-oublier-le-releve="oui" title="Ce chiffre'
      + " vient de ton relevé au niveau " + bilanDXP.observation.niveauMetierObserve
      + ", et non du calcul. Clique pour l'oublier et revenir au calcul.\">"
      + "d'après ton relevé ✕</button>"
    : "";

  const resume = "<span>" + echapperPourHtml(recette.metier) + " "
    + situation.niveau + " · <strong>" + formaterNombreSimple(xpParCraftMaintenant)
    + "</strong> XP par craft" + mentionDeProvenance + "</span>";

  // Un ratio de zéro n'est pas une lacune, c'est une propriété de la recette :
  // quatre-vingts recettes du jeu ne rapportent jamais rien, à aucun niveau. Le
  // dire franchement évite d'aller le découvrir après deux cents crafts.
  if (recette.ratioDXP === 0 && !bilanDXP.ratioVientDUnReleve) {
    return '<div class="ligne-xp">' + resume
      + '<span class="prix-manquant" title="Cette recette a un ratio d\'XP nul'
        + " dans les fichiers du jeu. Elle ne rapporte rien, quel que soit ton"
        + ' niveau de métier.">ne rapporte jamais d\'XP</span>'
      + selecteur + "</div>";
  }

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
    + construireLArriveeProjetee(bilanDXP)
    + (quantitePiloteeParLObjectif
        ? '<span class="pastille pastille-objectif" title="La quantité du craft a été'
          + ' mise à ce compte. Tape une quantité toi-même pour reprendre la main.">'
          + "quantité remplie</span>"
        : "")
    + '<span class="attenue" title="Au-delà de cent niveaux d\'écart, la régression'
      + ' annule le gain">s\'éteint au niveau ' + bilanDXP.niveauOuLaRecetteSEteint + "</span>"
    + selecteur + "</div>";
}

/**
 * Où le métier atterrit une fois la quantité prévue craftée.
 *
 * Se lit à côté du compte de crafts, et ne dit pas la même chose : le compte
 * répond à l'objectif, celle-ci répond à la QUANTITÉ, qui peut venir d'ailleurs
 * — d'une saisie à la main, d'un stock, d'un budget. Quand les deux coïncident,
 * la redondance est utile : elle confirme que la quantité écrite fait bien ce
 * qu'on lui demande.
 *
 * Le reste de palier est donné parce que c'est lui qui décide de la suite : finir
 * à 20 XP du niveau suivant ou à 1 900 ne se joue pas de la même façon.
 */
function construireLArriveeProjetee(bilanDXP) {
  const { projection, situation, quantiteProjetee } = bilanDXP;
  if (!(quantiteProjetee > 0) || projection.experienceGagnee <= 0) return "";

  const resteAuPalier = projection.seuilDuNiveauSuivant - projection.experienceFinale;
  const detailDuPalier = projection.niveauFinal >= 200
    ? "Niveau maximal atteint."
    : formaterNombreSimple(resteAuPalier) + " XP resteraient à faire pour le niveau "
      + (projection.niveauFinal + 1) + ".";

  const titre = "Après les " + formaterNombreSimple(quantiteProjetee)
    + " crafts prévus : " + formaterNombreSimple(projection.experienceGagnee)
    + " XP gagnés, soit " + formaterNombreSimple(projection.experienceFinale)
    + " XP en tout. " + detailDuPalier;

  const gain = projection.niveauxGagnes > 0
    ? '<strong class="accentue">' + situation.niveau + " → " + projection.niveauFinal + "</strong>"
    : '<strong>' + situation.niveau + "</strong>";

  return '<span title="' + echapperPourHtml(titre) + '">Après ces crafts : niveau '
    + gain + (projection.niveauxGagnes > 0
        ? ""
        : ' <span class="attenue">(pas encore un niveau)</span>') + "</span>";
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
