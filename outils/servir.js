/**
 * Petit serveur statique, pour travailler sur le calculateur en local.
 *
 * Nécessaire depuis le passage en modules ES : un `import` refusé par la
 * politique d'origine ne fonctionne pas en `file://`. Aucune dépendance, rien à
 * installer, `node outils/servir.js` suffit.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(fileURLToPath(new URL(".", import.meta.url)), "..", "calculateur");
const PORT = Number(process.env.PORT) || 4173;

const TYPES_MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

createServer(async (requete, reponse) => {
  // `normalize` puis retrait des remontées : sans cela, une requête contenant
  // ../.. servirait n'importe quel fichier du disque.
  const cheminDemande = normalize(decodeURIComponent(new URL(requete.url, "http://x").pathname))
    .replace(/^(\.\.[/\\])+/, "");
  const cheminFichier = join(RACINE, cheminDemande === "/" ? "index.html" : cheminDemande);

  try {
    const contenu = await readFile(cheminFichier);
    reponse.writeHead(200, {
      "Content-Type": TYPES_MIME[extname(cheminFichier)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    reponse.end(contenu);
  } catch (erreur) {
    reponse.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    reponse.end("Introuvable : " + cheminDemande);
  }
}).listen(PORT, () => {
  console.log("Calculateur servi sur http://localhost:" + PORT);
});
