/**
 * Accès à l'API publique DofusDude : recettes, noms et icônes.
 * Sans clé. C'est la seule source de la composition des crafts.
 */
import { ADRESSE_BASE_API_DOFUSDUDE } from "./config.js";
import { etatApplication, sauvegarderEtat } from "./etat.js";

/**
 * Recherche des équipements par nom. La réponse contient déjà la recette, ce
 * qui évite un second appel pour obtenir les ingrédients.
 */
export async function rechercherDesEquipementsParNom(termeDeRecherche) {
  const adresse = ADRESSE_BASE_API_DOFUSDUDE
    + "/items/equipment/search?query=" + encodeURIComponent(termeDeRecherche) + "&limit=8";
  const reponse = await fetch(adresse);
  if (!reponse.ok) throw new Error("Recherche refusée par l'API, code " + reponse.status);
  return await reponse.json();
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
