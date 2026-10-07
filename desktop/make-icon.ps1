# Draws the Strata logo (three slanted bars) on a dark tile and writes a multi-size icon.ico.
# Only needs to be re-run if you want to change the icon.
Add-Type -AssemblyName System.Drawing
$sizes = 16, 20, 24, 32, 40, 48, 64, 128, 256
$pngs = @()
foreach ($S in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $S, $S
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'
  $k = $S / 32.0
  # rounded dark tile
  $r = 7 * $k; $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90); $path.AddArc($S - 2 * $r - 0.5, 0, 2 * $r, 2 * $r, 270, 90)
  $path.AddArc($S - 2 * $r - 0.5, $S - 2 * $r - 0.5, 2 * $r, 2 * $r, 0, 90); $path.AddArc(0, $S - 2 * $r - 0.5, 2 * $r, 2 * $r, 90, 90); $path.CloseFigure()
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.PointF]::new(0, 0)), ([System.Drawing.PointF]::new(0, $S)), ([System.Drawing.Color]::FromArgb(255, 34, 36, 44)), ([System.Drawing.Color]::FromArgb(255, 16, 17, 21))
  $g.FillPath($bg, $path)
  # bars: same geometry as the in-app logo, scaled to 78% and centered
  $s = 0.78; $off = (1 - $s) * 16
  $m = New-Object System.Drawing.Drawing2D.Matrix
  $m.Translate($off * $k + 0.4 * $k, $off * $k); $m.Scale($s * $k, $s * $k); $m.Shear(-0.2126, 0); $m.Translate(4, 0)
  $g.Transform = $m
  foreach ($b in @(@(2, 5, '#ff7849'), @(4, 13, '#35d6b4'), @(6, 21, '#a08aff'))) {
    $bp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $x = $b[0]; $y = $b[1]; $w = 22; $h = 6; $rr = 3
    $bp.AddArc($x, $y, 2 * $rr, $h, 90, 180); $bp.AddArc($x + $w - 2 * $rr, $y, 2 * $rr, $h, 270, 180); $bp.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($b[2]))), $bp)
  }
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs += , $ms.ToArray()
}
# ICO container with PNG-compressed entries
$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $out
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $S = $sizes[$i]; $d = $pngs[$i]
  $bw.Write([byte]($S % 256)); $bw.Write([byte]($S % 256)); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$d.Length); $bw.Write([UInt32]$offset)
  $offset += $d.Length
}
foreach ($d in $pngs) { $bw.Write($d) }
[System.IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'icon.ico'), $out.ToArray())
"icon.ico written ($($out.Length) bytes)"
