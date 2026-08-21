/**
 * Expérience de métier : ce qu'un craft rapporte, et combien il en faut.
 *
 * Fonctions pures, sans DOM ni réseau, comme `moteur.js` et `arbre-de-crafts.js`.
 *
 * LA FORMULE N'EST PLUS DEVINÉE : C'EST CELLE DU CLIENT DOFUS
 *
 *     basicXp = 20 × niveauRecette / (écart^1,1 / 10 + 1)
 *     xp      = floor(basicXp × ratio / 100)          écart = niveauMétier − niveauRecette
 *
 * Recopiée de `Item.getCraftXpByJobLevel`, dans le client décompilé. Ce n'est
 * donc plus une hypothèse tirée de deux formules de forum, c'est le calcul que
 * le jeu exécute — et les six relevés de Brice tombent tous EXACTEMENT, au point
 * près, alors qu'aucun n'a servi à l'établir.
 *
 * CE QUI AVAIT MANQUÉ, ET LA CONCLUSION QU'IL AVAIT FAIT TIRER
 *
 * On avait écrit ici, noir sur blanc, qu'aucune formule ne donnerait l'XP de
 * base : trois recettes de niveau 40 du même métier rapportaient 160, 40 et 80
 * XP, donc l'XP semblait propre à chaque recette, et seul un relevé en jeu
 * pouvait la livrer. Le raisonnement était juste, la prémisse était incomplète.
 *
 * Il manquait un champ, `craftXpRatio`, un pourcentage porté par l'objet et, à
 * défaut, par SON TYPE. L'Essence de Batofu est une « Essence de gardien de
 * donjon », à 20 % ; la Potion de Soin est une « Potion », à 5 %. Quatre fois
 * moins, et c'est très exactement le rapport de 160 à 40. La troisième recette
 * est à 10 %. Il n'y avait aucune irrégularité à expliquer, seulement une
 * colonne qu'on ne lisait pas.
 *
 * La leçon vaut d'être gardée : « aucune formule ne peut donner ce chiffre » se
 * déduisait de trois mesures et d'un schéma de données lu à moitié. Le fichier
 * `Items` de Datafus portait la réponse depuis le début, et l'extraction allait
 * déjà le chercher pour autre chose.
 *
 * DEUX CONSÉQUENCES QUI CHANGENT L'USAGE
 *
 *   Plus rien à calibrer. L'XP d'un craft se lit d'un objet ajouté à la session,
 *   sans qu'aucun lot n'ait été fait ni aucun relevé pris. Le calibrage manuel
 *   reste, en SECOURS : il prime quand il existe, ce qui laisse le dernier mot à
 *   une mesure réelle si le jeu venait à s'écarter du calcul.
 *
 *   La régression n'est plus linéaire. On appliquait `1 − écart/100`, l'une des
 *   deux formules qui circulaient sur le forum ; c'est l'autre qui était la
 *   bonne. La différence n'est pas cosmétique — à trente niveaux d'écart, la
 *   linéaire annonce 70 % de l'XP là où le jeu en donne 21 %.
 *
 * L'ÉCART NÉGATIF EXISTE, ET IL EST BORNÉ À ZÉRO
 *
 * Une recette peut dépasser le niveau du métier — les relevés de Brice en
 * contiennent un. `Math.pow` d'un négatif à la puissance 1,1 rend `NaN`, et le
 * client s'en accommode parce que le cas ne l'atteint pas. Ici on borne l'écart
 * à zéro, ce qui rend le plein d'XP : c'est ce que le jeu donne au niveau exact
 * de la recette, et le relevé « recette 90 au métier 90 » le confirme à 1 800.
 */

/**
 * Le multiplicateur du client, `20`. Une recette de niveau L rapporte `20 × L`
 * au niveau de métier exact de la recette, avant application du ratio.
 */
const MULTIPLICATEUR_DE_BASE = 20;

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
 * Coefficient de régression : ce qui reste de l'XP quand le métier dépasse la
 * recette. Vaut 1 au niveau exact de la recette, 0 au-delà de cent niveaux.
 *
 * L'écart est borné à zéro par le bas. Une recette au-dessus du niveau du métier
 * ne rapporte pas DAVANTAGE que le plein — et sans cette borne, `Math.pow` d'un
 * négatif rendrait `NaN`, qui contaminerait tout le calcul en silence.
 */
export function calculerLeFacteurDeRegression(niveauDeMetier, niveauDeLaRecette) {
  const ecart = (niveauDeMetier || 0) - (niveauDeLaRecette || 0);
  if (ecart > ECART_ANNULANT_LEXPERIENCE) return 0;
  return 1 / (Math.pow(Math.max(0, ecart), 1.1) / 10 + 1);
}

/**
 * XP de base d'une recette, avant régression et avant ratio.
 *
 * `20 × niveauDeLaRecette` : une recette de niveau 40 vaut 800, une de niveau 90
 * en vaut 1 800. C'est la même constante que le palier de niveau — le jeu la
 * réutilise, et ce n'est probablement pas un hasard.
 */
export function calculerLExperienceDeBaseDUneRecette(niveauDeLaRecette) {
  return MULTIPLICATEUR_DE_BASE * Math.max(0, niveauDeLaRecette || 0);
}

/**
 * XP rapportée par un craft, à un niveau de métier donné.
 *
 * Tronquée et non arrondie, comme le client, qui fait `Math.floor` du produit
 * complet — donc APRÈS le ratio, pas avant. Tronquer deux fois donnerait un
 * point d'écart sur certaines recettes.
 *
 * @param {number} niveauDeMetier    où en est le métier
 * @param {number} niveauDeLaRecette niveau de l'objet produit
 * @param {number} ratioDXP          `craftXpRatio` en pourcentage, 100 par défaut
 */
export function calculerLExperienceDUnCraft(niveauDeMetier, niveauDeLaRecette, ratioDXP) {
  const ratio = ratioDXP === undefined || ratioDXP === null ? 100 : ratioDXP;
  if (!(ratio > 0)) return 0;

  const base = calculerLExperienceDeBaseDUneRecette(niveauDeLaRecette)
    * calculerLeFacteurDeRegression(niveauDeMetier, niveauDeLaRecette);
  return Math.floor(base * ratio / 100);
}

/**
 * XP d'un craft quand une observation réelle prime sur le calcul.
 *
 * LE CALIBRAGE MANUEL SURVIT, EN SECOURS
 *
 * La formule est désormais celle du client, donc juste ; mais elle est recopiée
 * d'un client décompilé, et une mise à jour du jeu pourrait l'écarter sans
 * prévenir. Un relevé réel garde donc le dernier mot : on en déduit le ratio
 * qu'il implique, et on le substitue à celui du fichier de données.
 *
 * Déduire le RATIO plutôt que de figer l'XP observée n'est pas un détail : le
 * ratio est indépendant du niveau, donc l'observation continue de se projeter
 * correctement à mesure que le métier monte. Figer l'XP la rendrait fausse dès
 * le niveau suivant.
 *
 * @param {number} xpObservee            XP vue en jeu pour un craft
 * @param {number} niveauDeMetierObserve niveau du métier à ce moment-là
 * @param {number} niveauDeLaRecette     niveau de l'objet produit
 * @returns {number|null} le ratio impliqué, null si l'observation n'apprend rien
 */
export function deduireLeRatioDepuisUneObservation(
    xpObservee, niveauDeMetierObserve, niveauDeLaRecette) {
  if (!(xpObservee > 0)) return null;

  const base = calculerLExperienceDeBaseDUneRecette(niveauDeLaRecette)
    * calculerLeFacteurDeRegression(niveauDeMetierObserve, niveauDeLaRecette);
  // Une observation faite alors que la recette ne rapportait déjà plus rien
  // n'apprend rien : diviser par zéro donnerait un infini, et prétendre en tirer
  // un ratio serait pire que de ne rien afficher.
  if (!(base > 0)) return null;

  return xpObservee * 100 / base;
}

/* ============================================================
   Où l'on en sera une fois les crafts faits
   ============================================================ */

/**
 * Projette le métier après un nombre de crafts donné.
 *
 * C'EST LA QUESTION INVERSE DE L'OBJECTIF, ET ELLE VAUT AUTANT
 *
 * L'objectif répond à « combien de crafts pour gagner dix niveaux ». Celle-ci
 * répond à « et si j'en fais ces 72, je serai où ? » — la question qu'on se pose
 * dès que la quantité vient d'ailleurs que de l'objectif : d'une saisie à la
 * main, d'un lot qu'on a déjà en stock, d'un budget de ressources.
 *
 * Le calcul avance PALIER PAR PALIER, comme son symétrique, et pour la même
 * raison : l'XP par craft baisse à chaque niveau gagné. Multiplier la quantité
 * par l'XP d'aujourd'hui surestimerait le résultat, d'autant plus que la montée
 * est longue.
 *
 * @param {Object} situation
 *   @param {number} situation.niveauActuel
 *   @param {number} situation.experienceActuelle   XP cumulée, pas celle du palier
 *   @param {number} situation.nombreDeCrafts
 *   @param {number} situation.niveauDeLaRecette
 *   @param {number} situation.ratioDXP
 * @returns {{niveauFinal:number, experienceFinale:number, experienceGagnee:number,
 *            niveauxGagnes:number, xpDansLePalierFinal:number,
 *            seuilDuNiveauSuivant:number}}
 */
export function projeterLeMetierApresDesCrafts(situation) {
  const { niveauActuel, experienceActuelle, nombreDeCrafts,
          niveauDeLaRecette, ratioDXP } = situation;

  let experience = Math.max(experienceActuelle || 0, calculerLeSeuilDUnNiveau(niveauActuel));
  let niveau = niveauActuel;
  let craftsRestants = Math.max(0, Math.floor(nombreDeCrafts || 0));

  // La boucle avance d'un NIVEAU à la fois, pas d'un craft : une quantité de
  // cent mille crafts se projette donc en deux cents tours au pire, et non en
  // cent mille. La borne du niveau maximal la termine dans tous les cas.
  while (craftsRestants > 0 && niveau < NIVEAU_MAXIMAL_DUN_METIER) {
    const xpParCraft = calculerLExperienceDUnCraft(niveau, niveauDeLaRecette, ratioDXP);
    // La recette ne rapporte plus rien : les crafts restants ne feront pas
    // monter d'un point, et boucler dessus ne finirait jamais.
    if (xpParCraft <= 0) break;

    const seuilSuivant = calculerLeSeuilDUnNiveau(niveau + 1);
    const craftsPourLeNiveau = Math.ceil((seuilSuivant - experience) / xpParCraft);

    if (craftsPourLeNiveau > craftsRestants) {
      experience += craftsRestants * xpParCraft;
      craftsRestants = 0;
      break;
    }

    experience += craftsPourLeNiveau * xpParCraft;
    craftsRestants -= craftsPourLeNiveau;
    niveau++;
  }

  // Les crafts encore en main alors que le niveau maximal est atteint, ou que la
  // recette s'est éteinte, rapportent quand même leur XP — elle ne fait
  // simplement plus monter de niveau.
  if (craftsRestants > 0 && niveau >= NIVEAU_MAXIMAL_DUN_METIER) {
    experience += craftsRestants
      * calculerLExperienceDUnCraft(niveau, niveauDeLaRecette, ratioDXP);
  }

  const seuilDuNiveauFinal = calculerLeSeuilDUnNiveau(niveau);
  const seuilSuivant = niveau >= NIVEAU_MAXIMAL_DUN_METIER
    ? seuilDuNiveauFinal
    : calculerLeSeuilDUnNiveau(niveau + 1);

  return {
    niveauFinal: niveau,
    experienceFinale: experience,
    experienceGagnee: experience - Math.max(experienceActuelle || 0,
      calculerLeSeuilDUnNiveau(niveauActuel)),
    niveauxGagnes: niveau - niveauActuel,
    xpDansLePalierFinal: experience - seuilDuNiveauFinal,
    seuilDuNiveauSuivant: seuilSuivant
  };
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
 *   @param {number} situation.niveauDeLaRecette
 *   @param {number} situation.ratioDXP           `craftXpRatio` en pourcentage
 * @returns {{atteignable:boolean, nombreDeCrafts:number, experienceAGagner:number,
 *            paliers:Array, niveauDeBlocage:number|null}}
 */
export function calculerLesCraftsPourAtteindreUnNiveau(situation) {
  const { niveauActuel, experienceActuelle, niveauVise, niveauDeLaRecette, ratioDXP } = situation;

  const resultat = {
    atteignable: true,
    nombreDeCrafts: 0,
    experienceAGagner: 0,
    // Le détail palier par palier : de quoi montrer où la recette s'essouffle,
    // ce qui est précisément la décision que Brice a à prendre.
    paliers: [],
    niveauDeBlocage: null
  };

  // Un ratio nul est une vraie donnée du jeu, pas une absence : quatre-vingts
  // recettes ne rapportent jamais rien, quel que soit le niveau. Les traiter
  // comme « pas encore calibrées » enverrait crafter pour rien.
  if (!(niveauDeLaRecette > 0) || niveauVise <= niveauActuel) {
    resultat.atteignable = niveauVise <= niveauActuel;
    return resultat;
  }

  let experience = Math.max(experienceActuelle || 0, calculerLeSeuilDUnNiveau(niveauActuel));
  const plafond = Math.min(niveauVise, NIVEAU_MAXIMAL_DUN_METIER);

  for (let niveau = niveauActuel; niveau < plafond; niveau++) {
    const xpParCraft = calculerLExperienceDUnCraft(niveau, niveauDeLaRecette, ratioDXP);

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
