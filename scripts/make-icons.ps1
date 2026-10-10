# Draws the TRUE HOOF app icon (two claws seen sole-on, brass on dark leather) at every size
# the PWA and the Android launcher need. Windows-only (System.Drawing); outputs are committed,
# so this only needs re-running when the icon design changes.
#   powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot

function New-Icon([int]$size, [string]$path, [double]$scale = 1.0, [bool]$transparent = $false, [bool]$round = $false) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $bg = [System.Drawing.Color]::FromArgb(255, 0x1d, 0x16, 0x11)
  if (-not $transparent) {
    $b = New-Object System.Drawing.SolidBrush $bg
    if ($round) { $g.FillEllipse($b, 0, 0, $size, $size) } else { $g.FillRectangle($b, 0, 0, $size, $size) }
  }
  # Design space is 100x100; $scale shrinks the motif toward the centre (maskable / adaptive safe zones).
  $u = $size / 100.0 * $scale
  $o = ($size - 100 * $u) / 2
  $g.TranslateTransform($o, $o)
  $g.ScaleTransform($u, $u)

  $brass = [System.Drawing.Color]::FromArgb(255, 0xd6, 0xa6, 0x56)
  $horn  = [System.Drawing.Color]::FromArgb(255, 0xf1, 0xe7, 0xd0)
  $dark  = [System.Drawing.Color]::FromArgb(255, 0x8a, 0x5a, 0x2a)
  $hornB = New-Object System.Drawing.SolidBrush $horn
  $wallP = New-Object System.Drawing.Pen $brass, 4.5
  $wallP.LineJoin = 'Round'
  $soleP = New-Object System.Drawing.Pen $dark, 2.2

  # Each claw: a teardrop, heel bulb at the top, toe pointing down, inner edge straight.
  foreach ($side in -1, 1) {
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $x0 = 50 + $side * 3          # inner edge (interdigital gap)
    $x1 = 50 + $side * 30         # outer wall
    $gp.AddBezier([single]$x0, 22, [single]($x0 + $side * 12), 14, [single]($x1 + $side * 2), 18, [single]$x1, 40)
    $gp.AddBezier([single]$x1, 40, [single]($x1 - $side * 1), 62, [single]($x0 + $side * 10), 82, [single]($x0 + $side * 1), 86)
    $gp.AddLine([single]($x0 + $side * 1), 86, [single]$x0, 22)
    $gp.CloseFigure()
    $g.FillPath($hornB, $gp)
    $g.DrawPath($wallP, $gp)
    # Sole line hint: the dished inner edge.
    $g.DrawBezier($soleP, [single]($x0 + $side * 7), 34, [single]($x0 + $side * 14), 46, [single]($x0 + $side * 13), 64, [single]($x0 + $side * 7), 76)
  }
  $g.Dispose()
  New-Item -ItemType Directory -Force (Split-Path -Parent $path) | Out-Null
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# PWA / browser icons
$ic = Join-Path $root 'icons'
New-Icon 192 "$ic\icon-192.png"
New-Icon 512 "$ic\icon-512.png"
New-Icon 512 "$ic\icon-maskable-512.png" 0.72
New-Icon 180 "$ic\apple-touch-icon.png"
New-Icon 32  "$ic\favicon-32.png"

# Android launcher icons (only if the Capacitor project exists)
$res = Join-Path $root 'android\app\src\main\res'
if (Test-Path $res) {
  $dens = @{ mdpi = 1.0; hdpi = 1.5; xhdpi = 2.0; xxhdpi = 3.0; xxxhdpi = 4.0 }
  foreach ($d in $dens.Keys) {
    $k = $dens[$d]
    New-Icon ([int](48 * $k))  "$res\mipmap-$d\ic_launcher.png"
    New-Icon ([int](48 * $k))  "$res\mipmap-$d\ic_launcher_round.png" 1.0 $false $true
    # Adaptive foreground: 108dp canvas, motif inside the 66dp safe zone; background colour is set in XML.
    New-Icon ([int](108 * $k)) "$res\mipmap-$d\ic_launcher_foreground.png" 0.6 $true
  }
  # Launch splash: replace Capacitor's default artwork with the icon on the game's background.
  Get-ChildItem $res -Recurse -Filter splash.png | ForEach-Object {
    $img = [System.Drawing.Image]::FromFile($_.FullName); $w = $img.Width; $h = $img.Height; $img.Dispose()
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(255, 0x1d, 0x16, 0x11))
    $side = [int]([Math]::Min($w, $h) * 0.35)
    $tmp = Join-Path $env:TEMP 'truehoof-splash-icon.png'
    New-Icon $side $tmp 1.0 $true
    $ico = [System.Drawing.Image]::FromFile($tmp)
    $g.DrawImage($ico, [int](($w - $side) / 2), [int](($h - $side) / 2), $side, $side)
    $ico.Dispose(); $g.Dispose()
    $bmp.Save($_.FullName, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  }
}
Write-Host 'Icons written.'
