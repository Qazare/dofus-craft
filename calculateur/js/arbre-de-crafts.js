/**
 * Structure de la chaîne de crafts : qui nourrit qui, et en quelle quantité.
 *
 * Fonctions pures, sans DOM ni réseau — comme `moteur.js`, et pour la même
 * raison : l'ordre de calcul d'un arbre est exactement le genre de chose qui se
 * teste sous Node et qui se casse en silence si elle ne l'est pas.
 *
 * CE QU'UN SOUS-CRAFT CHANGE, ET CE QU'IL NE CHANGE PAS
 *
 * Un craft porte `identifiantDuCraftParent`. Quand il est renseigné, l'objet
 * produit n'est pas destiné au HDV : il est consommé par le craft parent, comme
 * ingrédient. Trois conséquences, et aucune n'est cosmétique.
 *
 *   1. Sa quantité n'est plus saisie, elle est DÉDUITE. Crafter 3 Substrats de
 *      Futaie qui demandent chacun 1 Planche de Surf, c'est crafter 3 Planches.
 *      Laisser les deux quantités saisissables séparément, c'est laisser Brice
 *      chiffrer une session incohérente sans que rien ne le signale.
 *   2. L'ingrédient correspondant sort de la liste de courses du parent : il
 *      est produit sur place, pas acheté. Ne pas le retirer compterait son coût
 *      deux fois, une fois à l'achat et une fois par la chaîne.
 *   3. Il n'a pas de destination propre. Son coût remonte au parent, dont le
 *      prix de vente est le seul revenu de la branche.
 *
 * CE QUE LA PRODUCTION PAR CRAFT VAUT
 *
 * Un craft produit une unité de son objet. DofusDude ne porte aucun champ de
 * quantité produite, et les recettes ordinaires de Dofus rendent bien une pièce
 * par exécution — les rares exceptions, comme certaines potions, sortiraient de
 * ce qu'on peut affirmer à partir de cette source. La quantité d'un sous-craft
 * est donc le besoin du parent, sans division.
 */
import { PROFONDEUR_MAXIMALE_DE_SOUS_CRAFT } from "./config.js";

/**
 * Indexe la session en arbre et résout les quantités.
 *
 * @param {Array} craftsDeLaSession
 * @returns {{noeudsParLigne:Map, racines:Array, deLaRacineAuxFeuilles:Array}}
 *          `deLaRacineAuxFeuilles` est un ordre de parcours en profondeur, où
 *          un parent précède toujours ses enfants ET où une branche entière
 *          reste d'un seul tenant. Le parcourir à l'envers donne l'ordre du
 *          chiffrage : le coût d'un parent a besoin de celui de ses enfants.
 */
export function construireLArbreDesCrafts(craftsDeLaSession) {
  const noeudsParLigne = new Map();

  for (const craft of craftsDeLaSession) {
    noeudsParLigne.set(craft.identifiantDeLigne, {
      craft,
      parent: null,
      enfants: [],
      profondeur: 0,
      // Nombre d'exemplaires réellement à produire. Saisi pour un craft de
      // tête, déduit du parent pour un sous-craft.
      quantiteEffective: 0,
      // Identifiants Ankama des ingrédients produits par un enfant, donc à ne
      // pas acheter. Un Set plutôt qu'un test dans une boucle : l'agrégation
      // des besoins interroge cet ensemble une fois par ingrédient.
      ingredientsProduitsSurPlace: new Set()
    });
  }

  const racines = [];

  for (const noeud of noeudsParLigne.values()) {
    const noeudParent = noeud.craft.identifiantDuCraftParent
      ? noeudsParLigne.get(noeud.craft.identifiantDuCraftParent)
      : null;

    // Un parent absent fait du craft une tête. Le cas ne devrait pas survenir,
    // la suppression d'un craft emportant sa descendance, mais un état importé
    // d'une autre machine peut être tronqué : mieux vaut un craft orphelin
    // affiché à la racine qu'une branche entière rendue invisible.
    if (!noeudParent) {
      racines.push(noeud);
      continue;
    }

    noeud.parent = noeudParent;
    noeudParent.enfants.push(noeud);
    noeudParent.ingredientsProduitsSurPlace.add(noeud.craft.identifiantAnkama);
  }

  const deLaRacineAuxFeuilles = parcourirEnProfondeur(racines);
  resoudreLesQuantites(deLaRacineAuxFeuilles);

  return { noeudsParLigne, racines, deLaRacineAuxFeuilles };
}

/**
 * Ordre de parcours en profondeur, parent d'abord.
 *
 * TROIS USAGES, UN SEUL ORDRE
 *
 * La résolution des quantités exige qu'un parent précède ses enfants ; le
 * chiffrage exige l'inverse, et se contente donc de le remonter ; l'affichage
 * exige en plus qu'une branche reste d'un seul tenant. Un parcours en largeur
 * satisferait les deux premiers mais pas le troisième : il intercalerait les
 * enfants de la première recette entre ceux de la deuxième, et l'écran
 * montrerait un arbre mélangé. La profondeur les satisfait tous les trois.
 *
 * La borne de profondeur n'est pas un garde-fou de style. Deux crafts qui se
 * désigneraient mutuellement comme parent, dans un état importé abîmé, ne sont
 * atteignables depuis aucune racine et ne peuvent donc pas boucler ici — mais
 * une chaîne qui file reste illisible, et vaut mieux coupée que déroulée.
 */
function parcourirEnProfondeur(racines) {
  const ordre = [];

  const descendre = (noeud, profondeur) => {
    noeud.profondeur = profondeur;
    ordre.push(noeud);
    if (profondeur >= PROFONDEUR_MAXIMALE_DE_SOUS_CRAFT) return;
    for (const enfant of noeud.enfants) descendre(enfant, profondeur + 1);
  };

  for (const racine of racines) descendre(racine, 0);
  return ordre;
}

/**
 * Quantité à produire de chaque craft, de la racine vers les feuilles.
 *
 * L'ordre importe : la quantité d'un enfant est un multiple de celle de son
 * parent, qui doit donc être connue d'abord. D'où le parcours parent-d'abord.
 */
function resoudreLesQuantites(deLaRacineAuxFeuilles) {
  for (const noeud of deLaRacineAuxFeuilles) {
    if (!noeud.parent) {
      noeud.quantiteEffective = Math.max(0, noeud.craft.quantiteACrafter || 0);
      continue;
    }

    const ingredientServi = noeud.parent.craft.ingredients
      .find(ingredient => ingredient.identifiantAnkama === noeud.craft.identifiantAnkama);

    // Un sous-craft dont l'ingrédient a disparu de la recette du parent ne sert
    // plus rien : sa quantité est nulle, il n'entre dans aucun total. Il reste
    // affiché pour que Brice le voie et le retire, plutôt que de s'évaporer.
    noeud.quantiteEffective = ingredientServi
      ? noeud.parent.quantiteEffective * ingredientServi.quantiteParCraft
      : 0;
  }
}

/**
 * Identifiants Ankama de tous les objets produits sur la branche qui mène à ce
 * craft, lui compris.
 *
 * Sert au garde-fou de l'ajout : proposer de crafter une Planche de Surf pour
 * fabriquer une Planche de Surf ouvrirait une chaîne sans fin. Le cas est réel,
 * Dofus ayant des recettes qui se citent en cascade.
 */
export function listerLesObjetsDeLaBranche(noeud) {
  const identifiants = [];
  for (let courant = noeud; courant; courant = courant.parent) {
    identifiants.push(courant.craft.identifiantAnkama);
  }
  return identifiants;
}
