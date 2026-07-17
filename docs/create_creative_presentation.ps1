param(
  [string]$OutputDirectory = $PSScriptRoot,
  [string]$HeroPath = 'D:\Downloads\Proseminar_Fable-claude-ai-journalism-experiment-app-pm9fkb (1)\Proseminar_Fable-claude-ai-journalism-experiment-app-pm9fkb\docs\assets\graphrag-hero.png'
)

$ErrorActionPreference = 'Stop'

function Rgb([int]$r, [int]$g, [int]$b) { $r + 256 * $g + 65536 * $b }

$C = @{
  Ink = Rgb 11 31 46
  Navy = Rgb 15 41 59
  Deep = Rgb 9 24 37
  Surface = Rgb 25 59 78
  Teal = Rgb 94 234 212
  Ivory = Rgb 248 250 252
  Soft = Rgb 203 213 225
  Muted = Rgb 148 163 184
  Blue = Rgb 96 165 250
  Amber = Rgb 251 191 36
  Coral = Rgb 251 113 133
}

$msoFalse = 0; $msoTrue = -1
$msoTextOrientationHorizontal = 1
$msoShapeRectangle = 1; $msoShapeOval = 9
$msoConnectorStraight = 1
$ppLayoutBlank = 12; $ppAlignLeft = 1; $ppAlignCenter = 2; $ppAlignRight = 3
$ppSaveAsOpenXMLPresentation = 24; $ppSaveAsPDF = 32

function Add-Text {
  param($Slide,[double]$X,[double]$Y,[double]$W,[double]$H,[string]$Text,[double]$Size=20,[int]$Color=$C.Ivory,[bool]$Bold=$false,[int]$Align=$ppAlignLeft,[string]$Font='Calibri')
  $s=$Slide.Shapes.AddTextbox($msoTextOrientationHorizontal,$X,$Y,$W,$H)
  $s.TextFrame.MarginLeft=0; $s.TextFrame.MarginRight=0; $s.TextFrame.MarginTop=0; $s.TextFrame.MarginBottom=0
  $s.TextFrame.WordWrap=$msoTrue; $s.TextFrame.TextRange.Text=$Text
  $s.TextFrame.TextRange.Font.Name=$Font; $s.TextFrame.TextRange.Font.Size=$Size
  $s.TextFrame.TextRange.Font.Color.RGB=$Color; $s.TextFrame.TextRange.Font.Bold=if($Bold){$msoTrue}else{$msoFalse}
  $s.TextFrame.TextRange.ParagraphFormat.Alignment=$Align
  return $s
}

function Add-Rect {
  param($Slide,[double]$X,[double]$Y,[double]$W,[double]$H,[int]$Fill,[int]$Line=$Fill,[double]$Transparency=0)
  $s=$Slide.Shapes.AddShape($msoShapeRectangle,$X,$Y,$W,$H)
  $s.Fill.ForeColor.RGB=$Fill; $s.Fill.Solid(); $s.Fill.Transparency=if($Transparency -gt 1){$Transparency/100}else{$Transparency}
  $s.Line.ForeColor.RGB=$Line; $s.Line.Weight=0.75
  return $s
}

function Add-Line {
  param($Slide,[double]$X1,[double]$Y1,[double]$X2,[double]$Y2,[int]$Color=$C.Teal,[double]$Weight=2,[bool]$Arrow=$false)
  $l=$Slide.Shapes.AddConnector($msoConnectorStraight,$X1,$Y1,$X2,$Y2)
  $l.Line.ForeColor.RGB=$Color; $l.Line.Weight=$Weight
  if($Arrow){$l.Line.EndArrowheadStyle=3}
  return $l
}

function Add-Dot {
  param($Slide,[double]$X,[double]$Y,[double]$D,[int]$Fill=$C.Teal)
  $s=$Slide.Shapes.AddShape($msoShapeOval,$X,$Y,$D,$D)
  $s.Fill.ForeColor.RGB=$Fill; $s.Fill.Solid(); $s.Line.Visible=$msoFalse
  return $s
}

function New-Slide {
  param([string]$Kicker,[string]$Title,[int]$Number,[bool]$Dark=$true)
  $s=$script:Deck.Slides.Add($script:Deck.Slides.Count+1,$ppLayoutBlank)
  $s.FollowMasterBackground=$msoFalse
  $s.Background.Fill.ForeColor.RGB=if($Dark){$C.Navy}else{$C.Ivory}; $s.Background.Fill.Solid()
  $ink=if($Dark){$C.Ivory}else{$C.Ink}; $sub=if($Dark){$C.Teal}else{$C.Navy}
  $footerColor=if($Dark){$C.Muted}else{$C.Navy}
  $null=Add-Text $s 56 38 550 18 $Kicker.ToUpperInvariant() 11.5 $sub $true
  $null=Add-Text $s 56 72 840 58 $Title 35 $ink $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Rect $s 56 140 76 3 $C.Teal
  $null=Add-Text $s 56 516 600 14 'Graph-RAG auf dem Smartphone · Proseminar SoSe 2026' 9.5 $footerColor $false
  $null=Add-Text $s 870 516 34 14 ("{0:00}" -f $Number) 9.5 $footerColor $true $ppAlignRight
  return $s
}

$script:Ppt=$null; $script:Deck=$null
try {
  $script:Ppt=New-Object -ComObject PowerPoint.Application
  $script:Deck=$script:Ppt.Presentations.Add(); $script:Deck.PageSetup.SlideWidth=960; $script:Deck.PageSetup.SlideHeight=540
  $hero=$HeroPath

  # 1 — minimaler Aufschlag mit maßgeschneidertem Motiv
  $s=$script:Deck.Slides.Add(1,$ppLayoutBlank); $s.FollowMasterBackground=$msoFalse
  $s.Background.Fill.ForeColor.RGB=$C.Ink; $s.Background.Fill.Solid()
  $pic=$s.Shapes.AddPicture($hero,$msoFalse,$msoTrue,0,0,960,540)
  $shade=Add-Rect $s 0 0 566 540 $C.Ink $C.Ink 10
  $null=Add-Text $s 62 52 310 18 'PROSEMINAR · SOSE 2026' 11.5 $C.Teal $true
  $null=Add-Text $s 62 132 490 190 "Graph-RAG`nauf dem Smartphone" 52 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Text $s 64 346 418 56 'Hilft explizite Struktur kleinen lokalen Sprachmodellen bei Multi-Hop-Fragen?' 20 $C.Soft $false
  $null=Add-Rect $s 64 420 88 3 $C.Teal
  $null=Add-Text $s 64 454 360 18 'Sinan Yavuz Adigüzel · TU Dortmund' 12.5 $C.Muted $false

  # 2 — Spannung
  $s=New-Slide 'Ausgangspunkt' 'Lokale KI schützt Daten – aber weiß nicht alles.' 2
  $null=Add-Rect $s 50 66 850 84 $C.Navy $C.Navy
  $null=Add-Text $s 56 72 840 58 'Privat heisst nicht allwissend.' 35 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Rect $s 56 140 76 3 $C.Teal
  $null=Add-Text $s 58 184 355 62 'PRIVAT' 46 $C.Teal $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Text $s 58 250 360 92 'klein · lokal · nach dem Download offline' 21 $C.Soft $false
  $null=Add-Text $s 535 184 355 62 'LÜCKENHAFT' 42 $C.Amber $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Text $s 535 250 355 92 'Faktenwissen fehlt. Antworten können plausibel klingen und dennoch falsch sein.' 21 $C.Soft $false
  $null=Add-Line $s 480 185 480 360 $C.Muted 1
  $null=Add-Text $s 186 412 590 48 'Die zentrale Frage lautet deshalb nicht: Wie groß ist das Modell? Sondern: Welches Wissen erhält es im richtigen Moment?' 19 $C.Ivory $true $ppAlignCenter

  # 3 — ein Diagramm, das die methodische Idee wirklich erklärt
  # 3 — Theorie
  $s=New-Slide 'Theorie' 'RAG ergänzt das Gedächtnis des Modells zur Laufzeit.' 3
  $null=Add-Rect $s 50 66 850 84 $C.Navy $C.Navy
  $null=Add-Text $s 56 72 840 58 'RAG erweitert Modellwissen.' 35 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Rect $s 56 140 76 3 $C.Teal
  $null=Add-Text $s 86 193 250 32 'PARAMETRISCHES WISSEN' 15 $C.Blue $true
  $null=Add-Text $s 86 244 230 104 'Was das Modell bereits in seinen Gewichten gelernt hat.' 23 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Line $s 376 282 528 282 $C.Teal 2 $true
  $null=Add-Text $s 388 238 126 26 '+ Kontext' 18 $C.Teal $true $ppAlignCenter
  $null=Add-Text $s 610 193 230 32 'RETRIEVAL-AUGMENTED GENERATION' 15 $C.Amber $true
  $null=Add-Text $s 610 244 236 104 'Relevantes, überprüfbares Wissen wird für eine konkrete Frage bereitgestellt.' 23 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Text $s 166 434 628 34 'Meine Arbeit prüft, ob die Form dieses Kontexts bei mehrstufigen Fragen einen Unterschied macht.' 18 $C.Soft $false $ppAlignCenter

  # 4 — Beziehungen im Kontext
  $s=New-Slide 'Theorie' 'Graph-RAG macht Beziehungen sichtbar.' 4
  $null=Add-Text $s 78 184 270 24 'Vektor-RAG' 22 $C.Blue $true
  $null=Add-Text $s 78 221 286 112 "[Hegel]`n[Berlin]`n[Schelling]" 23 $C.Soft $false
  $null=Add-Text $s 78 350 270 28 'relevante Schnipsel – aber getrennt' 15 $C.Muted $false
  $null=Add-Line $s 434 250 515 250 $C.Muted 2 $true
  $null=Add-Text $s 585 184 280 24 'Graph-RAG' 22 $C.Teal $true
  $null=Add-Line $s 618 270 690 270 $C.Teal 2 $true
  $null=Add-Line $s 722 270 794 270 $C.Teal 2 $true
  $null=Add-Dot $s 586 248 42 $C.Teal
  $null=Add-Dot $s 690 248 42 $C.Blue
  $null=Add-Dot $s 794 248 42 $C.Amber
  $null=Add-Text $s 569 304 76 38 'Hegel' 14 $C.Ivory $true $ppAlignCenter
  $null=Add-Text $s 670 304 82 38 'Schelling' 14 $C.Ivory $true $ppAlignCenter
  $null=Add-Text $s 772 304 86 38 'Kierkegaard' 13 $C.Ivory $true $ppAlignCenter
  $null=Add-Text $s 548 364 330 42 'Die Kette bleibt im Kontext sichtbar.' 16 $C.Soft $false $ppAlignCenter
  $null=Add-Text $s 150 443 660 34 'Das ist die Multi-Hop-Hypothese: Nicht mehr Text allein, sondern besser verbundene Evidenz.' 18 $C.Ivory $true $ppAlignCenter

  # 4 — Forschungsfrage als zentrales Objekt
  $s=New-Slide 'Forschungsfrage und Hypothesen' 'Wann lohnt sich ein Wissensgraph?' 5
  $null=Add-Text $s 126 182 708 102 'Verbessert Graph-RAG auf einem kuratierten, typisierten Wissensgraphen die Antwortqualität kleiner On-Device-LLMs gegenüber Vektor-RAG und einer kontextfreien Baseline?' 24 $C.Ivory $true $ppAlignCenter
  $null=Add-Rect $s 176 305 606 2 $C.Teal
  $null=Add-Text $s 156 336 648 26 'H1  RAG schlägt die Baseline · H2  bei einfachen Fragen annähernd gleich · H3  Graph-RAG profitiert bei 2–3 Hops' 15.5 $C.Soft $false $ppAlignCenter
  $null=Add-Text $s 228 390 504 26 'H4  bessere Enthaltung möglich · H5  mehr Kontext und höhere End-to-End-Kosten erwartet' 15.5 $C.Soft $false $ppAlignCenter

  # 5 — Design ohne Dashboard-Optik
  $s=New-Slide 'Modellierung' 'Ein kleines, kontrolliertes Wissensuniversum.' 6
  $null=Add-Text $s 68 180 205 94 '75`nKnoten' 37 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Text $s 68 286 220 36 '165 typisierte Beziehungen' 16 $C.Muted $false
  $null=Add-Rect $s 58 170 235 164 $C.Navy $C.Navy
  $null=Add-Text $s 68 180 205 52 '75' 37 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Text $s 68 230 205 28 'Knoten' 18 $C.Ivory $true
  $null=Add-Text $s 68 286 220 36 '165 typisierte Beziehungen' 16 $C.Muted $false
  $null=Add-Line $s 316 182 316 398 $C.Navy 1
  $null=Add-Text $s 356 180 200 94 '40`nFragen' 37 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Text $s 356 286 258 36 '10 Direkt · 14 Zwei-Hop · 8 Drei-Hop' 16 $C.Muted $false
  $null=Add-Rect $s 346 170 275 164 $C.Navy $C.Navy
  $null=Add-Text $s 356 180 200 52 '40' 37 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Text $s 356 230 205 28 'Fragen' 18 $C.Ivory $true
  $null=Add-Text $s 356 286 258 36 '10 Direkt · 14 Zwei-Hop · 8 Drei-Hop' 16 $C.Muted $false
  $null=Add-Line $s 642 182 642 398 $C.Navy 1
  $null=Add-Text $s 682 184 190 28 'Kernvergleich' 20 $C.Teal $true
  $null=Add-Text $s 682 234 190 105 "B0  kein Kontext`nB1  Vektor-RAG`nB2  Graph-RAG" 20 $C.Soft $false
  $null=Add-Text $s 148 438 664 32 'Domäne: Deutscher Idealismus · Wikipedia-basierte Inhalte · manuell kuratierter und eingefrorener Messgraph' 15 $C.Ivory $true $ppAlignCenter

  # 6 — Fairness als Ablauf
  $s=New-Slide 'Experiment' 'Die Reihenfolge darf das Ergebnis nicht prägen.' 7
  $null=Add-Rect $s 50 66 850 84 $C.Navy $C.Navy
  $null=Add-Text $s 56 72 840 58 'Reihenfolge darf nicht verzerren.' 35 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Rect $s 56 140 76 3 $C.Teal
  $null=Add-Rect $s 50 150 850 130 $C.Navy $C.Navy
  $null=Add-Line $s 140 302 820 302 $C.Muted 2
  $items=@(
    @{x=140;n='Gleicher Prompt';t='Modell, Temperatur und Antwortlimit bleiben konstant.';c=$C.Blue},
    @{x=365;n='Seed + Rotation';t='Fragen werden gemischt; Bedingungen rotieren zyklisch.';c=$C.Teal},
    @{x=590;n='3 Wiederholungen';t='Jeder Lauf bleibt getrennt gespeichert.';c=$C.Amber},
    @{x=815;n='E2E-Zeit';t='Retrieval, Vorbereitung und Generierung werden sichtbar.';c=$C.Coral}
  )
  foreach($i in $items){
    $null=Add-Dot $s ($i.x-18) 284 36 $i.c
    $null=Add-Text $s ($i.x-72) 218 144 36 $i.n 15 $C.Ivory $true $ppAlignCenter
    $null=Add-Text $s ($i.x-90) 338 180 70 $i.t 13.5 $C.Soft $false $ppAlignCenter
  }
  $null=Add-Text $s 185 440 590 34 '40 Fragen × 3 Bedingungen × 2 Modelle × 3 Wiederholungen = 720 Kern-Trials' 17 $C.Teal $true $ppAlignCenter

  # 7 — Resultate als Fragelogik
  $s=New-Slide 'Auswertung' 'Ein Ergebnis muss erklärbar sein.' 8
  $null=Add-Text $s 82 205 225 38 'Antworten' 28 $C.Blue $true '1' 'Century Schoolbook'
  $null=Add-Text $s 82 255 225 88 'Korrekt? Teilweise? Enthaltung? Verblindete Doppelbewertung.' 18 $C.Soft $false
  $null=Add-Text $s 368 205 225 38 'Evidenz' 28 $C.Teal $true '1' 'Century Schoolbook'
  $null=Add-Text $s 368 255 225 88 'War der Goldpfad überhaupt im Kontext – oder scheiterte das Retrieval?' 18 $C.Soft $false
  $null=Add-Text $s 654 205 225 38 'Ressourcen' 28 $C.Amber $true '1' 'Century Schoolbook'
  $null=Add-Text $s 654 255 225 88 'p50/p95 der End-to-End-Zeit, Retrievalzeit und Kontextgröße.' 18 $C.Soft $false
  $null=Add-Text $s 166 434 628 36 'So kann ein Nullbefund genauso aufschlussreich sein wie ein Graph-RAG-Vorteil.' 18 $C.Ivory $true $ppAlignCenter

  # 8 — Artefakt
  # 9 — Umsetzung
  $s=New-Slide 'Umsetzung' 'Die App verbindet Korpus, Retrieval und lokales Modell.' 9
  $null=Add-Rect $s 50 66 850 84 $C.Navy $C.Navy
  $null=Add-Text $s 56 72 840 58 'Die App macht den Vergleich messbar.' 35 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Rect $s 56 140 76 3 $C.Teal
  $null=Add-Line $s 198 300 346 300 $C.Teal 2 $true
  $null=Add-Line $s 452 300 600 300 $C.Teal 2 $true
  $null=Add-Line $s 706 300 826 300 $C.Teal 2 $true
  $null=Add-Dot $s 164 278 44 $C.Blue
  $null=Add-Dot $s 418 278 44 $C.Teal
  $null=Add-Dot $s 672 278 44 $C.Amber
  $null=Add-Dot $s 826 278 44 $C.Coral
  $null=Add-Text $s 110 344 152 40 'Eingefrorener Korpus' 16 $C.Ivory $true $ppAlignCenter
  $null=Add-Text $s 364 344 152 40 'Vektor- und Graphindex' 16 $C.Ivory $true $ppAlignCenter
  $null=Add-Text $s 618 344 152 40 'WebGPU-LLM im Browser' 16 $C.Ivory $true $ppAlignCenter
  $null=Add-Text $s 780 344 136 40 'Export und Bewertung' 16 $C.Ivory $true $ppAlignCenter
  $null=Add-Text $s 168 435 624 34 'Kein eigenes Backend: Messdaten, Nutzerwissen und Modellinferenz bleiben auf dem Gerät.' 18 $C.Soft $false $ppAlignCenter

  # 10 — Hürden
  $s=New-Slide 'Umsetzung und Hürden' 'Eine faire Studie entsteht nicht nur durch mehr Code.' 10
  $null=Add-Rect $s 50 66 850 84 $C.Navy $C.Navy
  $null=Add-Text $s 56 72 840 58 'Faire Messung ist mehr als Code.' 35 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Rect $s 56 140 76 3 $C.Teal
  $null=Add-Text $s 78 190 252 26 '1 · Reproduzierbarkeit' 18 $C.Teal $true
  $null=Add-Text $s 78 228 246 88 'Wikipedia ändert sich. Deshalb habe ich einen kuratierten Messgraphen eingefroren.' 17 $C.Soft $false
  $null=Add-Text $s 354 190 252 26 '2 · Faire Bedingungen' 18 $C.Blue $true
  $null=Add-Text $s 354 228 246 88 'Graph-Kontexte können länger sein. Budgetkontrolle, gleiche Prompts und Rotation reduzieren Verzerrungen.' 17 $C.Soft $false
  $null=Add-Text $s 630 190 252 26 '3 · Mobile Laufzeit' 18 $C.Amber $true
  $null=Add-Text $s 630 228 246 88 'WebGPU, Modell- und Embedding-Downloads, Wärme und Cache-Zustände können Messungen beeinflussen.' 17 $C.Soft $false
  $null=Add-Text $s 166 418 628 48 'Weitere Prüfaufgabe vor dem Hauptlauf: Fakten, Goldpfade und Hop-Tiefen des Katalogs einzeln gegen den Korpus kontrollieren.' 18 $C.Ivory $true $ppAlignCenter

  # 11 — Artefakt
  $s=New-Slide 'Artefakt' 'Mein Messinstrument zeigt den Weg zur Antwort.' 11
  $null=Add-Rect $s 50 66 850 84 $C.Navy $C.Navy
  $null=Add-Text $s 56 72 840 58 'Der Weg zur Antwort bleibt sichtbar.' 35 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Rect $s 56 140 76 3 $C.Teal
  $null=Add-Text $s 84 202 258 30 'FRAGE' 14 $C.Teal $true $ppAlignCenter
  $null=Add-Text $s 370 202 228 30 'RETRIEVAL' 14 $C.Teal $true $ppAlignCenter
  $null=Add-Text $s 648 202 228 30 'ANTWORT' 14 $C.Teal $true $ppAlignCenter
  $null=Add-Line $s 250 278 362 278 $C.Teal 2 $true
  $null=Add-Line $s 584 278 640 278 $C.Teal 2 $true
  $null=Add-Text $s 80 250 178 64 'Welche Verbindung führt von Hegel zu Kierkegaard?' 18 $C.Ivory $true $ppAlignCenter
  $null=Add-Text $s 366 250 206 64 'Kontext, Knoten und Kanten bleiben offenlegbar.' 18 $C.Ivory $true $ppAlignCenter
  $null=Add-Text $s 650 250 200 64 'Antwort, Laufzeit und Evidenz sind exportierbar.' 18 $C.Ivory $true $ppAlignCenter
  $null=Add-Text $s 182 395 590 42 'Die App ist nicht nur eine Demo. Sie ist das Messinstrument für einen transparenten Vergleich.' 20 $C.Soft $false $ppAlignCenter

  # 9 — Schluss
  $s=New-Slide 'Einordnung' 'Graph-RAG ist nicht einfach „besser“.' 12
  $null=Add-Text $s 146 205 670 70 'Sondern wann explizite Struktur ihren Preis wert ist.' 30 $C.Ivory $true $ppAlignCenter 'Century Schoolbook'
  $null=Add-Rect $s 282 308 396 2 $C.Teal
  $null=Add-Text $s 195 346 570 55 'Ich dokumentiere auch Null- und Negativbefunde – sowie meinen iterativen KI-Einsatz mit Claude und ChatGPT – vollständig im Transparenz-Bericht.' 16.5 $C.Soft $false $ppAlignCenter
  $null=Add-Text $s 259 438 442 24 'Nächster Schritt: Messläufe · Bewertung · nachvollziehbare Ergebnisse' 15 $C.Teal $true $ppAlignCenter

  # 13 — Quellen
  # Pilot und Freigabe
  $s=New-Slide 'Pilot und Freigabe' 'Erst prüfen, dann behaupten.' 13
  $null=Add-Text $s 88 194 260 30 '1  Messstand einfrieren' 21 $C.Teal $true
  $null=Add-Text $s 88 238 250 70 'Commit, Gerät, Browser, Modelle, Seeds und Cache-Zustand dokumentieren.' 17 $C.Soft $false
  $null=Add-Text $s 382 194 240 30 '2  Korpus kontrollieren' 21 $C.Blue $true
  $null=Add-Text $s 382 238 240 70 'Alle Goldpfade, Hop-Tiefen und unbeantwortbaren Fragen gegen den Korpus prüfen.' 17 $C.Soft $false
  $null=Add-Text $s 668 194 210 30 '3  Pipeline prüfen' 21 $C.Amber $true
  $null=Add-Text $s 668 238 210 70 'Zeitmessung, Export und Verblindung zuerst technisch validieren.' 17 $C.Soft $false
  $null=Add-Line $s 126 354 834 354 $C.Muted 1.5
  $null=Add-Text $s 164 402 632 56 'Demo-Ausgaben sind kein Ergebnis. Erst exportierte und doppelt bewertete WebLLM-Läufe dürfen Hypothesen bestätigen oder widerlegen.' 19 $C.Ivory $true $ppAlignCenter

  # Quellen
  $s=New-Slide 'Quellen' 'Theorie, Benchmarks und technische Grundlage' 14
  $null=Add-Rect $s 50 66 850 84 $C.Navy $C.Navy
  $null=Add-Text $s 56 72 840 58 'Quellen und Grundlagen.' 35 $C.Ivory $true $ppAlignLeft 'Century Schoolbook'
  $null=Add-Rect $s 56 140 76 3 $C.Teal
  $null=Add-Rect $s 50 150 850 150 $C.Navy $C.Navy
  $null=Add-Text $s 84 186 780 206 "[1] Lewis et al. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. NeurIPS.`n`n[2] Edge et al. (2024). From Local to Global: A Graph RAG Approach to Query-Focused Summarization.`n`n[3] Gutiérrez et al. (2024). HippoRAG. NeurIPS.`n`n[4] Yang et al. (2018). HotpotQA. EMNLP.`n`n[5] MLC-Team (2024). WebLLM: High-Performance In-Browser LLM Inference." 16.5 $C.Soft $false
  $null=Add-Text $s 84 432 780 38 'Korpusgrundlage: ausgewählte deutschsprachige Wikipedia-Artikel; konkrete Artikelversionen und Attribution werden im Transparenz-Bericht dokumentiert.' 15 $C.Ivory $true

  # 14 — KI-Disclaimer
  $s=New-Slide 'KI-Disclaimer' 'Wo ich KI verwendet habe' 15
  $null=Add-Text $s 86 184 330 34 'Claude und ChatGPT im Chat' 22 $C.Teal $true
  $null=Add-Text $s 86 236 330 190 "• Ideenschärfung und Forschungsfrage`n• Entwürfe für Code und UI`n• Korpus- und Fragenentwürfe`n• Struktur und Rohfassungen der Texte`n• Präsentationsentwurf und Überarbeitung" 18 $C.Soft $false
  $null=Add-Line $s 494 184 494 422 $C.Muted 1
  $null=Add-Text $s 560 184 310 34 'Meine Verantwortung' 22 $C.Amber $true
  $null=Add-Text $s 560 236 310 190 'Ich habe Ziele und Anforderungen vorgegeben, Varianten ausgewählt, Inhalte geprüft, Tests angestoßen und verantworte Methode, Code, Quellen und Schlussfolgerungen.' 19 $C.Ivory $true
  $null=Add-Text $s 156 448 650 26 'Alle übernommenen Fakten und Quellen werden vor der Abgabe nochmals einzeln überprüft.' 15.5 $C.Teal $true $ppAlignCenter

  if(-not(Test-Path -LiteralPath $OutputDirectory)){New-Item -ItemType Directory -Path $OutputDirectory | Out-Null}
  $pptx=Join-Path $OutputDirectory 'Praesentation_Graph-RAG_kreativ.pptx'
  $pdf=Join-Path $OutputDirectory 'Praesentation_Graph-RAG_kreativ.pdf'
  $preview=Join-Path $OutputDirectory 'Praesentation_Graph-RAG_kreativ_Vorschau'
  $script:Deck.SaveAs($pptx,$ppSaveAsOpenXMLPresentation)
  $script:Deck.SaveAs($pdf,$ppSaveAsPDF)
  $script:Deck.Export($preview,'PNG',1600,900)
  Write-Output $pptx; Write-Output $pdf; Write-Output $preview
}
finally {
  if($script:Deck -ne $null){try{$script:Deck.Close()}catch{};try{[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($script:Deck)}catch{}}
  if($script:Ppt -ne $null){try{$script:Ppt.Quit()}catch{};try{[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($script:Ppt)}catch{}}
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
