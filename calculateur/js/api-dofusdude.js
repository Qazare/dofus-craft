/**
 * Accès à l'API publique DofusDude : recettes, noms et icônes.
 * Sans clé. C'est la seule source de la composition des crafts.
 */
import { ADRESSE_BASE_API_DOFUSDUDE, FAMILLES_DOBJETS_CRAFTABLES,
         NOMBRE_DE_SUGGESTIONS_PAR_FAMILLE } from "./config.js";
import { etatApplication, sauvegarderEtat } from "./etat.js";

/**
 * Recherche par nom dans les trois familles d'objets craftables.
 *
 * L'équipement ne suffit plus depuis la vente par lot : ce qui s'empile au HDV,
 * ce sont les pains, les potions et les ressources travaillées, qui vivent dans
 * `consumables` et `resources`. Chercher `Pain aux Céréales` ne renvoyait donc
 * rien du tout jusqu'ici, alors que c'est un craft de paysan tout ce qu'il y a
 * de plus ordinaire.
 *
 * Les trois appels partent ensemble : la latence de la recherche est celle du
 * plus lent, pas leur somme. Une famille en échec est ignorée plutôt que de
 * faire échouer la recherche entière — mieux vaut des suggestions partielles
 * que pas de suggestions.
 *
 * La réponse porte déjà la recette, ce qui évite un second appel pour obtenir
 * les ingrédients. Les objets sans recette sont écartés : ils ne se craftent
 * pas, et les proposer ne mènerait qu'à l'alerte « pas de recette ».
 */
export async function rechercherDesObjetsCraftablesParNom(termeDeRecherche) {
  const reponsesParFamille = await Promise.all(
    FAMILLES_DOBJETS_CRAFTABLES.map(famille => interrogerUneFamille(famille, termeDeRecherche)));

  const toutesLesFamillesOntEchoue = reponsesParFamille.every(r => r === null);
  if (toutesLesFamillesOntEchoue) {
    throw new Error("Recherche refusée par l'API sur les trois familles d'objets.");
  }

  const resultats = [];
  for (const reponse of reponsesParFamille) {
    if (reponse === null) continue;
    for (const objet of reponse.objets) {
      if (!Array.isArray(objet.recipe) || objet.recipe.length === 0) continue;
      // La famille voyage avec l'objet : elle décide de la destination proposée
      // à l'ajout, un pain n'ayant pas la même façon de se vendre qu'une cape.
      resultats.push(Object.assign({ familleDObjet: reponse.famille }, objet));
    }
  }

  // Un même terme peut sortir un objet de niveau 200 et un de niveau 1. Le plus
  // haut niveau d'abord : c'est presque toujours celui qu'on cherche à crafter.
  resultats.sort((a, b) => (b.level || 0) - (a.level || 0));
  return resultats;
}

async function interrogerUneFamille(famille, termeDeRecherche) {
  const adresse = ADRESSE_BASE_API_DOFUSDUDE + "/items/" + famille + "/search?query="
    + encodeURIComponent(termeDeRecherche) + "&limit=" + NOMBRE_DE_SUGGESTIONS_PAR_FAMILLE;
  try {
    const reponse = await fetch(adresse);
    if (!reponse.ok) return null;
    const objets = await reponse.json();
    return { famille, objets: Array.isArray(objets) ? objets : [] };
  } catch (erreur) {
    console.debug("Famille " + famille + " injoignable, ignorée :", erreur);
    return null;
  }
}

/**
 * Objet complet, recette comprise, à partir de son identifiant Ankama.
 *
 * La recherche par nom rapporte déjà la recette des objets qu'elle propose,
 * mais un sous-craft ne passe pas par la recherche : il part d'un ingrédient
 * déjà présent dans une autre recette, dont on ne connaît que l'identifiant.
 * C'est ce chemin-là que cette fonction ouvre.
 *
 * Le détail est LA source de la composition, y compris quand la table des
 * métiers a déjà annoncé que l'objet se craftait : lui seul porte les
 * `item_subtype`, sans lesquels ni le nom ni l'icône d'un ingrédient ne sont
 * résolvables. Une source par question, jamais deux sources pour la même.
 */
export async function obtenirLObjetCompletAvecSaRecette(identifiantAnkama, sousTypeDObjet) {
  const adresse = ADRESSE_BASE_API_DOFUSDUDE + "/items/" + sousTypeDObjet + "/" + identifiantAnkama;
  const reponse = await fetch(adresse);
  if (!reponse.ok) {
    throw new Error("Recette de l'objet " + identifiantAnkama + " illisible, code " + reponse.status);
  }
  return reponse.json();
}

/**
 * Résout le nom et l'icône d'un objet à partir de son identifiant Ankama.
 * Ces données ne changent pas entre deux mises à jour du jeu : mises en cache
 * définitivement, l'API n'est plus jamais rappelée dessus.
 */
export async function obtenirLesInformationsDUnObjet(identifiantAnkama, sousTypeDObjet) {
  const cleDeCache = sousTypeDObjet + ":" + identifiantAnkama;
  if (etatApplication.cacheDesObjets[cleDeCache]) {
    return etatApplication.cacheDesObjets[cleDeCache];
  }

  const adresse = ADRESSE_BASE_API_DOFUSDUDE + "/items/" + sousTypeDObjet + "/" + identifiantAnkama;
  const reponse = await fetch(adresse);
  if (!reponse.ok) throw new Error("Objet " + identifiantAnkama + " introuvable, code " + reponse.status);

  const donneesObjet = await reponse.json();
  const informationsRetenues = {
    identifiantAnkama: donneesObjet.ankama_id,
    nom: donneesObjet.name,
    adresseIcone: donneesObjet.image_urls ? donneesObjet.image_urls.icon : ""
  };

  etatApplication.cacheDesObjets[cleDeCache] = informationsRetenues;
  sauvegarderEtat();
  return informationsRetenues;
}
