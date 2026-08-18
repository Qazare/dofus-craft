/**
 * Accès à la base de prix communautaire de dofus-calculator.fr.
 *
 * Lecture ouverte, écriture avec jeton. Deux directions, deux identifiants :
 *
 *   LIRE   filtre `dofusdb_id=in:...`, l'identifiant Ankama.
 *   ÉCRIRE champ `item_id`, l'identifiant interne de dofus-calculator.
 *
 * Ce n'est pas le même nombre, et confondre les deux écrirait le prix d'une
 * ressource sur une autre. La lecture renvoyant les deux, la correspondance
 * s'établit d'elle-même : on ne peut publier que ce qu'on a d'abord lu, ce qui
 * est un garde-fou et non une gêne.
 */
import {
  ADRESSE_BASE_API_PRIX, IDENTIFIANT_DU_SERVEUR_SUIVI, NOM_DU_SERVEUR_SUIVI,
  NOMBRE_MAXIMAL_DE_RESSOURCES_PAR_APPEL_DE_LECTURE, NOMBRE_MAXIMAL_DE_PRIX_PAR_ENVOI
} from "./config.js";
import { etatApplication, sauvegarderEtat, lireLeJetonDEcriture } from "./etat.js";
import { obtenirLIdentifiantInterne, ecrireLEtatDePublication } from "./prix-communautaires.js";
import { annoncer } from "./journal.js";
import { formaterNombreSimple } from "./formats.js";

/* ============================================================
   Lecture
   ============================================================ */

/**
 * Interroge la base pour un paquet d'identifiants Ankama et range les prix du
 * serveur suivi dans le cache, avec leur identifiant interne et la date du
 * relevé.
 *
 * Ne lève pas : un échec réseau, une API en panne ou un poste hors ligne ne
 * doivent pas empêcher le calculateur de fonctionner sur ce qu'il a déjà.
 *
 * @returns {Promise<{nombreDeReleves:number, messageDErreur:string|null}>}
 */
export async function lireLesPrixCommunautaires(identifiantsAnkama) {
  const identifiants = Array.from(new Set(identifiantsAnkama)).filter(Boolean);
  if (identifiants.length === 0) return { nombreDeReleves: 0, messageDErreur: null };

  let nombreDeReleves = 0;

  for (let debut = 0; debut < identifiants.length;
       debut += NOMBRE_MAXIMAL_DE_RESSOURCES_PAR_APPEL_DE_LECTURE) {

    const paquet = identifiants.slice(debut, debut + NOMBRE_MAXIMAL_DE_RESSOURCES_PAR_APPEL_DE_LECTURE);
    const adresse = ADRESSE_BASE_API_PRIX
      + "/items?dofusdb_id=in:" + paquet.join(",")
      + "&include=prices"
      + "&server_id=" + IDENTIFIANT_DU_SERVEUR_SUIVI
      + "&per_page=" + NOMBRE_MAXIMAL_DE_RESSOURCES_PAR_APPEL_DE_LECTURE;

    try {
      const reponse = await fetch(adresse, { headers: { Accept: "application/json" } });
      if (!reponse.ok) {
        return { nombreDeReleves, messageDErreur: "code " + reponse.status };
      }

      const donnees = await reponse.json();
      for (const objet of (donnees.data || [])) {
        // L'API filtre déjà sur le serveur demandé : au plus une entrée, et zéro
        // si personne n'a jamais relevé ce prix sur Brial.
        const releve = (objet.prices || [])[0];

        // L'identifiant interne est mémorisé même sans relevé de prix : c'est
        // lui qui rendra la ressource publiable. Sans cela, une ressource que
        // personne n'a jamais cotée resterait impossible à renseigner, ce qui
        // est précisément le cas où la contribution a le plus de valeur.
        const ficheExistante = etatApplication.prixCommunautairesParRessource[objet.dofusdb_id] || {};
        etatApplication.prixCommunautairesParRessource[objet.dofusdb_id] = {
          nom: objet.name,
          identifiantInterne: objet.id,
          prixUnitaire: releve && releve.price > 0 ? releve.price : 0,
          horodatageDuReleve: releve
            ? (Date.parse(releve.updated_at || releve.created_at) || null)
            : (ficheExistante.horodatageDuReleve || null),
          horodatageDeLaRecuperation: Date.now()
        };
        if (releve && releve.price > 0) nombreDeReleves++;
      }
    } catch (erreur) {
      return { nombreDeReleves, messageDErreur: erreur.message };
    }
  }

  sauvegarderEtat();
  return { nombreDeReleves, messageDErreur: null };
}

/* ============================================================
   Écriture

   Un envoi est une publication : le prix devient visible par tous les joueurs
   du serveur. Trois précautions, dans cet ordre :

     1. rien ne part sans jeton, et le jeton n'est jamais dans le code
     2. rien ne part si Brice a coupé la publication dans les réglages
     3. rien ne part sans identifiant interne connu, faute de quoi on écrirait
        au hasard

   L'API n'impose aucune limite de fréquence : ni en-tête `RateLimit`, ni 429
   documenté. Une correction est donc immédiate par simple ressaisie, ce qui
   justifie de publier au fil de la saisie plutôt que sur un bouton.
   ============================================================ */

export function laPublicationEstPossible() {
  return lireLeJetonDEcriture() !== "" && etatApplication.publicationAutomatiqueActive !== false;
}

/**
 * Publie un prix unitaire pour une ressource.
 *
 * @returns {Promise<{publie:boolean, message:string, detail:Object|null}>}
 */
export async function publierUnPrixUnitaire(identifiantAnkama, nomDeLaRessource, prixUnitaire) {
  const jeton = lireLeJetonDEcriture();

  if (jeton === "") {
    return { publie: false, message: "aucun jeton enregistré", detail: null };
  }
  if (etatApplication.publicationAutomatiqueActive === false) {
    return { publie: false, message: "publication coupée dans les réglages", detail: null };
  }
  if (!(prixUnitaire > 0)) {
    // Effacer un champ n'est pas publier un prix nul : la base n'a pas de
    // notion de suppression, et un zéro y serait un mensonge.
    return { publie: false, message: "prix vide, rien à publier", detail: null };
  }

  const identifiantInterne = obtenirLIdentifiantInterne(identifiantAnkama);
  if (!identifiantInterne) {
    return {
      publie: false,
      message: nomDeLaRessource + " est inconnue de la base, publication impossible",
      detail: null
    };
  }

  ecrireLEtatDePublication(identifiantAnkama, { etat: "envoi", message: null, prixEnvoye: prixUnitaire });

  try {
    const reponse = await fetch(ADRESSE_BASE_API_PRIX + "/prices", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + jeton,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        server_id: IDENTIFIANT_DU_SERVEUR_SUIVI,
        prices: [{ item_id: identifiantInterne, price: Math.round(prixUnitaire) }]
      })
    });

    const corps = await reponse.json().catch(() => null);

    if (reponse.status === 401) {
      ecrireLEtatDePublication(identifiantAnkama, { etat: "echec", message: "jeton refusé" });
      sauvegarderEtat();
      return { publie: false, message: "jeton refusé par la base, vérifie-le dans les réglages", detail: corps };
    }
    if (!reponse.ok) {
      const messageDeLApi = corps && corps.message ? corps.message : "code " + reponse.status;
      ecrireLEtatDePublication(identifiantAnkama, { etat: "echec", message: messageDeLApi });
      sauvegarderEtat();
      return { publie: false, message: messageDeLApi, detail: corps };
    }

    // La base applique sa propre modération : le prix retenu peut différer de
    // celui envoyé, et un envoi peut être compté comme ignoré. On rapporte ce
    // qu'elle dit plutôt que de supposer que l'envoi vaut acceptation.
    const detailDuPrix = corps && corps.updated_prices ? corps.updated_prices[0] : null;
    const prixRetenu = detailDuPrix ? Number(detailDuPrix.price) : prixUnitaire;
    const statutAnnonce = detailDuPrix ? detailDuPrix.status : null;
    const aEteIgnore = corps && Number(corps.ignored_count) > 0;

    ecrireLEtatDePublication(identifiantAnkama, {
      etat: aEteIgnore ? "echec" : "publie",
      message: aEteIgnore ? "envoi ignoré par la base" : statutAnnonce,
      prixEnvoye: prixUnitaire,
      prixRetenuParLaBase: prixRetenu
    });

    // Le cache local reflète immédiatement ce que la base vient d'accepter, pour
    // que l'écran ne montre pas un état antérieur à l'action qu'on vient de faire.
    if (!aEteIgnore) {
      const ficheDuCache = etatApplication.prixCommunautairesParRessource[identifiantAnkama];
      if (ficheDuCache) {
        ficheDuCache.prixUnitaire = prixRetenu;
        ficheDuCache.horodatageDuReleve = Date.now();
      }
    }

    sauvegarderEtat();

    return {
      publie: !aEteIgnore,
      message: aEteIgnore
        ? nomDeLaRessource + " : envoi ignoré par la base"
        : nomDeLaRessource + " publié à " + formaterNombreSimple(prixRetenu)
          + " kamas sur " + NOM_DU_SERVEUR_SUIVI
          + (prixRetenu !== Math.round(prixUnitaire)
              ? " (la base a retenu " + formaterNombreSimple(prixRetenu)
                + " et non " + formaterNombreSimple(prixUnitaire) + ")"
              : ""),
      detail: corps
    };

  } catch (erreur) {
    ecrireLEtatDePublication(identifiantAnkama, { etat: "echec", message: erreur.message });
    sauvegarderEtat();
    return { publie: false, message: "publication impossible, " + erreur.message, detail: null };
  }
}

/**
 * Vérifie qu'un jeton est accepté, sans rien publier.
 *
 * Astuce assumée : on envoie un identifiant volontairement invalide. Un jeton
 * valide se fait répondre 422 par la validation, un jeton refusé se fait
 * répondre 401 avant elle. La distinction suffit, et rien n'est écrit.
 */
export async function verifierLeJeton(jeton) {
  if (!jeton) return { valide: false, message: "aucun jeton saisi" };
  try {
    const reponse = await fetch(ADRESSE_BASE_API_PRIX + "/prices", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + jeton,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        server_id: IDENTIFIANT_DU_SERVEUR_SUIVI,
        prices: [{ item_id: 999999999, price: 1 }]
      })
    });

    if (reponse.status === 401) return { valide: false, message: "jeton refusé par la base" };
    if (reponse.status === 403) return { valide: false, message: "jeton sans permission d'écriture" };
    if (reponse.status === 422) return { valide: true, message: "jeton accepté, droit d'écriture confirmé" };
    return { valide: false, message: "réponse inattendue, code " + reponse.status };
  } catch (erreur) {
    return { valide: false, message: "vérification impossible, " + erreur.message };
  }
}

/** Nombre maximal de prix qu'un même envoi peut porter, si un jour on groupe. */
export const TAILLE_MAXIMALE_DUN_ENVOI = NOMBRE_MAXIMAL_DE_PRIX_PAR_ENVOI;

export { annoncer };
