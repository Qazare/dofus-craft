/**
 * Ajout et retrait des crafts de la session, et synchronisation des prix
 * communautaires qui en découle.
 */
import { etatApplication, sauvegarderEtat, normaliserUnCraft } from "./etat.js";
import { obtenirLesInformationsDUnObjet } from "./api-dofusdude.js";
import { lireLesPrixCommunautaires } from "./api-prix.js";
import { listerLesIdentifiantsDesRessourcesDeLaSession } from "./analyse.js";
import { redessinerToutLEcran } from "./vue.js";
import { annoncer } from "./journal.js";
import { NOM_DU_SERVEUR_SUIVI, DESTINATION_PAR_DEFAUT,
         DESTINATION_PAR_DEFAUT_SELON_LA_FAMILLE } from "./config.js";

let compteurDIdentifiantsDeLigne = 1;

/**
 * Ajoute un objet à la session : résout le nom de chacun de ses ingrédients
 * auprès de DofusDude, enregistre la ligne, puis va chercher les prix.
 */
export async function ajouterUnCraftALaSession(objetRetourneParLApi) {
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

  // Les prix arrivent après coup : la recette s'affiche tout de suite, les
  // repères se posent ensuite. Volontairement non attendu, l'API de prix ne doit
  // jamais retarder l'affichage de la recette.
  synchroniserLesPrixDeLaSession();
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
