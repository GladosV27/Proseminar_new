param(
  [string]$OutputDirectory = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

function Color([int]$r, [int]$g, [int]$b) {
  return $r + 256 * $g + 65536 * $b
}

$C = @{
  Navy = Color 15 41 59
  Navy2 = Color 23 57 77
  Navy3 = Color 31 73 92
  Mint = Color 94 234 212
  MintDark = Color 15 148 136
  White = Color 248 250 252
  Soft = Color 203 213 225
  Muted = Color 148 163 184
  Amber = Color 251 191 36
  Coral = Color 251 113 133
  Blue = Color 96 165 250
  Green = Color 74 222 128
}

$msoFalse = 0
$msoTrue = -1
$msoTextOrientationHorizontal = 1
$msoShapeRectangle = 1
$msoShapeRoundedRectangle = 5
$msoShapeOval = 9
$msoConnectorStraight = 1
$ppLayoutBlank = 12
$ppAlignLeft = 1
$ppAlignCenter = 2
$ppSaveAsOpenXMLPresentation = 24
$ppSaveAsPDF = 32

$script:Ppt = $null
$script:Deck = $null

function Add-Text {
  param(
    $Slide,
    [double]$X,
    [double]$Y,
    [double]$W,
    [double]$H,
    [string]$Text,
    [double]$Size = 18,
    [int]$Color = $C.White,
    [bool]$Bold = $false,
    [int]$Align = $ppAlignLeft,
    [string]$Font = 'Calibri'
  )
  $s = $Slide.Shapes.AddTextbox($msoTextOrientationHorizontal, $X, $Y, $W, $H)
  $s.TextFrame.MarginLeft = 0
  $s.TextFrame.MarginRight = 0
  $s.TextFrame.MarginTop = 0
  $s.TextFrame.MarginBottom = 0
  $s.TextFrame.WordWrap = $msoTrue
  $s.TextFrame.TextRange.Text = $Text
  $s.TextFrame.TextRange.Font.Name = $Font
  $s.TextFrame.TextRange.Font.Size = $Size
  $s.TextFrame.TextRange.Font.Color.RGB = $Color
  $s.TextFrame.TextRange.Font.Bold = if ($Bold) { $msoTrue } else { $msoFalse }
  $s.TextFrame.TextRange.ParagraphFormat.Alignment = $Align
  $s.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 5
  return $s
}

function Add-Box {
  param(
    $Slide,
    [double]$X,
    [double]$Y,
    [double]$W,
    [double]$H,
    [int]$Fill = $C.Navy2,
    [int]$Line = $C.Navy3,
    [double]$Radius = 0
  )
  $shapeType = if ($Radius -gt 0) { $msoShapeRoundedRectangle } else { $msoShapeRectangle }
  $s = $Slide.Shapes.AddShape($shapeType, $X, $Y, $W, $H)
  $s.Fill.ForeColor.RGB = $Fill
  $s.Fill.Solid()
  $s.Line.ForeColor.RGB = $Line
  $s.Line.Weight = 1
  return $s
}

function Add-Card {
  param(
    $Slide,
    [double]$X,
    [double]$Y,
    [double]$W,
    [double]$H,
    [string]$Title,
    [string]$Body,
    [int]$Accent = $C.Mint
  )
  $null = Add-Box $Slide $X $Y $W $H $C.Navy2 $C.Navy3 1
  $bar = $Slide.Shapes.AddShape($msoShapeRectangle, $X, $Y, 6, $H)
  $bar.Fill.ForeColor.RGB = $Accent
  $bar.Fill.Solid()
  $bar.Line.Visible = $msoFalse
  $null = Add-Text $Slide ($X + 20) ($Y + 16) ($W - 34) 30 $Title 19 $C.White $true
  $null = Add-Text $Slide ($X + 20) ($Y + 53) ($W - 34) ($H - 65) $Body 15.5 $C.Soft $false
}

function Add-Pill {
  param($Slide, [double]$X, [double]$Y, [double]$W, [string]$Text, [int]$Fill = $C.Navy3, [int]$TextColor = $C.Mint)
  $null = Add-Box $Slide $X $Y $W 28 $Fill $Fill 1
  $null = Add-Text $Slide $X ($Y + 5) $W 18 $Text 11.5 $TextColor $true $ppAlignCenter
}

function Add-Arrow {
  param($Slide, [double]$X1, [double]$Y1, [double]$X2, [double]$Y2, [int]$Color = $C.Mint)
  $line = $Slide.Shapes.AddConnector($msoConnectorStraight, $X1, $Y1, $X2, $Y2)
  $line.Line.ForeColor.RGB = $Color
  $line.Line.Weight = 2.25
  $line.Line.EndArrowheadStyle = 3
  return $line
}

function New-Slide {
  param([string]$Kicker, [string]$Title, [int]$Number)
  $slide = $script:Deck.Slides.Add($script:Deck.Slides.Count + 1, $ppLayoutBlank)
  $slide.FollowMasterBackground = $msoFalse
  $bg = $slide.Background.Fill
  $bg.ForeColor.RGB = $C.Navy
  $bg.Solid()
  $null = Add-Text $slide 54 34 700 22 $Kicker.ToUpperInvariant() 11.5 $C.Mint $true
  $null = Add-Text $slide 54 64 790 52 $Title 30 $C.White $true $ppAlignLeft 'Century Schoolbook'
  $accent = $slide.Shapes.AddShape($msoShapeRectangle, 54, 121, 64, 3)
  $accent.Fill.ForeColor.RGB = $C.Mint
  $accent.Fill.Solid()
  $accent.Line.Visible = $msoFalse
  $null = Add-Text $slide 838 33 68 52 ("{0:00}" -f $Number) 31 $C.Navy3 $true $ppAlignCenter 'Century Schoolbook'
  $line = $slide.Shapes.AddShape($msoShapeRectangle, 54, 512, 852, 2)
  $line.Fill.ForeColor.RGB = $C.Navy3
  $line.Fill.Solid()
  $line.Line.Visible = $msoFalse
  $null = Add-Text $slide 54 518 650 14 'Proseminar »Let ChatGPT do the work?!« · SoSe 2026' 9.5 $C.Muted $false
  $null = Add-Text $slide 860 518 46 14 ("{0:00}" -f $Number) 9.5 $C.Muted $true $ppAlignCenter
  return $slide
}

function Add-Node {
  param($Slide, [double]$X, [double]$Y, [double]$D, [string]$Text, [int]$Fill, [int]$TextColor = $C.Navy)
  $n = $Slide.Shapes.AddShape($msoShapeOval, $X, $Y, $D, $D)
  $n.Fill.ForeColor.RGB = $Fill
  $n.Fill.Solid()
  $n.Line.Visible = $msoFalse
  $null = Add-Text $Slide $X ($Y + ($D / 2) - 9) $D 18 $Text 10.5 $TextColor $true $ppAlignCenter
}

try {
  $script:Ppt = New-Object -ComObject PowerPoint.Application
  $script:Deck = $script:Ppt.Presentations.Add()
  $script:Deck.PageSetup.SlideWidth = 960
  $script:Deck.PageSetup.SlideHeight = 540

  # 1 – Titel
  $s = $script:Deck.Slides.Add(1, $ppLayoutBlank)
  $s.FollowMasterBackground = $msoFalse
  $s.Background.Fill.ForeColor.RGB = $C.Navy
  $s.Background.Fill.Solid()
  $null = Add-Pill $s 58 42 218 'PROSEMINAR · SOSE 2026'
  $null = Add-Text $s 58 112 625 120 "Graph-RAG auf dem`nSmartphone" 46 $C.White $true $ppAlignLeft 'Century Schoolbook'
  $null = Add-Text $s 60 248 590 62 'Kann ein kuratierter Wissensgraph kleinen lokalen Sprachmodellen bei Multi-Hop-Fragen helfen?' 21 $C.Soft $false
  $null = Add-Text $s 60 450 590 24 'Sinan Yavuz Adigüzel · TU Dortmund' 13.5 $C.Muted $false
  $null = Add-Box $s 700 104 206 284 $C.Navy2 $C.Navy3 1
  $null = Add-Text $s 726 126 154 20 'LOKALER WISSENSGRAPH' 10.5 $C.Mint $true $ppAlignCenter
  $null = Add-Arrow $s 760 202 810 162 $C.Mint
  $null = Add-Arrow $s 760 202 810 248 $C.Mint
  $null = Add-Arrow $s 760 202 746 298 $C.Mint
  $null = Add-Arrow $s 810 162 858 214 $C.Mint
  Add-Node $s 738 181 44 'LLM' $C.Mint
  Add-Node $s 790 140 44 'Kant' $C.Blue $C.White
  Add-Node $s 790 230 44 'Hegel' $C.Amber $C.Navy
  Add-Node $s 724 292 44 'Werk' $C.Coral $C.White
  Add-Node $s 842 198 44 'Ort' $C.Green $C.Navy
  $null = Add-Text $s 724 348 158 24 'privat · offline · messbar' 11.5 $C.Soft $false $ppAlignCenter

  # 2 – Prozess
  $s = New-Slide 'Ausgangspunkt' 'Wie ich von der Idee zum Experiment kam' 2
  Add-Card $s 54 138 252 300 '1 · Meine Ausgangsfrage' "Wie kann ein kleines Sprachmodell auf meinem Smartphone verlässlicher mit lokalem Wissen arbeiten?" $C.Blue
  Add-Card $s 354 138 252 300 '2 · Iterativer Aufbau' "Ich habe Anforderungen formuliert, Varianten verglichen und das Projekt Schritt für Schritt mit Claude und ChatGPT im Chat weiterentwickelt." $C.Mint
  Add-Card $s 654 138 252 300 '3 · Meine Kontrolle' "Ich habe Entscheidungen getroffen, den Code getestet, Inhalte geprüft und übernehme die Verantwortung für Methode und Ergebnis." $C.Amber
  $null = Add-Arrow $s 307 288 350 288 $C.Mint
  $null = Add-Arrow $s 607 288 650 288 $C.Mint
  $null = Add-Text $s 54 460 852 32 'Idee → Dialogische Entwürfe → eigene Auswahl und Prüfung → Artefakt → Experiment' 15.5 $C.Soft $true $ppAlignCenter

  # 3 – Problem
  $s = New-Slide 'Motivation' 'Lokal ist privat – aber Wissen bleibt knapp' 3
  Add-Card $s 54 140 394 270 'On-Device-LLMs' "• lokale Inferenz ohne eigenes Backend`n• nach dem Modelldownload offline nutzbar`n• private Daten bleiben auf dem Gerät`n• kleine Modelle passen auf mobile Hardware" $C.Mint
  Add-Card $s 512 140 394 270 'Das Wissensproblem' "• lückenhaftes parametrisches Faktenwissen`n• plausible, aber falsche Antworten`n• begrenztes Kontext- und Speicherbudget`n• Multi-Hop-Fragen verlangen mehrere Fakten" $C.Coral
  $null = Add-Pill $s 283 440 394 'RAG lädt relevantes Wissen zur Laufzeit nach.' $C.Navy3 $C.White

  # 4 – Retrieval comparison
  $s = New-Slide 'Unabhängige Variable' 'Zwei Retrieval-Pipelines im Vergleich' 4
  Add-Card $s 54 138 382 290 'Vektor-RAG' "Semantische Ähnlichkeitssuche über isolierte Kurztexte.`n`nFaire Baseline: mehrsprachige dichte Embeddings, Top-k = 4." $C.Blue
  Add-Card $s 524 138 382 290 'Graph-RAG' "Traversal über einen kuratierten, typisierten Wissensgraphen.`n`nKontext: relevante Beziehungstripel plus dieselben Kurztexte." $C.Mint
  $null = Add-Text $s 68 444 824 40 'Wichtig: Der Messgraph wurde manuell kuratiert und eingefroren. Ich teste keine automatische Graphgewinnung aus rohen Wikipedia-Links.' 14.5 $C.Amber $true $ppAlignCenter
  $null = Add-Arrow $s 438 280 520 280 $C.Muted

  # 5 – RQ
  $s = New-Slide 'Forschungsfrage' 'Wann hilft explizite Struktur?' 5
  $null = Add-Box $s 54 136 852 120 $C.Navy2 $C.Mint 1
  $null = Add-Text $s 82 161 796 72 'Verbessert Retrieval über einen kuratierten, typisierten Wissensgraphen die Antwortqualität kleiner On-Device-LLMs gegenüber Vektor-RAG und einer kontextfreien Baseline – besonders bei Multi-Hop-Fragen und zu welchen Ressourcenkosten?' 19 $C.White $true $ppAlignCenter
  Add-Card $s 54 286 252 150 'H1 · RAG hilft' 'Beide RAG-Verfahren sollten die kontextfreie Baseline übertreffen.' $C.Blue
  Add-Card $s 354 286 252 150 'H2/H3 · Hop-Tiefe' 'Bei einfachen Fragen ähnlich; erwarteter Graph-Vorteil bei 2–3 Hops.' $C.Mint
  Add-Card $s 654 286 252 150 'H4/H5 · Trade-off' 'Weniger Konfabulation, aber mehr Kontext und höhere Kosten möglich.' $C.Amber

  # 6 – Design
  $s = New-Slide 'Studiendesign' 'Korpus, Fragen und Bedingungen' 6
  $null = Add-Pill $s 54 132 235 '75 Entitäten' $C.Navy3 $C.Mint
  $null = Add-Pill $s 302 132 235 '165 typisierte Kanten' $C.Navy3 $C.Mint
  $null = Add-Pill $s 550 132 175 '5 Communities' $C.Navy3 $C.Mint
  $null = Add-Pill $s 738 132 168 '40 Fragen' $C.Navy3 $C.Mint
  Add-Card $s 54 190 252 210 'Kernbedingungen' "B0 · ohne Kontext`nB1 · Vektor-RAG`nB2 · Graph-RAG" $C.Mint
  Add-Card $s 354 190 252 210 'Strata' "10 Einzeldokument/Direkt`n14 echte 2-Hop`n8 echte 3-Hop`n4 Vergleich · 4 unbeantwortbar" $C.Blue
  Add-Card $s 654 190 252 210 'Zusatzbedingungen' "B1b · gleiches Kontextbudget`nB3 · Graph + Vektor`n`nKontrolle und Exploration" $C.Amber
  $null = Add-Text $s 54 430 852 42 'Domäne: Deutscher Idealismus · Wikipedia-basierte Inhalte · manuell geprüfte, eingefrorene Repräsentation' 14 $C.Soft $false $ppAlignCenter

  # 7 – Fairness
  $s = New-Slide 'Messprotokoll' 'So halte ich Reihenfolge und Laufzeit fair' 7
  $steps = @(
    @{x=54; n='01'; t='Gleicher Prompt'; b='Modell, Temperatur und Antwortlimit bleiben konstant.'; c=$C.Blue},
    @{x=270; n='02'; t='Gegenbalanciert'; b='Fragen seeded gemischt; Bedingungen zyklisch rotiert.'; c=$C.Mint},
    @{x=486; n='03'; t='3 Wiederholungen'; b='Jeder Lauf bleibt mit Run-ID und Seed erhalten.'; c=$C.Amber},
    @{x=702; n='04'; t='Echte E2E-Zeit'; b='Retrieval und Generierung werden getrennt und gemeinsam gemessen.'; c=$C.Coral}
  )
  foreach ($st in $steps) {
    $null = Add-Box $s $st.x 154 184 264 $C.Navy2 $C.Navy3 1
    $null = Add-Pill $s ($st.x + 18) 172 48 $st.n $st.c $C.Navy
    $null = Add-Text $s ($st.x + 18) 222 148 30 $st.t 17 $C.White $true
    $null = Add-Text $s ($st.x + 18) 270 148 100 $st.b 14.2 $C.Soft $false
  }
  $null = Add-Text $s 54 450 852 34 '40 Fragen × 3 Kernbedingungen × 2 Modelle × 3 Wiederholungen = 720 Kern-Trials' 17 $C.Mint $true $ppAlignCenter

  # 8 – Metrics
  $s = New-Slide 'Auswertung' 'Mehr als nur ein Gewinner' 8
  Add-Card $s 54 142 252 280 'Antwortqualität' "• verblindete Doppelbewertung`n• korrekt / teilweise / falsch / Enthaltung`n• Cohens κ`n• Halluzinations- und Enthaltungsrate" $C.Blue
  Add-Card $s 354 142 252 280 'Retrieval-Diagnose' "• Evidenz-Recall`n• Evidenz-Präzision`n• Goldpfad vollständig?`n• Retrieval- oder Generierungsfehler?" $C.Mint
  Add-Card $s 654 142 252 280 'Ressourcen' "• End-to-End-Latenz`n• Retrievalzeit`n• Generierungszeit`n• Kontext- und Modellgröße" $C.Amber
  $null = Add-Text $s 54 450 852 36 'Primärvergleich: Graph-RAG vs. Vektor-RAG auf Multi-Hop-Fragen · Effektstärke + 95-%-Konfidenzintervall' 14.5 $C.Soft $true $ppAlignCenter

  # 9 – App
  $s = New-Slide 'Artefakt' 'Graph-RAG Lab ist mein Messinstrument' 9
  $null = Add-Box $s 54 138 548 322 $C.Navy2 $C.Navy3 1
  $null = Add-Box $s 72 156 118 286 $C.Navy3 $C.Navy3 1
  $null = Add-Text $s 87 176 88 42 "Graph-RAG`nLab" 15.5 $C.White $true $ppAlignCenter
  $nav = "Übersicht`n`nExplorer`n`nAssistent`n`nExperiment`n`nBewerten`n`nErgebnisse"
  $null = Add-Text $s 88 238 86 180 $nav 11.5 $C.Soft $false
  $null = Add-Text $s 216 170 350 30 'Experiment · Q22 · 3-Hop' 18 $C.White $true
  $null = Add-Pill $s 216 214 92 'Baseline' $C.Navy3 $C.Coral
  $null = Add-Pill $s 318 214 92 'Vektor' $C.Navy3 $C.Blue
  $null = Add-Pill $s 420 214 92 'Graph' $C.Navy3 $C.Mint
  $null = Add-Box $s 216 260 350 132 $C.Navy $C.Navy3 1
  $null = Add-Text $s 232 276 316 90 "Frage → Retrieval → lokales LLM`n`nAntwort, Kontext, Evidenzpfad und Laufzeiten bleiben vollständig sichtbar." 14 $C.Soft $false
  Add-Card $s 638 138 268 322 'Für die Live-Demo' "1. Dieselbe Frage in B0, B1 und B2`n`n2. Retrieval-Kontext und Subgraph öffnen`n`n3. Messwerte vergleichen`n`n4. Rohdaten exportieren" $C.Mint

  # 10 – Limits & transparency
  $s = New-Slide 'Einordnung' 'Grenzen und Transparenz' 10
  Add-Card $s 54 140 404 272 'Grenzen' "• eine Domäne und eine Sprache`n• zwei kleine Modelle, 40 Fragen`n• kuratierter statt automatisch erzeugter Graph`n• Pipelinevergleich: Auswahl und Darstellungsform ändern sich`n• explorativer Nachweis, kein universeller Benchmark" $C.Coral
  Add-Card $s 502 140 404 272 'Mein KI-Einsatz' "Ich nutzte Claude und ChatGPT ausschließlich dialogisch. Die Modelle erzeugten umfangreiche Code- und Textvorschläge. Ich gab Ziele vor, wählte aus, testete, prüfte und dokumentiere die verbleibenden Unsicherheiten." $C.Mint
  $null = Add-Text $s 54 442 852 42 'Nächster Schritt: Hauptläufe → verblindete Bewertung → vollständige Veröffentlichung auch von Null- oder Negativbefunden' 15 $C.White $true $ppAlignCenter

  if (-not (Test-Path -LiteralPath $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
  }
  $pptxPath = Join-Path $OutputDirectory 'Praesentation_Graph-RAG_korrigiert.pptx'
  $pdfPath = Join-Path $OutputDirectory 'Praesentation_Graph-RAG_korrigiert.pdf'
  $previewPath = Join-Path $OutputDirectory 'Praesentation_Graph-RAG_Vorschau'
  $script:Deck.SaveAs($pptxPath, $ppSaveAsOpenXMLPresentation)
  $script:Deck.SaveAs($pdfPath, $ppSaveAsPDF)
  $script:Deck.Export($previewPath, 'PNG', 1600, 900)
  Write-Output $pptxPath
  Write-Output $pdfPath
  Write-Output $previewPath
}
finally {
  if ($script:Deck -ne $null) {
    try { $script:Deck.Close() } catch { }
    try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($script:Deck) } catch { }
  }
  if ($script:Ppt -ne $null) {
    try { $script:Ppt.Quit() } catch { }
    try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($script:Ppt) } catch { }
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
