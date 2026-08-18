/**
 * Joignabilité des deux API, sans navigateur ni dépendance.
 *
 *   node outils/verifier-les-api.js
 *
 * Remplace l'ancien `test-api-dofusdude.html`, qui vérifiait la même chose
 * depuis un fichier local ouvert en `file://`. Le site étant désormais servi en
 * HTTP, ce mode de test n'avait plus d'objet, et la vérification couvre en plus
 * la base de prix.
 *
 * Ne publie rien. Le contrôle du jeton passe par un identifiant volontairement
 * invalide : un jeton valide se fait répondre 422 par la validation, un jeton
 * refusé se fait répondre 401 avant elle. La distinction suffit, et la base
 * commune reste intacte.
 *
 * Le jeton se passe par l'environnement, jamais en argument de ligne de
 * commande, qui resterait dans l'historique du shell :
 *
 *   JETON_DOFUS_CALCULATOR="7|…" node outils/verifier-les-api.js
 */
import { ADRESSE_BASE_API_DOFUSDUDE, ADRESSE_BASE_API_PRIX,
         IDENTIFIANT_DU_SERVEUR_SUIVI, NOM_DU_SERVEUR_SUIVI }
  from "../calculateur/js/config.js";

let nombreDEchecs = 0;
function rapporter(intitule, reussi, detail) {
  if (!reussi) nombreDEchecs++;
  console.log((reussi ? "  OK   " : "ECHEC  ") + intitule + (detail ? "  " + detail : ""));
}

console.log("\n--- DofusDude, recettes ---");
try {
  const reponse = await fetch(ADRESSE_BASE_API_DOFUSDUDE
    + "/items/equipment/search?query=Coiffe%20du%20Boufcoul&limit=1");
  const resultats = await reponse.json();
  rapporter("recherche d'équipement", reponse.ok && resultats.length > 0,
    resultats[0] ? resultats[0].name : "");
  rapporter("la réponse porte déjà la recette",
    !!(resultats[0] && resultats[0].recipe && resultats[0].recipe.length > 0),
    resultats[0] && resultats[0].recipe ? resultats[0].recipe.length + " ingrédients" : "");
} catch (erreur) {
  rapporter("DofusDude joignable", false, erreur.message);
}

console.log("\n--- dofus-calculator, lecture ---");
let identifiantInterneDuBle = null;
try {
  const reponse = await fetch(ADRESSE_BASE_API_PRIX + "/servers");
  const donnees = await reponse.json();
  const serveur = (donnees.data || []).find(s => s.id === IDENTIFIANT_DU_SERVEUR_SUIVI);
  rapporter("liste des serveurs", reponse.ok, (donnees.data || []).length + " serveurs");
  rapporter("le serveur suivi existe toujours sous le même identifiant",
    !!serveur && serveur.name === NOM_DU_SERVEUR_SUIVI,
    serveur ? serveur.name + " = " + serveur.id : "introuvable");

  // Le Blé, 289 des deux côtés : c'est le contrôle de la correspondance entre
  // l'identifiant Ankama de DofusDude et le `dofusdb_id` de cette base. Si elle
  // cessait d'être vraie, tout le calculateur lirait les prix d'autres objets.
  const reponsePrix = await fetch(ADRESSE_BASE_API_PRIX
    + "/items?dofusdb_id=in:289&include=prices&server_id=" + IDENTIFIANT_DU_SERVEUR_SUIVI);
  const donneesPrix = await reponsePrix.json();
  const ble = (donneesPrix.data || [])[0];
  identifiantInterneDuBle = ble ? ble.id : null;

  rapporter("le dofusdb_id est bien l'identifiant Ankama",
    !!ble && ble.dofusdb_id === 289 && ble.name === "Blé",
    ble ? ble.name + ", dofusdb_id " + ble.dofusdb_id : "");
  rapporter("l'identifiant interne en diffère, comme attendu",
    !!ble && ble.id !== ble.dofusdb_id,
    ble ? "id interne " + ble.id + " contre " + ble.dofusdb_id + " côté Ankama" : "");
} catch (erreur) {
  rapporter("dofus-calculator joignable", false, erreur.message);
}

console.log("\n--- dofus-calculator, écriture ---");
const jeton = process.env.JETON_DOFUS_CALCULATOR;
if (!jeton) {
  console.log("  (ignoré, aucun JETON_DOFUS_CALCULATOR dans l'environnement)");
} else {
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
    rapporter("le jeton est accepté et a le droit d'écriture", reponse.status === 422,
      "code " + reponse.status + (reponse.status === 401 ? ", jeton refusé" : ""));

    // Contrôle de non-régression sur le contrat d'écriture : c'est l'identifiant
    // INTERNE qui est attendu. Envoyer un dofusdb_id valide mais absent de la
    // table interne doit continuer d'être refusé. Le jour où ce test passe au
    // vert à tort, le calculateur écrit sur les mauvaises ressources.
    const reponseSonde = await fetch(ADRESSE_BASE_API_PRIX + "/prices", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + jeton,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        server_id: IDENTIFIANT_DU_SERVEUR_SUIVI,
        prices: [{ item_id: 18371, price: 4999 }]
      })
    });
    rapporter("un dofusdb_id est bien refusé à l'écriture", reponseSonde.status === 422,
      "code " + reponseSonde.status);
  } catch (erreur) {
    rapporter("écriture testable", false, erreur.message);
  }
}

console.log("\n" + (nombreDEchecs === 0 ? "Tout répond." : nombreDEchecs + " contrôle(s) en échec."));
process.exit(nombreDEchecs === 0 ? 0 : 1);
