/**
 * Ajout et retrait des crafts de la session, et synchronisation des prix
 * communautaires qui en découle.
 */
import { etatApplication, sauvegarderEtat, normaliserUnCraft } from "./etat.js";
import { obtenirLesInformationsDUnObjet, obtenirLObjetCompletAvecSaRecette } from "./api-dofusdude.js";
import { chargerLesMetiers } from "./metiers.js";
import { chargerLaTableDXP } from "./xp-session.js";
import { construireLArbreDesCrafts, listerLesObjetsDeLaBranche } from "./arbre-de-crafts.js";
import { lireLesPrixCommunautaires } from "./api-prix.js";
import { listerLesIdentifiantsDesRessourcesDeLaSession } from "./analyse.js";
import { redessinerToutLEcran } from "./vue.js";
import { annoncer } from "./journal.js";
import { NOM_DU_SERVEUR_SUIVI, DESTINATION_PAR_DEFAUT,
         DESTINATION_PAR_DEFAUT_SELON_LA_FAMILLE,
         PROFONDEUR_MAXIMALE_DE_SOUS_CRAFT } from "./config.js";

let compteurDIdentifiantsDeLigne = 1;

/**
 * Ajoute un objet à la session : résout le nom de chacun de ses ingrédients
 * auprès de DofusDude, enregistre la ligne, puis va chercher les prix.
 *
 * @param objetRetourneParLApi      objet DofusDude, recette comprise
 * @param identifiantDuCraftParent  ligne du craft servi, si c'est un sous-craft
 */
export async function ajouterUnCraftALaSession(objetRetourneParLApi,
                                               identifiantDuCraftParent = null) {
  if (!objetRetourneParLApi.recipe || objetRetourneParLApi.recipe.length === 0) {
    alert("Cet objet n'a pas de recette de craft dans la base.");
    return;
  }

  const ingredientsResolus = [];
  for (const ligneDeRecette of objetRetourneParLApi.recipe) {
    const informations = await obtenirLesInformationsDUnObjet(
      ligneDeRecette.item_ankama_id, ligneDeRecette.item_subtype);
    ingredientsResolus.push({
      identifiantAnkama: ligneDeRecette.item_ankama_id,
      sousType: ligneDeRecette.item_subtype,
      nom: informations.nom,
      adresseIcone: informations.adresseIcone,
      quantiteParCraft: ligneDeRecette.quantity
    });
  }

  // Un pain se vend par 100, une cape à la pièce. La famille de l'objet dit
  // laquelle des deux ventes proposer, ce qui évite d'avoir à y penser à chaque
  // ajout. Proposition seulement : le sélecteur de la carte reste libre.
  const destinationProposee =
    DESTINATION_PAR_DEFAUT_SELON_LA_FAMILLE[objetRetourneParLApi.familleDObjet]
    || DESTINATION_PAR_DEFAUT;

  etatApplication.craftsDeLaSession.push(normaliserUnCraft({
    identifiantDeLigne: "ligne-" + (compteurDIdentifiantsDeLigne++) + "-" + objetRetourneParLApi.ankama_id,
    identifiantAnkama: objetRetourneParLApi.ankama_id,
    // Ce qui fait d'un craft un sous-craft. Sa quantité en découlera, déduite
    // du parent, et son objet sortira de la liste de courses de celui-ci.
    identifiantDuCraftParent,
    nom: objetRetourneParLApi.name,
    niveau: objetRetourneParLApi.level,
    adresseIcone: objetRetourneParLApi.image_urls ? objetRetourneParLApi.image_urls.icon : "",
    quantiteACrafter: 1,
    destination: destinationProposee,
    prixDeVenteUnitaire: 0,
    // Prix de vente par taille de lot, pour la seule destination « par lot ».
    // Séparé du prix unitaire : basculer d'un mode à l'autre ne doit effacer
    // ni l'un ni l'autre, on compare souvent les deux avant de trancher.
    prixDeVenteParTailleDeLot: {},
    // Réutilise l'XP déjà relevée pour cette recette lors d'une session précédente.
    experienceParCraft: etatApplication.memoireExperienceParRecette[objetRetourneParLApi.ankama_id] || 0,
    ingredients: ingredientsResolus
  }));

  sauvegarderEtat();
  redessinerToutLEcran();

  // Les prix et les métiers arrivent après coup : la recette s'affiche tout de
  // suite, les repères se posent ensuite. Volontairement non attendus, aucune
  // API ne doit retarder l'affichage de la recette.
  synchroniserLesPrixDeLaSession();
  synchroniserLesRecettesDeLaSession();
}

/**
 * Ajoute le craft d'une ressource, rattaché au craft qui la consomme.
 *
 * C'est le geste de la chaîne : au lieu d'acheter la Planche de Surf, on la
 * fabrique, et ce sont ses propres ingrédients qui entrent dans la liste de
 * courses. Le calcul suit tout seul — la quantité est déduite du parent, et
 * l'ingrédient sort du panier.
 *
 * La composition vient de DofusDude, et de lui seul : la table des métiers dit
 * QU'il y a une recette, jamais laquelle, et seul DofusDude porte les
 * `item_subtype` sans lesquels ni le nom ni l'icône d'un ingrédient ne sont
 * résolvables. Une source par question, jamais deux sources pour la même.
 *
 * @returns {Promise<{ajoute:boolean, message:string}>}
 */
export async function crafterUneRessourceSurPlace(identifiantAnkama, identifiantDuCraftParent) {
  const arbre = construireLArbreDesCrafts(etatApplication.craftsDeLaSession);
  const noeudParent = arbre.noeudsParLigne.get(identifiantDuCraftParent);

  if (!noeudParent) {
    return { ajoute: false, message: "Le craft à servir n'existe plus." };
  }

  // Déjà crafté sur place pour ce parent : le refaire produirait deux fois la
  // même chose pour un besoin unique, et doublerait le coût sans rien ajouter.
  if (noeudParent.ingredientsProduitsSurPlace.has(identifiantAnkama)) {
    return { ajoute: false, message: "Cette ressource est déjà craftée pour cette recette." };
  }

  // Le garde-fou qui compte. Dofus a des recettes qui se citent en cascade, et
  // une ressource déjà produite plus haut dans la branche ouvrirait une chaîne
  // sans fin, chaque étage redemandant le précédent.
  if (listerLesObjetsDeLaBranche(noeudParent).includes(identifiantAnkama)) {
    return { ajoute: false,
      message: "Déjà produite plus haut dans la chaîne : la boucle est refusée." };
  }

  if (noeudParent.profondeur + 1 > PROFONDEUR_MAXIMALE_DE_SOUS_CRAFT) {
    return { ajoute: false,
      message: "Chaîne trop profonde, au-delà de " + PROFONDEUR_MAXIMALE_DE_SOUS_CRAFT + " étages." };
  }

  const ingredientDuParent = noeudParent.craft.ingredients
    .find(ingredient => ingredient.identifiantAnkama === identifiantAnkama);
  if (!ingredientDuParent) {
    return { ajoute: false, message: "Cette ressource n'entre pas dans cette recette." };
  }

  let objetComplet;
  try {
    objetComplet = await obtenirLObjetCompletAvecSaRecette(
      identifiantAnkama, ingredientDuParent.sousType);
  } catch (erreur) {
    return { ajoute: false, message: "Recette illisible : " + erreur.message };
  }

  if (!Array.isArray(objetComplet.recipe) || objetComplet.recipe.length === 0) {
    return { ajoute: false, message: ingredientDuParent.nom + " ne se crafte pas." };
  }

  // La famille sert normalement à proposer une destination de vente. Un
  // sous-craft n'en a pas, étant consommé par son parent — mais on la renseigne
  // quand même, pour qu'il reste chiffrable le jour où Brice le détacherait.
  await ajouterUnCraftALaSession(
    Object.assign({ familleDObjet: ingredientDuParent.sousType }, objetComplet),
    identifiantDuCraftParent);

  return { ajoute: true, message: objetComplet.name + " sera crafté au lieu d'être acheté." };
}

/**
 * Retire un craft et toute sa descendance.
 *
 * La cascade n'est pas un raffinement : un sous-craft privé de son parent n'a
 * plus ni quantité à déduire ni recette à servir. Le laisser derrière ferait un
 * craft fantôme dont personne ne saurait dire ce qu'il fabrique, ni pour qui.
 *
 * @returns {number} nombre de crafts effectivement retirés
 */
export function retirerUnCraftEtSaDescendance(identifiantDeLigne) {
  const arbre = construireLArbreDesCrafts(etatApplication.craftsDeLaSession);
  const noeud = arbre.noeudsParLigne.get(identifiantDeLigne);
  if (!noeud) return 0;

  const lignesARetirer = new Set();
  const aParcourir = [noeud];
  while (aParcourir.length > 0) {
    const courant = aParcourir.pop();
    lignesARetirer.add(courant.craft.identifiantDeLigne);
    for (const enfant of courant.enfants) aParcourir.push(enfant);
  }

  etatApplication.craftsDeLaSession = etatApplication.craftsDeLaSession
    .filter(craft => !lignesARetirer.has(craft.identifiantDeLigne));
  sauvegarderEtat();
  return lignesARetirer.size;
}

/**
 * S'assure que la table des métiers est chargée, et redessine si elle vient
 * d'arriver.
 *
 * Le chargement lui-même n'a lieu qu'une fois par page : `chargerLesMetiers`
 * mémorise sa promesse, donc appeler ceci à chaque ajout de recette ne coûte
 * rien après la première fois.
 *
 * Silencieuse dans les deux sens : rien à annoncer quand elle réussit, la
 * pastille de métier qui apparaît étant son propre message, et rien non plus
 * quand elle échoue. Voir l'en-tête de `metiers.js` sur ce dernier point.
 */
export async function synchroniserLesRecettesDeLaSession() {
  // Les deux tables partent ensemble : elles sont servies par le même hébergeur,
  // et attendre la première pour demander la seconde doublerait l'attente sans
  // rien simplifier.
  const [metiersCharges, tableChargee] = await Promise.all([
    chargerLesMetiers(), chargerLaTableDXP()
  ]);
  if (metiersCharges || tableChargee) redessinerToutLEcran();
}

/**
 * Recharge depuis la base les prix de toutes les ressources de la session.
 *
 * C'est ici que se fait le rapatriement de l'identifiant interne, sans lequel
 * aucune publication n'est possible : on ne peut publier que ce qu'on a d'abord
 * lu, ce qui est un garde-fou et non une gêne.
 */
export async function synchroniserLesPrixDeLaSession() {
  const identifiants = listerLesIdentifiantsDesRessourcesDeLaSession();
  if (identifiants.length === 0) {
    annoncer("");
    return;
  }

  annoncer("Lecture des prix " + NOM_DU_SERVEUR_SUIVI + "…", "en-cours");
  const bilan = await lireLesPrixCommunautaires(identifiants);

  if (bilan.messageDErreur) {
    annoncer("Base de prix injoignable (" + bilan.messageDErreur
      + "), le calcul continue sur ce qui est déjà connu.", "echec");
  } else {
    annoncer(bilan.nombreDeReleves + " prix relevé(s) sur " + NOM_DU_SERVEUR_SUIVI
      + " pour " + identifiants.length + " ressource(s) en session.");
  }

  redessinerToutLEcran();
}
