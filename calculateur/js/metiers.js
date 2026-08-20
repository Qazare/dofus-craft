/**
 * Métiers, niveaux requis, et détection de ce qui se crafte.
 *
 * AUCUNE API NE PORTE CETTE DONNÉE, ET C'EST VÉRIFIÉ
 *
 * DofusDude donne la composition d'une recette mais pas le métier qui la
 * réalise : son schéma `Recipe` officiel ne compte que trois champs —
 * identifiant de l'ingrédient, sous-type, quantité — et ni `/jobs` ni
 * `/recipes` n'existent chez lui. Dofapi n'a pas la donnée non plus, et son
 * hôte refuse les connexions. Restait dofusdb, qui l'a, mais dont la licence
 * LPNC-IA écarte les projets majoritairement produits par une IA — exactement
 * le motif pour lequel il avait déjà été refusé comme source de recettes.
 *
 * D'OÙ UN FICHIER SERVI AVEC LE SITE, ET NON UN APPEL
 *
 * `donnees/metiers-par-recette.json` est extrait de Datafus, la base de Dofus
 * tirée des fichiers du jeu et publiée sous licence MIT. Il est fabriqué par
 * `outils/extraire-les-metiers.js` et versionné : une extension du jeu se
 * rejoue en une commande, et le diff montre ce qui a changé.
 *
 * Trois conséquences, toutes bonnes. Le fichier vient du même hébergeur que le
 * reste du site, donc il ne peut pas tomber tout seul ni poser de question de
 * CORS. Il est complet dès le premier chargement, là où un appel ne renseignait
 * que les ressources déjà en session. Et il fonctionne hors ligne, ce que le
 * calculateur sait faire par ailleurs.
 *
 * SOURCE D'AGRÉMENT MALGRÉ TOUT
 *
 * Aucun total n'en dépend. Fichier absent ou illisible, les pastilles de métier
 * et les boutons de sous-craft disparaissent, et le calculateur fonctionne
 * exactement comme avant leur existence. C'est pourquoi un échec est journalisé
 * en `debug` plutôt qu'annoncé : un bandeau d'alerte pour une décoration
 * absente coûterait plus qu'il ne rapporte.
 *
 * La composition d'un sous-craft, elle, continue de venir intégralement de
 * DofusDude, seul porteur des `item_subtype` sans lesquels un ingrédient n'est
 * ni nommable ni illustrable. Ce fichier dit QU'il y a une recette, jamais
 * laquelle : une source par question, jamais deux sources pour la même.
 */
import { ADRESSE_DES_METIERS_PAR_RECETTE, NOMS_DES_METIERS } from "./config.js";

/**
 * Table `identifiant Ankama` vers `[jobId, niveau requis]`, une fois chargée.
 *
 * Vide tant que le fichier n'est pas arrivé, et vide pour toujours s'il
 * n'arrive jamais. Les deux se lisent pareil à l'affichage — on ne sait pas,
 * donc on se tait — ce qui évite un drapeau « chargement en cours » que
 * personne n'aurait à consulter.
 */
let metiersParRecette = {};
let leChargementEstFait = false;

/**
 * Charge la table, une fois pour toute la vie de la page.
 *
 * La promesse est mémorisée plutôt que le seul résultat : le démarrage et
 * l'ajout d'une recette peuvent appeler à quelques millisecondes d'écart, et
 * sans cela le fichier partirait deux fois sur le réseau.
 *
 * @returns {Promise<boolean>} vrai si la table est utilisable
 */
let chargementEnCours = null;

export function chargerLesMetiers() {
  if (chargementEnCours) return chargementEnCours;

  chargementEnCours = (async () => {
    try {
      const reponse = await fetch(ADRESSE_DES_METIERS_PAR_RECETTE);
      if (!reponse.ok) throw new Error("code " + reponse.status);
      metiersParRecette = await reponse.json();
      leChargementEstFait = true;
      return true;
    } catch (erreur) {
      console.debug("Table des métiers illisible, les pastilles resteront muettes :", erreur);
      return false;
    }
  })();

  return chargementEnCours;
}

/**
 * Recette connue pour un objet, ou null si l'objet ne se crafte pas — ou si la
 * table n'est pas encore là. Lecture pure, jamais de réseau : appelable depuis
 * le rendu, qui s'exécute des dizaines de fois par saisie.
 *
 * @returns {{craftable:true, jobId:number, metier:string, niveauRequis:number}|null}
 */
export function lireLaRecetteConnue(identifiantAnkama) {
  if (!leChargementEstFait) return null;

  const entree = metiersParRecette[identifiantAnkama];
  if (!entree) return null;

  const [identifiantDuMetier, niveauRequis] = entree;
  return {
    craftable: true,
    jobId: identifiantDuMetier,
    metier: NOMS_DES_METIERS[identifiantDuMetier] || "Métier inconnu",
    // Dans Dofus, le niveau de métier exigé par un atelier est celui de l'objet
    // produit. C'est le champ `resultLevel` de la recette, et il n'a pas
    // d'exception connue sur les recettes ordinaires.
    niveauRequis
  };
}

/** Vrai si l'objet se crafte. Faux tant que la table n'est pas chargée. */
export function laRessourceEstCraftable(identifiantAnkama) {
  const recette = lireLaRecetteConnue(identifiantAnkama);
  return recette !== null;
}
