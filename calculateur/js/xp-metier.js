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
 * par des joueurs, et celle-ci est retenue faute de mieux. LE COEFFICIENT N'EST
 * PAS CONFIRMÉ, contrairement à la courbe de niveau ci-dessous qui, elle, est
 * mesurée.
 *
 * Il l'a semblé un moment : les trois relevés du métier 89 — recette 90 à
 * 1 800, 89 à 1 618, 88 à 1 449 — donnaient des XP de base de 1 782, 1 618 et
 * 1 464, soit une progression régulière d'environ 10 % par niveau de recette,
 * là où la formule concurrente en `1 / (1 + 0,1 × écart^1,1)` donnait 1,5 %
 * puis 11 %. L'argument paraissait fort.
 *
 * Il ne tient plus. Les relevés d'Alchimiste 40 le démontent : trois recettes
 * de niveau 40, au même niveau de métier, rapportent 160, 40 et 80 XP. L'XP de
 * base est donc PROPRE À CHAQUE RECETTE, et ni son niveau ni son nombre de
 * cases ne la prédisent. La régularité observée sur les trois recettes de
 * niveau 88, 89 et 90 était une coïncidence, et ne prouvait rien.
 *
 * Conséquence pratique : le coefficient de 1 % par niveau reste une hypothèse.
 * Un seul relevé la trancherait — la même recette, à deux niveaux de métier
 * différents. En attendant, l'écran signale quand un chiffre est projeté plutôt
 * qu'observé, et un relevé frais vaut toujours mieux qu'une longue projection.
 *
 * L'XP DE BASE NE SE DEVINE PAS, ELLE SE CALIBRE
 *
 * Aucune source publique ne donne l'XP de base d'une recette, et on sait
 * maintenant qu'aucune formule ne la donnera : elle ne se déduit ni du niveau
 * de la recette ni de son nombre de cases. Essence de Batofu et Potion de Soin
 * sont toutes deux de niveau 40, chez le même métier ; l'une rapporte 160, la
 * seconde 40.
 *
 * On prend donc le problème par l'autre bout : Brice relève UNE fois l'XP que
 * lui rapporte une recette, en disant à quel niveau de métier il l'a vue, et la
 * formule remonte à l'XP de base. C'est un relevé qu'il faisait déjà — il ne
 * servait simplement à rien. Ce choix n'était au départ qu'une prudence ; les
 * relevés d'Alchimiste en ont fait la seule approche possible.
 */

/** Écart maximal au-delà duquel une recette ne rapporte plus rien. */
const ECART_ANNULANT_LEXPERIENCE = 100;

/* ============================================================
   LA COURBE D'XP DES MÉTIERS, EN FORME CLOSE

   Le palier du niveau L au suivant coûte `20 × L`, donc l'XP cumulée pour
   atteindre le niveau L vaut la somme des paliers précédents :

       xpCumulée(L) = Σ 20k pour k de 1 à L-1  =  10 × L × (L − 1)

   Établie sur des mesures, pas devinée. Le palier vaut 20 au niveau 1, 800 au
   niveau 40, 1 000 au 50, 2 000 au 100, 3 000 au 150 et 3 980 au 199 : c'est
   `20 × L` sur toute l'étendue. Et la forme close tombe juste sur le relevé en
   jeu de Brice — Alchimiste niveau 40 avec 15 769 XP, le niveau 41 annoncé à
   16 400, et 10 × 41 × 40 fait exactement 16 400.

   Cette forme remplace une table dérivée à la main de la table historique
   1-100 et du devblog de la refonte. Celle-là donnait 8 347 XP au niveau 40 là
   où le jeu en demande 15 600 : le raisonnement était défendable, il était
   faux, et c'est le relevé qui l'a montré. Rien ne remplace une mesure.

   Conséquence agréable : plus de fichier de données, plus d'interpolation, plus
   de niveaux « approximatifs ». Deux multiplications suffisent, et le total
   pour le niveau 200 tombe à 398 000 XP.
   ============================================================ */

/** Niveau maximal d'un métier depuis la refonte. */
export const NIVEAU_MAXIMAL_DUN_METIER = 200;

/** XP cumulée nécessaire pour atteindre un niveau. */
export function calculerLeSeuilDUnNiveau(niveau) {
  const borne = Math.min(Math.max(1, niveau), NIVEAU_MAXIMAL_DUN_METIER);
  return 10 * borne * (borne - 1);
}

/**
 * Niveau atteint avec une XP cumulée donnée.
 *
 * Inversion directe de `10 L (L-1) ≤ xp`, soit `L = ⌊(1 + √(1 + 2xp/5)) / 2⌋`.
 * La racine flottante peut tomber à un cheveu du seuil sur les grands nombres,
 * ce qui ferait annoncer un niveau de moins juste après en avoir gagné un. Le
 * résultat est donc recalé sur la forme exacte, qui est en nombres entiers.
 */
export function calculerLeNiveauDepuisLXP(experienceTotale) {
  const xp = Math.max(0, experienceTotale || 0);
  let niveau = Math.floor((1 + Math.sqrt(1 + 2 * xp / 5)) / 2);
  niveau = Math.min(Math.max(1, niveau), NIVEAU_MAXIMAL_DUN_METIER);
  while (niveau < NIVEAU_MAXIMAL_DUN_METIER && calculerLeSeuilDUnNiveau(niveau + 1) <= xp) niveau++;
  while (niveau > 1 && calculerLeSeuilDUnNiveau(niveau) > xp) niveau--;
  return niveau;
}

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
 * @returns {{atteignable:boolean, nombreDeCrafts:number, experienceAGagner:number,
 *            paliers:Array, niveauDeBlocage:number|null}}
 */
export function calculerLesCraftsPourAtteindreUnNiveau(situation) {
  const { niveauActuel, experienceActuelle, niveauVise, xpDeBase, niveauDeLaRecette } = situation;

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

  let experience = Math.max(experienceActuelle || 0, calculerLeSeuilDUnNiveau(niveauActuel));
  const plafond = Math.min(niveauVise, NIVEAU_MAXIMAL_DUN_METIER);

  for (let niveau = niveauActuel; niveau < plafond; niveau++) {
    const xpParCraft = calculerLExperienceDUnCraft(xpDeBase, niveau, niveauDeLaRecette);

    // La recette est arrivée au bout de ce qu'elle peut donner. On s'arrête là
    // et on le dit, plutôt que de renvoyer un nombre de crafts infini.
    if (xpParCraft <= 0) {
      resultat.atteignable = false;
      resultat.niveauDeBlocage = niveau;
      return resultat;
    }

    const seuilSuivant = calculerLeSeuilDUnNiveau(niveau + 1);
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
