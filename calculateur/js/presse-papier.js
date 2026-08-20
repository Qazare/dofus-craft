/**
 * Copie d'un nom d'objet dans le presse-papier.
 *
 * POURQUOI CE GESTE MÉRITE UN MODULE
 *
 * Le nom recopié ne va pas dans un document : il va dans la barre de recherche
 * du HDV, où la moindre faute de frappe ne renvoie rien. « Substrat de Futaie »
 * se tape mal, s'accentue mal, et se cherche vingt fois par session. Un clic
 * vaut mieux qu'une frappe, et c'est tout le propos.
 *
 * L'API `navigator.clipboard` demande un contexte sécurisé — https ou
 * localhost. Le site est servi en https par GitHub Pages, donc le cas nominal
 * est couvert ; le repli par `document.execCommand` couvre le reste, dont la
 * fenêtre flottante de Picture-in-Picture, où le contexte n'est pas toujours
 * celui qu'on croit. Un `execCommand` déprécié qui fonctionne vaut mieux qu'une
 * API moderne qui refuse.
 *
 * Le retour visuel est indispensable : sans lui, rien à l'écran ne distingue
 * une copie réussie d'un clic qui n'a rien fait, et Brice recliquerait.
 */

/** Durée d'affichage de la confirmation, assez longue pour être lue. */
const DUREE_DE_LA_CONFIRMATION_MS = 1100;

/**
 * Copie un texte et confirme visuellement sur l'élément cliqué.
 * @param {string} texte
 * @param {Element} elementCliquable  reçoit la classe `.copie` le temps du retour
 */
export async function copierDansLePressePapier(texte, elementCliquable) {
  const copie = await tenterLaCopie(texte);
  if (elementCliquable) marquerLeRetourVisuel(elementCliquable, copie);
  return copie;
}

async function tenterLaCopie(texte) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texte);
      return true;
    } catch (erreur) {
      console.debug("Presse-papier refusé, repli sur execCommand :", erreur);
    }
  }
  return copierParLeRepli(texte);
}

/**
 * Repli historique : un champ de saisie hors écran, sélectionné puis copié.
 *
 * Placé en `fixed` avec une opacité nulle plutôt qu'en `display:none` — un
 * élément non rendu n'est pas sélectionnable, et la copie échouerait sans un
 * mot. Le `readonly` empêche le clavier virtuel de surgir sur un écran tactile.
 */
function copierParLeRepli(texte) {
  const champTemporaire = document.createElement("textarea");
  champTemporaire.value = texte;
  champTemporaire.setAttribute("readonly", "");
  champTemporaire.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(champTemporaire);

  try {
    champTemporaire.select();
    return document.execCommand("copy");
  } catch (erreur) {
    console.warn("Copie impossible :", erreur);
    return false;
  } finally {
    champTemporaire.remove();
  }
}

/**
 * Marque l'élément le temps de la confirmation.
 *
 * Le minuteur est rangé sur l'élément lui-même : recliquer avant la fin doit
 * repartir de zéro, et non voir la marque s'effacer au terme du premier
 * minuteur alors que la deuxième copie vient d'avoir lieu.
 */
function marquerLeRetourVisuel(element, copieReussie) {
  const classe = copieReussie ? "copie" : "copie-en-echec";
  clearTimeout(element.minuteurDeConfirmationDeCopie);
  element.classList.add(classe);
  element.minuteurDeConfirmationDeCopie = setTimeout(
    () => element.classList.remove(classe), DUREE_DE_LA_CONFIRMATION_MS);
}

/**
 * Branche la copie sur tous les noms cliquables d'un conteneur.
 *
 * Un seul écouteur posé sur le conteneur, par délégation : le tableau des
 * ressources se redessine en entier à chaque saisie de prix, et poser un
 * écouteur par nom en rebrancherait des dizaines à chaque frappe.
 */
export function brancherLaCopieDesNoms(conteneur) {
  if (!conteneur || conteneur.laCopieEstBranchee) return;
  conteneur.laCopieEstBranchee = true;

  conteneur.addEventListener("click", evenement => {
    const nomCliquable = evenement.target.closest("[data-copier]");
    if (!nomCliquable || !conteneur.contains(nomCliquable)) return;
    evenement.preventDefault();
    copierDansLePressePapier(nomCliquable.getAttribute("data-copier"), nomCliquable);
  });
}
