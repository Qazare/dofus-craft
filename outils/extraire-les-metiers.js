/**
 * Fabrique `calculateur/donnees/metiers-par-recette.json` à partir de Datafus.
 *
 *   node outils/extraire-les-metiers.js
 *
 * POURQUOI UN FICHIER FIGÉ PLUTÔT QU'UNE API
 *
 * Aucune des API Dofus joignables n'expose le métier d'une recette. Vérifié :
 * le schéma `Recipe` de DofusDude ne porte que trois champs — identifiant de
 * l'ingrédient, sous-type, quantité — et ni `/jobs` ni `/recipes` n'existent
 * chez lui. Dofapi n'a pas la donnée non plus et son hôte refuse les connexions.
 * Restait dofusdb, qui l'a, mais dont la licence LPNC-IA écarte les projets
 * majoritairement produits par une IA — la raison pour laquelle il avait déjà
 * été refusé comme source de recettes.
 *
 * Datafus tranche le nœud : c'est la base de Dofus extraite des fichiers du
 * jeu, publiée en JSON sous licence MIT. La donnée est la même que celle de
 * dofusdb, à la source près, et sans la clause qui gêne.
 *
 * TROIS BÉNÉFICES QUE L'APPEL RÉSEAU N'AVAIT PAS
 *
 *   Aucune dépendance à un tiers au moment de l'usage. Le fichier est servi par
 *   le même hébergeur que le reste du site, donc il ne peut pas tomber tout seul.
 *   Aucune question de CORS, aucun quota, aucune latence de première pastille.
 *   Il fonctionne hors ligne, ce que le calculateur sait déjà faire par ailleurs.
 *
 * QUAND LE REJOUER
 *
 * À chaque extension du jeu qui ajoute des recettes. Le fichier produit est
 * versionné dans le dépôt : c'est ce qui le rend consultable en revue, et une
 * recette qui change se voit alors dans le diff.
 *
 * Le format de sortie est délibérément compact — `{ resultId: [jobId, niveau] }`
 * — parce qu'il est téléchargé par le navigateur. Nommer les champs tripleraît
 * son poids pour une lisibilité dont seule cette fonction-ci a besoin.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ADRESSE_DES_RECETTES =
  "https://raw.githubusercontent.com/bot4dofus/Datafus/master/data/B/entities_json/Recipes.part00.json";

const DOSSIER = fileURLToPath(new URL(".", import.meta.url));
const FICHIER_PRODUIT = join(DOSSIER, "..", "calculateur", "donnees", "metiers-par-recette.json");

console.log("Lecture de Datafus…");
const reponse = await fetch(ADRESSE_DES_RECETTES);
if (!reponse.ok) {
  console.error("Datafus injoignable, code " + reponse.status);
  process.exit(1);
}

// Datafus écrit `NaN` en clair dans son JSON, sur les dates d'expiration
// absentes. Ce n'est pas du JSON valide — la grammaire ne connaît que `null` —
// et `JSON.parse` s'en étrangle à juste titre. On assainit le texte avant de
// l'analyser plutôt que de tolérer le champ : il ne nous sert pas, et
// l'expression est ancrée sur un `NaN` isolé pour ne pas toucher une chaîne
// qui contiendrait ces trois lettres.
const texteBrut = await reponse.text();
const contenu = JSON.parse(texteBrut.replace(/\bNaN\b/g, "null"));
const recettes = contenu.data;
if (!Array.isArray(recettes)) {
  console.error("Format inattendu : la clé `data` n'est pas un tableau.");
  process.exit(1);
}

const metiersParRecette = {};
let nombreDeRecettesIgnorees = 0;

for (const recette of recettes) {
  // Une recette sans métier ni niveau n'apprendrait rien à l'écran, et la
  // garder ferait passer pour connu ce qui ne l'est pas. La pastille reste
  // muette dans ce cas, ce qui est le comportement voulu.
  if (!recette.resultId || !recette.jobId) {
    nombreDeRecettesIgnorees++;
    continue;
  }
  metiersParRecette[recette.resultId] = [recette.jobId, recette.resultLevel || 0];
}

await mkdir(join(DOSSIER, "..", "calculateur", "donnees"), { recursive: true });
await writeFile(FICHIER_PRODUIT, JSON.stringify(metiersParRecette) + "\n", "utf8");

const nombreRetenu = Object.keys(metiersParRecette).length;
console.log(nombreRetenu + " recettes retenues"
  + (nombreDeRecettesIgnorees > 0 ? ", " + nombreDeRecettesIgnorees + " sans métier ignorées" : "")
  + ".");
console.log("Écrit dans calculateur/donnees/metiers-par-recette.json");
