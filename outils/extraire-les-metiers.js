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
 * Le format de sortie est délibérément compact — `{ resultId: [jobId, niveau] }`,
 * avec un TROISIÈME élément, le ratio d'XP, quand il ne vaut pas 100 — parce
 * qu'il est téléchargé par le navigateur. Nommer les champs tripleraît son poids
 * pour une lisibilité dont seule cette fonction-ci a besoin.
 *
 * LE RATIO D'XP, ET POURQUOI IL VAUT LE DÉTOUR
 *
 * Le client Dofus calcule l'XP d'un craft ainsi (`Item.getCraftXpByJobLevel`) :
 *
 *     basicXp = 20 × niveauRecette / (écart^1,1 / 10 + 1)
 *     xp      = floor(basicXp × ratio / 100)
 *
 * Le ratio est `craftXpRatio`, pris SUR L'OBJET s'il vaut mieux que −1, sinon
 * SUR SON TYPE, sinon 100. C'est lui, et rien d'autre, qui explique que deux
 * recettes de niveau 40 du même métier rapportent 160 et 40 XP : l'Essence de
 * Batofu est de type « Essence de gardien de donjon », à 20 %, la Potion de Soin
 * de type « Potion », à 5 %. On avait conclu qu'aucune formule ne donnerait
 * l'XP de base ; il manquait seulement ce champ-là.
 *
 * Il porte aussi une information qu'on ne pouvait pas deviner : QUATRE-VINGTS
 * RECETTES ENVIRON ONT UN RATIO DE ZÉRO et ne rapportent donc jamais rien. Les
 * proposer comme objectif d'XP serait envoyer Brice crafter pour rien.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE_DATAFUS =
  "https://raw.githubusercontent.com/bot4dofus/Datafus/master/data/B/entities_json/";
const ADRESSE_DES_RECETTES = RACINE_DATAFUS + "Recipes.part00.json";
// Le ratio d'XP se lit sur l'objet, et se replie sur son type quand l'objet ne
// le fixe pas. Il faut donc les deux tables, et `Items` pèse quarante mégaoctets
// — ce qui ne coûte rien ici, ce script ne tournant qu'à chaque extension.
const ADRESSE_DES_OBJETS = RACINE_DATAFUS + "Items.part00.json";
const ADRESSE_DES_TYPES = RACINE_DATAFUS + "ItemTypes.part00.json";

/** Ratio par défaut, quand ni l'objet ni son type n'en fixe un. */
const RATIO_DXP_PAR_DEFAUT = 100;

const DOSSIER = fileURLToPath(new URL(".", import.meta.url));
const FICHIER_PRODUIT = join(DOSSIER, "..", "calculateur", "donnees", "metiers-par-recette.json");

console.log("Lecture de Datafus…");

/**
 * Lit une table Datafus et rend son tableau `data`.
 *
 * Datafus écrit `NaN` en clair dans son JSON, sur les dates d'expiration
 * absentes. Ce n'est pas du JSON valide — la grammaire ne connaît que `null` —
 * et `JSON.parse` s'en étrangle à juste titre. On assainit le texte avant de
 * l'analyser plutôt que de tolérer le champ : il ne nous sert pas, et
 * l'expression est ancrée sur un `NaN` isolé pour ne pas toucher une chaîne qui
 * contiendrait ces trois lettres.
 */
async function lireUneTableDatafus(adresse, nom) {
  const reponse = await fetch(adresse);
  if (!reponse.ok) {
    console.error("Datafus injoignable sur " + nom + ", code " + reponse.status);
    process.exit(1);
  }
  const contenu = JSON.parse((await reponse.text()).replace(/\bNaN\b/g, "null"));
  if (!Array.isArray(contenu.data)) {
    console.error("Format inattendu sur " + nom + " : la clé `data` n'est pas un tableau.");
    process.exit(1);
  }
  console.log("  " + nom + " : " + contenu.data.length + " entrées");
  return contenu.data;
}

const [recettes, objets, typesDObjets] = await Promise.all([
  lireUneTableDatafus(ADRESSE_DES_RECETTES, "Recipes"),
  lireUneTableDatafus(ADRESSE_DES_OBJETS, "Items"),
  lireUneTableDatafus(ADRESSE_DES_TYPES, "ItemTypes")
]);

const objetsParIdentifiant = new Map(objets.map(objet => [objet.id, objet]));
const typesParIdentifiant = new Map(typesDObjets.map(type => [type.id, type]));

/**
 * Le ratio d'XP d'un objet produit, en pourcentage.
 *
 * L'ordre de repli est celui du client : l'objet d'abord, son type ensuite, et
 * 100 à défaut. `−1` n'est pas un ratio, c'est l'absence de ratio — le confondre
 * avec une valeur ferait rapporter −1 % à la moitié du jeu.
 */
function lireLeRatioDXP(identifiantDeLObjet) {
  const objet = objetsParIdentifiant.get(identifiantDeLObjet);
  if (!objet) return RATIO_DXP_PAR_DEFAUT;
  if (objet.craftXpRatio > -1) return objet.craftXpRatio;

  const type = typesParIdentifiant.get(objet.typeId);
  if (type && type.craftXpRatio > -1) return type.craftXpRatio;

  return RATIO_DXP_PAR_DEFAUT;
}

const metiersParRecette = {};
let nombreDeRecettesIgnorees = 0;
let nombreAvecRatio = 0;
let nombreSansAucuneXP = 0;

for (const recette of recettes) {
  // Une recette sans métier ni niveau n'apprendrait rien à l'écran, et la
  // garder ferait passer pour connu ce qui ne l'est pas. La pastille reste
  // muette dans ce cas, ce qui est le comportement voulu.
  if (!recette.resultId || !recette.jobId) {
    nombreDeRecettesIgnorees++;
    continue;
  }

  const entree = [recette.jobId, recette.resultLevel || 0];

  // Le ratio n'est écrit que lorsqu'il s'écarte du défaut. Il ne le fait que
  // pour un cinquième des recettes, et l'écrire partout gonflerait de vingt
  // kilo-octets un fichier que le navigateur télécharge à chaque visite.
  const ratio = lireLeRatioDXP(recette.resultId);
  if (ratio !== RATIO_DXP_PAR_DEFAUT) {
    entree.push(ratio);
    nombreAvecRatio++;
    if (ratio === 0) nombreSansAucuneXP++;
  }

  metiersParRecette[recette.resultId] = entree;
}

await mkdir(join(DOSSIER, "..", "calculateur", "donnees"), { recursive: true });
await writeFile(FICHIER_PRODUIT, JSON.stringify(metiersParRecette) + "\n", "utf8");

const nombreRetenu = Object.keys(metiersParRecette).length;
console.log(nombreRetenu + " recettes retenues"
  + (nombreDeRecettesIgnorees > 0 ? ", " + nombreDeRecettesIgnorees + " sans métier ignorées" : "")
  + ".");
console.log(nombreAvecRatio + " portent un ratio d'XP propre, dont "
  + nombreSansAucuneXP + " qui ne rapportent jamais rien.");
console.log("Écrit dans calculateur/donnees/metiers-par-recette.json");
