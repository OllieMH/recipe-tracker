# Generates the app icons in public/icons/ and public/favicon.svg: a white K on the
# navy header colour with a berry bar under it (colours from src/index.css).
# Windows only (System.Drawing). Run from the repo root:  pwsh scripts/make-icons.ps1
# Output is committed, so this only needs re-running when the design changes.

Add-Type -AssemblyName System.Drawing

$navyHex = '#14283A'; $berryHex = '#A81F3F'; $whiteHex = '#FDFDFC'
$navy  = [System.Drawing.ColorTranslator]::FromHtml($navyHex)
$berry = [System.Drawing.ColorTranslator]::FromHtml($berryHex)
$white = [System.Drawing.ColorTranslator]::FromHtml($whiteHex)
$inv = [System.Globalization.CultureInfo]::InvariantCulture

$root = Join-Path $PSScriptRoot '..'
$outDir = Join-Path $root 'public\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Where the K and the bar go on a square canvas. $kHeight = height of the K as a
# fraction of the canvas.
function Get-Layout([double]$size, [double]$kHeight) {
  $family = New-Object System.Drawing.FontFamily 'Segoe UI'
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $origin = New-Object System.Drawing.PointF 0, 0
  $path.AddString('K', $family, [int][System.Drawing.FontStyle]::Bold, 100, $origin, [System.Drawing.StringFormat]::GenericTypographic)
  $b = $path.GetBounds()

  $scale = ($size * $kHeight) / $b.Height
  $kW = $b.Width * $scale
  $kH = $b.Height * $scale
  $gap = $size * 0.055
  $barH = $size * 0.04
  $top = ($size - ($kH + $gap + $barH)) / 2
  $left = ($size - $kW) / 2

  $m = New-Object System.Drawing.Drawing2D.Matrix
  $m.Translate(-$b.X, -$b.Y)
  $m.Scale($scale, $scale, [System.Drawing.Drawing2D.MatrixOrder]::Append)
  $m.Translate($left, $top, [System.Drawing.Drawing2D.MatrixOrder]::Append)
  $path.Transform($m)

  $barW = $kW * 0.6
  return @{
    Path = $path; BarX = ($size - $barW) / 2; BarY = $top + $kH + $gap; BarW = $barW; BarH = $barH
  }
}

# $kHeight for maskable icons stays inside the central safe zone (phones crop them to a circle).
function New-Icon([int]$size, [double]$kHeight, [string]$file) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear($navy) # full bleed, no transparency: iOS and Android apply their own mask

  $l = Get-Layout $size $kHeight
  $g.FillPath((New-Object System.Drawing.SolidBrush $white), $l.Path)

  $r = $l.BarH
  $bar = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bar.AddArc($l.BarX, $l.BarY, $r, $r, 90, 180)
  $bar.AddArc($l.BarX + $l.BarW - $r, $l.BarY, $r, $r, 270, 180)
  $bar.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush $berry), $bar)

  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "wrote $file ($size x $size)"
}

# The browser-tab icon as an SVG: the K's outline written out as a path, so it
# needs no font. The K is a bit larger here because it is shown tiny.
function New-FaviconSvg([string]$file) {
  $l = Get-Layout 64 0.60
  # turn any curve segments into fine straight ones (0.02 units on a 64 unit canvas)
  $l.Path.Flatten((New-Object System.Drawing.Drawing2D.Matrix), 0.02)
  $pts = $l.Path.PathPoints
  $types = $l.Path.PathTypes
  $d = ''
  for ($i = 0; $i -lt $pts.Length; $i++) {
    $kind = $types[$i] -band 7
    $x = $pts[$i].X.ToString('0.##', $inv); $y = $pts[$i].Y.ToString('0.##', $inv)
    if ($kind -eq 0) { $d += "M$x $y" }
    elseif ($kind -eq 1) { $d += "L$x $y" }
    else { throw 'K outline unexpectedly contains curves' }
    if ($types[$i] -band 0x80) { $d += 'Z' }
  }
  $bx = $l.BarX.ToString('0.##', $inv); $by = $l.BarY.ToString('0.##', $inv)
  $bw = $l.BarW.ToString('0.##', $inv); $bh = $l.BarH.ToString('0.##', $inv)
  $rx = ($l.BarH / 2).ToString('0.##', $inv)
  $svg = @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="$navyHex"/>
  <path d="$d" fill="$whiteHex"/>
  <rect x="$bx" y="$by" width="$bw" height="$bh" rx="$rx" fill="$berryHex"/>
</svg>
"@
  Set-Content -Path $file -Value $svg -Encoding utf8
  Write-Host "wrote $file"
}

New-Icon 192 0.50 (Join-Path $outDir 'icon-192.png')
New-Icon 512 0.50 (Join-Path $outDir 'icon-512.png')
New-Icon 512 0.34 (Join-Path $outDir 'icon-maskable-512.png') # inside the 80 % safe zone
New-Icon 180 0.50 (Join-Path $outDir 'apple-touch-icon.png')
New-FaviconSvg (Join-Path $root 'public\favicon.svg')
