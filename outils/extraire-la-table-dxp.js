/**
 * Fabrique `calculateur/donnees/xp-par-niveau-de-metier.json`.
 *
 *   node outils/extraire-la-table-dxp.js
 *
 * D'OÙ VIENT CETTE TABLE, ET CE QU'ELLE VAUT
 *
 * Elle n'est dans aucune donnée de jeu : le client reçoit du serveur son niveau
 * de métier et ses seuils d'XP déjà calculés (`KnownJobWrapper.jobXpLevelFloor`
 * et `jobXpNextLevelFloor`), et ni Datafus ni `LuaFormulas` ne portent la courbe.
 * Vérifié aussi du côté des API : DofusDude ne l'expose pas.
 *
 * Elle est donc DÉRIVÉE de deux faits, et c'est à ce titre qu'il faut la lire.
 *
 *   1. La table officielle des métiers, niveaux 1 à 100, relevée à l'identique
 *      par deux sources indépendantes — wiki-dofus.eu et guidedofus.com. Elle
 *      culmine à 581 687 XP cumulés au niveau 100. (Une coquille isolée chez
 *      guidedofus au niveau 9, 1 543 au lieu de 1 534, tranchée par la
 *      régularité des écarts : ils progressent de 40 environ à chaque palier,
 *      ce que 1 534 respecte et 1 543 casse.)
 *
 *   2. Le devblog d'Ankama sur la refonte des métiers : « Les métiers ont
 *      désormais 200 niveaux (un niveau 100 de métier en 2.28 équivaudra à un
 *      niveau 200 de métier en 2.29, les métiers ne nécessiteront pas plus
 *      d'expérience pour atteindre leur niveau maximum). »
 *
 * De 2, la courbe garde ses deux extrémités : le niveau 1 ne coûte rien, et le
 * niveau 200 coûte ce que coûtait l'ancien niveau 100. Les 198 paliers du
 * milieu sont répartis entre les deux, ce qui revient à faire correspondre le
 * nouveau niveau L à la position `1 + (L-1) × 99/199` de l'ancienne table.
 *
 * Le découpage naïf `nouveau L ≡ ancien L/2` a été essayé et rejeté : il fait
 * tomber le nouveau niveau 2 sur l'ancien niveau 1, donc à zéro XP, et un
 * métier vierge s'affiche alors niveau 2 sans avoir rien crafté.
 *
 * CE QUE CETTE INTERPOLATION N'EST PAS
 *
 * Une donnée relevée. Ankama a redécoupé une courbe en deux fois plus de
 * paliers ; rien ne dit que le redécoupage est linéaire. Seuls les niveaux qui
 * tombent exactement sur une valeur d'origine sont sûrs, et le fichier produit
 * porte le drapeau `interpole` sur tous les autres : l'interface peut ainsi
 * nuancer ce qu'elle affiche plutôt que de présenter comme sûr ce qui ne l'est
 * pas.
 *
 * À CONFIRMER SUR PIÈCE
 *
 * Un seul relevé en jeu suffit à valider ou renverser l'ensemble : niveau de
 * métier et XP affichée dans la fenêtre du métier. Si l'échelle ne tombe pas,
 * c'est toute la dérivation qui saute, et ce fichier avec.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * XP cumulée pour atteindre chaque niveau, dans l'ancienne table 1 à 100.
 * Recopiée depuis wiki-dofus.eu, recoupée avec guidedofus.com.
 */
const TABLE_HISTORIQUE_1_A_100 = [
  0, 50, 140, 271, 441, 653, 905, 1199, 1534, 1911,
  2330, 2792, 3297, 3840, 4428, 5060, 5731, 6447, 7208, 8007,
  8852, 9741, 10673, 11651, 12669, 14122, 15313, 16564, 17873, 19242,
  20672, 22166, 23725, 25353, 27048, 28815, 30655, 32568, 34558, 36641,
  38790, 41028, 43355, 45772, 48282, 50885, 53585, 56382, 59279, 62491,
  65664, 68960, 72385, 75943, 79640, 83482, 87475, 91624, 95937, 100421,
  105082, 109928, 114967, 120207, 125656, 131323, 137218, 143350, 149729, 156365,
  163269, 170452, 177926, 185702, 193793, 202839, 211765, 221082, 230808, 240964,
  251574, 262660, 274248, 286364, 299037, 312297, 326176, 340708, 355929, 371877,
  388592, 406117, 424497, 443779, 464013, 485252, 507551, 530969, 555568, 581687
];

const DOSSIER = fileURLToPath(new URL(".", import.meta.url));
const FICHIER_PRODUIT = join(DOSSIER, "..", "calculateur", "donnees", "xp-par-niveau-de-metier.json");

if (TABLE_HISTORIQUE_1_A_100.length !== 100) {
  console.error("La table historique doit compter exactement 100 niveaux.");
  process.exit(1);
}

// Contrôle de cohérence : une table d'XP cumulée est strictement croissante.
// Une valeur recopiée de travers se voit ici, pas trois écrans plus loin.
for (let rang = 1; rang < TABLE_HISTORIQUE_1_A_100.length; rang++) {
  if (TABLE_HISTORIQUE_1_A_100[rang] <= TABLE_HISTORIQUE_1_A_100[rang - 1]) {
    console.error("Table non croissante au niveau " + (rang + 1) + ", recopie à revoir.");
    process.exit(1);
  }
}

const niveaux = [];
for (let niveau = 1; niveau <= 200; niveau++) {
  // Position correspondante dans l'ancienne table, extrémités alignées.
  const position = 1 + (niveau - 1) * 99 / 199;
  const rangBas = Math.floor(position);
  const rangHaut = Math.ceil(position);

  if (rangBas === rangHaut) {
    niveaux.push({ xp: TABLE_HISTORIQUE_1_A_100[rangBas - 1], interpole: false });
  } else {
    const bas = TABLE_HISTORIQUE_1_A_100[rangBas - 1];
    const haut = TABLE_HISTORIQUE_1_A_100[rangHaut - 1];
    const fraction = position - rangBas;
    niveaux.push({ xp: Math.round(bas + (haut - bas) * fraction), interpole: true });
  }
}

// Le niveau 1 coûte 0 par définition : c'est le point de départ, pas un palier.
niveaux[0] = { xp: 0, interpole: false };

const contenu = {
  source: "wiki-dofus.eu et guidedofus.com pour la table 1-100, redécoupée en 200 "
    + "niveaux d'après le devblog d'Ankama sur la refonte des métiers.",
  aConfirmer: "Les niveaux impairs sont interpolés. Un relevé en jeu tranche.",
  xpCumuleeParNiveau: niveaux.map(n => n.xp),
  niveauxInterpoles: niveaux.map(n => (n.interpole ? 1 : 0))
};

await mkdir(join(DOSSIER, "..", "calculateur", "donnees"), { recursive: true });
await writeFile(FICHIER_PRODUIT, JSON.stringify(contenu) + "\n", "utf8");

console.log("200 niveaux écrits, dont "
  + niveaux.filter(n => n.interpole).length + " interpolés.");
console.log("Niveau 200 : " + niveaux[199].xp.toLocaleString("fr-FR") + " XP cumulés.");
