/**
 * Bandeau d'état, une ligne sous l'en-tête.
 *
 * Tout ce qui part vers le réseau ou en revient s'annonce ici, et nulle part
 * ailleurs. Une publication est une écriture publique, visible par tous les
 * joueurs du serveur : elle ne doit jamais se faire en silence.
 */
let zoneDuJournal = null;

export function installerLeJournal(element) {
  zoneDuJournal = element;
}

export function annoncer(texte, niveau) {
  if (!zoneDuJournal) return;
  zoneDuJournal.textContent = texte || "";
  zoneDuJournal.classList.toggle("en-echec", niveau === "echec");
  zoneDuJournal.classList.toggle("en-cours", niveau === "en-cours");
  zoneDuJournal.classList.toggle("en-succes", niveau === "succes");
}
