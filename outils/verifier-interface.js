/**
 * Vérification de l'interface dans un vrai navigateur, sans réseau.
 *
 * Les trois API sont interceptées : DofusDude pour la recette, la lecture des
 * prix communautaires, et surtout leur ÉCRITURE. Ce dernier point n'est pas un
 * détail de confort : un test qui publie pour de vrai polluerait une base
 * partagée par tous les joueurs du serveur à chaque exécution.
 *
 * Prérequis :
 *   npm install playwright && npx playwright install chromium
 *
 * Le site étant en modules ES, il doit être servi et non ouvert en file://.
 * Ce script lance le serveur lui-même.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DOSSIER = fileURLToPath(new URL(".", import.meta.url));
const PORT = 4199;
const ADRESSE = "http://localhost:" + PORT;

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch (erreur) {
  console.error("Playwright introuvable. Installe-le avec :\n"
    + "  npm install playwright && npx playwright install chromium");
  process.exit(1);
}

// L'identifiant est celui d'une VRAIE recette de la table des métiers : sans
// lui, aucune pastille de métier, aucune carte de métier, et tout le pan XP de
// l'interface resterait hors du champ du test.
const RECETTE_DE_TEST = [{
  ankama_id: 917, name: "Coiffe du Boufcoul", level: 89,
  image_urls: { icon: "" },
  recipe: [
    { item_ankama_id: 289, item_subtype: "resources", quantity: 6 },
    { item_ankama_id: 290, item_subtype: "resources", quantity: 3 }
  ]
}];
const RESSOURCES_DE_TEST = {
  289: { ankama_id: 289, name: "Laine", image_urls: { icon: "" } },
  290: { ankama_id: 290, name: "Corne", image_urls: { icon: "" } }
};

/**
 * La Corne a un relevé communautaire, la Laine n'en a pas : la même session
 * couvre ainsi les deux cas. Les deux portent un identifiant interne, distinct
 * de l'identifiant Ankama, précisément pour que le test échoue si le code
 * publie le mauvais des deux.
 */
const REPONSE_DE_LECTURE = {
  data: [
    { id: 1001, dofusdb_id: 289, name: "Laine", level: 1, prices: [] },
    { id: 1002, dofusdb_id: 290, name: "Corne", level: 1,
      prices: [{ id: 1, server_id: 22, price: 250, status: "approved",
                 created_at: "2026-01-01T00:00:00.000000Z",
                 updated_at: "2026-01-01T00:00:00.000000Z" }] }
  ]
};

const serveur = spawn(process.execPath, [join(DOSSIER, "servir.js")],
  { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await new Promise(r => setTimeout(r, 400));

let nombreDEchecs = 0;
function verifier(intitule, obtenu, attendu) {
  const conforme = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!conforme) nombreDEchecs++;
  console.log((conforme ? "  OK   " : "ECHEC  ") + intitule
    + (conforme ? "" : "\n         obtenu " + JSON.stringify(obtenu)
                     + " / attendu " + JSON.stringify(attendu)));
}

const navigateur = await chromium.launch();
const page = await navigateur.newPage();
const erreursConsole = [];
page.on("pageerror", e => erreursConsole.push(String(e)));

const envoisInterceptes = [];

await page.route("**/api.dofusdu.de/**", route => {
  const adresse = route.request().url();
  const detailDUneRessource = adresse.match(/\/items\/resources\/(\d+)/);

  let reponse;
  if (detailDUneRessource) {
    reponse = RESSOURCES_DE_TEST[detailDUneRessource[1]];
  } else if (adresse.includes("/items/equipment/search")) {
    reponse = RECETTE_DE_TEST;
  } else {
    // Consommables et ressources : interrogés eux aussi depuis l'ouverture de
    // la vente par lot, mais une coiffe ne s'y trouve pas.
    reponse = [];
  }

  route.fulfill({ contentType: "application/json", body: JSON.stringify(reponse) });
});

await page.route("**/dofus-calculator.fr/api/**", route => {
  const requete = route.request();

  if (requete.method() === "POST") {
    envoisInterceptes.push({
      corps: JSON.parse(requete.postData()),
      jeton: requete.headers()["authorization"]
    });
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        message: "Prices updated successfully", server_id: "22",
        updated_count: "1", recorded_count: "1", ignored_count: "0",
        updated_prices: [{ item_id: "1001", item_name: "Laine", server_id: "22",
                           submitted_price: "1500", price: "1500",
                           status: "approved", recorded: "1" }]
      })
    });
  }

  route.fulfill({ contentType: "application/json", body: JSON.stringify(REPONSE_DE_LECTURE) });
});

await page.goto(ADRESSE);
await page.evaluate(() => localStorage.clear());
await page.reload();

// --- Ajout d'un craft, au clavier de bout en bout ---
console.log("\n--- Recherche et navigation au clavier ---");
await page.fill("#champRechercheRecette", "Coiffe");
await page.waitForSelector(".ligne-suggestion");

await page.keyboard.press("ArrowDown");
verifier("la première flèche bas vise le premier résultat",
  await page.locator(".ligne-suggestion.survolee").count(), 1);

await page.keyboard.press("ArrowUp");
verifier("flèche haut, la mise en avant reste sur une ligne",
  await page.locator(".ligne-suggestion.survolee").count(), 1);

await page.keyboard.press("Enter");
await page.waitForSelector(".tableau-ressources tbody tr");
verifier("Entrée ajoute la recette",
  await page.locator(".tableau-ressources tbody tr").count(), 2);
verifier("le champ de recherche est vidé", await page.inputValue("#champRechercheRecette"), "");

// --- Provenance des prix ---
console.log("\n--- Provenance et couleurs ---");
await page.waitForTimeout(400);

const rangeeDeLaCorne = page.locator(".tableau-ressources tbody tr", { hasText: "Corne" });
const rangeeDeLaLaine = page.locator(".tableau-ressources tbody tr", { hasText: "Laine" });

verifier("le ×1 de la Corne est marqué comme venant de la base",
  await rangeeDeLaCorne.locator('[data-taille-de-lot="1"]').getAttribute("class"),
  "champ-prix-lot prix-de-la-base");
verifier("son champ reste vide, la valeur n'est qu'un repère",
  await rangeeDeLaCorne.locator('[data-taille-de-lot="1"]').inputValue(), "");
verifier("le repère affiche le prix de la base",
  await rangeeDeLaCorne.locator('[data-taille-de-lot="1"]').getAttribute("placeholder"), "250");
verifier("la Laine, sans relevé, n'a aucune marque de provenance",
  await rangeeDeLaLaine.locator('[data-taille-de-lot="1"]').getAttribute("class"),
  "champ-prix-lot");

// La cellule de coût se désigne par sa classe et non par `last()` : depuis la
// colonne d'action des sous-crafts, elle n'est plus la dernière de la rangée.
verifier("le coût de la Corne repose sur la base, 3 à 250",
  (await rangeeDeLaCorne.locator("td.colonne-cout").textContent()).replace(/\s/g, ""), "750k");

// --- Publication ---
console.log("\n--- Publication du ×1 ---");

// Sans jeton, rien ne doit partir.
await rangeeDeLaLaine.locator('[data-taille-de-lot="1"]').fill("1200");
await rangeeDeLaLaine.locator('[data-taille-de-lot="1"]').dispatchEvent("change");
await page.waitForTimeout(300);
verifier("sans jeton, aucun envoi", envoisInterceptes.length, 0);
verifier("et le bandeau le dit",
  (await page.locator("#journal").textContent()).includes("Aucun jeton"), true);

// Avec jeton.
await page.evaluate(() =>
  localStorage.setItem("calculateur-craft-dofus-jeton", "7|jeton-de-test"));

await rangeeDeLaLaine.locator('[data-taille-de-lot="1"]').fill("1500");
await rangeeDeLaLaine.locator('[data-taille-de-lot="1"]').dispatchEvent("change");
await page.waitForTimeout(500);

verifier("un envoi est parti", envoisInterceptes.length, 1);
verifier("le jeton est dans l'en-tête",
  envoisInterceptes[0].jeton, "Bearer 7|jeton-de-test");
verifier("le serveur est Brial", envoisInterceptes[0].corps.server_id, 22);
verifier("le prix envoyé est bien le ×1", envoisInterceptes[0].corps.prices[0].price, 1500);
// LE test qui compte : l'identifiant interne, 1001, et surtout pas l'identifiant
// Ankama 289. Confondre les deux écrirait le prix sur une autre ressource.
verifier("c'est l'identifiant INTERNE qui est envoyé, pas l'Ankama",
  envoisInterceptes[0].corps.prices[0].item_id, 1001);

verifier("le champ passe en violet, publié",
  await rangeeDeLaLaine.locator('[data-taille-de-lot="1"]').getAttribute("class"),
  "champ-prix-lot prix-a-moi publication-faite");
verifier("la pastille annonce la publication",
  await rangeeDeLaLaine.locator(".pastille").textContent(), "publié");

// Les autres colonnes ne publient rien.
await rangeeDeLaLaine.locator('[data-taille-de-lot="10"]').fill("9000");
await rangeeDeLaLaine.locator('[data-taille-de-lot="10"]').dispatchEvent("change");
await page.locator("[data-prix-moyen]").first().fill("777");
await page.locator("[data-prix-moyen]").first().dispatchEvent("change");
await page.waitForTimeout(400);
verifier("ni le ×10 ni le prix moyen ne partent vers la base", envoisInterceptes.length, 1);

// La publication coupée est respectée.
await page.evaluate(() => {
  const etat = JSON.parse(localStorage.getItem("calculateur-craft-dofus-v1"));
  etat.publicationAutomatiqueActive = false;
  localStorage.setItem("calculateur-craft-dofus-v1", JSON.stringify(etat));
});
await page.reload();
await page.waitForSelector(".tableau-ressources tbody tr");
await page.waitForTimeout(400);
const nombreAvantCoupure = envoisInterceptes.length;
await page.locator(".tableau-ressources tbody tr", { hasText: "Corne" })
  .locator('[data-taille-de-lot="1"]').fill("300");
await page.locator(".tableau-ressources tbody tr", { hasText: "Corne" })
  .locator('[data-taille-de-lot="1"]').dispatchEvent("change");
await page.waitForTimeout(400);
verifier("publication coupée, rien ne part", envoisInterceptes.length, nombreAvantCoupure);

// --- Saisie en cours et redessin ---
// Regression du 18 08 2026 : retirer du DOM un input modifié fait émettre un
// `change` par le navigateur. Un redessin survenu pendant la frappe publiait
// donc la saisie en cours. Une valeur à moitié tapée partait vers la base
// commune, cent fois trop basse, visible par tous les joueurs du serveur.
console.log("\n--- Saisie interrompue par un redessin ---");
await page.evaluate(() => {
  const etat = JSON.parse(localStorage.getItem("calculateur-craft-dofus-v1"));
  etat.publicationAutomatiqueActive = true;
  localStorage.setItem("calculateur-craft-dofus-v1", JSON.stringify(etat));
});
await page.reload();
await page.waitForSelector(".tableau-ressources tbody tr");
await page.waitForTimeout(400);
const champEnCoursDeSaisie = page.locator(".tableau-ressources tbody tr", { hasText: "Laine" })
  .locator('[data-taille-de-lot="1"]');
await champEnCoursDeSaisie.click();
// `ControlOrMeta` et non `Control` : sur macOS, Ctrl+A place le curseur en
// début de ligne au lieu de tout sélectionner, et la frappe se retrouvait
// insérée devant la valeur existante plutôt qu'à sa place.
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.type("15");
verifier("la saisie est bien à moitié tapée",
  await champEnCoursDeSaisie.inputValue(), "15");
const nombreAvantFrappe = envoisInterceptes.length;
await page.evaluate(async () => (await import("./js/vue.js")).redessinerToutLEcran());
await page.waitForTimeout(600);
verifier("un redessin pendant la frappe ne publie rien",
  envoisInterceptes.length, nombreAvantFrappe);

// --- Recommandation d'achat, signal distinct de la provenance ---
console.log("\n--- Signal de recommandation ---");
const cellulesRecommandees = await page.locator("td.cellule-recommandee").count();
verifier("au moins une cellule porte le fond de recommandation",
  cellulesRecommandees > 0, true);
verifier("aucune cellule recommandée n'emprunte une couleur de provenance",
  await page.locator("td.cellule-recommandee.prix-a-moi, td.cellule-recommandee.prix-de-la-base").count(), 0);

// --- Le jeton ne fuit pas dans l'export ---
console.log("\n--- Étanchéité du jeton ---");
verifier("le jeton n'est pas dans l'état de session",
  await page.evaluate(() =>
    localStorage.getItem("calculateur-craft-dofus-v1").includes("jeton-de-test")), false);

/* --- Quarantaine de l'OCR ---

   Le parcours complet, du collage à la publication : un texte signé arrive, ses
   valeurs se rangent en quarantaine, aucun total ne bouge, rien ne part vers la
   base — puis une coche les fait entrer dans la base personnelle et publier.
   C'est la garantie centrale du chantier, elle mérite d'être vérifiée dans un
   vrai navigateur et pas seulement en unité. */
console.log("\n--- Quarantaine de l'OCR ---");

async function collerDansLaPage(texte) {
  await page.evaluate(contenu => {
    const donnees = new DataTransfer();
    donnees.setData("text/plain", contenu);
    document.dispatchEvent(new ClipboardEvent("paste", {
      clipboardData: donnees, bubbles: true, cancelable: true
    }));
  }, texte);
  await page.waitForTimeout(250);
}

// Les tests précédents ont rempli les prix de la Laine à la main. On les
// efface pour repartir d'une ressource vierge : la quarantaine ne s'affiche que
// là où Brice n'a pas déjà relevé le prix lui-même, sa saisie primant toujours.
await page.evaluate(async () => {
  const etat = await import("./js/etat.js");
  const vue = await import("./js/vue.js");
  delete etat.etatApplication.basePrixDesRessources[289];
  etat.sauvegarderEtat();
  vue.redessinerToutLEcran();
});
await page.waitForTimeout(200);

const coutAvantLeCollage = await page.locator("#bandeauResultats .valeur").first().textContent();

// Un collage ordinaire ne doit rien déclencher, et surtout rien annoncer.
await collerDansLaPage("https://exemple.fr/une-adresse-quelconque");
verifier("un collage sans signature ne met rien en quarantaine",
  await page.locator(".pastille-quarantaine").count(), 0);

// La Laine (289) a 6 unités nécessaires et aucun prix personnel.
await collerDansLaPage(
  "#DOFUS-HDV/1\tbrial\t2026-08-18T14:22:11\n"
  + "289\tLaine\t490\t1300\t12986\t129900\t241\t1\t0.98");

verifier("la ligne passe en quarantaine",
  await page.locator(".pastille-quarantaine").count(), 1);
verifier("le champ ×1 de la Laine est en orange pointillé",
  await page.locator("tr:has-text('Laine') input.prix-en-quarantaine").count() > 0, true);
verifier("mais le champ reste vide, la valeur n'est qu'un repère",
  await page.locator("tr:has-text('Laine') input[data-taille-de-lot='1']").inputValue(), "");
verifier("la valeur lue s'affiche en texte de remplacement",
  await page.locator("tr:has-text('Laine') input[data-taille-de-lot='1']")
    .getAttribute("placeholder"), "490");

// LA garantie : rien n'a bougé dans les totaux, et rien n'est parti sur le réseau.
verifier("aucun total n'a bougé",
  await page.locator("#bandeauResultats .valeur").first().textContent(), coutAvantLeCollage);
const envoisAvantLaCoche = envoisInterceptes.length;
verifier("et rien n'est parti vers la base", envoisAvantLaCoche, envoisInterceptes.length);
verifier("la quarantaine est rangée hors de la base personnelle",
  await page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem("calculateur-craft-dofus-v1"));
    return [Object.keys(etat.prixOcrEnAttente).length,
            (etat.basePrixDesRessources[289] || {}).prixParTailleDeLot || null];
  }), [1, null]);

// La coche du ×1 : entrée en base, passage au violet, et publication.
await page.click("tr:has-text('Laine') [data-confirmer-ocr='1']");
await page.waitForTimeout(700);

verifier("le ×1 confirmé porte désormais la valeur",
  await page.locator("tr:has-text('Laine') input[data-taille-de-lot='1']").inputValue(), "490");
verifier("et passe au violet",
  await page.locator("tr:has-text('Laine') input[data-taille-de-lot='1'].prix-a-moi").count(), 1);
verifier("un envoi est parti à la confirmation",
  envoisInterceptes.length, envoisAvantLaCoche + 1);
verifier("avec le prix lu par l'OCR",
  envoisInterceptes[envoisInterceptes.length - 1].corps.prices[0].price, 490);
verifier("et l'identifiant interne, pas l'Ankama",
  envoisInterceptes[envoisInterceptes.length - 1].corps.prices[0].item_id, 1001);

// Les trois autres lots restent en attente : une coche ne confirme qu'elle-même.
verifier("le ×10 reste en quarantaine",
  await page.locator("tr:has-text('Laine') input[data-taille-de-lot='10'].prix-en-quarantaine")
    .count(), 1);

// La pastille confirme tout le reste d'un coup.
await page.click("tr:has-text('Laine') [data-confirmer-toute-la-ligne]");
await page.waitForTimeout(700);
verifier("la pastille vide la quarantaine de la ligne",
  await page.locator(".pastille-quarantaine").count(), 0);
// Les milliers sont séparés par une espace insécable fine. On ne garde que les
// chiffres plutôt que de coller un caractère invisible dans un test.
verifier("les gros lots sont entrés en base",
  (await page.locator("tr:has-text('Laine') input[data-taille-de-lot='100']").inputValue())
    .replace(/[^0-9]/g, ""), "12986");
verifier("mais eux ne partent pas vers la base, ils ne sont pas partageables",
  envoisInterceptes.length, envoisAvantLaCoche + 1);

verifier("la quarantaine n'entre pas dans l'export",
  await page.evaluate(async () => {
    const etat = await import("./js/etat.js");
    return Object.prototype.hasOwnProperty.call(etat.construireLExportPartageable(), "prixOcrEnAttente");
  }), false);

/* --- Destination d'un craft --- */
console.log("\n--- Destination d'un craft ---");

verifier("un équipement est proposé en revente à l'unité",
  await page.locator("[data-destination]").first().inputValue(), "vente-unitaire");

await page.selectOption("[data-destination]", "vente-par-lot");
await page.waitForTimeout(250);
verifier("le mode par lot affiche quatre champs de vente",
  await page.locator("[data-vente-taille-de-lot]").count(), 4);

await page.fill("[data-vente-taille-de-lot='10']", "8000");
await page.locator("[data-vente-taille-de-lot='10']").press("Tab");
await page.waitForTimeout(300);
verifier("un reliquat sans prix ×1 est annoncé invendu",
  await page.locator(".carte-craft .prix-manquant:has-text('invendu')").count() > 0, true);

await page.selectOption("[data-destination]", "usage");
await page.waitForTimeout(250);
verifier("en usage personnel, aucun champ de vente",
  await page.locator("[data-vente-taille-de-lot], [data-champ='prixDeVenteUnitaire']").count(), 0);
verifier("et le coût sort du résultat de session",
  await page.locator("#bandeauResultats:has-text('Pour tes persos')").count(), 1);

await page.selectOption("[data-destination]", "vente-unitaire");
await page.waitForTimeout(250);

// --- XP de métier : calibrage automatique et objectif ---
//
// C'est le chemin que Brice suit vraiment : il saisit l'XP cumulée, craft,
// ressaisit l'XP cumulée, attribue le gain, puis demande « +10 niveaux ». À
// aucun moment il ne tape une XP par craft, et à la fin la quantité est remplie.
console.log("\n--- XP de métier, de bout en bout ---");

verifier("la carte du métier apparaît", await page.locator(".carte-metier").count(), 1);

await page.fill("[data-xp-metier]", "15769");
await page.locator("[data-xp-metier]").dispatchEvent("change");
await page.waitForTimeout(200);
verifier("l'XP cumulée donne le niveau",
  (await page.locator(".carte-metier .niveau-metier").textContent()).trim(), "niveau 40");
verifier("un premier relevé ne propose aucun calibrage",
  await page.locator(".calibrage-xp").count(), 0);

await page.fill("[data-xp-metier]", "17369");
await page.locator("[data-xp-metier]").dispatchEvent("change");
await page.waitForTimeout(200);
verifier("le second relevé propose d'attribuer le gain",
  (await page.locator(".gain-xp").textContent()).replace(/\s/g, ""), "+1600XPdepuistonrelevéauniveau40");

await page.fill("[data-calibrage-crafts]", "10");
await page.click("[data-calibrage-valider]");
await page.waitForTimeout(300);
verifier("la recette est calibrée sans qu'aucune XP n'ait été tapée",
  await page.inputValue("[data-xp-observee]"), "160");
verifier("au niveau du relevé de départ",
  await page.inputValue("[data-niveau-observation]"), "40");
verifier("le gain attribué ne l'est pas deux fois",
  await page.locator(".calibrage-xp").count(), 0);

verifier("l'objectif par défaut est +1 niveau",
  await page.locator("[data-objectif-xp]").inputValue(), "1");
verifier("trois objectifs, en niveaux à gagner",
  await page.locator("[data-objectif-xp] option").allTextContents(),
  ["+1 niveau", "+10 niveaux", "+20 niveaux"]);

await page.selectOption("[data-objectif-xp]", "10");
await page.waitForTimeout(300);
const quantiteVisee = await page.inputValue("[data-champ='quantiteACrafter']");
verifier("choisir un objectif REMPLIT la quantité", Number(quantiteVisee) > 1, true);
verifier("et la liste de courses suit",
  Number((await page.locator(".tableau-ressources tbody tr").first()
    .locator("td.colonne-chiffre").first().textContent()).replace(/\s/g, "")) > 6,
  true);

// Reprendre la main à la main : sans cela, le redessin suivant écraserait la
// saisie et le champ semblerait refuser toute quantité.
await page.fill("[data-champ='quantiteACrafter']", "2");
await page.locator("[data-champ='quantiteACrafter']").dispatchEvent("change");
await page.waitForTimeout(300);
verifier("une quantité tapée à la main reprend la main sur l'objectif",
  await page.inputValue("[data-champ='quantiteACrafter']"), "2");

// LE CHEMIN MANUEL, CELUI QUI AVAIT CASSÉ SANS QUE RIEN NE LE DISE
//
// Le calibrage automatique remplissait les DEUX champs, donc les tests ci-dessus
// passaient pendant que le geste courant — taper l'XP par craft et ne pas
// toucher au champ voisin — enregistrait une observation sans niveau, jamais
// calibrée, et laissait les objectifs sans effet sur la quantité. On repart donc
// d'une observation effacée, et on ne touche qu'à l'XP.
await page.evaluate(() => {
  const etat = JSON.parse(localStorage.getItem("calculateur-craft-dofus-v1"));
  etat.memoireExperienceParRecette = {};
  etat.craftsDeLaSession[0].quantiteACrafter = 1;
  localStorage.setItem("calculateur-craft-dofus-v1", JSON.stringify(etat));
});
await page.reload();
await page.waitForTimeout(600);

// 42, et non 40 : le niveau proposé est celui du métier MAINTENANT, pas celui
// du vieux relevé. C'est la bonne réponse dans le cas courant — on relève l'XP
// au moment où l'on craft.
verifier("le niveau d'observation est proposé avant toute saisie",
  await page.inputValue("[data-niveau-observation]"), "42");

await page.fill("[data-xp-observee]", "160");
await page.locator("[data-xp-observee]").dispatchEvent("change");
await page.waitForTimeout(300);
verifier("taper la seule XP par craft suffit à calibrer",
  await page.evaluate(() => JSON.parse(localStorage.getItem("calculateur-craft-dofus-v1"))
    .memoireExperienceParRecette["917"].niveauMetierObserve), 42);
verifier("et la ligne d'XP n'annonce plus une recette non calibrée",
  await page.locator(".ligne-xp .prix-manquant").count(), 0);

await page.selectOption("[data-objectif-xp]", "20");
await page.waitForTimeout(300);
const quantiteApresCalibrageManuel =
  Number(await page.inputValue("[data-champ='quantiteACrafter']"));
verifier("+20 remplit la quantité après un calibrage tapé à la main",
  quantiteApresCalibrageManuel > 1, true);
verifier("et la quantité est bien celle qu'annonce la ligne d'XP",
  Number((await page.locator(".ligne-xp strong.accentue").textContent()).replace(/\s/g, "")),
  quantiteApresCalibrageManuel);

// La suite du fichier chiffre sur une quantité de 2 : on la lui rend, sans quoi
// un test d'XP ferait échouer un test de fenêtre flottante trois cents lignes
// plus bas, pour une raison qu'il serait pénible de retrouver.
await page.fill("[data-champ='quantiteACrafter']", "2");
await page.locator("[data-champ='quantiteACrafter']").dispatchEvent("change");
await page.waitForTimeout(300);

// --- Mode PIP : la liste de courses ---
//
// L'API Document Picture-in-Picture n'est pas accordée à un Chromium sans
// interface. On lui en substitue une, qui rend dans une iframe : le code de la
// fenêtre flottante s'exécute alors pour de vrai, et sa liste est inspectable.
console.log("\n--- Fenêtre flottante : liste de courses ---");

await page.evaluate(() => {
  const cadre = document.createElement("iframe");
  cadre.id = "pip-de-test";
  // Assez grande pour que rien ne se recouvre : dans le vrai PIP la fenêtre
  // fait 520 pixels, et une iframe de 300 sur 150 ferait passer le bandeau
  // par-dessus les cases à cocher.
  cadre.style.cssText = "width:560px;height:640px;border:0";
  document.body.appendChild(cadre);
  Object.defineProperty(window, "documentPictureInPicture", {
    configurable: true,
    value: { requestWindow: async () => cadre.contentWindow }
  });
});

await page.click("#boutonPictureInPicture");
await page.waitForTimeout(600);

verifier("la page survit à l'ouverture du PIP",
  await page.locator("#bandeauResultats").isVisible(), true);

const pip = page.frameLocator("#pip-de-test");
verifier("la fenêtre flottante affiche une liste, pas un tableau",
  await pip.locator(".liste-de-courses .ligne-de-courses").count(), 2);
verifier("aucun tableau de ressources n'y subsiste",
  await pip.locator(".tableau-ressources").count(), 0);
verifier("le champ ×1 y est bien un champ, pas une cellule avalée par le parseur",
  await pip.locator(".ligne-de-courses .champ-prix-lot").count(), 2);

const ligneDeLaLaineDansLePip = pip.locator(".ligne-de-courses", { hasText: "Laine" });
verifier("le panier à taper au HDV est annoncé",
  (await ligneDeLaLaineDansLePip.locator(".panier-de-courses").textContent()).includes("×"), true);

await ligneDeLaLaineDansLePip.locator(".coche-achat").check({ force: true });
await page.waitForTimeout(250);
verifier("cocher une ressource la sort du chemin",
  await pip.locator(".ligne-achetee").count(), 1);
verifier("et le compte des courses le dit",
  (await pip.locator("#bandeauResultatsCompact").textContent()).includes("1 / 2"), true);

// Le rappel des crafts : la liste de courses agrège les ressources, elle ne dit
// plus quelle recette et en quelle quantité.
verifier("le rappel nomme la recette à crafter",
  await pip.locator(".craft-rappele .nom-copiable").first().textContent(), "Coiffe du Boufcoul");
verifier("avec sa quantité",
  await pip.locator(".craft-rappele .quantite").first().textContent(), "×2");
verifier("et son niveau, qui donne l'ordre de priorité",
  (await pip.locator(".craft-rappele").first().textContent()).includes("niv. 89"), true);

// Un craft à quantité nulle ne consomme aucune ressource : il n'a rien à faire
// dans un rappel de ce qu'il reste à faire.
await page.fill("[data-champ='quantiteACrafter']", "0");
await page.locator("[data-champ='quantiteACrafter']").press("Tab");
await page.waitForTimeout(300);
verifier("un craft à quantité nulle disparaît du rappel",
  await pip.locator(".craft-rappele").count(), 0);

await page.fill("[data-champ='quantiteACrafter']", "2");
await page.locator("[data-champ='quantiteACrafter']").press("Tab");
await page.waitForTimeout(300);

await page.screenshot({ path: join(DOSSIER, "apercu.png"), fullPage: true });

console.log("\nErreurs JavaScript :", erreursConsole.length === 0 ? "aucune" : erreursConsole);
if (erreursConsole.length > 0) nombreDEchecs += erreursConsole.length;

await navigateur.close();
serveur.kill();

console.log("\n" + (nombreDEchecs === 0
  ? "Tous les tests d'interface passent."
  : nombreDEchecs + " test(s) en échec."));
process.exit(nombreDEchecs === 0 ? 0 : 1);
