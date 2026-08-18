# Phase 0 de l'OCR du HDV : passe une image a Windows.Media.Ocr et rend le texte
# brut, ligne par ligne, avec la boite englobante de chaque mot.
#
#   powershell -NoProfile -File ocr-winrt.ps1 -Image <chemin> [-Zoom 3] [-Gris] [-Seuil 128] [-Json]
#
# Aucun appel au jeu, aucune entree envoyee : on ne lit qu'un PNG deja sur le disque.

param(
  [Parameter(Mandatory=$true)][string]$Image,
  [int]$Zoom = 1,
  [switch]$Gris,
  [int]$Seuil = -1,
  [string]$Zone = '',
  [switch]$Json
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime

# --- pretraitement : agrandissement, niveaux de gris, seuillage -------------
$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Image).Path)
if ($Zone -ne '') {
  $c = $Zone -split ','
  $rect = New-Object System.Drawing.Rectangle ([int]$c[0]), ([int]$c[1]), ([int]$c[2]), ([int]$c[3])
  $decoupe = $source.Clone($rect, $source.PixelFormat)
  $source.Dispose()
  $source = $decoupe
}
$cible = $source
if ($Zoom -gt 1) {
  $cible = New-Object System.Drawing.Bitmap ($source.Width * $Zoom), ($source.Height * $Zoom)
  $g = [System.Drawing.Graphics]::FromImage($cible)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($source, 0, 0, $cible.Width, $cible.Height)
  $g.Dispose()
  $source.Dispose()
}
if ($Gris -or $Seuil -ge 0) {
  for ($y = 0; $y -lt $cible.Height; $y++) {
    for ($x = 0; $x -lt $cible.Width; $x++) {
      $p = $cible.GetPixel($x, $y)
      $l = [int](0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B)
      if ($Seuil -ge 0) { if ($l -ge $Seuil) { $l = 255 } else { $l = 0 } }
      $cible.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $l, $l, $l))
    }
  }
}
$temporaire = [System.IO.Path]::Combine($env:TEMP, "ocr-phase0-$([guid]::NewGuid()).png")
$cible.Save($temporaire, [System.Drawing.Imaging.ImageFormat]::Png)
$cible.Dispose()

# --- appel de Windows.Media.Ocr --------------------------------------------
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

$fichier = Attendre ([Windows.Storage.StorageFile]::GetFileFromPathAsync($temporaire)) ([Windows.Storage.StorageFile])
$flux = Attendre ($fichier.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decodeur = Attendre ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($flux)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Attendre ($decodeur.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$moteur = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $moteur) { throw "Aucun moteur OCR disponible pour les langues du profil." }

$resultat = Attendre ($moteur.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$lignes = @()
foreach ($ligne in $resultat.Lines) {
  $mots = @()
  foreach ($mot in $ligne.Words) {
    $mots += [pscustomobject]@{
      texte = $mot.Text
      x = [int]($mot.BoundingRect.X / $Zoom); y = [int]($mot.BoundingRect.Y / $Zoom)
      l = [int]($mot.BoundingRect.Width / $Zoom); h = [int]($mot.BoundingRect.Height / $Zoom)
    }
  }
  $lignes += [pscustomobject]@{ texte = $ligne.Text; mots = $mots }
}

Remove-Item $temporaire -Force

if ($Json) {
  [pscustomobject]@{ langue = $moteur.RecognizerLanguage.LanguageTag; lignes = $lignes } |
    ConvertTo-Json -Depth 6 -Compress
} else {
  "moteur : $($moteur.RecognizerLanguage.LanguageTag)"
  foreach ($ligne in $lignes) {
    $ligne.texte
    foreach ($mot in $ligne.mots) { "    [{0,4},{1,4} {2,3}x{3,3}] {4}" -f $mot.x, $mot.y, $mot.l, $mot.h, $mot.texte }
  }
}

