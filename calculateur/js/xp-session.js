/**
 * L'XP de métier au niveau de la session : où en est chaque métier, ce qu'une
 * recette rapporte aujourd'hui, et combien de crafts pour atteindre un objectif.
 *
 * Fait le lien entre `xp-metier.js`, qui est pur et ne connaît que des nombres,
 * et l'état de l'application. La séparation n'est pas décorative : c'est elle
 * qui permet de tester la formule et la montée de niveau sous Node, sans DOM ni
 * stockage local.
 *
 * LA COURBE D'XP EST EXACTE, ET NE COÛTE PLUS RIEN
 *
 * Elle tenait dans un fichier de données interpolé ; elle tient maintenant dans
 * `10 × L × (L − 1)`, mesuré et recoupé avec le jeu. Plus de chargement, plus
 * d'attente, plus de niveaux « approximatifs » — voir l'en-tête de
 * `xp-metier.js` sur la façon dont la forme a été établie.
 */
import {
  etatApplication, lireLObservationDXP, lireLExperienceDUnMetier,
  lireLeReleveDXPPrecedent, oublierLeReleveDXPPrecedent, enregistrerLObservationDXP
} from "./etat.js";
import { lireLaRecetteConnue } from "./metiers.js";
import {
  deduireLeRatioDepuisUneObservation, calculerLExperienceDUnCraft,
  calculerLeNiveauDepuisLXP, calculerLeSeuilDUnNiveau,
  calculerLesCraftsPourAtteindreUnNiveau, projeterLeMetierApresDesCrafts,
  NIVEAU_MAXIMAL_DUN_METIER
} from "./xp-metier.js";

/* ============================================================
   Où en est un métier
   ============================================================ */

/**
 * Situation d'un métier : son XP cumulée, le niveau qui s'en déduit, et où l'on
 * en est dans le palier courant.
 *
 * @returns {{identifiantDuMetier:number, nom:string, experienceTotale:number,
 *            niveau:number, seuilDuNiveau:number, seuilSuivant:number,
 *            xpDansLePalier:number, xpRestantePourLeNiveau:number}|null}
 */
export function lireLaSituationDUnMetier(identifiantDuMetier, nomDuMetier, experienceImposee) {
  // L'XP réelle est la base, toujours. Une XP imposée sert au CHAÎNAGE : le
  // deuxième craft d'une session se juge au niveau où le premier l'a amené, pas
  // au niveau d'avant la session.
  const experienceTotale = experienceImposee === undefined || experienceImposee === null
    ? lireLExperienceDUnMetier(identifiantDuMetier)
    : experienceImposee;
  const niveau = calculerLeNiveauDepuisLXP(experienceTotale);
  const seuilDuNiveau = calculerLeSeuilDUnNiveau(niveau);
  const seuilSuivant = niveau >= NIVEAU_MAXIMAL_DUN_METIER
    ? seuilDuNiveau
    : calculerLeSeuilDUnNiveau(niveau + 1);

  return {
    identifiantDuMetier,
    nom: nomDuMetier,
    experienceTotale,
    niveau,
    seuilDuNiveau,
    seuilSuivant,
    xpDansLePalier: experienceTotale - seuilDuNiveau,
    xpRestantePourLeNiveau: Math.max(0, seuilSuivant - experienceTotale),
    estAuNiveauMaximal: niveau >= NIVEAU_MAXIMAL_DUN_METIER
  };
}

/**
 * Les métiers que la session met en jeu, chacun une fois.
 *
 * Tirés des crafts eux-mêmes plutôt que d'une liste fixe : afficher les vingt
 * métiers de Dofus alors qu'on en travaille deux noierait l'information utile.
 */
export function listerLesMetiersDeLaSession() {
  const parIdentifiant = new Map();

  for (const craft of etatApplication.craftsDeLaSession) {
    const recette = lireLaRecetteConnue(craft.identifiantAnkama);
    if (!recette) continue;
    if (!parIdentifiant.has(recette.jobId)) {
      const situation = lireLaSituationDUnMetier(recette.jobId, recette.metier);
      if (situation) parIdentifiant.set(recette.jobId, situation);
    }
  }

  return [...parIdentifiant.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/* ============================================================
   Ce qu'une recette rapporte, et ce qu'elle peut encore faire monter
   ============================================================ */

/**
 * Bilan d'XP d'un craft : ce qu'il rapporte au niveau actuel du métier, et ce
 * qu'il faudrait en faire pour atteindre l'objectif visé.
 *
 * @param craft            la ligne de craft
 * @param {number|null} niveauxAGagner  nombre de niveaux visés, 1 par défaut
 * @param {number|null} quantiteEffective  quantité réellement prévue, pour la
 *        projection. Celle du craft par défaut ; un sous-craft la tient de son
 *        parent, et la sienne propre ne veut rien dire.
 * @param {number|null} experienceDeDepart  XP cumulée d'où partir. L'XP réelle
 *        du métier par défaut ; le chaînage y met celle qu'atteignent les crafts
 *        placés avant celui-ci dans la session.
 * @returns {Object|null} null si le métier de la recette est inconnu
 */
export function chiffrerLXPDUnCraft(craft, niveauxAGagner, quantiteEffective, experienceDeDepart) {
  const recette = lireLaRecetteConnue(craft.identifiantAnkama);
  if (!recette) return null;

  const situation = lireLaSituationDUnMetier(recette.jobId, recette.metier, experienceDeDepart);
  const observation = lireLObservationDXP(craft.identifiantAnkama);

  // Sans le niveau auquel l'XP a été vue, la régression ne peut pas être
  // défaite. On ne devine pas : l'observation est alors ignorée, et le calcul
  // reprend la main — ce qu'il sait faire seul depuis qu'il tient la formule.
  const observationComplete = observation.xpObservee > 0
    && observation.niveauMetierObserve !== null && observation.niveauMetierObserve > 0;

  // LE RATIO DU JEU D'ABORD, UN RELEVÉ RÉEL PAR-DESSUS
  //
  // Le fichier de données porte le `craftXpRatio` du client, ce qui suffit à
  // tout calculer sans rien relever. Un relevé fait en jeu prime quand il
  // existe : il ne sert plus à rendre le calcul possible, mais à le corriger si
  // le jeu venait à s'écarter de la formule recopiée.
  const ratioObserve = observationComplete
    ? deduireLeRatioDepuisUneObservation(
        observation.xpObservee, observation.niveauMetierObserve, recette.niveauRequis)
    : null;
  const ratioDXP = ratioObserve === null ? recette.ratioDXP : ratioObserve;

  const xpParCraftMaintenant = calculerLExperienceDUnCraft(
    situation.niveau, recette.niveauRequis, ratioDXP);

  // L'objectif est un NOMBRE DE NIVEAUX À GAGNER, pas un palier absolu : c'est
  // la question qu'on se pose devant l'écran, et elle reste valable quel que
  // soit le niveau courant. Le palier visé s'en déduit ici, une fois pour toutes.
  const niveauxVises = Math.max(1, niveauxAGagner || 1);
  const cible = Math.min(situation.niveau + niveauxVises, NIVEAU_MAXIMAL_DUN_METIER);

  const montee = calculerLesCraftsPourAtteindreUnNiveau({
    niveauActuel: situation.niveau,
    experienceActuelle: situation.experienceTotale,
    niveauVise: cible,
    niveauDeLaRecette: recette.niveauRequis,
    ratioDXP
  });

  // OÙ LE MÉTIER SERA UNE FOIS CES CRAFTS FAITS
  //
  // Question inverse de l'objectif, et posée dès que la quantité vient d'ailleurs
  // que de lui : d'une saisie à la main, d'un stock, d'un budget de ressources.
  //
  // Chaque craft est projeté SEUL, depuis le niveau actuel. Deux recettes du même
  // métier dans la même session ne cumulent donc pas leurs gains à l'écran : dire
  // « celle-ci te mène au 105 » recette par recette est ce que l'objectif promet
  // déjà, et additionner les deux exigerait de fixer un ordre de craft qui
  // n'existe nulle part.
  const quantiteProjetee = quantiteEffective === undefined || quantiteEffective === null
    ? craft.quantiteACrafter
    : quantiteEffective;

  const projection = projeterLeMetierApresDesCrafts({
    niveauActuel: situation.niveau,
    experienceActuelle: situation.experienceTotale,
    nombreDeCrafts: quantiteProjetee,
    niveauDeLaRecette: recette.niveauRequis,
    ratioDXP
  });

  return {
    recette,
    situation,
    observation,
    quantiteProjetee,
    projection,
    // Le niveau de métier exigé par l'atelier. Ne bloque rien — comparer la
    // rentabilité d'une recette qu'on ne peut pas encore faire est un usage
    // légitime, et souvent la raison de l'ajouter à une session.
    craftable: situation.niveau >= recette.niveauRequis,
    niveauxManquantsPourCrafter: Math.max(0, recette.niveauRequis - situation.niveau),
    observationComplete,
    ratioDXP,
    // Vrai quand le chiffre affiché vient d'un relevé de Brice et non du fichier
    // de données. L'écran le dit : les deux ne se valent pas en cas de doute.
    ratioVientDUnReleve: ratioObserve !== null,
    xpParCraftMaintenant,
    niveauVise: cible,
    niveauxVises,
    montee,
    // Le niveau à partir duquel cette recette cesse de rapporter. Ce que Brice
    // veut vraiment savoir : jusqu'où elle le mène avant de devoir en changer.
    niveauOuLaRecetteSEteint: recette.niveauRequis + 100
  };
}

/* ============================================================
   LE CHAÎNAGE : UNE SESSION EST UNE SUITE, PAS UNE LISTE

   Chaque craft était projeté depuis l'XP réelle du métier, donc tous depuis le
   même point de départ. La session s'en trouvait fausse dès qu'elle contenait
   deux recettes du même métier : monter Bûcheron de 40 à 60 avec des Substrats
   de Bocage rend les Substrats de Futaie craftables, et l'écran continuait
   pourtant à les marquer hors de portée et à les chiffrer au niveau 40.

   Le chaînage corrige cela. L'XP RÉELLE RESTE LA BASE — elle est saisie, elle
   n'est jamais réécrite — et une XP SIMULÉE l'accompagne, qui accumule les gains
   des crafts déjà planifiés. Chaque craft part de là où le précédent l'a laissé.

   DANS L'ORDRE DE LA SESSION, ET C'EST UN CHOIX

   L'ordre retenu est celui des cartes, donc celui dans lequel Brice a ajouté ses
   recettes. Ce n'est pas un détail : chaîner dans un autre ordre donnerait
   d'autres niveaux, et il n'existe aucun ordre « juste » dans l'absolu. Celui
   des cartes a le mérite d'être visible et réarrangeable, ce qu'un tri caché ne
   serait pas.

   LES SOUS-CRAFTS N'Y CONTRIBUENT PAS

   Ils rapportent pourtant de l'XP, et leur quantité est bien connue. Mais elle
   se déduit de l'analyse, qui a besoin des quantités que ce calcul produit : les
   faire entrer ici demanderait de résoudre les deux ensemble. La simulation est
   donc PRUDENTE plutôt que fausse — elle sous-estime le niveau atteint, jamais
   l'inverse, ce qui est le bon sens de l'erreur quand on décide d'acheter des
   ressources.
   ============================================================ */

/**
 * Point de départ de chaque craft de la session, et quantité voulue par son
 * objectif, calculés en une seule passe dans l'ordre des cartes.
 *
 * Une seule passe, et pas deux, parce que les deux résultats se tiennent : la
 * quantité d'un craft dépend du niveau où il commence, et le niveau où commence
 * le suivant dépend de cette quantité. Les calculer séparément les ferait
 * diverger, et l'écran afficherait un compte de crafts qui ne mène pas au niveau
 * annoncé juste à côté.
 *
 * @param {Map<string, number>} objectifsParLigne  niveaux visés, par ligne
 * @returns {Map<string, {experienceDeDepart:number, quantiteVoulue:number|null}>}
 */
export function chainerLXPDeLaSession(objectifsParLigne) {
  const experienceSimuleeParMetier = new Map();
  const parLigne = new Map();

  const lireLeDepart = identifiantDuMetier =>
    experienceSimuleeParMetier.has(identifiantDuMetier)
      ? experienceSimuleeParMetier.get(identifiantDuMetier)
      : lireLExperienceDUnMetier(identifiantDuMetier);

  for (const craft of etatApplication.craftsDeLaSession) {
    const recette = lireLaRecetteConnue(craft.identifiantAnkama);
    if (!recette) continue;

    const experienceDeDepart = lireLeDepart(recette.jobId);

    // Un sous-craft hérite du départ courant de son métier, pour que son propre
    // chiffrage reste cohérent, mais n'avance pas le compteur.
    if (craft.identifiantDuCraftParent !== null) {
      parLigne.set(craft.identifiantDeLigne, { experienceDeDepart, quantiteVoulue: null });
      continue;
    }

    const niveauxVises = objectifsParLigne ? objectifsParLigne.get(craft.identifiantDeLigne) : null;
    const bilan = chiffrerLXPDUnCraft(craft, niveauxVises, undefined, experienceDeDepart);
    if (!bilan) continue;

    // La quantité que l'objectif réclame, quand il y en a un et qu'il est
    // atteignable. Sinon celle du champ, qui fait foi.
    const quantiteVoulue = niveauxVises && bilan.montee.atteignable
      && bilan.montee.nombreDeCrafts > 0
        ? bilan.montee.nombreDeCrafts
        : null;

    parLigne.set(craft.identifiantDeLigne, { experienceDeDepart, quantiteVoulue });

    // Le compteur avance sur la quantité RETENUE, pas sur celle du champ : quand
    // un objectif est en vigueur, c'est lui qui décidera de la quantité au
    // redessin, et partir de l'ancienne décalerait tout le reste de la chaîne.
    const quantiteRetenue = quantiteVoulue === null ? craft.quantiteACrafter : quantiteVoulue;
    const arrivee = projeterLeMetierApresDesCrafts({
      niveauActuel: bilan.situation.niveau,
      experienceActuelle: experienceDeDepart,
      nombreDeCrafts: quantiteRetenue,
      niveauDeLaRecette: recette.niveauRequis,
      ratioDXP: bilan.ratioDXP
    });
    experienceSimuleeParMetier.set(recette.jobId, arrivee.experienceFinale);
  }

  return parLigne;
}

/**
 * Où chaque métier de la session finit, une fois tous ses crafts faits.
 *
 * Sert la carte du métier, qui montre l'XP réelle saisie et, à côté, celle que
 * la session promet. C'est le « second champ » : l'XP réelle reste la base et
 * n'est jamais réécrite, la simulée ne vit que le temps de l'affichage.
 *
 * @returns {Map<number, {experienceFinale:number, niveauFinal:number}>}
 */
export function lireLArriveeDeChaqueMetier(objectifsParLigne) {
  const parMetier = new Map();
  const chaine = chainerLXPDeLaSession(objectifsParLigne);

  for (const craft of etatApplication.craftsDeLaSession) {
    if (craft.identifiantDuCraftParent !== null) continue;
    const recette = lireLaRecetteConnue(craft.identifiantAnkama);
    if (!recette) continue;

    const entree = chaine.get(craft.identifiantDeLigne);
    if (!entree) continue;

    const bilan = chiffrerLXPDUnCraft(craft,
      objectifsParLigne ? objectifsParLigne.get(craft.identifiantDeLigne) : null,
      entree.quantiteVoulue === null ? undefined : entree.quantiteVoulue,
      entree.experienceDeDepart);
    if (!bilan) continue;

    parMetier.set(recette.jobId, {
      experienceFinale: bilan.projection.experienceFinale,
      niveauFinal: bilan.projection.niveauFinal
    });
  }

  return parMetier;
}

/* ============================================================
   CALIBRAGE AUTOMATIQUE PAR L'XP TOTALE DU MÉTIER

   Ce que le jeu donne gratuitement, c'est l'XP CUMULÉE du métier — un seul
   nombre, lisible dans l'interface, que Brice saisit déjà. Ce qu'il ne donne
   nulle part, c'est l'XP de base d'une recette. Réclamer une saisie « XP vue
   par craft » revenait à faire faire à la main une soustraction que la machine
   peut faire seule.

   Le principe tient en une ligne : DEUX RELEVÉS D'XP TOTALE ENCADRANT UN LOT DE
   CRAFTS SUFFISENT. Le gain divisé par le nombre de crafts est l'XP par craft,
   observée au niveau du premier relevé — exactement la mesure que le calibrage
   attend, mais obtenue sans rien taper de plus.

   Deux précautions, et elles ne sont pas décoratives :

     Le gain est attribué À UNE recette, choisie explicitement quand la session
     en contient plusieurs pour le même métier. Répartir au prorata inventerait
     une hypothèse sur des chiffres qu'on cherche justement à mesurer.

     Le relevé précédent est OUBLIÉ une fois le gain attribué. Un même gain
     attribué deux fois donnerait une seconde mesure qui n'en est pas une.
   ============================================================ */

/**
 * Le gain d'XP en attente d'attribution pour un métier, et à quoi l'attribuer.
 *
 * @returns {{gain:number, niveauAuReleve:number, craftsCandidats:Array}|null}
 *          null quand il n'y a pas deux relevés, ou aucun gain
 */
export function decrireLeGainDXPAAttribuer(identifiantDuMetier) {
  const precedent = lireLeReleveDXPPrecedent(identifiantDuMetier);
  if (!precedent) return null;

  const experienceActuelle = lireLExperienceDUnMetier(identifiantDuMetier);
  const gain = experienceActuelle - (precedent.experienceTotale || 0);
  if (!(gain > 0)) return null;

  const craftsCandidats = etatApplication.craftsDeLaSession
    .map(craft => ({ craft, recette: lireLaRecetteConnue(craft.identifiantAnkama) }))
    .filter(entree => entree.recette && entree.recette.jobId === identifiantDuMetier);

  return {
    gain,
    // Le niveau où le lot a été crafté, donc celui auquel la mesure vaut. Pris
    // au relevé de DÉPART : c'est là que les crafts ont commencé.
    niveauAuReleve: calculerLeNiveauDepuisLXP(precedent.experienceTotale || 0),
    craftsCandidats
  };
}

/**
 * Attribue un gain d'XP à une recette, et en déduit son calibrage.
 *
 * @returns {{xpParCraft:number}|null} null si le compte de crafts est absurde
 */
export function calibrerUneRecetteParLeGain(
    identifiantDuMetier, identifiantAnkama, gain, nombreDeCrafts, niveauAuReleve) {
  if (!(gain > 0) || !(nombreDeCrafts > 0)) return null;

  const xpParCraft = Math.round(gain / nombreDeCrafts);
  if (!(xpParCraft > 0)) return null;

  enregistrerLObservationDXP(identifiantAnkama, xpParCraft, niveauAuReleve);
  oublierLeReleveDXPPrecedent(identifiantDuMetier);
  return { xpParCraft };
}
