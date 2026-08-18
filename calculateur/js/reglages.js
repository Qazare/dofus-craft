/**
 * Réglages : jeton d'écriture, publication, export et import.
 *
 * Le jeton mérite son propre écran et sa propre explication. C'est un secret,
 * il donne le droit d'écrire dans une base partagée, et il ne peut pas vivre
 * dans le code d'un site servi en clair. Il est donc saisi ici, une fois par
 * navigateur, et rangé dans le stockage local — jamais dans l'export JSON, qui
 * circule entre machines.
 */
import { NOM_DU_SERVEUR_SUIVI, IDENTIFIANT_DU_SERVEUR_SUIVI } from "./config.js";
import { etatApplication, sauvegarderEtat, remplacerLEtat,
         lireLeJetonDEcriture, enregistrerLeJetonDEcriture } from "./etat.js";
import { verifierLeJeton } from "./api-prix.js";
import { redessinerToutLEcran } from "./vue.js";
import { synchroniserLesPrixDeLaSession } from "./crafts.js";
import { annoncer } from "./journal.js";
import { echapperPourHtml } from "./formats.js";

const ADRESSE_DE_CREATION_DU_JETON = "https://dofus-calculator.fr/api-tokens";

let voile = null;

export function ouvrirLesReglages() {
  voile = document.createElement("div");
  voile.className = "voile-revue";
  voile.innerHTML =
    '<div class="carte-revue carte-reglages">'
      + '<div class="avancement">Réglages</div>'

      + '<div class="champ-etiquete">'
        + '<label class="etiquette" for="champJeton">Jeton d\'écriture dofus-calculator</label>'
        + '<input type="password" id="champJeton" autocomplete="off" spellcheck="false"'
          + ' placeholder="7|xxxxxxxx…" value="' + echapperPourHtml(lireLeJetonDEcriture()) + '">'
      + "</div>"
      + '<p class="note-reglage">'
        + "Il reste dans ce navigateur, sur cette machine, et n'entre jamais dans l'export JSON. "
        + "Il n'est pas non plus dans le code du site, qui est servi en clair : c'est pour cela "
        + "qu'il faut le ressaisir sur ta seconde machine. "
        + '<a href="' + ADRESSE_DE_CREATION_DU_JETON + '" target="_blank" rel="noopener">'
        + "En créer un</a>."
      + "</p>"
      + '<div class="ligne-boutons-reglage">'
        + '<button id="boutonVerifierLeJeton">Vérifier le jeton</button>'
        + '<button id="boutonEffacerLeJeton" class="bouton-discret">Effacer</button>'
        + '<span class="attenue" id="retourDeVerification"></span>'
      + "</div>"

      + '<label class="interrupteur">'
        + '<input type="checkbox" id="casePublication"'
        + (etatApplication.publicationAutomatiqueActive !== false ? " checked" : "") + ">"
        + "<span>Publier mes prix ×1 vers la base " + NOM_DU_SERVEUR_SUIVI + "</span>"
      + "</label>"
      + '<p class="note-reglage">'
        + "Seule la colonne ×1 part, parce que c'est le seul prix que la base connaisse : "
        + "un vrai prix unitaire relevé au HDV. Les lots de 10, 100 et 1000 et le prix moyen "
        + "restent strictement locaux. Un envoi est public, et corrigeable à tout moment "
        + "par une simple ressaisie."
      + "</p>"

      + '<p class="note-reglage attenue">Serveur : <strong>' + NOM_DU_SERVEUR_SUIVI
        + "</strong>, identifiant " + IDENTIFIANT_DU_SERVEUR_SUIVI + ".</p>"

      + '<div class="ligne-boutons-reglage">'
        + '<button id="boutonExporter">Exporter</button>'
        + '<button id="boutonImporter">Importer</button>'
        + '<button id="boutonViderSession" class="bouton-discret">Vider la session</button>'
      + "</div>"

      + '<div class="aide-clavier"><kbd>Échap</kbd> fermer</div>'
    + "</div>";

  document.body.appendChild(voile);
  document.addEventListener("keydown", surTouche);
  voile.addEventListener("mousedown", evenement => {
    if (evenement.target === voile) fermerLesReglages();
  });

  brancherLesControles();
  voile.querySelector("#champJeton").focus();
}

export function fermerLesReglages() {
  document.removeEventListener("keydown", surTouche);
  if (voile) {
    voile.remove();
    voile = null;
  }
  redessinerToutLEcran();
}

function surTouche(evenement) {
  if (evenement.key === "Escape") {
    evenement.preventDefault();
    fermerLesReglages();
  }
}

function brancherLesControles() {
  const champJeton = voile.querySelector("#champJeton");
  const retour = voile.querySelector("#retourDeVerification");

  champJeton.addEventListener("change", () => {
    enregistrerLeJetonDEcriture(champJeton.value);
    retour.textContent = champJeton.value.trim() === "" ? "jeton effacé" : "jeton enregistré";
    retour.className = "attenue";
  });

  voile.querySelector("#boutonVerifierLeJeton").addEventListener("click", async () => {
    enregistrerLeJetonDEcriture(champJeton.value);
    retour.textContent = "vérification…";
    retour.className = "attenue";
    const resultat = await verifierLeJeton(champJeton.value.trim());
    retour.textContent = resultat.message;
    retour.className = resultat.valide ? "gain" : "perte";
  });

  voile.querySelector("#boutonEffacerLeJeton").addEventListener("click", () => {
    champJeton.value = "";
    enregistrerLeJetonDEcriture("");
    retour.textContent = "jeton effacé";
    retour.className = "attenue";
  });

  voile.querySelector("#casePublication").addEventListener("change", evenement => {
    etatApplication.publicationAutomatiqueActive = evenement.target.checked;
    sauvegarderEtat();
  });

  voile.querySelector("#boutonExporter").addEventListener("click", exporterLEtat);
  voile.querySelector("#boutonImporter").addEventListener("click", importerUnEtat);

  voile.querySelector("#boutonViderSession").addEventListener("click", () => {
    if (!confirm("Vider la liste des crafts ? Les prix des ressources, eux, sont conservés.")) return;
    etatApplication.craftsDeLaSession = [];
    sauvegarderEtat();
    fermerLesReglages();
  });
}

function exporterLEtat() {
  // `etatApplication` ne contient pas le jeton, rangé sous une autre clé :
  // l'export peut donc circuler sans exposer de secret.
  const contenu = JSON.stringify(etatApplication, null, 2);
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([contenu], { type: "application/json" }));
  lien.download = "calculateur-craft-dofus-sauvegarde.json";
  lien.click();
}

function importerUnEtat() {
  const champDeFichier = document.createElement("input");
  champDeFichier.type = "file";
  champDeFichier.accept = "application/json";
  champDeFichier.addEventListener("change", async () => {
    const fichier = champDeFichier.files[0];
    if (!fichier) return;
    try {
      // Un fichier exporté par une version antérieure porte l'ancien format :
      // `remplacerLEtat` migre, sans quoi ses prix seraient silencieusement ignorés.
      remplacerLEtat(JSON.parse(await fichier.text()));
      sauvegarderEtat();
      fermerLesReglages();
      annoncer("Sauvegarde importée.");
      synchroniserLesPrixDeLaSession();
    } catch (erreur) {
      alert("Fichier illisible : " + erreur.message);
    }
  });
  champDeFichier.click();
}
