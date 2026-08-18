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
  const correspondance = route.request().url().match(/\/items\/resources\/(\d+)/);
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(correspondance ? RESSOURCES_DE_TEST[correspondance[1]] : RECETTE_DE_TEST)
  });
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
