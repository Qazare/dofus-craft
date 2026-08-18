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

const RECETTE_DE_TEST = [{
  ankama_id: 1234, name: "Coiffe du Boufcoul", level: 89,
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

verifier("le coût de la Corne repose sur la base, 3 à 250",
  (await rangeeDeLaCorne.locator("td").last().textContent()).replace(/\s/g, ""), "750k");

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
await page.keyboard.press("Control+a");
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

// --- Mode PIP ---
console.log("\n--- Fenêtre flottante ---");
await page.click("#boutonPictureInPicture");
await page.waitForTimeout(600);

// Chromium sans interface n'accorde pas l'API Document Picture-in-Picture : on
// vérifie seulement que le clic ne casse pas la page, le repli en popup étant
// lui aussi bloqué en mode automatisé.
verifier("la page survit à l'ouverture du PIP",
  await page.locator("#bandeauResultats").isVisible(), true);

await page.screenshot({ path: join(DOSSIER, "apercu.png"), fullPage: true });

console.log("\nErreurs JavaScript :", erreursConsole.length === 0 ? "aucune" : erreursConsole);
if (erreursConsole.length > 0) nombreDEchecs += erreursConsole.length;

await navigateur.close();
serveur.kill();

console.log("\n" + (nombreDEchecs === 0
  ? "Tous les tests d'interface passent."
  : nombreDEchecs + " test(s) en échec."));
process.exit(nombreDEchecs === 0 ? 0 : 1);
