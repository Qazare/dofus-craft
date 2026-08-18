#Requires AutoHotkey v2.0

; ============================================================
; Configuration
; ============================================================

characters := [
    "Aalessa",
    "Liandri",
    "Chironides",
    "Selene"
]

isMaximized := false


; ============================================================
; Trouver les fenêtres Dofus
; ============================================================

GetDofusWindows()
{
    global characters

    windows := []

    for character in characters
    {
        hwnd := WinExist(character " ahk_exe Dofus.exe")

        if !hwnd
        {
            MsgBox "Impossible de trouver la fenêtre Dofus de : " character
            return []
        }

        windows.Push(hwnd)
    }

    return windows
}


; ============================================================
; F8 = mode 2×2
; ============================================================

F8::
{
    global isMaximized

    windows := GetDofusWindows()

    if windows.Length != 4
        return

    MonitorGetWorkArea(1, &left, &top, &right, &bottom)

    halfWidth := (right - left) / 2
    halfHeight := (bottom - top) / 2

    overlapX := 10

    for hwnd in windows
        WinRestore("ahk_id " hwnd)

    ; Haut gauche
    WinMove(
        left - overlapX,
        top,
        halfWidth + overlapX,
        halfHeight,
        "ahk_id " windows[1]
    )

    ; Haut droite
    WinMove(
        left + halfWidth - overlapX,
        top,
        halfWidth + overlapX * 2,
        halfHeight,
        "ahk_id " windows[2]
    )

    ; Bas gauche
    WinMove(
        left - overlapX,
        top + halfHeight,
        halfWidth + overlapX,
        halfHeight,
        "ahk_id " windows[3]
    )

    ; Bas droite
    WinMove(
        left + halfWidth - overlapX,
        top + halfHeight,
        halfWidth + overlapX * 2,
        halfHeight,
        "ahk_id " windows[4]
    )

    isMaximized := false
}


; ============================================================
; F9 = toggle maximisé / 2×2
; ============================================================

F9::
{
    global isMaximized

    windows := GetDofusWindows()

    if windows.Length != 4
        return

    if !isMaximized
    {
        for hwnd in windows
            WinMaximize("ahk_id " hwnd)

        isMaximized := true
    }
    else
    {
        for hwnd in windows
            WinRestore("ahk_id " hwnd)

        isMaximized := false
    }
}