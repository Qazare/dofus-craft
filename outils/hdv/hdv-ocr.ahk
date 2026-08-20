#Requires AutoHotkey v2.0
#SingleInstance Force

; ============================================================================
;  Relève des prix du HDV, côté Windows.
;
;  Une touche capture le popup d'objet affiché, en lit les quatre prix de lot,
;  les montre dans une infobulle, et les empile dans le presse-papier. Le
;  calculateur les récupère d'un seul Ctrl+V, quand tu le décides.
;
;  CE QUE CE SCRIPT NE FAIT PAS, ET NE FERA PAS
;    - il n'envoie aucune entrée clavier ou souris au jeu
;    - il ne lit aucun fichier du client, aucun paquet réseau
;    - il ne parcourt pas le HDV tout seul : c'est toi qui ouvres le popup
;  Il ne fait que lire des pixels déjà affichés à l'écran. Un script qui
;  feuilletterait les objets tout seul serait un bot, même en ne lisant que des
;  pixels — c'est la ligne, et elle ne bouge pas.
;
;  LA BASCULE DE FENÊTRE RESTE MANUELLE, VOLONTAIREMENT. Un script qui vole le
;  focus pour coller dans le navigateur marcherait, mais interromprait le jeu à
;  chaque touche. On relève six ressources, puis on va voir le résultat.
; ============================================================================

; ---- Touches ----------------------------------------------------------------
; F8 et F9 sont prises par la gestion des affichages, F1 par l'aide de Windows.
; F6 et F7 sont libres des deux côtés. Tout est ici, en un seul endroit, pour
; qu'un conflit se règle sans lire le reste du fichier.
TOUCHE_CAPTURER := "F6"
TOUCHE_RETIRER_LA_DERNIERE := "+F6"   ; Maj+F6
TOUCHE_VIDER_LA_FILE := "^F6"         ; Ctrl+F6
TOUCHE_MONTRER_LA_FILE := "F7"

; ---- Réglages ---------------------------------------------------------------
FENETRE_DU_JEU := "ahk_exe Dofus.exe"
SERVEUR := "brial"

; Assez long pour relire quatre nombres sans se presser. L'infobulle est le
; premier filtre du dispositif, et le plus efficace : elle montre le chiffre
; avant qu'il n'existe ailleurs. La bâcler, c'est perdre le filtre.
DUREE_INFOBULLE := 7000

DOSSIER := A_ScriptDir
LECTEUR := DOSSIER "\lire-le-hdv.ps1"
JOURNAL := DOSSIER "\journal"

; La file, une ligne de format d'échange par ressource relevée.
;
; Nommée `fileDAttente` et pas `file` : AutoHotkey v2 réserve ce nom pour sa
; classe File. L'erreur tombe au chargement du script, avant la première touche,
; avec un message qui ne dit pas que le nom est réservé.
fileDAttente := []

if !FileExist(LECTEUR) {
    MsgBox "Introuvable :`n" LECTEUR "`n`nLe script doit rester à côté de lire-le-hdv.ps1.",
        "Relève HDV", "Iconx"
    ExitApp
}

TraySetIcon("shell32.dll", 172)
A_IconTip := "Relève HDV — " TOUCHE_CAPTURER " capture, " TOUCHE_MONTRER_LA_FILE " montre la file"

; ============================================================================
;  Lecture d'un popup
; ============================================================================

/**
 * Appelle le lecteur PowerShell sur la fenêtre du jeu et rend sa sortie brute.
 *
 * La sortie passe par un fichier temporaire plutôt que par un tuyau : c'est le
 * seul moyen d'exécuter la commande sans qu'une console clignote par-dessus le
 * jeu, ce qui serait plus gênant que l'attente elle-même.
 */
LireLePopup(poigneeDeLaFenetre) {
    global LECTEUR, JOURNAL
    sortie := A_Temp "\hdv-ocr-sortie.txt"

    ; L'INFOBULLE EST EFFACÉE AVANT LA CAPTURE, ET CE N'EST PAS COSMÉTIQUE.
    ;
    ; Elle s'affiche près du curseur, donc au-dessus du popup au moment même où
    ; on photographie l'écran. Elle entrait dans l'image, l'OCR la lisait comme
    ; du texte du jeu, et son « Lecture… » se retrouvait dans la colonne du nom
    ; — pire, ses mots décalaient les rangées et les prix changeaient de lot.
    ;
    ; Le Sleep laisse Windows repeindre la zone. Sans lui, on capture l'écran
    ; d'avant l'effacement, ce qui revient au même. Et surtout : on efface une
    ; fenêtre à nous, on ne touche pas à la souris — déplacer le curseur serait
    ; envoyer une entrée au jeu, ce que ce script ne fait jamais.
    ToolTip
    Sleep 90

    commande := Format('{1} /c ""{2}" -NoProfile -ExecutionPolicy Bypass -File "{3}"'
        . ' -Poignee {4} -JournalDossier "{5}" > "{6}" 2>&1"',
        A_ComSpec, "powershell.exe", LECTEUR, poigneeDeLaFenetre, JOURNAL, sortie)

    RunWait commande, , "Hide"

    if !FileExist(sortie)
        return ""
    contenu := FileRead(sortie, "UTF-8")
    FileDelete sortie
    return Trim(contenu, " `t`r`n")
}

/** Découpe une ligne du format d'échange en ses colonnes. */
ColonnesDe(ligne) {
    return StrSplit(ligne, "`t")
}

/**
 * Reconstruit le presse-papier à partir de la file entière.
 *
 * Recopié à chaque changement, et non à la demande : la file et le
 * presse-papier ne peuvent donc jamais diverger, et il n'y a pas de « touche
 * pour copier » à oublier avant de basculer sur le navigateur.
 */
RecopierLaFile() {
    global fileDAttente, SERVEUR
    if fileDAttente.Length = 0 {
        A_Clipboard := ""
        return
    }
    horodatage := FormatTime(A_Now, "yyyy-MM-dd'T'HH:mm:ss")
    lignes := "#DOFUS-HDV/1`t" SERVEUR "`t" horodatage
    for ligne in fileDAttente
        lignes .= "`n" ligne
    A_Clipboard := lignes
}

/** Résumé d'une ligne, pour l'infobulle. */
ResumerUneLigne(ligne) {
    colonnes := ColonnesDe(ligne)
    tailles := ["x1", "x10", "x100", "x1000"]
    resume := ""
    loop 4 {
        valeur := colonnes.Has(A_Index + 2) ? colonnes[A_Index + 2] : ""
        if valeur != ""
            resume .= (resume = "" ? "" : "   ") tailles[A_Index] " " valeur
    }
    return resume = "" ? "aucun prix" : resume
}

/**
 * Affiche une infobulle près du curseur, effacée après un délai.
 *
 * LE MINUTEUR PASSE PAR UNE FONCTION NOMMÉE, et c'est tout l'objet de ce
 * commentaire. Avec une fonction anonyme, chaque appel crée un nouvel objet
 * fonction, donc un NOUVEAU minuteur : celui du « Lecture… » n'est pas remplacé
 * par celui du résultat, il survit et vient effacer le résultat une seconde
 * plus tard. Symptôme observé : les prix s'affichent puis disparaissent trop
 * vite pour être lus, d'autant plus vite que la lecture a été longue.
 *
 * Avec la même référence de fonction, `SetTimer` réarme le minuteur existant au
 * lieu d'en empiler un second.
 */
Infobulle(texte, duree := 0) {
    global DUREE_INFOBULLE
    ToolTip texte
    SetTimer EffacerLInfobulle, -(duree > 0 ? duree : DUREE_INFOBULLE)
}

EffacerLInfobulle() {
    ToolTip
}

; ============================================================================
;  Raccourcis, actifs seulement quand le jeu est au premier plan
;
;  AHK intercepte la touche : le jeu ne la reçoit plus tant que le raccourci est
;  actif. D'où le choix de touches qui ne servent à rien en jeu, et la garde
;  WinActive qui les rend à Windows dès qu'on quitte Dofus.
; ============================================================================

; HotIf() en fonction, et non la directive #HotIf : les raccourcis sont posés
; par Hotkey() à l'exécution, et celui-ci ne connaît que le critère fonctionnel.
; La directive, elle, ne s'applique qu'aux raccourcis écrits en dur — mélanger
; les deux donne des touches actives partout, y compris dans le navigateur.
HotIf (*) => WinActive(FENETRE_DU_JEU)

Hotkey(TOUCHE_CAPTURER, (*) => Capturer())
Hotkey(TOUCHE_RETIRER_LA_DERNIERE, (*) => RetirerLaDerniere())
Hotkey(TOUCHE_VIDER_LA_FILE, (*) => ViderLaFile())
Hotkey(TOUCHE_MONTRER_LA_FILE, (*) => MontrerLaFile())

HotIf

Capturer() {
    global fileDAttente
    ; Aucun message d'attente : il serait affiché par-dessus le popup et entrerait
    ; dans la capture. La lecture dure une seconde ou deux, le retour vient après.
    resultat := LireLePopup(WinExist("A"))

    if resultat = "" {
        Infobulle("Lecture impossible. Le lecteur n'a rien renvoyé.")
        return
    }
    if InStr(resultat, "ECHEC") = 1 {
        ; Un rejet ne coûte rien : on reprend la capture, ou on tape à la main.
        ; Un mauvais chiffre accepté, lui, contamine un calcul.
        Infobulle("Aucun prix lisible.`nLe popup d'objet est-il bien ouvert ?")
        return
    }

    premiereLigne := StrSplit(resultat, "`n")[1]
    colonnes := ColonnesDe(premiereLigne)
    nom := colonnes.Has(2) ? colonnes[2] : ""
    confiance := colonnes.Has(9) ? colonnes[9] : "1"

    fileDAttente.Push(premiereLigne)
    RecopierLaFile()

    ; L'infobulle est le premier filtre, et le plus efficace : tu vois le chiffre
    ; avant qu'il n'existe ailleurs.
    avertissement := (confiance + 0 < 0.5)
        ? "`n/!\ lecture douteuse, les lots ne se tiennent pas entre eux" : ""
    Infobulle(Format("{1}{2}`n{3}`n{4} en file, presse-papier à jour{5}",
        nom = "" ? "" : nom, nom = "" ? "" : " —", ResumerUneLigne(premiereLigne),
        fileDAttente.Length, avertissement))
}

RetirerLaDerniere() {
    global fileDAttente
    if fileDAttente.Length = 0 {
        Infobulle("La file est déjà vide.")
        return
    }
    fileDAttente.Pop()
    RecopierLaFile()
    Infobulle("Dernière entrée retirée. " fileDAttente.Length " en file.")
}

ViderLaFile() {
    global fileDAttente
    fileDAttente := []
    RecopierLaFile()
    Infobulle("File vidée.")
}

MontrerLaFile() {
    global fileDAttente
    if fileDAttente.Length = 0 {
        Infobulle("File vide. " TOUCHE_CAPTURER " pour relever un prix.")
        return
    }
    texte := fileDAttente.Length " ressource(s) en file :"
    for index, ligne in fileDAttente {
        colonnes := ColonnesDe(ligne)
        texte .= "`n" index ". " (colonnes.Has(2) ? colonnes[2] : "?")
            . "   " ResumerUneLigne(ligne)
    }
    texte .= "`n`nCtrl+V dans le calculateur pour tout envoyer en quarantaine."
    Infobulle(texte)
}
