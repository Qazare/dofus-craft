# Phase 0 de l'OCR du HDV : mesure du taux de lecture exacte au chiffre pres.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File mesurer.ps1
#
# Chaque zone est un rectangle de prix decoupe dans une capture reelle du jeu.
# La verite terrain est relevee a l'oeil, une fois. On compare la suite de
# chiffres lue a la suite attendue : egalite strict, ou echec. Pas de "proche".

$ErrorActionPreference = 'Stop'
$ici = Split-Path -Parent $MyInvocation.MyCommand.Path
$moteur = Join-Path $ici 'ocr-winrt.ps1'

$zones = @(
  # capture,                     libelle,               zone x,y,l,h,        attendu
  ,@('popup-moskito-4lots.png',   'moyen',               '285,143,100,32',    '368')
  ,@('popup-moskito-4lots.png',   'lot 1',               '350,307,130,36',    '994')
  ,@('popup-moskito-4lots.png',   'lot 10',              '350,369,130,36',    '8998')
  ,@('popup-moskito-4lots.png',   'lot 100',             '350,431,130,36',    '49999')
  ,@('popup-moskito-4lots.png',   'lot 1000 (rouge)',    '350,493,130,36',    '780000')

  ,@('popup-shinlarve-1lot.png',  'moyen',               '285,152,100,32',    '503')
  ,@('popup-shinlarve-1lot.png',  'lot 1',               '350,317,130,36',    '1486')

  ,@('fenetre-entiere.png',       'popup moyen',         '810,982,110,34',    '241')
  ,@('fenetre-entiere.png',       'popup lot 1',         '875,1148,110,36',   '490')
  ,@('fenetre-entiere.png',       'popup lot 10',        '875,1211,110,36',   '1300')
  ,@('fenetre-entiere.png',       'popup lot 100',       '875,1273,110,36',   '12986')
  ,@('fenetre-entiere.png',       'popup lot 1000',      '875,1335,110,36',   '129900')

  ,@('fenetre-entiere.png',       'liste 1 volk pourpre','2260,561,90,34',    '564')
  ,@('fenetre-entiere.png',       'liste 2 volk ebene',  '2260,675,90,34',    '1272')
  ,@('fenetre-entiere.png',       'liste 3 tofu',        '2260,788,90,34',    '66')
  ,@('fenetre-entiere.png',       'liste 4 cassees',     '2260,902,90,34',    '')
  ,@('fenetre-entiere.png',       'liste 5 moskito',     '2260,1015,90,34',   '368')
  ,@('fenetre-entiere.png',       'liste 6 scara blanc', '2260,1128,90,34',   '241')
  ,@('fenetre-entiere.png',       'liste 7 scara bleu',  '2260,1242,90,34',   '163')
  ,@('fenetre-entiere.png',       'liste 8 scara rouge', '2260,1355,90,34',   '149')
)

$modes = @(
  @{ nom = 'brut';              args = @() }
  @{ nom = 'zoom x3';           args = @('-Zoom', '3') }
  @{ nom = 'zoom x3 + gris';    args = @('-Zoom', '3', '-Gris') }
  @{ nom = 'zoom x3 + seuil';   args = @('-Zoom', '3', '-Seuil', '110') }
)

foreach ($mode in $modes) {
  $exact = 0
  $exactBlanchi = 0
  $lignes = @()
  foreach ($z in $zones) {
    $image = Join-Path $ici (Join-Path 'captures' $z[0])
    $sortie = & powershell -NoProfile -ExecutionPolicy Bypass -File $moteur `
      -Image $image -Zone $z[2] -Json @($mode.args) 2>&1 | Out-String
    $lu = ''
    try {
      $json = $sortie | ConvertFrom-Json
      $lu = ($json.lignes | ForEach-Object { $_.texte }) -join ' '
    } catch { $lu = "<erreur> $sortie" }
    # on ne garde que les chiffres : le symbole kama et les espaces de milliers
    # ne sont pas des donnees.
    $chiffres = ($lu -replace '[^0-9]', '')
    # variante "liste blanche" : dans un champ ou seuls des chiffres peuvent
    # figurer, les sosies du 1 (i, l, I, barre verticale) sont des 1.
    $blanchi = (($lu -replace '[iIl|!]', '1') -replace '[^0-9]', '')
    $ok = ($chiffres -eq $z[3])
    if ($ok) { $exact++ }
    if ($blanchi -eq $z[3]) { $exactBlanchi++ }
    $lignes += '{0,-24} {1,-22} attendu {2,-8} lu {3,-10} {4}' -f `
      $z[0].Replace('.png',''), $z[1], $(if ($z[3] -eq '') { '(vide)' } else { $z[3] }), `
      $(if ($chiffres -eq '') { '(vide)' } else { $chiffres }), $(if ($ok) { 'ok' } else { 'ECHEC  brut: ' + $lu.Trim() })
  }
  ''
  "=== mode $($mode.nom) ==="
  $lignes | ForEach-Object { $_ }
  '{0} / {1} exactes, soit {2:N0} % — avec liste blanche : {3} / {1}, soit {4:N0} %' -f $exact, $zones.Count, (100 * $exact / $zones.Count), $exactBlanchi, (100 * $exactBlanchi / $zones.Count)
}
