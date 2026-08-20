/**
 * Expérience de métier : ce qu'un craft rapporte, et combien il en faut.
 *
 * Fonctions pures, sans DOM ni réseau, comme `moteur.js` et `arbre-de-crafts.js`.
 * La table d'XP est injectée plutôt qu'importée, ce qui permet aux tests de la
 * remplacer par une table courte et lisible à la main.
 *
 * LA FORMULE, ET CE QUI L'ÉTABLIT
 *
 *     xpGagnée = xpDeBase × (1 − (niveauDeMétier − niveauDeRecette) / 100)
 *
 * Soit un point de pourcentage perdu par niveau d'écart : c'est la régression
 * qui fait qu'une recette rentable à 40 ne vaut plus rien à 140.
 *
 * Deux formules circulent sur le forum officiel, toutes deux données de mémoire
 * par des joueurs. Celle-ci est retenue parce qu'elle est la seule des deux à
 * tenir devant les relevés de Brice — au métier 89, une recette 90 rapporte
 * 1 800, une 89 rapporte 1 618, une 88 rapporte 1 449. Elle en déduit des XP de
 * base de 1 782, 1 618 et 1 464, soit une progression régulière d'environ 10 %
 * par niveau de recette. L'autre formule, en `1 / (1 + 0,1 × écart^1,1)`, en
 * déduit 1 800, 1 618 et 1 594 : une progression de 1,5 % puis de 11 %, ce qui
 * ne ressemble à aucune courbe. Voir `outils/test-moteur-calcul.js`.
 *
 * L'XP DE BASE NE SE DEVINE PAS, ELLE SE CALIBRE
 *
 * Aucune source publique ne donne l'XP de base d'une recette, et la deviner
 * demanderait d'extrapoler une exponentielle sur deux cents niveaux depuis
 * trois points voisins — une erreur de 1 % par niveau y devient un facteur 7.
 *
 * On prend donc le problème par l'autre bout : Brice relève UNE fois l'XP que
 * lui rapporte une recette, en disant à quel niveau de métier il l'a vue, et la
 * formule remonte à l'XP de base. Tout le reste s'en déduit, à n'importe quel
 * niveau. C'est un relevé qu'il faisait déjà — il ne servait simplement à rien.
 */

/** Écart maximal au-delà duquel une recette ne rapporte plus rien. */
const ECART_ANNULANT_LEXPERIENCE = 100;

/**
 * XP de base d'une recette, déduite d'une observation.
 *
 * @param {number} xpObservee            XP vue en jeu pour un craft
 * @param {number} niveauDeMetierObserve niveau du métier à ce moment-là
 * @param {number} niveauDeLaRecette     niveau de l'objet produit
 * @returns {number} l'XP de base, 0 si l'observation ne permet rien d'en tirer
 */
export function deduireLExperienceDeBase(xpObservee, niveauDeMetierObserve, niveauDeLaRecette) {
  if (!(xpObservee > 0)) return 0;
  const facteur = calculerLeFacteurDeRegression(niveauDeMetierObserve, niveauDeLaRecette);
  // Une observation faite alors que la recette ne rapportait déjà plus rien
  // n'apprend rien : diviser par zéro donnerait un infini, et prétendre en tirer
  // une XP de base serait pire que de ne rien afficher.
  if (facteur <= 0) return 0;
  return xpObservee / facteur;
}

/**
 * Coefficient appliqué à l'XP de base, selon l'écart de niveau.
 * Jamais négatif : au-delà de cent niveaux d'écart, la recette ne rapporte plus.
 */
export function calculerLeFacteurDeRegression(niveauDeMetier, niveauDeLaRecette) {
  const ecart = (niveauDeMetier || 0) - (niveauDeLaRecette || 0);
  return Math.max(0, 1 - ecart / ECART_ANNULANT_LEXPERIENCE);
}

/**
 * XP rapportée par un craft, à un niveau de métier donné.
 *
 * Tronquée et non arrondie : c'est ce que rapportent les relevés du forum, et
 * l'écart ne dépasse jamais un point d'XP de toute façon.
 */
export function calculerLExperienceDUnCraft(xpDeBase, niveauDeMetier, niveauDeLaRecette) {
  if (!(xpDeBase > 0)) return 0;
  return Math.floor(xpDeBase * calculerLeFacteurDeRegression(niveauDeMetier, niveauDeLaRecette));
}

/* ============================================================
   Niveaux et seuils
   ============================================================ */

/**
 * Niveau atteint avec une XP cumulée donnée.
 * @param {number[]} xpCumuleeParNiveau  index 0 = niveau 1
 */
export function deduireLeNiveauDepuisLExperience(experienceTotale, xpCumuleeParNiveau) {
  const xp = Math.max(0, experienceTotale || 0);
  let niveau = 1;
  // Parcours ascendant plutôt que dichotomie : deux cents entrées, et le code
  // se relit sans effort. La dichotomie ici serait une optimisation qu'aucune
  // mesure ne réclame.
  for (let rang = 1; rang < xpCumuleeParNiveau.length; rang++) {
    if (xp >= xpCumuleeParNiveau[rang]) niveau = rang + 1;
    else break;
  }
  return niveau;
}

/** XP cumulée nécessaire pour atteindre un niveau. */
export function lireLeSeuilDUnNiveau(niveau, xpCumuleeParNiveau) {
  if (niveau <= 1) return 0;
  const rang = Math.min(niveau, xpCumuleeParNiveau.length) - 1;
  return xpCumuleeParNiveau[rang];
}

export function lireLeNiveauMaximal(xpCumuleeParNiveau) {
  return xpCumuleeParNiveau.length;
}

/* ============================================================
   Combien de crafts pour atteindre un niveau
   ============================================================ */

/**
 * Nombre de crafts nécessaires pour mener un métier jusqu'à un niveau visé.
 *
 * LE CALCUL SE FAIT PALIER PAR PALIER, ET C'EST TOUT L'INTÉRÊT
 *
 * Diviser l'XP restante par l'XP d'un craft donnerait une réponse fausse, et
 * toujours trop optimiste : la recette rapporte moins à chaque niveau gagné.
 * On avance donc d'un niveau à la fois, en recalculant l'XP du craft à chaque
 * palier — la régression est prise en compte par construction, pas corrigée
 * après coup.
 *
 * @param {Object} situation
 *   @param {number} situation.niveauActuel
 *   @param {number} situation.experienceActuelle   XP cumulée, pas celle du palier
 *   @param {number} situation.niveauVise
 *   @param {number} situation.xpDeBase
 *   @param {number} situation.niveauDeLaRecette
 *   @param {number[]} situation.xpCumuleeParNiveau
 * @returns {{atteignable:boolean, nombreDeCrafts:number, experienceAGagner:number,
 *            paliers:Array, niveauDeBlocage:number|null}}
 */
export function calculerLesCraftsPourAtteindreUnNiveau(situation) {
  const {
    niveauActuel, experienceActuelle, niveauVise,
    xpDeBase, niveauDeLaRecette, xpCumuleeParNiveau
  } = situation;

  const resultat = {
    atteignable: true,
    nombreDeCrafts: 0,
    experienceAGagner: 0,
    // Le détail palier par palier : de quoi montrer où la recette s'essouffle,
    // ce qui est précisément la décision que Brice a à prendre.
    paliers: [],
    niveauDeBlocage: null
  };

  if (!(xpDeBase > 0) || niveauVise <= niveauActuel) {
    resultat.atteignable = niveauVise <= niveauActuel;
    return resultat;
  }

  let experience = Math.max(experienceActuelle || 0, lireLeSeuilDUnNiveau(niveauActuel, xpCumuleeParNiveau));
  const plafond = Math.min(niveauVise, lireLeNiveauMaximal(xpCumuleeParNiveau));

  for (let niveau = niveauActuel; niveau < plafond; niveau++) {
    const xpParCraft = calculerLExperienceDUnCraft(xpDeBase, niveau, niveauDeLaRecette);

    // La recette est arrivée au bout de ce qu'elle peut donner. On s'arrête là
    // et on le dit, plutôt que de renvoyer un nombre de crafts infini.
    if (xpParCraft <= 0) {
      resultat.atteignable = false;
      resultat.niveauDeBlocage = niveau;
      return resultat;
    }

    const seuilSuivant = lireLeSeuilDUnNiveau(niveau + 1, xpCumuleeParNiveau);
    const xpManquante = Math.max(0, seuilSuivant - experience);
    const craftsDeCePalier = Math.ceil(xpManquante / xpParCraft);

    resultat.paliers.push({
      niveau,
      versLeNiveau: niveau + 1,
      xpParCraft,
      xpManquante,
      nombreDeCrafts: craftsDeCePalier
    });

    resultat.nombreDeCrafts += craftsDeCePalier;
    resultat.experienceAGagner += xpManquante;
    // Le surplus du dernier craft d'un palier compte pour le palier suivant :
    // ignorer ce report surestimerait le total sur une longue montée.
    experience += craftsDeCePalier * xpParCraft;
  }

  return resultat;
}
