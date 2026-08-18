# Lecture des prix d'un popup d'objet du HDV, et rien d'autre.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File lire-le-hdv.ps1 -Capture
#   powershell -NoProfile -ExecutionPolicy Bypass -File lire-le-hdv.ps1 -Image <chemin.png>
#
# Sort une ligne au format d'echange du calculateur, prete a etre mise en file :
#
#   <identifiant>  <nom>  <x1>  <x10>  <x100>  <x1000>  <moyen>  <taille>  <confiance>
#
# CE QUE CE SCRIPT NE FAIT PAS, ET NE FERA PAS
#   - il n'envoie aucune entree clavier ou souris au jeu
#   - il ne lit aucun fichier du client, aucun paquet reseau
#   - il ne parcourt pas le HDV tout seul : c'est Brice qui ouvre le popup
# Il ne fait que lire des pixels deja affiches a l'ecran. Un scan qui feuillette
# les objets tout seul serait un bot, meme en ne lisant que des pixels.
#
# PAS DE CALIBRATION, ET C'EST VOULU. La phase 0 a montre que la fenetre entiere
# se lit juste a sa resolution native. On repere donc la colonne des prix par
# ses ancres -- les en-tetes "Lot" et "prix", puis les libelles de lot -- au lieu
# de regler des rectangles en pourcentage a chaque resolution. Un rectangle fige
# se decale des que l'interface bouge d'un pixel ; une ancre, non.
#
# Fichier a garder en UTF-8 AVEC BOM : PowerShell 5.1 lit un .ps1 sans BOM comme
# de l'ANSI, et le moindre caractere accentue casse alors l'analyse syntaxique.

param(
  [switch]$Capture,
  [string]$Image = "",
  # Poignee de la fenetre a capturer. Fournie par le script AHK, qui sait quelle
  # fenetre etait au premier plan au moment de la touche. Sans elle, on prend la
  # fenetre active, ce qui suffit en usage manuel mais reste a la merci d'un
  # changement de focus entre la frappe et la capture.
  [string]$Poignee = "",
  [string]$JournalDossier = "",
  [switch]$Detaille
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime

# Sosies du 1 dans un champ ou seuls des chiffres peuvent figurer. La liste
# s'arrete la, volontairement : le symbole kama se colle au nombre et se lit
# tantot E, tantot K, tantot une etoile. Mapper d'autres lettres vers des
# chiffres fabriquerait des prix. Mesure du 18 08 2026, voir ocr-phase0.
$SOSIES_DU_UN = 'iIl|!'

$PRIX_MINIMAL = 1
$PRIX_MAXIMAL = 100000000
$TAILLES_DE_LOT = @(1, 10, 100, 1000)

# Rapports admis entre lots avant de crier au chiffre perdu ou en trop. C'est le
# controle qui attrape l'erreur d'OCR la plus couteuse : un chiffre avale ou
# duplique, qui divise ou multiplie le prix par dix sans rien casser d'apparent.
#
# La borne basse vaut un CINQUIEME de la taille du lot, pas la taille elle-meme.
# Un lot de 10 moins cher que dix fois l'unite est la situation normale au HDV,
# c'est meme la raison d'acheter en lot. Mesure du 18 08 : sur une capture
# reelle, 490 a l'unite et 1 300 les dix, soit 2,65 fois -- un rapport que des
# bornes calquees sur la taille du lot signalaient a tort comme une anomalie.
$RAPPORTS_ADMIS = @{
  10   = @{ min = 2;   max = 30 }
  100  = @{ min = 20;  max = 300 }
  1000 = @{ min = 200; max = 3000 }
}

# ============================================================
#  Capture de la fenetre au premier plan
# ============================================================

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FenetreAuPremierPlan {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@

function CapturerLaFenetreActive([string]$poigneeDemandee) {
  $poignee = if ($poigneeDemandee -ne "") { [IntPtr][int64]$poigneeDemandee }
             else { [FenetreAuPremierPlan]::GetForegroundWindow() }
  $rectangle = New-Object FenetreAuPremierPlan+RECT
  if (-not [FenetreAuPremierPlan]::GetWindowRect($poignee, [ref]$rectangle)) {
    throw "Fenetre active illisible."
  }
  $largeur = $rectangle.R - $rectangle.L
  $hauteur = $rectangle.B - $rectangle.T
  if ($largeur -le 0 -or $hauteur -le 0) { throw "Fenetre active de taille nulle." }

  $bitmap = New-Object System.Drawing.Bitmap $largeur, $hauteur
  $dessin = [System.Drawing.Graphics]::FromImage($bitmap)
  $dessin.CopyFromScreen($rectangle.L, $rectangle.T, 0, 0, $bitmap.Size)
  $dessin.Dispose()
  return $bitmap
}

# ============================================================
#  Appel de Windows.Media.Ocr
# ============================================================

$asTaskGenerique = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
                 $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

function Attendre($tacheWinRt, $typeResultat) {
  $asTask = $asTaskGenerique.MakeGenericMethod($typeResultat)
  $tacheNet = $asTask.Invoke($null, @($tacheWinRt))
  $tacheNet.Wait(-1) | Out-Null
  $tacheNet.Result
}

[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime] | Out-Null

<#
  Rend la liste des mots reconnus, avec leur boite englobante. C'est la boite qui
  fait tout le travail ici : le texte seul ne dit pas quel nombre est sur quelle
  ligne, ni lequel appartient a la colonne des prix.
#>
function LireLesMots([System.Drawing.Bitmap]$bitmap, [int]$agrandissement) {
  $cible = $bitmap
  if ($agrandissement -gt 1) {
    $cible = New-Object System.Drawing.Bitmap ($bitmap.Width * $agrandissement), ($bitmap.Height * $agrandissement)
    $dessin = [System.Drawing.Graphics]::FromImage($cible)
    $dessin.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $dessin.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $dessin.DrawImage($bitmap, 0, 0, $cible.Width, $cible.Height)
    $dessin.Dispose()
  }

  $temporaire = [System.IO.Path]::Combine($env:TEMP, "hdv-ocr-$([guid]::NewGuid()).png")
  $cible.Save($temporaire, [System.Drawing.Imaging.ImageFormat]::Png)
  if ($agrandissement -gt 1) { $cible.Dispose() }

  $fichier = Attendre ([Windows.Storage.StorageFile]::GetFileFromPathAsync($temporaire)) ([Windows.Storage.StorageFile])
  $flux = Attendre ($fichier.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decodeur = Attendre ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($flux)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $imageOcr = Attendre ($decodeur.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

  $moteur = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $moteur) { throw "Aucun moteur OCR pour les langues du profil." }
  $resultat = Attendre ($moteur.RecognizeAsync($imageOcr)) ([Windows.Media.Ocr.OcrResult])

  $mots = @()
  foreach ($ligneReconnue in $resultat.Lines) {
    foreach ($mot in $ligneReconnue.Words) {
      $mots += [pscustomobject]@{
        texte   = $mot.Text
        x       = [double]($mot.BoundingRect.X / $agrandissement)
        y       = [double]($mot.BoundingRect.Y / $agrandissement)
        largeur = [double]($mot.BoundingRect.Width / $agrandissement)
        hauteur = [double]($mot.BoundingRect.Height / $agrandissement)
        ligne   = $ligneReconnue.Text
      }
    }
  }

  Remove-Item $temporaire -Force -ErrorAction SilentlyContinue
  return $mots
}

# ============================================================
#  Normalisation et vraisemblance
# ============================================================

<#
  Applique la liste blanche, puis ne garde que les chiffres. Rend $null si rien
  d'exploitable ne subsiste : un champ vide n'est PAS un prix de zero, et un lot
  non propose par le HDV ne doit pas devenir une ressource gratuite.
#>
function LireUnNombre([string]$texte) {
  if ([string]::IsNullOrWhiteSpace($texte)) { return $null }

  $normalise = $texte
  foreach ($sosie in $SOSIES_DU_UN.ToCharArray()) { $normalise = $normalise.Replace($sosie, '1') }
  $chiffres = ($normalise -replace '[^0-9]', '')

  # Une suite de chiffres plus longue que le plus gros prix possible n'est pas un
  # prix : c'est une ligne entiere recollee par erreur. On refuse avant la
  # conversion, qui deborderait.
  if ($chiffres -eq '' -or $chiffres.Length -gt 9) { return $null }

  $valeur = [int64]$chiffres
  if ($valeur -lt $PRIX_MINIMAL -or $valeur -gt $PRIX_MAXIMAL) { return $null }
  return $valeur
}

function ReleverLesIncoherences($prixParLot) {
  $unitaire = $prixParLot[1]
  if ($null -eq $unitaire -or $unitaire -le 0) { return @() }

  $anomalies = @()
  foreach ($taille in $RAPPORTS_ADMIS.Keys) {
    $prix = $prixParLot[$taille]
    if ($null -eq $prix -or $prix -le 0) { continue }
    $rapport = $prix / $unitaire
    $bornes = $RAPPORTS_ADMIS[$taille]
    if ($rapport -lt $bornes.min -or $rapport -gt $bornes.max) {
      $anomalies += ("lot de {0} a {1}x le x1" -f $taille, [math]::Round($rapport))
    }
  }
  return $anomalies
}

# ============================================================
#  Reperage du popup par ses ancres
# ============================================================

<#
  Les libelles de lot vivent dans la colonne de gauche du popup, les montants
  dans celle de droite. On identifie chaque RANGEE par son libelle, puis on lit
  les nombres situes a sa droite et sur la meme ligne.

  Le "1 000" du libelle arrive en deux mots, "1" et "000" : ils sont recolles
  avant comparaison, sans quoi la rangee du lot de 1000 se ferait passer pour
  celle du lot de 1.
#>
function ExtraireLesPrix($mots) {
  $motifLot = '^(?i)lot$'
  $motifPrix = '^(?i)prix$'
  $motifMoyen = '^(?i)moyen$'

  # Ancre de colonne : la PAIRE d'en-tetes "Lot" et "prix", cote a cote sur la
  # meme rangee. Chercher "prix" tout seul ne marche pas : le popup porte deja
  # un "Prix moyen" plus haut, et c'etait lui qu'on attrapait -- la colonne des
  # montants se retrouvait placee tout a gauche, et pas un lot n'etait reconnu.
  $enTeteLot = $null
  $enTetePrix = $null
  foreach ($candidatLot in ($mots | Where-Object { $_.texte -match $motifLot } | Sort-Object y)) {
    $candidatPrix = $mots | Where-Object {
      $_.texte -match $motifPrix -and $_.x -gt $candidatLot.x -and
      [math]::Abs($_.y - $candidatLot.y) -lt 30
    } | Sort-Object x | Select-Object -First 1

    if ($null -ne $candidatPrix) {
      $enTeteLot = $candidatLot
      $enTetePrix = $candidatPrix
      break
    }
  }
  if ($null -eq $enTetePrix) { return $null }

  $bordGaucheDesPrix = $enTetePrix.x - 120
  $hauteurDeLigne = [math]::Max(14, $enTetePrix.hauteur * 1.6)

  # EMPRISE DU POPUP. Sans borne a droite, une capture de la fenetre entiere fait
  # entrer dans la "colonne des prix" tout ce qui traine plus loin sur l'ecran --
  # la liste du HDV, l'inventaire, la barre de recherche -- et les nombres se
  # recollent en montants absurdes. Mesure du 18 08 : c'est exactement ce qui
  # transformait 12 986 en 12986111. Les deux bornes viennent des en-tetes, elles
  # suivent donc le popup ou qu'il soit.
  $bordGauchePopup = $enTeteLot.x - 60
  $bordDroitPopup = $enTetePrix.x + 250

  # Rangees candidates : tout mot numerique situe a GAUCHE de la colonne des
  # montants mais dans l'emprise du popup, donc un libelle de lot et non un prix.
  $libelles = $mots | Where-Object {
    $_.x -lt $bordGaucheDesPrix -and $_.x -ge $bordGauchePopup -and
    $_.y -gt ($enTetePrix.y + $enTetePrix.hauteur / 2) -and
    ($_.texte -replace '[^0-9]', '') -ne ''
  } | Sort-Object y

  $prixParLot = @{}
  $rangeesDejaVues = @{}

  foreach ($libelle in $libelles) {
    if ($rangeesDejaVues.ContainsKey([math]::Round($libelle.y))) { continue }

    $morceauxDuLibelle = $mots | Where-Object {
      $_.x -lt $bordGaucheDesPrix -and $_.x -ge $bordGauchePopup -and
      [math]::Abs($_.y - $libelle.y) -lt $hauteurDeLigne / 2
    } | Sort-Object x

    $tailleLue = LireUnNombre (($morceauxDuLibelle | ForEach-Object { $_.texte }) -join '')
    if ($null -eq $tailleLue -or $TAILLES_DE_LOT -notcontains $tailleLue) { continue }

    foreach ($morceau in $morceauxDuLibelle) { $rangeesDejaVues[[math]::Round($morceau.y)] = $true }

    $morceauxDuPrix = $mots | Where-Object {
      $_.x -ge $bordGaucheDesPrix -and $_.x -le $bordDroitPopup -and
      [math]::Abs($_.y - $libelle.y) -lt $hauteurDeLigne / 2
    } | Sort-Object x

    $prixLu = LireUnNombre (($morceauxDuPrix | ForEach-Object { $_.texte }) -join '')

    # Un lot deja rencontre ne se remplace pas : la premiere rangee fait foi.
    if ($null -ne $prixLu -and -not $prixParLot.ContainsKey([int]$tailleLue)) {
      $prixParLot[[int]$tailleLue] = $prixLu
    }
  }

  # Prix moyen. Une fenetre entiere en porte plusieurs : celui du popup, et celui
  # de la colonne de la liste du HDV. On garde le plus proche AU-DESSUS de
  # l'en-tete "Lot" et dans l'emprise horizontale du popup, c'est celui de
  # l'objet ouvert. Le symbole kama se colle souvent au nombre, d'ou des lectures
  # comme "241K" : on ne garde que les chiffres, cela suffit.
  $prixMoyen = $null
  $motMoyen = $mots | Where-Object {
    $_.texte -match $motifMoyen -and $_.y -lt $enTeteLot.y -and
    $_.x -gt ($enTeteLot.x - 200) -and $_.x -lt ($enTetePrix.x + 400)
  } | Sort-Object y -Descending | Select-Object -First 1

  if ($null -ne $motMoyen) {
    $morceauxDuMoyen = $mots | Where-Object {
      [math]::Abs($_.y - $motMoyen.y) -lt 20 -and $_.x -gt $motMoyen.x -and $_.x -le $bordDroitPopup
    } | Sort-Object x
    $prixMoyen = LireUnNombre (($morceauxDuMoyen | ForEach-Object { $_.texte }) -join '')
  }

  # Le nom est lu comme garde-fou seulement, jamais pour designer la ressource :
  # c'est le calculateur qui sait sur quoi il attend un prix, sa revue avance
  # ressource par ressource. Reconnaitre un nom propre en texte libre est le
  # probleme le plus dur du lot, et il est inutile ici.
  $nomLu = ""
  # Au moins trois caracteres et une lettre : sans ce filtre, c'est la croix de
  # fermeture du popup qui se fait passer pour le nom de l'objet.
  $motDuNom = $mots | Where-Object {
    $_.y -lt ($enTeteLot.y - 60) -and
    $_.x -gt ($enTeteLot.x - 60) -and $_.x -lt ($enTetePrix.x + 400) -and
    $_.texte.Length -ge 3 -and $_.texte -match '[A-Za-z]'
  } | Sort-Object y | Select-Object -First 1
  if ($null -ne $motDuNom) { $nomLu = $motDuNom.ligne }

  return [pscustomobject]@{
    prixParLot = $prixParLot
    prixMoyen  = $prixMoyen
    nom        = $nomLu
  }
}

<#
  Rectangle du popup dans l'image, deduit des memes ancres que les prix.

  Les marges sont exprimees en hauteurs de ligne et non en pixels : c'est ce qui
  rend le recadrage indifferent a la resolution, et evite de rejouer une
  calibration a chaque changement d'ecran.
#>
function CalculerLEmpriseDuPopup($mots, [System.Drawing.Bitmap]$bitmap) {
  $motifLot = '^(?i)lot$'
  $motifPrix = '^(?i)prix$'

  $enTeteLot = $null
  $enTetePrix = $null
  foreach ($candidatLot in ($mots | Where-Object { $_.texte -match $motifLot } | Sort-Object y)) {
    $candidatPrix = $mots | Where-Object {
      $_.texte -match $motifPrix -and $_.x -gt $candidatLot.x -and
      [math]::Abs($_.y - $candidatLot.y) -lt 30
    } | Sort-Object x | Select-Object -First 1
    if ($null -ne $candidatPrix) {
      $enTeteLot = $candidatLot
      $enTetePrix = $candidatPrix
      break
    }
  }
  if ($null -eq $enTetePrix) { return $null }

  $hauteurDeLigne = [math]::Max(14, $enTetePrix.hauteur * 1.6)
  $gauche = [int][math]::Max(0, $enTeteLot.x - 3 * $hauteurDeLigne)
  $droite = [int][math]::Min($bitmap.Width, $enTetePrix.x + 12 * $hauteurDeLigne)
  $haut = [int][math]::Max(0, $enTeteLot.y - 13 * $hauteurDeLigne)
  $bas = [int][math]::Min($bitmap.Height, $enTeteLot.y + 13 * $hauteurDeLigne)

  if ($droite - $gauche -lt 40 -or $bas - $haut -lt 40) { return $null }
  return New-Object System.Drawing.Rectangle $gauche, $haut, ($droite - $gauche), ($bas - $haut)
}

# ============================================================
#  Deroulement
# ============================================================

$bitmap = $null
if ($Image -ne "") {
  $bitmap = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Image).Path)
} elseif ($Capture -or $Poignee -ne "") {
  $bitmap = CapturerLaFenetreActive $Poignee
} else {
  Write-Error "Preciser -Capture ou -Image <chemin>."
  exit 2
}

# DEUX PASSES, ET LA SECONDE N'EST PAS UN LUXE.
#
# La premiere lit l'image telle quelle et sert uniquement a TROUVER le popup :
# ses en-tetes "Lot" et "prix" suffisent, et ils sortent sans difficulte.
#
# La seconde relit le popup seul, agrandi trois fois. Sur une capture de la
# fenetre entiere, la premiere passe rate les libelles de lot les plus fins --
# mesure du 18 08 : "1" et "10" manquaient a l'appel, "100" et "1 000" non, et
# la moitie des prix se perdait avec eux. L'agrandissement etait deja la
# condition du fonctionnement en phase 0 ; il l'est encore ici.
$mots = LireLesMots $bitmap 1
$extraction = ExtraireLesPrix $mots

$emprise = CalculerLEmpriseDuPopup $mots $bitmap
if ($null -ne $emprise) {
  $popup = $bitmap.Clone($emprise, $bitmap.PixelFormat)
  $motsAgrandis = LireLesMots $popup 3
  $popup.Dispose()

  $extractionFine = ExtraireLesPrix $motsAgrandis
  # La passe fine ne l'emporte que si elle lit AU MOINS autant de lots. Elle
  # travaille sur une image recadree, donc plus fragile a l'ancrage : mieux vaut
  # la lecture large que rien du tout.
  if ($null -ne $extractionFine -and
      $extractionFine.prixParLot.Count -ge (@{$true = $extraction.prixParLot.Count; $false = 0}[$null -ne $extraction])) {
    $extraction = $extractionFine
  }
}

if ($JournalDossier -ne "") {
  # Sans journal, aucune regression d'OCR n'est diagnosticable : on garde
  # l'image telle qu'elle a ete lue.
  New-Item -ItemType Directory -Force $JournalDossier | Out-Null
  $tampon = Get-Date -Format "yyyyMMdd-HHmmss"
  $bitmap.Save((Join-Path $JournalDossier "$tampon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
}

$bitmap.Dispose()

if ($null -eq $extraction -or $extraction.prixParLot.Count -eq 0) {
  Write-Output "ECHEC`tAucun prix lisible. Le popup d'objet est-il bien ouvert ?"
  exit 1
}

$anomalies = ReleverLesIncoherences $extraction.prixParLot
$confiance = if ($anomalies.Count -gt 0) { "0.3" } else { "0.95" }

# Colonne 1 laissee vide : l'identifiant Ankama n'est pas devinable ici, c'est le
# calculateur qui sait de quelle ressource il attend un prix. Le nom suit, en
# garde-fou.
$colonnes = @("", $extraction.nom) `
  + ($TAILLES_DE_LOT | ForEach-Object {
      if ($extraction.prixParLot.ContainsKey($_)) { $extraction.prixParLot[$_] } else { "" }
    }) `
  + @(
      $(if ($null -ne $extraction.prixMoyen) { $extraction.prixMoyen } else { "" }),
      1,
      $confiance
    )

Write-Output ($colonnes -join "`t")

if ($Detaille) {
  Write-Output ""
  foreach ($taille in $TAILLES_DE_LOT) {
    $valeur = if ($extraction.prixParLot.ContainsKey($taille)) { $extraction.prixParLot[$taille] } else { "-" }
    Write-Output ("  x{0,-5} {1}" -f $taille, $valeur)
  }
  Write-Output ("  moyen  {0}" -f $(if ($null -ne $extraction.prixMoyen) { $extraction.prixMoyen } else { "-" }))
  Write-Output ("  nom    {0}" -f $extraction.nom)
  foreach ($anomalie in $anomalies) { Write-Output ("  ANOMALIE {0}" -f $anomalie) }
}
