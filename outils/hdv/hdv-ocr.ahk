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
DUREE_INFOBULLE := 2500

DOSSIER := A_ScriptDir
LECTEUR := DOSSIER "\lire-le-hdv.ps1"
JOURNAL := DOSSIER "\journal"

; La file, une ligne de format d'échange par ressource relevée.
file := []

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
    global file, SERVEUR
    if file.Length = 0 {
        A_Clipboard := ""
        return
    }
    horodatage := FormatTime(A_Now, "yyyy-MM-dd'T'HH:mm:ss")
    lignes := "#DOFUS-HDV/1`t" SERVEUR "`t" horodatage
    for ligne in file
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

Infobulle(texte) {
    global DUREE_INFOBULLE
    ToolTip texte
    SetTimer () => ToolTip(), -DUREE_INFOBULLE
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
    global file
    Infobulle("Lecture…")
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

    file.Push(premiereLigne)
    RecopierLaFile()

    ; L'infobulle est le premier filtre, et le plus efficace : tu vois le chiffre
    ; avant qu'il n'existe ailleurs.
    avertissement := (confiance + 0 < 0.5)
        ? "`n/!\ lecture douteuse, les lots ne se tiennent pas entre eux" : ""
    Infobulle(Format("{1}{2}`n{3}`n{4} en file, presse-papier à jour{5}",
        nom = "" ? "" : nom, nom = "" ? "" : " —", ResumerUneLigne(premiereLigne),
        file.Length, avertissement))
}

RetirerLaDerniere() {
    global file
    if file.Length = 0 {
        Infobulle("La file est déjà vide.")
        return
    }
    file.Pop()
    RecopierLaFile()
    Infobulle("Dernière entrée retirée. " file.Length " en file.")
}

ViderLaFile() {
    global file
    file := []
    RecopierLaFile()
    Infobulle("File vidée.")
}

MontrerLaFile() {
    global file
    if file.Length = 0 {
        Infobulle("File vide. " TOUCHE_CAPTURER " pour relever un prix.")
        return
    }
    texte := file.Length " ressource(s) en file :"
    for index, ligne in file {
        colonnes := ColonnesDe(ligne)
        texte .= "`n" index ". " (colonnes.Has(2) ? colonnes[2] : "?")
            . "   " ResumerUneLigne(ligne)
    }
    texte .= "`n`nCtrl+V dans le calculateur pour tout envoyer en quarantaine."
    Infobulle(texte)
}
