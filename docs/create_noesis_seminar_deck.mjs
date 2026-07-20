import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  Presentation,
  PresentationFile,
  image,
  layers,
  shape,
  text,
} from "@oai/artifact-tool";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.NOESIS_PROJECT_ROOT
  ? path.resolve(process.env.NOESIS_PROJECT_ROOT)
  : path.resolve(HERE, "..");
const OUTPUT = process.argv[2] || path.join(HERE, "Noesis_Seminarpraesentation_SoSe2026.pptx");

const W = 1280;
const H = 720;

const C = {
  ink: "#171613",
  ink2: "#211F1A",
  panel: "#2A2721",
  panel2: "#332E27",
  ivory: "#F3EFE5",
  paper: "#FBF8F1",
  paper2: "#E9E2D5",
  white: "#FFFDF8",
  coal: "#292823",
  muted: "#9A9387",
  mutedDark: "#6B655B",
  coral: "#E97857",
  coral2: "#F3B09A",
  amber: "#E8B86B",
  sage: "#88A889",
  teal: "#65AFA4",
  lilac: "#A395E7",
  red: "#D7655E",
  green: "#6EA578",
  lineDark: "#464138",
  lineLight: "#D8D0C2",
};

const F = {
  display: "Georgia",
  body: "Aptos",
  mono: "Cascadia Mono",
};

const presentation = Presentation.create({ slideSize: { width: W, height: H } });

async function bytes(rel) {
  return fs.readFile(path.join(ROOT, rel));
}

const assets = {
  hero: await bytes("docs/assets/graphrag-hero.png"),
  journey: await bytes("docs/assets/presentation/story-journey-background.png"),
  product: await bytes("docs/assets/presentation/current/noesis-product-chat.png"),
  offlineError: await bytes("docs/assets/presentation/evidence/dense-offline-json-error.png"),
  knowledgeError: await bytes("docs/assets/presentation/evidence/wikipedia-command-failed.png"),
  topicLeak: await bytes("docs/assets/presentation/evidence/topic-leak-einstein-mathetower.png"),
  liveQuiz: await bytes("docs/assets/presentation/evidence/live-quiz-not-connected.png"),
};

function tx(value, x, y, w, h, size, color, options = {}) {
  return text([value], {
    name: options.name,
    position: { left: x, top: y },
    width: w,
    height: h,
    style: {
      fontSize: `${size}px`,
      typeface: options.font || F.body,
      color,
      bold: options.bold || false,
      italic: options.italic || false,
      alignment: options.align || "left",
      verticalAlignment: options.valign || "top",
      autoFit: options.autoFit || "shrinkText",
      wrap: "square",
      insets: options.insets || { top: 0, right: 0, bottom: 0, left: 0 },
    },
  });
}

function rect(x, y, w, h, fill, options = {}) {
  return shape({
    geometry: options.geometry || (options.radius ? "roundRect" : "rect"),
    name: options.name,
    position: { left: x, top: y },
    width: w,
    height: h,
    rotation: options.rotation || 0,
    fill,
    line: options.line || { style: "solid", fill, width: 0 },
    shadow: options.shadow,
  });
}

function rule(x, y, w, h, color, width = 2, dash = "solid") {
  const left = w < 0 ? x + w : x;
  const top = h < 0 ? y + h : y;
  const inverse = (w < 0) !== (h < 0);
  return shape({
    geometry: inverse ? "lineInv" : "line",
    position: { left, top },
    width: Math.max(Math.abs(w), 1),
    height: Math.max(Math.abs(h), 1),
    fill: "none",
    line: { style: dash, fill: color, width },
  });
}

function img(blob, x, y, w, h, options = {}) {
  return image({
    blob,
    contentType: "image/png",
    alt: options.alt || "Präsentationsbild",
    fit: options.fit || "cover",
    position: { left: x, top: y },
    width: w,
    height: h,
    geometry: options.geometry || "rect",
    borderRadius: options.radius,
    crop: options.crop,
  });
}

function base(elements, tone = "dark", chapter = "", number = "") {
  const dark = tone === "dark";
  elements.__background = dark ? C.ink : C.ivory;
  elements.push(rect(0, 0, W, H, dark ? C.ink : C.ivory));
  elements.push(rect(0, 0, 10, H, dark ? C.coral : C.coral));
  if (chapter) {
    elements.push(tx(chapter.toUpperCase(), 42, 28, 420, 22, 12, dark ? C.coral2 : C.coral, {
      bold: true,
    }));
  }
  if (number) {
    elements.push(tx(number, 1185, 665, 48, 22, 12, dark ? C.muted : C.mutedDark, {
      align: "right",
    }));
  }
  elements.push(rule(42, 651, 1110, 0, dark ? C.lineDark : C.lineLight, 1));
}

function title(elements, value, tone = "dark", kicker = "") {
  const dark = tone === "dark";
  if (kicker) elements.push(tx(kicker.toUpperCase(), 56, 52, 1080, 26, 13, dark ? C.coral : C.coral, { bold: true }));
  elements.push(tx(value, 56, 84, 1140, 80, 38, dark ? C.ivory : C.ink, {
    font: F.display,
    bold: true,
    valign: "middle",
  }));
}

function chip(elements, value, x, y, w, tone = "dark", accent = C.coral) {
  const dark = tone === "dark";
  elements.push(rect(x, y, w, 32, dark ? C.panel2 : C.paper, {
    radius: 16,
    line: { style: "solid", fill: accent, width: 1 },
  }));
  elements.push(tx(value, x + 12, y + 7, w - 24, 18, 12, dark ? C.ivory : C.ink, {
    bold: true,
    align: "center",
  }));
}

function card(elements, { x, y, w, h, title: heading, body, accent = C.coral, tone = "dark", label = "" }) {
  const dark = tone === "dark";
  elements.push(rect(x, y, w, h, dark ? C.panel : C.paper, {
    radius: 18,
    line: { style: "solid", fill: dark ? C.lineDark : C.lineLight, width: 1 },
    shadow: dark ? "shadow-md" : "shadow-sm",
  }));
  elements.push(rect(x, y, 7, h, accent, { radius: 6 }));
  if (h < 120) {
    elements.push(tx(heading, x + 24, y + 14, Math.min(190, w * 0.28), h - 28, 18, dark ? C.ivory : C.ink, {
      font: F.display,
      bold: true,
      valign: "middle",
    }));
    elements.push(tx(body, x + Math.min(226, w * 0.32), y + 13, w - Math.min(250, w * 0.34), h - 26, 15, dark ? C.paper2 : C.coal, {
      valign: "middle",
      autoFit: "shrinkText",
    }));
    return;
  }
  if (label) elements.push(tx(label.toUpperCase(), x + 24, y + 22, w - 44, 20, 11, accent, { bold: true }));
  elements.push(tx(heading, x + 24, y + (label ? 48 : 26), w - 48, 52, 23, dark ? C.ivory : C.ink, {
    font: F.display,
    bold: true,
  }));
  elements.push(tx(body, x + 24, y + (label ? 104 : 84), w - 48, h - (label ? 124 : 104), 17, dark ? C.paper2 : C.coal, {
    autoFit: "shrinkText",
  }));
}

function quote(elements, textValue, x, y, w, h, tone = "dark", accent = C.coral) {
  const dark = tone === "dark";
  elements.push(rect(x, y, 7, h, accent));
  elements.push(tx(`„${textValue}“`, x + 28, y, w - 28, h, 30, dark ? C.ivory : C.ink, {
    font: F.display,
    italic: true,
    valign: "middle",
  }));
}

function codeBlock(elements, lines, x, y, w, h, highlights = []) {
  elements.push(rect(x, y, w, h, "#101212", {
    radius: 18,
    line: { style: "solid", fill: "#343A38", width: 1 },
    shadow: "shadow-lg",
  }));
  elements.push(rect(x, y, w, 34, "#1A1D1C", { radius: 16 }));
  [C.red, C.amber, C.green].forEach((color, i) => elements.push(rect(x + 18 + i * 22, y + 12, 9, 9, color, { geometry: "ellipse" })));
  const lineH = Math.min(28, (h - 52) / Math.max(1, lines.length));
  lines.forEach((line, i) => {
    const ly = y + 43 + i * lineH;
    if (highlights.includes(i + 1)) elements.push(rect(x + 46, ly - 2, w - 62, lineH, "#3C2C24", { radius: 4 }));
    elements.push(tx(String(i + 1).padStart(2, "0"), x + 14, ly, 28, lineH, 12, C.muted, {
      font: F.mono,
      align: "right",
    }));
    elements.push(tx(line || " ", x + 54, ly, w - 70, lineH, 15.5, highlights.includes(i + 1) ? C.coral2 : "#E8E6DE", {
      font: F.mono,
      autoFit: "shrinkText",
    }));
  });
}

function compose(elements, notes) {
  const slide = presentation.slides.add();
  slide.background.fill = elements.__background || C.ivory;
  slide.compose(layers({ width: "fill", height: "fill" }, elements), {
    frame: { left: 0, top: 0, width: W, height: H },
    baseUnit: 1,
  });
  if (notes) {
    slide.speakerNotes.textFrame.setText(notes);
    slide.speakerNotes.setVisible(true);
  }
  return slide;
}

function sectionSlide(number, heading, subtitle, accent, notes) {
  const e = [];
  e.push(img(assets.journey, 0, 0, W, H, { alt: "Abstrakte Reise vom Entwurf zum Wissensgraphen" }));
  e.push(rect(0, 0, W, H, C.ink, { line: { style: "solid", fill: C.ink, width: 0 } }));
  e.push(img(assets.journey, 0, 0, W, H, { alt: "Abstrakte Reise", crop: { left: 0.34, top: 0, right: 0, bottom: 0 } }));
  e.push(rect(0, 0, 570, H, C.ink));
  e.push(rect(0, 0, 10, H, accent));
  e.push(tx(`AKT ${number}`, 72, 92, 300, 36, 16, accent, { bold: true }));
  e.push(tx(heading, 72, 170, 490, 200, 52, C.ivory, { font: F.display, bold: true }));
  e.push(rule(72, 414, 178, 0, accent, 4));
  e.push(tx(subtitle, 72, 455, 430, 112, 21, C.paper2));
  e.push(tx(`${String(number).padStart(2, "0")} / 05`, 1120, 650, 100, 22, 13, C.ivory, { align: "right" }));
  return compose(e, notes);
}

// 01 — Cover
{
  const e = [];
  e.push(img(assets.hero, 0, 0, W, H, { alt: "Smartphone mit philosophischem Wissensgraphen" }));
  e.push(rect(0, 0, 620, H, C.ink));
  e.push(rect(0, 0, 10, H, C.coral));
  e.push(tx("PROSEMINAR · SOSE 2026", 64, 58, 420, 24, 13, C.coral2, { bold: true }));
  e.push(tx("Vom Scraper\nzu Noesis", 64, 130, 520, 180, 58, C.ivory, { font: F.display, bold: true }));
  e.push(tx("Wie ich mit Claude und ChatGPT aus ein paar Python-Zeilen ein lokales Graph-RAG-Experiment baute — und warum die schwierigsten Teile erst nach dem ersten „fertig“ begannen.", 64, 350, 500, 146, 22, C.paper2));
  e.push(rule(64, 536, 170, 0, C.coral, 4));
  e.push(tx("Sinan Yavuz Adigüzel · TU Dortmund\n„Let ChatGPT do the work?!“", 64, 570, 500, 56, 15, C.muted));
  compose(e, "Zielzeit: 0:45. Nicht mit der Architektur beginnen, sondern mit der persönlichen Reise. Kurzer Einstieg: Ich wollte zuerst kein Produkt und kein Benchmark bauen. Ich wollte Wikipedia-Verbindungen mit einem eigenen Python-Skript sichtbar machen. Der Titel verrät schon die Wendung: Aus einem überschaubaren Skript wurde ein System, das ich ohne Claude und ChatGPT in dieser Breite nicht gebaut hätte — das ich aber auch nicht ungeprüft übernehmen konnte.");
}

// 02 — Cold open
{
  const e = [];
  base(e, "light", "Auftakt", "02");
  title(e, "Die KI sagte oft: fertig.", "light", "Die eigentliche Geschichte");
  e.push(img(assets.product, 590, 150, 630, 420, { alt: "Aktuelle Noesis-Oberfläche", radius: 18, geometry: "roundRect" }));
  e.push(rect(588, 148, 634, 424, "none", { radius: 18, line: { style: "solid", fill: C.coral, width: 3 } }));
  quote(e, "Mein Smartphone sagte: VK_ERROR_UNKNOWN.", 72, 196, 438, 140, "light", C.coral);
  e.push(tx("Genau zwischen diesen beiden Sätzen liegt der Schaffungsprozess.", 100, 378, 390, 90, 24, C.coal, { bold: true }));
  chip(e, "Produkt", 74, 510, 120, "light", C.coral);
  chip(e, "Experiment", 208, 510, 140, "light", C.teal);
  chip(e, "Reflexion", 362, 510, 128, "light", C.lilac);
  compose(e, "Zielzeit: 1:00. Dies ist der Hook. Rechts ist nicht nur ein Mock-up, sondern die aktuelle Noesis-Oberfläche. Dann direkt den Konflikt formulieren: Die Chatmodelle konnten sehr schnell Code erzeugen. Ob dieser Code auf meinem Samsung S23+ lief, ob Zahlen plausibel waren und ob ein angeblich semantischer Graph wirklich Bedeutung trug, musste ich durch konkrete Tests herausfinden.");
}

// 03 — Map
{
  const e = [];
  base(e, "dark", "Roter Faden", "03");
  title(e, "Eine Reise in fünf Akten", "dark", "Heute geht es nicht nur um das Ergebnis");
  const acts = [
    ["01", "Python", "Links sammeln", C.coral],
    ["02", "Experiment", "Vergleich entwerfen", C.teal],
    ["03", "Web-App", "KI baut Breite", C.lilac],
    ["04", "Realität", "Fehler widerlegen", C.red],
    ["05", "Evidenz", "Grenzen benennen", C.amber],
  ];
  acts.forEach((a, i) => {
    const x = 58 + i * 238;
    e.push(rect(x, 220, 196, 250, C.panel, { radius: 20, line: { style: "solid", fill: a[3], width: 1 } }));
    e.push(tx(a[0], x + 22, 240, 80, 58, 42, a[3], { font: F.display, bold: true }));
    e.push(tx(a[1], x + 22, 318, 152, 40, 23, C.ivory, { font: F.display, bold: true }));
    e.push(tx(a[2], x + 22, 374, 150, 60, 16, C.paper2));
    if (i < acts.length - 1) e.push(rule(x + 196, 345, 42, 0, C.lineDark, 2));
  });
  e.push(tx("Leitfrage des Seminars", 62, 528, 240, 20, 12, C.coral2, { bold: true }));
  e.push(tx("Was kann KI tatsächlich übernehmen — und wo beginnt meine Verantwortung als Student?", 62, 555, 1040, 52, 26, C.ivory, { font: F.display, bold: true }));
  compose(e, "Zielzeit: 0:45. Die fünf Akte kurz ankündigen. Die Reihenfolge ist bewusst autobiografisch: Ich erkläre die Theorie erst, nachdem klar ist, warum ich sie brauchte. Danach kommt nicht einfach eine Featureliste, sondern jede Funktion wird als Reaktion auf ein Problem erzählt.");
}

// 04
sectionSlide("1", "Ein paar Zeilen Python", "Vor Git, vor React und vor dem Experiment stand ein selbst geschriebener Wikipedia-Scraper.", C.coral,
  "Zielzeit: 0:20. Den Vor-Git-Status ausdrücklich sagen. Der Scraper liegt im aktuellen Repository nicht vor. Für die endgültige Abgabe sollte ich die Originaldatei, eine Beispielausgabe oder einen datierten Screenshot ergänzen. In den Folien zeige ich deshalb nur die rekonstruierte Logik, nicht angeblich exakten historischen Code.");

// 05 — Scraper code
{
  const e = [];
  base(e, "dark", "Akt I · Vor-Git-Prototyp", "05");
  title(e, "Ich wollte nur Links sammeln.", "dark", "Vereinfachte, sinngemäß rekonstruierte Logik");
  const lines = [
    "import requests",
    "from bs4 import BeautifulSoup",
    "",
    "def links_von(titel):",
    "    url = f\"https://de.wikipedia.org/wiki/{titel}\"",
    "    html = requests.get(url, timeout=10).text",
    "    soup = BeautifulSoup(html, \"html.parser\")",
    "    return [",
    "        a.get(\"title\")",
    "        for a in soup.select(\"#mw-content-text a[title]\")",
    "        if a.get(\"href\", \"\").startswith(\"/wiki/\")",
    "    ]",
  ];
  codeBlock(e, lines, 56, 178, 710, 420, [4, 10, 11]);
  card(e, {
    x: 812, y: 190, w: 380, h: 180,
    title: "Mein Anteil",
    body: "Thema, Skriptlogik, erste Läufe und die Entscheidung, überhaupt Verbindungen statt nur Texte zu untersuchen.",
    accent: C.coral, tone: "dark", label: "Student",
  });
  card(e, {
    x: 812, y: 398, w: 380, h: 190,
    title: "Ehrliche Lücke",
    body: "Der Original-Scraper ist im heutigen Repo nicht belegt. Vor der finalen Präsentation ersetze ich diesen Ausschnitt idealerweise durch meinen echten Code.",
    accent: C.amber, tone: "dark", label: "Transparenz",
  });
  compose(e, "Zielzeit: 1:30. Den Code langsam lesen: URL bilden, HTML holen, Links extrahieren. Das war ein sinnvoller eigener Einstieg, weil ich dadurch die Datenform verstanden habe. Aber der Code beantwortete noch keine Forschungsfrage. Wichtig: Keine technischen Details als historisch exakt ausgeben, solange der Original-Scraper nicht wieder beigefügt ist.");
}

// 06 — Link != relation
{
  const e = [];
  base(e, "light", "Akt I · Erste Erkenntnis", "06");
  title(e, "Ein Link ist noch keine Beziehung.", "light", "Das erste methodische Missverständnis");
  e.push(rect(70, 192, 270, 270, C.paper, { radius: 22, line: { style: "solid", fill: C.lineLight, width: 1 } }));
  e.push(tx("HTML-Link", 110, 228, 190, 42, 30, C.ink, { font: F.display, bold: true, align: "center" }));
  e.push(tx("Kant → Hegel", 106, 304, 200, 48, 26, C.coral, { font: F.mono, bold: true, align: "center" }));
  e.push(tx("bedeutet zunächst nur:\nDer Artikel verlinkt.", 105, 378, 200, 60, 17, C.mutedDark, { align: "center" }));
  e.push(rule(350, 324, 130, 0, C.coral, 4));
  e.push(tx("≠", 385, 288, 62, 60, 46, C.red, { font: F.display, bold: true, align: "center" }));
  e.push(rect(492, 176, 704, 326, C.ink, { radius: 24 }));
  const rels = [
    ["kritisierte", C.coral], ["beeinflusste", C.teal], ["lehrte an", C.lilac],
    ["verfasste", C.amber], ["war Zeitgenosse von", C.sage], ["widersprach", C.red],
  ];
  rels.forEach((r, i) => {
    const row = Math.floor(i / 3), col = i % 3;
    const x = 532 + col * 206, y = 226 + row * 114;
    e.push(rect(x, y, 172, 72, C.panel2, { radius: 16, line: { style: "solid", fill: r[1], width: 1 } }));
    e.push(tx(r[0], x + 12, y + 23, 148, 28, 17, C.ivory, { bold: true, align: "center" }));
  });
  e.push(tx("Für einen prüfbaren Graphen brauche ich Relationstyp, Richtung und Quelle — nicht nur eine Linie.", 82, 550, 1080, 58, 24, C.ink, { font: F.display, bold: true, align: "center" }));
  compose(e, "Zielzeit: 1:10. Dies ist der Übergang vom Webscraping zur Wissensmodellierung. Ein Wikipedia-Link ist nützlich, aber semantisch schwach. Ich durfte später deshalb MediaWiki-Linkkanten nur als 'verlinkt auf' darstellen. Historische, philosophische oder kausale Beziehungen mussten im Messgraphen typisiert und geprüft werden.");
}

// 07 — Pivot
{
  const e = [];
  base(e, "dark", "Akt I · Projekt-Pivot", "07");
  title(e, "Aus einem Artefakt wurde eine Frage.", "dark", "Der entscheidende Richtungswechsel");
  card(e, { x: 70, y: 200, w: 330, h: 278, title: "Produktfrage", body: "Wie kann ein kleines lokales Modell auf dem Smartphone sinnvoll mit Wikipedia-Wissen sprechen?", accent: C.coral, tone: "dark", label: "Start" });
  e.push(rule(410, 340, 90, 0, C.lineDark, 3));
  e.push(rect(466, 312, 52, 52, C.coral, { geometry: "ellipse" }));
  e.push(tx("→", 476, 321, 32, 30, 24, C.ink, { bold: true, align: "center" }));
  e.push(rule(520, 340, 90, 0, C.lineDark, 3));
  card(e, { x: 620, y: 176, w: 560, h: 326, title: "Forschungsfrage", body: "Hilft die explizite Struktur eines kuratierten Graphen kleinen On-Device-LLMs bei Multi-Hop-Fragen besser als Vektor-RAG — und was kostet dieser Vorteil?", accent: C.teal, tone: "dark", label: "Pivot" });
  e.push(tx("KI-Nutzen: 4/5", 84, 528, 200, 28, 15, C.coral2, { bold: true }));
  e.push(tx("Verlässlichkeit ohne eigene Prüfung: 2/5", 314, 528, 430, 28, 15, C.muted));
  e.push(tx("Claude und ChatGPT lieferten Varianten. Die endgültige Abgrenzung musste ich wählen.", 84, 570, 1030, 34, 18, C.paper2));
  compose(e, "Zielzeit: 1:15. Hier die KI-Nutzen-Skala einführen: Nutzen beschreibt Tempo und Ideenbreite; Verlässlichkeit beschreibt, wie gut ich das Ergebnis ungeprüft übernehmen könnte. Bei der Forschungsfrage halfen die Systeme sehr, aber sie erzeugten auch viele attraktive Nebenideen. Ich musste Produktfunktion, Demo und Experiment trennen.");
}

// 08 — Research question
{
  const e = [];
  base(e, "light", "Forschungsfrage", "08");
  e.push(tx("DIE FRAGE, DIE ALLES SORTIERTE", 68, 70, 560, 24, 13, C.coral, { bold: true }));
  quote(e, "Verbessert Graph-RAG auf einem kuratierten, eingefrorenen Wissensgraphen die Antwortqualität eines On-Device-LLMs gegenüber Vektor-RAG und einer kontextfreien Baseline bei Multi-Hop-Fragen — und zu welchen Ressourcenkosten?", 72, 142, 1110, 298, "light", C.coral);
  const tags = [
    ["≤ 4 Mrd. Parameter", C.coral], ["deutsch", C.teal], ["Smartphone", C.lilac],
    ["Multi-Hop", C.amber], ["Qualität + Kosten", C.sage],
  ];
  tags.forEach((t, i) => chip(e, t[0], 95 + i * 220, 506, 195, "light", t[1]));
  e.push(tx("Begrenzung ist hier kein Mangel, sondern Voraussetzung für einen kontrollierbaren Proseminar-Versuch.", 116, 574, 1020, 34, 19, C.mutedDark, { align: "center" }));
  compose(e, "Zielzeit: 1:00. Die Frage einmal vollständig vorlesen. Danach die Begrenzungen betonen: eine Sprache, eine Domäne, kleine Modelle, 40 Fragen. Diese Grenzen verhindern, dass ich aus einem Proseminar einen allgemeinen Benchmark mache.");
}

// 09 — Hypothesis chart
{
  const e = [];
  base(e, "dark", "Hypothesen", "09");
  title(e, "Meine Wette: Struktur hilft erst, wenn die Frage Wege braucht.", "dark", "Erwartung — keine Messdaten");
  const x0 = 108, y0 = 540, pw = 670, ph = 320;
  e.push(rule(x0, y0, pw, 0, C.muted, 2));
  e.push(rule(x0, y0, 0, -ph, C.muted, 2));
  ["1 Hop", "2 Hops", "3 Hops"].forEach((label, i) => {
    const x = x0 + 120 + i * 220;
    e.push(rule(x, y0, 0, 10, C.muted, 1));
    e.push(tx(label, x - 52, y0 + 18, 104, 24, 14, C.paper2, { align: "center" }));
  });
  e.push(tx("erwartete\nAntwortqualität", 24, 255, 118, 70, 14, C.paper2, { align: "center" }));
  const pointsVector = [[228, 392], [448, 360], [668, 344]];
  const pointsGraph = [[228, 388], [448, 310], [668, 246]];
  for (let i = 0; i < 2; i++) {
    e.push(rule(pointsVector[i][0], pointsVector[i][1], pointsVector[i + 1][0] - pointsVector[i][0], pointsVector[i + 1][1] - pointsVector[i][1], C.teal, 4));
    e.push(rule(pointsGraph[i][0], pointsGraph[i][1], pointsGraph[i + 1][0] - pointsGraph[i][0], pointsGraph[i + 1][1] - pointsGraph[i][1], C.coral, 4));
  }
  pointsVector.forEach(p => e.push(rect(p[0] - 8, p[1] - 8, 16, 16, C.teal, { geometry: "ellipse" })));
  pointsGraph.forEach(p => e.push(rect(p[0] - 8, p[1] - 8, 16, 16, C.coral, { geometry: "ellipse" })));
  e.push(tx("Vektor-RAG", 790, 328, 130, 24, 15, C.teal, { bold: true }));
  e.push(tx("Graph-RAG", 790, 236, 130, 24, 15, C.coral, { bold: true }));
  card(e, { x: 920, y: 196, w: 286, h: 332, title: "H1–H5", body: "H1 RAG > Baseline\nH2 Vektor ≈ Graph bei 1 Hop\nH3 Graph > Vektor bei 2–3 Hops\nH4 bessere Enthaltung\nH5 mehr Kontext und Latenz", accent: C.amber, tone: "dark", label: "Hypothesen" });
  e.push(tx("Die Linien sind eine Vorhersage, kein Ergebnisdiagramm.", 925, 558, 280, 30, 14, C.amber, { bold: true, align: "center" }));
  compose(e, "Zielzeit: 1:20. Die erwartete Interaktion erklären: Bei einfachen Fragen reicht ein guter ähnlicher Textabschnitt wahrscheinlich aus. Bei zwei oder drei Schritten könnte die explizite Kante helfen. Gleichzeitig kann Graph-RAG durch mehr Kontext auch langsamer werden oder das kleine Modell überfordern. Die Grafik unbedingt als Hypothese benennen.");
}

// 10 — Vector vs graph
{
  const e = [];
  base(e, "light", "Theorie", "10");
  title(e, "Zwei Wege zum selben lokalen Wissen", "light", "Vektor-RAG versus Graph-RAG");
  card(e, { x: 60, y: 190, w: 500, h: 346, title: "Vektor-RAG", body: "1. Frage vektorisieren\n2. ähnliche Textstellen suchen\n3. Top-k Abschnitte in den Prompt\n\nStärke: paraphrasenrobuste Ähnlichkeit\nRisiko: isolierte Fragmente ohne expliziten Pfad", accent: C.teal, tone: "light", label: "Ähnlichkeit" });
  card(e, { x: 720, y: 190, w: 500, h: 346, title: "Graph-RAG", body: "1. Entitäten verknüpfen\n2. Kanten bis Tiefe 3 traversieren\n3. Tripel + dieselben Kurztexte serialisieren\n\nStärke: Beziehungen sind sichtbar\nRisiko: Kuratierung und größerer Kontext", accent: C.coral, tone: "light", label: "Struktur" });
  const nodesL = [[614, 260], [644, 334], [614, 410]];
  nodesL.forEach((p, i) => e.push(rect(p[0], p[1], 18, 18, i === 1 ? C.coral : C.muted, { geometry: "ellipse" })));
  e.push(rule(623, 278, 22, 55, C.lineLight, 3));
  e.push(rule(623, 352, -2, 58, C.lineLight, 3));
  e.push(tx("VS", 596, 464, 80, 34, 22, C.mutedDark, { font: F.display, bold: true, align: "center" }));
  e.push(tx("Fairnessregel: Beide Verfahren sehen dieselben Knotenzusammenfassungen. Graph-RAG ergänzt nur die explizite Relationsdarstellung und eine andere Auswahlpipeline.", 104, 576, 1060, 42, 17, C.mutedDark, { align: "center" }));
  compose(e, "Zielzeit: 1:30. Begriffe knapp erklären. Wichtig ist die faire Abgrenzung: Mein Projekt repliziert nicht Microsoft GraphRAG. Es adaptiert die Grundidee eines Graphindex für einen kleinen, kuratierten Korpus. Vektor-RAG ist eine starke Baseline und sollte mit dichten Embeddings laufen, nicht nur mit TF-IDF.");
}

// 11 — Corpus
{
  const e = [];
  base(e, "dark", "Messkorpus", "11");
  title(e, "Warum ich Wikipedia eingefroren habe", "dark", "Reproduzierbarkeit statt täglicher Veränderung");
  const stats = [
    ["75", "Knoten", C.coral], ["165", "typisierte Kanten", C.teal], ["5", "Communities", C.lilac], ["1", "Domäne", C.amber],
  ];
  stats.forEach((s, i) => {
    const x = 58 + i * 294;
    e.push(rect(x, 202, 258, 164, C.panel, { radius: 20, line: { style: "solid", fill: s[2], width: 1 } }));
    e.push(tx(s[0], x + 22, 222, 214, 70, 50, s[2], { font: F.display, bold: true, align: "center" }));
    e.push(tx(s[1], x + 20, 304, 218, 34, 16, C.ivory, { bold: true, align: "center" }));
  });
  quote(e, "Topologie macht kleines Wissen groß — vielleicht.", 88, 420, 620, 90, "dark", C.coral);
  card(e, { x: 770, y: 406, w: 410, h: 188, title: "Deutscher Idealismus", body: "Personen, Werke, Konzepte, Orte und Ereignisse. Die Auswahl ist kontrollierbar, aber nicht repräsentativ für Wikipedia oder Weltwissen.", accent: C.amber, tone: "dark", label: "Domäne" });
  compose(e, "Zielzeit: 1:10. Der Graph basiert auf ausgewählten Wikipedia-Inhalten, wurde aber nicht automatisch aus rohen Links übernommen. Entitäten, Kurztexte, Relationen und Communities wurden für den Messstand kuratiert. Ehrliche Grenze: Die vollständige Faktenprüfung und die Attribution einzelner Artikelversionen sind laut Bericht noch offen.");
}

// 12 — Questions
{
  const e = [];
  base(e, "light", "Fragenkatalog", "12");
  title(e, "40 Fragen, nicht 40 Zufälle", "light", "Stratifiziert nach benötigter Evidenz");
  const groups = [
    [10, "Single-Hop", C.teal], [14, "2-Hop", C.coral], [8, "3-Hop", C.lilac], [4, "Vergleich", C.amber], [4, "unbeantwortbar", C.sage],
  ];
  groups.forEach((g, i) => {
    const x = 62 + i * 236;
    const height = 110 + g[0] * 9;
    e.push(rect(x, 538 - height, 188, height, g[2], { radius: 16 }));
    e.push(tx(String(g[0]), x + 28, 496 - height, 132, 58, 40, C.ink, { font: F.display, bold: true, align: "center" }));
    e.push(tx(g[1], x + 16, 552, 156, 36, 15, C.ink, { bold: true, align: "center" }));
  });
  e.push(tx("Goldantwort · Muss-Begriffe · Gold-Evidenzpfad", 74, 188, 630, 40, 24, C.ink, { font: F.display, bold: true }));
  e.push(tx("Die unbeantwortbaren Fragen prüfen nicht Wissen, sondern die Fähigkeit, begründet zu verzichten.", 74, 238, 890, 44, 18, C.mutedDark));
  e.push(rect(972, 190, 220, 92, C.paper, { radius: 18, line: { style: "solid", fill: C.coral, width: 1 } }));
  e.push(tx("10 + 14 + 8 + 4 + 4", 988, 216, 188, 25, 16, C.coral, { font: F.mono, bold: true, align: "center" }));
  e.push(tx("= 40", 1030, 245, 104, 22, 15, C.ink, { bold: true, align: "center" }));
  compose(e, "Zielzeit: 1:10. Die Kategorien erläutern und ein Beispiel mündlich ergänzen. Wichtig für die spätere Korrektur: Zwei 3-Hop-Goldpfade sind aktuell eher verzweigte Evidenzmengen als lineare Pfade. Vor dem Freeze muss ich sie korrigieren oder formal als Gold-Subgraph definieren.");
}

// 13 — Conditions
{
  const e = [];
  base(e, "dark", "Experimentaldesign", "13");
  title(e, "Der Vergleich darf nur eine Sache verändern", "dark", "Kernbedingungen und Kontrollen");
  const cond = [
    ["B0", "Baseline", "kein externer Kontext", C.muted],
    ["B1", "Vektor-RAG", "Top-k ähnliche Texte", C.teal],
    ["B2", "Graph-RAG", "Subgraph + Relationen", C.coral],
  ];
  cond.forEach((c, i) => {
    const x = 60 + i * 402;
    e.push(rect(x, 196, 360, 218, C.panel, { radius: 22, line: { style: "solid", fill: c[3], width: 2 } }));
    e.push(tx(c[0], x + 24, 218, 72, 52, 34, c[3], { font: F.display, bold: true }));
    e.push(tx(c[1], x + 24, 284, 312, 44, 25, C.ivory, { font: F.display, bold: true }));
    e.push(tx(c[2], x + 24, 344, 312, 34, 17, C.paper2));
  });
  const ctrl = [
    ["B1b", "Budgetkontrolle", C.teal], ["B2a", "Graph ohne Kanten", C.coral], ["B3", "Hybrid", C.lilac],
  ];
  ctrl.forEach((c, i) => chip(e, `${c[0]} · ${c[1]}`, 126 + i * 360, 468, 308, "dark", c[2]));
  e.push(tx("Konfirmatorisch: B0/B1/B2 · Kontrollen: B1b/B2a · Explorativ: B3", 130, 542, 1020, 32, 17, C.amber, { bold: true, align: "center" }));
  e.push(tx("Gleich bleiben: Modell, Prompt, Temperatur 0, Antwortlimit und eingefrorener Korpus.", 130, 580, 1020, 32, 16, C.paper2, { align: "center" }));
  compose(e, "Zielzeit: 1:20. Die drei Kernbedingungen erklären. B2a ist besonders wichtig: gleiche graphselektierte Knoten, aber Relationstripel entfernt. Damit kann ich prüfen, ob die Kanten im Prompt tatsächlich beitragen. Die sechs Bedingungen sind implementiert; Hauptaussage bleibt vorab B0/B1/B2.");
}

// 14 — Schedule code
{
  const e = [];
  base(e, "dark", "Reproduzierbarkeit", "14");
  title(e, "720 Trials — aber nicht immer in derselben Reihenfolge", "dark", "Seeded Shuffle und zyklische Gegenbalancierung");
  const lines = [
    "for (let repetition = 1; repetition <= 3; repetition++) {",
    "  const shuffled = seededShuffle(questions, seededRandom(seed))",
    "",
    "  shuffled.forEach((question, index) => {",
    "    const offset = (index + repetition - 1) % conditions.length",
    "    for (let c = 0; c < conditions.length; c++) {",
    "      schedule.push({",
    "        question,",
    "        condition: conditions[(offset + c) % conditions.length],",
    "        repetition,",
    "      })",
    "    }",
    "  })",
    "}",
  ];
  codeBlock(e, lines, 56, 168, 760, 448, [2, 5, 9]);
  e.push(tx("40", 906, 200, 210, 72, 54, C.coral, { font: F.display, bold: true, align: "center" }));
  e.push(tx("Fragen", 906, 272, 210, 28, 16, C.ivory, { align: "center" }));
  e.push(tx("× 3 Bedingungen\n× 2 Modelle\n× 3 Wiederholungen", 864, 330, 294, 120, 24, C.paper2, { font: F.display, bold: true, align: "center" }));
  e.push(rule(878, 474, 266, 0, C.coral, 3));
  e.push(tx("720 Kern-Trials", 858, 496, 306, 52, 30, C.amber, { font: F.display, bold: true, align: "center" }));
  e.push(tx("Quelle im Code: app/src/engine/experiment.ts", 850, 574, 320, 24, 13, C.muted, { font: F.mono, align: "center" }));
  compose(e, "Zielzeit: 1:20. Zeigen, dass Methodik im Code steckt. Drei Bedingungen mal 40 Fragen mal zwei Modelle mal drei Wiederholungen ergeben 720 Kern-Trials. Die Kontrollen kommen separat. Offene Inkonsistenz: Die Dokumentation spricht teils von separaten runIds je Wiederholung, der Code nutzt eine runId mit repetition-Feld. Vor dem Hauptlauf angleichen.");
}

// 15 — Metrics
{
  const e = [];
  base(e, "light", "Auswertung", "15");
  title(e, "Was zählt als „bessere“ Antwort?", "light", "Qualität, Evidenz und Kosten");
  const blocks = [
    ["Antwort", "korrekt · teilweise · falsch · Enthaltung", C.coral],
    ["Evidenz", "Recall und Präzision des Goldpfads", C.teal],
    ["Zeit", "End-to-End · Retrieval · Generierung · p50/p95", C.lilac],
    ["Bewertung", "verblindet · zwei Rater · Cohen κ · Konfliktliste", C.amber],
  ];
  blocks.forEach((b, i) => {
    const x = 60 + (i % 2) * 598, y = 190 + Math.floor(i / 2) * 194;
    card(e, { x, y, w: 552, h: 166, title: b[0], body: b[1], accent: b[2], tone: "light" });
  });
  e.push(tx("Primärvergleich: Graph-RAG vs. Vektor-RAG auf 2- und 3-Hop-Fragen", 84, 584, 1080, 34, 20, C.ink, { font: F.display, bold: true, align: "center" }));
  compose(e, "Zielzeit: 1:20. Das automatische Schlüsselwort-Scoring ist nur Vorstrukturierung. Maßgeblich ist die verblindete menschliche Bewertung. Vor dem Rating muss die Rubrik die Kategorie 'Enthaltung' klar definieren, besonders für unbeantwortbare Fragen. Geplant sind Delta, 95%-Bootstrap über Fragen, exakter McNemar und Holm-Korrektur; nicht alles ist schon in der App umgesetzt.");
}

// 16
sectionSlide("2", "Let ChatGPT do the work?", "Jetzt kam der eigentliche Seminarversuch: Nur über die normalen Chatfunktionen von Claude und ChatGPT iterativ weiterbauen.", C.lilac,
  "Zielzeit: 0:20. Klar abgrenzen: Für die Erstellung nutzte ich ausschließlich normale Chatoberflächen, keine Entwicklungs-API. Das spätere lokale oder gehostete Modell in der App ist Untersuchungsgegenstand beziehungsweise Demo-Funktion — nicht mein Entwicklungswerkzeug.");

// 17 — Loop
{
  const e = [];
  base(e, "light", "Schaffungsprozess", "17");
  title(e, "Mein Workflow war kein Prompt. Es war eine Prüfschleife.", "light", "Menschliche Steuerung, KI-Breite, reale Tests");
  const steps = [
    ["1", "Ich formuliere", "Ziel, Problem, Grenze", C.coral],
    ["2", "KI entwirft", "Code, Text, Varianten", C.lilac],
    ["3", "Ich teste", "Build, Gerät, Screenshot", C.teal],
    ["4", "Fehler widerspricht", "„fertig“ wird Hypothese", C.red],
    ["5", "Nächste Runde", "präziser Prompt + Gegentest", C.amber],
  ];
  steps.forEach((s, i) => {
    const x = 54 + i * 244;
    e.push(rect(x, 210, 210, 250, C.paper, { radius: 22, line: { style: "solid", fill: s[3], width: 2 } }));
    e.push(rect(x + 18, 230, 50, 50, s[3], { geometry: "ellipse" }));
    e.push(tx(s[0], x + 28, 241, 30, 28, 18, C.ink, { bold: true, align: "center" }));
    e.push(tx(s[1], x + 20, 308, 170, 48, 23, C.ink, { font: F.display, bold: true, align: "center" }));
    e.push(tx(s[2], x + 22, 378, 166, 56, 15, C.mutedDark, { align: "center" }));
    if (i < 4) e.push(tx("→", x + 210, 314, 34, 30, 22, C.mutedDark, { bold: true, align: "center" }));
  });
  quote(e, "Entscheidend war nicht die erste Antwort, sondern mein Test zwischen zwei Chatnachrichten.", 126, 520, 1020, 70, "light", C.coral);
  compose(e, "Zielzeit: 1:30. Diese Folie ist zentral für das Seminar. Ich habe Anforderungen, Prioritäten und Gegentests formuliert. Claude und ChatGPT erzeugten wesentliche Texte und große Teile des Codes. Meine Leistung bestand nicht darin, jede Zeile allein zu tippen, sondern Richtung, Auswahl, Test und Verantwortung zu übernehmen. Gleichzeitig muss ich einräumen: Bei 14.000 Zeilen KI-Code ist vollständiges Verständnis eine echte Herausforderung.");
}

// 18 — Git explosion
{
  const e = [];
  base(e, "dark", "Schaffungsprozess", "18");
  e.push(tx("EIN COMMIT SPÄTER", 64, 64, 400, 24, 13, C.coral2, { bold: true }));
  e.push(tx("+14.550", 62, 134, 720, 150, 102, C.coral, { font: F.display, bold: true }));
  e.push(tx("Zeilen", 70, 282, 320, 70, 46, C.ivory, { font: F.display, bold: true }));
  e.push(tx("100 Dateien geändert · 1 Löschung", 74, 376, 540, 36, 20, C.paper2));
  e.push(tx("Git-Beleg: 0bccc16 · „Publish Graph-RAG seminar project“", 74, 434, 620, 28, 14, C.muted, { font: F.mono }));
  card(e, { x: 758, y: 142, w: 438, h: 326, title: "Geschwindigkeit ≠ Verständnis", body: "Die KI erzeugte sehr schnell App, Korpusentwürfe, Fragen, Dokumentation und Folien. Mein neues Problem war nicht mehr „Wie programmiere ich das?“, sondern „Welche Teile kann ich fachlich und technisch verteidigen?“", accent: C.lilac, tone: "dark", label: "Der Preis der Breite" });
  e.push(tx("KI-Nutzen 5/5", 784, 516, 170, 28, 16, C.lilac, { bold: true }));
  e.push(tx("ungeprüfte Verlässlichkeit 1/5", 964, 516, 232, 28, 16, C.red, { bold: true, align: "right" }));
  compose(e, "Zielzeit: 1:20. Die Zahl stammt aus dem Git-Commit und ist belegbar. Sie ist kein Qualitätsmaß. Sie zeigt, wie Chat-KI den Engpass verschiebt: vom Tippen zum Prüfen. Ehrlich sagen, dass ein erheblicher Teil des Codes aus den Chat-Runden stammt.");
}

// 19 — Architecture
{
  const e = [];
  base(e, "light", "Architektur", "19");
  title(e, "Plötzlich hatte ich zwei Produkte", "light", "Noesis für die Vorführung · Graph-RAG Lab für die Prüfung");
  card(e, { x: 60, y: 200, w: 420, h: 310, title: "Noesis", body: "natürlicher Wissensdialog\nEigenes Wissen und Wikipedia\nQuellenchips und Graphtrace\nLive-Gespräch\n\nZiel: Nutzen sichtbar machen", accent: C.coral, tone: "light", label: "Produktmodus" });
  card(e, { x: 800, y: 200, w: 420, h: 310, title: "Graph-RAG Lab", body: "Experiment und Bedingungen\nverblindete Bewertung\nErgebnisse und Export\nModelle, Arena und Quiz\n\nZiel: Behauptung prüfbar machen", accent: C.teal, tone: "light", label: "Studienmodus" });
  e.push(rect(540, 268, 200, 170, C.ink, { radius: 22 }));
  e.push(tx("gemeinsame\nEngine", 550, 298, 180, 70, 22, C.ivory, { font: F.display, bold: true, align: "center" }));
  e.push(tx("Korpus · Retrieval\nLLM · Speicherung", 554, 374, 172, 42, 14, C.paper2, { align: "center" }));
  e.push(rule(480, 354, 60, 0, C.coral, 4));
  e.push(rule(740, 354, 60, 0, C.teal, 4));
  e.push(tx("Demo-Wissen ist technisch vom eingefrorenen Messkorpus getrennt.", 144, 568, 992, 34, 20, C.ink, { font: F.display, bold: true, align: "center" }));
  compose(e, "Zielzeit: 1:10. Diese Trennung entstand spät, weil die App als Sammlung technischer Werkzeuge unklar wirkte. Im normalen Vortrag sieht man Noesis; im Studienmodus bleibt der Messstand. Wichtig: Nutzer-PDFs, Wikipedia-Recherche und Quiz dürfen die experimentellen Trials nicht kontaminieren.");
}

// 20 — Graph code
{
  const e = [];
  base(e, "dark", "Implementierung", "20");
  title(e, "Der Kern ist erstaunlich unspektakulär", "dark", "Deterministische Traversierung statt magischer Intelligenz");
  const lines = [
    "for (let depth = 0; depth < opts.depth; depth++) {",
    "  for (const id of frontier) {",
    "    for (const next of adjacency.get(id) ?? []) {",
    "      const target = nodes.get(next.other)",
    "      const labelTerms = terms(next.edge.label + target.title)",
    "      let score = overlap(questionTerms, labelTerms)",
    "      if (alreadyInSubgraph(next.other)) score += 2",
    "      if (depth === 0) score += 0.5",
    "      candidates.push({ next, score })",
    "    }",
    "  }",
    "}",
  ];
  codeBlock(e, lines, 56, 176, 758, 416, [1, 6, 7, 8]);
  card(e, { x: 852, y: 186, w: 344, h: 180, title: "Was die KI half", body: "Datenstrukturen, Refactoring, Beam-Suche, Kontextserialisierung und Fehlerkorrekturen schnell umzusetzen.", accent: C.lilac, tone: "dark" });
  card(e, { x: 852, y: 392, w: 344, h: 200, title: "Was ich verstehen muss", body: "Warum diese Scores fair sind, welche Pfade ausgeschlossen werden und dass „Graph-RAG“ hier eine konkrete Heuristik bezeichnet.", accent: C.coral, tone: "dark" });
  compose(e, "Zielzeit: 1:30. Den Code nicht als Beweis für Intelligenz verkaufen. Die Traversierung ist lexikalisch und deterministisch. Das ist für Reproduzierbarkeit gut, begrenzt aber die Generalisierbarkeit. Verweis auf app/src/engine/graphRag.ts.");
}

// 21 — Product screenshot
{
  const e = [];
  base(e, "light", "Produktfokus", "21");
  title(e, "Noesis: Das sichtbare Ziel", "light", "Ein philosophischer Wissensdialog statt eines Werkzeugkastens");
  e.push(img(assets.product, 64, 170, 830, 430, { alt: "Aktuelle Noesis-Startansicht", fit: "contain", geometry: "roundRect", radius: 20 }));
  e.push(rect(62, 168, 834, 434, "none", { radius: 20, line: { style: "solid", fill: C.coral, width: 2 } }));
  card(e, { x: 934, y: 174, w: 284, h: 136, title: "Natürlich", body: "Multi-Turn, Anschlussfragen, Streaming und Stop.", accent: C.coral, tone: "light" });
  card(e, { x: 934, y: 326, w: 284, h: 136, title: "Transparent", body: "Verfahren, Quellen, Kontextmenge und Zeiten sichtbar.", accent: C.teal, tone: "light" });
  card(e, { x: 934, y: 478, w: 284, h: 136, title: "Lokal zuerst", body: "Offline nach Vorbereitung; Web nur bewusst als Zusatz.", accent: C.amber, tone: "light" });
  compose(e, "Zielzeit: 1:10. Kurz durch die Oberfläche führen. Die schnelle Demo-Engine ist bewusst als extraktiv und ohne LLM beschriftet. Für ein natürliches Gespräch muss ein echtes lokales Modell geladen sein. Das ist eine wichtige Transparenzentscheidung.");
}

// 22 — Feature grid
{
  const e = [];
  base(e, "dark", "Produkt & Messinstrument", "22");
  title(e, "Gimmicks — oder methodische Instrumente?", "dark", "Jede Spielerei sollte etwas zeigen");
  const features = [
    ["Retrieval-Schalter", "Auto · Vektor · Graph · Hybrid", C.coral],
    ["Graphtrace", "Antwortpfad nachvollziehen", C.teal],
    ["Live-Arena", "verblindetes A/B + Kantenablation", C.lilac],
    ["Eigenes Wissen", "PDF/Notiz lokal + Provenienz", C.amber],
    ["Live-Gespräch", "turn-basiert + lokale Piper-Stimme", C.sage],
    ["QR-Quiz", "Publikum spielt, Graph erklärt auf", C.red],
  ];
  features.forEach((f, i) => {
    const x = 58 + (i % 3) * 404, y = 184 + Math.floor(i / 3) * 200;
    card(e, { x, y, w: 364, h: 168, title: f[0], body: f[1], accent: f[2], tone: "dark" });
  });
  e.push(tx("Produktfunktionen sind nicht automatisch Versuchsdaten.", 102, 574, 1070, 34, 22, C.amber, { font: F.display, bold: true, align: "center" }));
  compose(e, "Zielzeit: 1:15. Die Features schnell als kommende Story-Beats ankündigen. Entscheidend ist die Grenze: Arena, Quiz, PDF-Import und Voice helfen beim Verstehen und Vorführen, sind aber nicht automatisch Teil des konfirmatorischen Experiments.");
}

// 23
sectionSlide("3", "Dann kam die Realität", "Die interessantesten Iterationen begannen dort, wo ein Screenshot oder ein Smartphone der plausiblen KI-Erklärung widersprach.", C.red,
  "Zielzeit: 0:20. Der Ton darf hier unterhaltsamer werden. Ab jetzt zeige ich keine abstrakten Schwierigkeiten, sondern konkrete Fehler, die tatsächlich im Projektverlauf aufgetreten sind.");

// 24 — n=532
{
  const e = [];
  base(e, "dark", "Fehler 01 · Ergebnislogik", "24");
  title(e, "Plausible Zahlen. Falscher Datensatz.", "dark", "„Kann das so stimmen?“");
  const cols = [60, 388, 492, 596, 700, 816, 942, 1074];
  const widths = [320, 92, 92, 92, 104, 114, 120, 120];
  const headers = ["Bedingung", "n", "korrekt", "teilw.", "falsch", "Enth.", "Ev.-Recall", "Acc|Ev."];
  e.push(rect(52, 178, 1172, 42, C.panel2, { radius: 10 }));
  headers.forEach((h, i) => e.push(tx(h, cols[i], 190, widths[i], 20, 12, C.coral2, { bold: true, align: i ? "center" : "left" })));
  const rows = [
    ["Baseline", "532", "55", "1", "9", "467", "0%", "—"],
    ["Vektor-RAG", "532", "322", "14", "192", "4", "74%", "84%"],
    ["Graph-RAG", "531", "293", "40", "198", "0", "93%", "67%"],
    ["Vektor · Budget", "462", "288", "23", "151", "0", "92%", "70%"],
    ["Hybrid", "462", "253", "35", "174", "0", "100%", "61%"],
  ];
  rows.forEach((r, ri) => {
    const y = 230 + ri * 58;
    e.push(rect(52, y, 1172, 50, ri % 2 ? C.panel : C.ink2, { radius: 8 }));
    r.forEach((v, i) => e.push(tx(v, cols[i], y + 15, widths[i], 20, 13.5, i === 1 ? C.red : C.ivory, { bold: i === 0 || i === 1, align: i ? "center" : "left" })));
  });
  e.push(rect(375, 222, 106, 296, "none", { radius: 14, line: { style: "solid", fill: C.red, width: 4 } }));
  card(e, { x: 58, y: 548, w: 1160, h: 72, title: "Befund", body: "Erwartet wären gleiche Zellgrößen. Die Werte waren kumulierte Demo-/Mischdaten — kein sauberer LLM-Hauptlauf.", accent: C.red, tone: "dark" });
  compose(e, "Zielzeit: 1:30. Die Tabelle ist aus dem damaligen Demo-Stand nachgebaut. Die n-Werte sind ungleich und viel zu groß. Bei 40 Fragen, drei Wiederholungen und zwei Modellen wären pro Bedingung 240 Trials zu erwarten, nicht 532 oder 462. Die extreme Baseline-Enthaltung passt außerdem wahrscheinlich zur extraktiven Demo-Engine. Ohne Rohdatenexport ist das eine plausible Diagnose, kein Ergebnis. Der Fix führte zu runId-Filtern und klarer Trennung von Läufen.");
}

// 25 — Offline error
{
  const e = [];
  base(e, "light", "Fehler 02 · Offline", "25");
  title(e, "„Offline“ war zuerst nur ein Wort", "light", "Der Browser lud HTML statt Modelldaten");
  e.push(img(assets.offlineError, 78, 188, 1124, 322, { alt: "Fehler beim Laden des Embedding-Modells", fit: "contain", geometry: "roundRect", radius: 18 }));
  e.push(rect(76, 186, 1128, 326, "none", { radius: 18, line: { style: "solid", fill: C.red, width: 3 } }));
  e.push(tx("Unexpected token '<'", 104, 526, 360, 38, 26, C.red, { font: F.mono, bold: true }));
  e.push(tx("→ Cache/URL/Service-Worker prüfen, nicht JSON-Parser beschuldigen", 456, 532, 704, 28, 17, C.ink, { bold: true }));
  e.push(tx("Neue Definition: offline = im selben Browserprofil vorbereitet + WLAN aus + Probeantwort bestanden.", 116, 594, 1040, 34, 18, C.mutedDark, { align: "center" }));
  compose(e, "Zielzeit: 1:15. Der Fehler zeigt eine HTML-Seite, die als JSON interpretiert wurde. Die KI half bei Diagnose und Precache-Architektur, aber die Behauptung 'offline fertig' wurde erst durch meinen WLAN-Test widerlegt. Modelle und Embeddings brauchen einmalig Internet; danach muss derselbe Browsercache genutzt werden.");
}

// 26 — Vulkan compute
{
  const e = [];
  base(e, "dark", "Fehler 03 · Zielgerät", "26");
  title(e, "Das Samsung S23+ wollte kein WebGPU", "dark", "Qwen und Llama scheiterten an derselben Compute-Pipeline");
  e.push(rect(56, 188, 580, 132, "#281E1C", { radius: 16, line: { style: "solid", fill: C.red, width: 2 } }));
  e.push(tx("CreateComputePipelines failed\nwith VK_ERROR_UNKNOWN", 78, 218, 536, 72, 25, C.coral2, { font: F.mono, bold: true, align: "center" }));
  const lines = [
    "const module = device.createShaderModule({",
    "  code: '@compute @workgroup_size(1) fn main() {}',",
    "})",
    "const pipeline = await device.createComputePipelineAsync({",
    "  layout: 'auto',",
    "  compute: { module, entryPoint: 'main' },",
    "})",
    "pass.setPipeline(pipeline)",
    "pass.dispatchWorkgroups(1)",
    "await device.queue.onSubmittedWorkDone()",
  ];
  codeBlock(e, lines, 668, 180, 544, 400, [4, 8, 9, 10]);
  card(e, { x: 56, y: 350, w: 580, h: 230, title: "Designänderung", body: "„navigator.gpu“ reicht nicht. Der Preflight baut heute eine echte Mini-Compute-Pipeline. Erst wenn sie läuft, wird WebGPU als verfügbar behandelt.", accent: C.red, tone: "dark", label: "Aus Fehler wird Test" });
  e.push(tx("Technisches Ergebnis auf diesem Gerät — kein Graph-vs.-Vektor-Befund.", 126, 604, 1030, 28, 15, C.amber, { bold: true, align: "center" }));
  compose(e, "Zielzeit: 1:30. Erklären, warum zwei Modelle denselben Fehler hatten: Nicht das Modell war das Problem, sondern die Vulkan/WebGPU-Pipeline. Daraus entstand ein besserer Preflight. Das ist ein belastbares gerätespezifisches Engineering-Ergebnis, aber keine empirische Antwort auf H1–H5.");
}

// 27 — CPU + context + cutoff
{
  const e = [];
  base(e, "light", "Fehler 04 · Lokales Modell", "27");
  title(e, "CPU rettete die Prämisse — und kostete Geduld", "light", "Drei Kompromisse auf einmal");
  const stages = [
    ["WebGPU fällt aus", "Vulkan-Treiber", C.red],
    ["GGUF auf CPU", "n_gpu_layers: 0 · 1 Thread", C.coral],
    ["Kontext 2048", "request 3098 > limit", C.amber],
    ["Antwortlimit 112", "schnell, aber mitten im Satz", C.lilac],
    ["Kompromiss", "kompakter Kontext · 144 Tokens · Satzende", C.green],
  ];
  stages.forEach((s, i) => {
    const x = 52 + i * 242;
    e.push(rect(x, 214, 206, 226, C.paper, { radius: 20, line: { style: "solid", fill: s[2], width: 2 } }));
    e.push(tx(String(i + 1).padStart(2, "0"), x + 18, 232, 56, 38, 28, s[2], { font: F.display, bold: true }));
    e.push(tx(s[0], x + 18, 296, 170, 56, 21, C.ink, { font: F.display, bold: true, align: "center" }));
    e.push(tx(s[1], x + 18, 372, 170, 44, 14.5, C.mutedDark, { font: F.mono, align: "center" }));
    if (i < 4) e.push(tx("→", x + 205, 306, 36, 28, 22, C.mutedDark, { bold: true, align: "center" }));
  });
  quote(e, "Geschwindigkeit war plötzlich kein Optimierungsziel mehr, sondern ein Dreieck aus Tempo, Kontext und vollständigen Sätzen.", 110, 500, 1060, 84, "light", C.coral);
  compose(e, "Zielzeit: 1:30. Der CPU-Pfad nutzt ein echtes lokales Qwen-0,5B-GGUF-Modell über Wllama/llama.cpp, ohne Vulkan. Er ist aber langsamer und braucht etwa 491 MB Download sowie Memory64. Der 1B/3B-Hauptvergleich ist damit noch nicht ersetzt. Der Context-Overflow und die abgeschnittene Einstein-Antwort zeigen: Eine Optimierung kann wissenschaftlich und qualitativ neue Fehler erzeugen.");
}

// 28 — Topic leak
{
  const e = [];
  base(e, "dark", "Fehler 05 · Kontextlogik", "28");
  title(e, "Warum Einstein plötzlich im Mathetower wohnte", "dark", "Nicht jede Halluzination kommt aus dem Modell");
  e.push(img(assets.topicLeak, 58, 166, 650, 446, { alt: "Noesis antwortet auf Mathetower-Frage erneut mit Einstein", fit: "cover", crop: { left: 0, top: 0.16, right: 0, bottom: 0.12 }, geometry: "roundRect", radius: 18 }));
  e.push(rect(56, 164, 654, 450, "none", { radius: 18, line: { style: "solid", fill: C.red, width: 3 } }));
  card(e, { x: 748, y: 174, w: 454, h: 158, title: "Symptom", body: "Auf „Wie viele Etagen hat der Mathetower … falls du es nicht weißt …“ folgte wieder eine Einstein-Antwort.", accent: C.red, tone: "dark" });
  card(e, { x: 748, y: 350, w: 454, h: 142, title: "Ursache", body: "Die Anschlussheuristik deutete jedes „es“ als Rückverweis und schleppte alten Verlauf mit.", accent: C.amber, tone: "dark" });
  card(e, { x: 748, y: 510, w: 454, h: 104, title: "Fix", body: "„es“ entfernt, unabhängige Fragen trennen, Gegentests für echte Pronomen-Anschlüsse.", accent: C.green, tone: "dark" });
  compose(e, "Zielzeit: 1:40. Den Fehler unterhaltsam erzählen, aber technisch sauber: Das kleine Modell bekam den falschen Kontext. Ich formulierte die Mathetower-Frage und eine echte Pronomen-Anschlussfrage als Gegentests. Der Fix betrifft nur den Produktchat; experimentelle Trials sind ohnehin unabhängig. KI-Nutzen beim Debugging 5/5, ungeprüfte Verlässlichkeit 2/5.");
}

// 29 — Voice
{
  const e = [];
  base(e, "light", "Fehler 06 · Stimme", "29");
  title(e, "Die Stimme klang wie ein Navi", "light", "Natürlichkeit ist mehr als Rate und Pitch");
  const phases = [
    ["Browserstimme", "verfügbar, aber auf dem S23+ monoton", C.red],
    ["Prosodie", "Sätze, Pausen, Markdown bereinigen", C.amber],
    ["Piper Thorsten", "optionaler ~100-MB-Download, lokale Ausgabe", C.coral],
    ["Ehrliche Grenze", "Mikrofonerkennung kann weiter online sein", C.teal],
  ];
  phases.forEach((p, i) => {
    const x = 60 + i * 298;
    e.push(rect(x, 208, 264, 258, C.paper, { radius: 22, line: { style: "solid", fill: p[2], width: 2 } }));
    e.push(tx(["01", "02", "03", "04"][i], x + 22, 230, 52, 34, 24, p[2], { font: F.display, bold: true }));
    e.push(tx(p[0], x + 20, 296, 224, 52, 22, C.ink, { font: F.display, bold: true, align: "center" }));
    e.push(tx(p[1], x + 22, 372, 220, 64, 15, C.mutedDark, { align: "center" }));
  });
  e.push(tx("Der Modus ist bewusst turn-basiert: zuhören → denken → sprechen → wieder zuhören.", 114, 524, 1050, 38, 23, C.ink, { font: F.display, bold: true, align: "center" }));
  e.push(tx("Kein vorgetäuschtes Full-Duplex · Echo und Datenschutz bleiben sichtbare Grenzen", 150, 574, 980, 26, 16, C.mutedDark, { align: "center" }));
  compose(e, "Zielzeit: 1:20. Ich wollte einen ChatGPT-ähnlichen Live-Dialog. Die stabile Lösung ist halbduplex: Nach einer fertigen Antwort liest Noesis vor und öffnet danach wieder das Mikrofon. Piper kann die Ausgabe lokal erzeugen. Die Web-Speech-Eingabe kann aber einen Anbieter-Onlinedienst verwenden, deshalb ist sie im Offline-Modus gesperrt. Der S23+-Klangtest von Piper steht noch aus.");
}

// 30
sectionSlide("4", "Wissen, aber mit Herkunft", "Die nächste Frage war nicht mehr nur, ob Noesis Wissen importieren kann — sondern ob jede neue Kante ehrlich begründet ist.", C.amber,
  "Zielzeit: 0:20. Überleitung: Ein Wissensgraph kann sehr überzeugend aussehen und trotzdem falsche Bedeutung vortäuschen. Deshalb wurden Provenienz, Schwellen und Importgrenzen zu Designmerkmalen.");

// 31 — PDF
{
  const e = [];
  base(e, "light", "Eigenes Wissen", "31");
  title(e, "Ein PDF ist noch kein semantischer Graph", "light", "Warum Abschnitt 2 nicht automatisch „mit“ Abschnitt 3 zusammenhängt");
  e.push(rect(62, 194, 268, 320, C.paper, { radius: 22, line: { style: "solid", fill: C.lineLight, width: 1 } }));
  e.push(tx("PDF", 110, 226, 170, 60, 42, C.coral, { font: F.display, bold: true, align: "center" }));
  e.push(tx("lokal gelesen\n≤ 30 MB · ≤ 80 Seiten", 94, 326, 204, 60, 17, C.mutedDark, { align: "center" }));
  e.push(tx("SHA-256\nSeitenbeleg\nImport-Scope", 100, 416, 192, 70, 15, C.ink, { font: F.mono, align: "center" }));
  e.push(rule(332, 350, 100, 0, C.coral, 4));
  const nodes = [
    [492, 238, "Abschnitt A"], [492, 380, "Abschnitt B"], [742, 238, "Kant"], [742, 380, "Transzendental"], [992, 308, "Bestand"],
  ];
  nodes.forEach((n, i) => {
    const col = i < 2 ? C.amber : i < 4 ? C.teal : C.lilac;
    e.push(rect(n[0], n[1], 170, 72, C.paper, { radius: 16, line: { style: "solid", fill: col, width: 2 } }));
    e.push(tx(n[2], n[0] + 14, n[1] + 23, 142, 26, 16, C.ink, { bold: true, align: "center" }));
  });
  e.push(rule(662, 274, 80, 0, C.teal, 3));
  e.push(rule(662, 416, 80, -142, C.teal, 2, "dash"));
  e.push(rule(912, 274, 80, 70, C.lilac, 2, "dash"));
  e.push(rule(912, 416, 80, -72, C.lilac, 2, "dash"));
  chip(e, "Entity-Nennung", 468, 520, 210, "light", C.teal);
  chip(e, "TF-IDF-Thema ≥ Schwelle", 700, 520, 258, "light", C.amber);
  chip(e, "sonst: keine Kante", 980, 520, 210, "light", C.red);
  e.push(tx("Offen: OCR, Spaltenlayout und Paraphrasen ohne gemeinsames Vokabular.", 116, 586, 1040, 26, 16, C.mutedDark, { align: "center" }));
  compose(e, "Zielzeit: 1:30. Der erste PDF-Import verband Abschnitte nach Reihenfolge. Das sah strukturiert aus, war aber keine semantische Aussage. Jetzt bleiben nur Dokument→Abschnitt als Quellenstruktur, eindeutige Entity-Nennungen und begrenzte lexikalische Themenkanten. Jede heuristische Kante speichert Score, Schwelle, gemeinsame Begriffe und Belegstellen. Lieber eine fehlende als eine erfundene Verbindung.");
}

// 32 — Wikipedia provenance
{
  const e = [];
  base(e, "dark", "Wikipedia-Erweiterung", "32");
  title(e, "Wikipedia-Kanten nur mit Beleg", "dark", "Automatisch ergänzen — aber nicht automatisch behaupten");
  const steps = [
    ["1", "Nutzer wählt Thema", "oder eindeutiger Wissensbefehl", C.coral],
    ["2", "MediaWiki-Suche", "mehrdeutige Treffer sichtbar", C.amber],
    ["3", "prop=links", "nur echte interne Links", C.teal],
    ["4", "Provenienz", "URL · Page-ID · Revision · Scope", C.lilac],
  ];
  steps.forEach((s, i) => {
    const x = 58 + i * 300;
    e.push(rect(x, 194, 266, 230, C.panel, { radius: 20, line: { style: "solid", fill: s[3], width: 2 } }));
    e.push(tx(s[0], x + 18, 216, 48, 36, 26, s[3], { font: F.display, bold: true }));
    e.push(tx(s[1], x + 20, 282, 226, 54, 21, C.ivory, { font: F.display, bold: true, align: "center" }));
    e.push(tx(s[2], x + 22, 360, 222, 40, 14.5, C.paper2, { align: "center" }));
  });
  card(e, { x: 72, y: 468, w: 530, h: 150, title: "Datenschutzgrenze", body: "Beim Auto-Nachimport gehen höchstens freigegebene Entitätsnamen an MediaWiki — niemals PDF- oder Notiztext.", accent: C.sage, tone: "dark" });
  card(e, { x: 674, y: 468, w: 530, h: 150, title: "Semantikgrenze", body: "„mediawiki_verlinkt_auf“ bedeutet nur: Der Quellartikel enthält diesen internen Link.", accent: C.amber, tone: "dark" });
  compose(e, "Zielzeit: 1:25. Den Unterschied zwischen Messgraph und Nutzergraph betonen. Der eingefrorene Experimentgraph bleibt unverändert. Wikipedia-Import ist Online-Funktion. Ein Link wird nicht als historische Beziehung umetikettiert. Reimporte sind idempotent und begrenzt.");
}

// 33 — Graph/Arena
{
  const e = [];
  base(e, "light", "Interaktiver Graph", "33");
  title(e, "Der Graph wird zum Interface", "light", "Pan, Zoom, Evidenzpfad und eine Kante als Gegenprobe");
  e.push(rect(56, 178, 720, 410, C.ink, { radius: 24 }));
  const pts = [
    [160, 280, C.coral], [300, 230, C.teal], [420, 330, C.lilac], [565, 250, C.amber], [670, 390, C.sage], [250, 450, C.amber], [500, 480, C.coral],
  ];
  const links = [[0,1],[0,5],[1,2],[2,3],[2,5],[2,6],[3,4],[4,6],[5,6]];
  links.forEach(([a,b], i) => e.push(rule(pts[a][0], pts[a][1], pts[b][0]-pts[a][0], pts[b][1]-pts[a][1], i===5 ? C.coral : C.lineDark, i===5 ? 5 : 2, i===5 ? "solid" : "dash")));
  pts.forEach((p,i) => {
    e.push(rect(p[0]-15,p[1]-15,30,30,p[2],{geometry:"ellipse",line:{style:"solid",fill:C.ivory,width:2}}));
    e.push(tx(String(i+1),p[0]-10,p[1]-9,20,18,11,C.ink,{bold:true,align:"center"}));
  });
  e.push(tx("Kante auswählen", 120, 528, 180, 22, 13, C.coral2, { bold: true }));
  e.push(tx("→ rechte Arena-Antwort ohne genau diese Kante", 282, 528, 440, 22, 13, C.ivory));
  card(e, { x: 818, y: 184, w: 390, h: 176, title: "Explorer", body: "cursorzentrierter Zoom · Hintergrund-Pan · Node-Drag · Pinch · Fit/Reset · Zeitreise", accent: C.teal, tone: "light" });
  card(e, { x: 818, y: 382, w: 390, h: 206, title: "Live-Arena", body: "verblindetes A/B zwischen Retrievalwegen; Evidenz und Zeiten aufklappbar. Kantenentfernung zeigt Sensitivität, aber keine Kausalität.", accent: C.coral, tone: "light" });
  compose(e, "Zielzeit: 1:20. Diese Funktion entstand aus einer echten Bedienhürde: Der ursprüngliche Canvas hatte keine Kamera. Heute kann ich navigieren und eine ausgewählte Kante als Gegenprobe in die Arena schicken. Das ist ein anschauliches Unterrichtsinstrument, kein kausales Experiment.");
}

// 34 — Quiz
{
  const e = [];
  base(e, "dark", "Seminar-Gimmick", "34");
  title(e, "Das Publikum baut mit — aber nicht am Experiment", "dark", "Kahoot-artiges Quiz und moderierter Seminargraph");
  e.push(img(assets.liveQuiz, 62, 182, 530, 314, { alt: "Live-Quiz noch ohne Supabase-Verbindung", fit: "contain", geometry: "roundRect", radius: 18 }));
  e.push(rect(60, 180, 534, 318, "none", { radius: 18, line: { style: "solid", fill: C.coral, width: 2 } }));
  card(e, { x: 636, y: 182, w: 274, h: 150, title: "Quiz", body: "QR-Raum · Lobby · 18 Sekunden · Tempo + Richtigkeit · Graph-Auflösung", accent: C.coral, tone: "dark" });
  card(e, { x: 930, y: 182, w: 274, h: 150, title: "Seminargraph", body: "Teilnehmende schlagen Themen vor; nur der Host gibt Wikipedia-Import frei.", accent: C.teal, tone: "dark" });
  card(e, { x: 636, y: 354, w: 568, h: 144, title: "Ehrlicher Status", body: "Supabase-Konfiguration nötig · Zielgröße 20 Geräte nicht lastgetestet · Host-Reload beendet den Raum · keine manipulationssichere Serverlogik.", accent: C.amber, tone: "dark" });
  e.push(tx("Interaktive Vorführung: ja. Datengrundlage des Hauptversuchs: nein.", 140, 548, 1000, 36, 22, C.amber, { font: F.display, bold: true, align: "center" }));
  compose(e, "Zielzeit: 1:15. Das Quiz ist bewusst ein Gimmick mit didaktischer Funktion: Nach der Antwort zeigt die App, wo die Frage im Graphen liegt. Der gemeinsame Seminargraph ist moderiert. Dieser Online-Modus und das gemeinsame gehostete Modell sind strikt vom Offline-Hauptversuch getrennt.");
}

// 35
sectionSlide("5", "Was kann ich wirklich behaupten?", "Ein funktionierendes Messinstrument ist ein Ergebnis des Schaffungsprozesses — aber noch kein Nachweis, dass Graph-RAG gewinnt.", C.amber,
  "Zielzeit: 0:20. Jetzt bewusst Tempo herausnehmen. Der Schluss soll nicht wie ein Feature-Finale wirken, sondern wie eine wissenschaftliche Bilanz.");

// 36 — Status board
{
  const e = [];
  base(e, "light", "Projektstatus", "36");
  title(e, "Technisch fertig ≠ wissenschaftlich beantwortet", "light", "Drei verschiedene Bedeutungen von „funktioniert“");
  card(e, { x: 58, y: 190, w: 356, h: 340, title: "Implementiert", body: "✓ 75/165 Messgraph\n✓ 40 Fragen\n✓ sechs Bedingungen\n✓ lokales WebLLM + CPU-Fallback\n✓ Export und Bewertung\n✓ Graph, Arena, PDF, Wikipedia", accent: C.green, tone: "light", label: "Code vorhanden" });
  card(e, { x: 462, y: 190, w: 356, h: 340, title: "Noch zu pilotieren", body: "○ S23+-Flugmoduslauf\n○ Dense-Modellcache\n○ Piper-Klang/Abbruch\n○ 20-Handy-Quiz\n○ Goldpfadkorrektur\n○ Fakten-/Quellenprüfung", accent: C.amber, tone: "light", label: "Praxisprüfung" });
  card(e, { x: 866, y: 190, w: 356, h: 340, title: "Empirisch offen", body: "□ 720 Kern-Trials\n□ zwei echte Modellgrößen\n□ Doppelbewertung + κ\n□ Rohdatenexport\n□ Bootstrap/Holm\n□ Entscheidung H1–H5", accent: C.red, tone: "light", label: "Hauptlauf" });
  e.push(tx("Das ist keine Schwäche der Präsentation, sondern ihr ehrlicher aktueller Stand.", 126, 576, 1030, 32, 20, C.ink, { font: F.display, bold: true, align: "center" }));
  compose(e, "Zielzeit: 1:30. Diese Folie kann als Checkliste für die nächsten Wochen dienen. 'Implementiert' heißt, dass Code vorhanden ist und Build/Node-Tests laufen. Es heißt nicht, dass jede Funktion auf dem Zielgerät oder unter Flugmodus validiert wurde. Der Hauptlauf ist noch vollständig offen.");
}

// 37 — Honest results
{
  const e = [];
  base(e, "dark", "Ergebnisstand", "37");
  title(e, "Das ehrliche Ergebnis heute", "dark", "Messinstrument fertig — Hypothesen offen");
  card(e, { x: 58, y: 188, w: 360, h: 338, title: "Belastbar", body: "75 Knoten · 165 Kanten\n40 stratifizierte Fragen\nsechs Bedingungen implementiert\nSeed, Zeiten, Evidenz, Export\nS23+-WebGPU-Ausfall dokumentiert", accent: C.green, tone: "dark", label: "Was ich zeigen kann" });
  card(e, { x: 460, y: 188, w: 360, h: 338, title: "Nicht behauptet", body: "kein freigegebener Pilot\nkein sauberer Rohdatensatz\nkeine Doppelbewertung\nkein κ\nkeine Entscheidung H1–H5\nDemo-Werte ≠ Ergebnis", accent: C.red, tone: "dark", label: "Was noch fehlt" });
  card(e, { x: 862, y: 188, w: 360, h: 338, title: "Nächster Nachweis", body: "Goldpfade + Rubrik einfrieren\n720 echte Kern-Trials\nzwei lokale Modelle + Dense\nzwei verblindete Rater\nΔ/CI/McNemar/Holm\np50/p95 berichten", accent: C.amber, tone: "dark", label: "Was folgen muss" });
  quote(e, "Ein überprüfbares Versuchsdesign ist ein Ergebnis des Projekts — aber noch kein Ergebnis des Experiments.", 130, 558, 1020, 56, "dark", C.amber);
  compose(e, "Zielzeit: 1:40. Diese Folie ist der wissenschaftliche Kern des Schlusses. Frühere Dashboardwerte sind Demo-/Mischdaten. Der einzige reale technische Befund ist die gerätespezifische WebGPU-Inkompatibilität. H1 bis H5 bleiben offen. Das ist vertretbar, weil die Abgabe erst Ende August ist und der Vortrag den Schaffungsprozess dokumentiert.");
}

// 38 — Gaps
{
  const e = [];
  base(e, "light", "Vor dem Hauptlauf", "38");
  title(e, "Die unbequemen offenen Punkte", "light", "Was ich noch korrigieren muss, bevor Zahlen Bedeutung bekommen");
  const gaps = [
    ["Primärtest", "Results.tsx paart derzeit alle Kategorien; nötig sind S2 ∪ S3.", C.red],
    ["Pseudoreplikation", "Modelle und Wiederholungen nicht blind zusammenzählen.", C.amber],
    ["Statistik", "Bootstrap-Konfidenzintervalle und Holm fehlen noch.", C.lilac],
    ["Rubrik", "Korrekte S5-Enthaltung eindeutig codieren.", C.teal],
    ["Goldpfade", "q21/q28 als Pfad oder Gold-Subgraph bereinigen.", C.coral],
    ["Hauptlauf-Guard", "Demo-Engine/TF-IDF darf nicht versehentlich messen.", C.green],
  ];
  gaps.forEach((g, i) => {
    const x = 58 + (i % 2) * 604, y = 180 + Math.floor(i / 2) * 142;
    e.push(rect(x, y, 560, 118, C.paper, { radius: 18, line: { style: "solid", fill: g[2], width: 2 } }));
    e.push(tx(g[0], x + 22, y + 18, 190, 30, 17.5, g[2], { font: F.display, bold: true }));
    e.push(tx(g[1], x + 218, y + 18, 316, 72, 15.5, C.coal));
  });
  e.push(tx("Ein Build ohne Fehler ist noch keine Freigabe zur Interpretation.", 140, 604, 1000, 30, 20, C.ink, { font: F.display, bold: true, align: "center" }));
  compose(e, "Zielzeit: 1:30. Nicht alle Lücken müssen im Vortrag technisch vertieft werden; zwei Beispiele reichen. Die Folie zeigt aber, dass ich das System nicht nur präsentiere, sondern kritisch auditieren kann. Besonders wichtig: Hauptlauf mit echter WebLLM-Engine und Dense Retrieval hart bestätigen.");
}

// 39 — AI scorecard
{
  const e = [];
  base(e, "dark", "Reflexion", "39");
  title(e, "Wo KI stark war — und wo nicht", "dark", "Nutzen ist nicht dasselbe wie Verlässlichkeit");
  const rows = [
    ["Ideen und Varianten", 4, 2],
    ["Breite Implementierung", 5, 1],
    ["Debugging mit Screenshot/Log", 5, 2],
    ["Methodische Vorschläge", 3, 1],
    ["Ungeprüfte Fertigmeldungen", 1, 1],
    ["Empirische Evidenz", 0, 0],
  ];
  e.push(tx("Bereich", 74, 180, 330, 24, 13, C.coral2, { bold: true }));
  e.push(tx("KI-Nutzen", 550, 180, 200, 24, 13, C.lilac, { bold: true, align: "center" }));
  e.push(tx("Verlässlichkeit ohne Prüfung", 820, 180, 320, 24, 13, C.amber, { bold: true, align: "center" }));
  rows.forEach((r, ri) => {
    const y = 220 + ri * 61;
    e.push(rect(58, y, 1162, 48, ri % 2 ? C.panel : C.ink2, { radius: 8 }));
    e.push(tx(r[0], 76, y + 13, 400, 24, 16, C.ivory, { bold: true }));
    for (let i = 0; i < 5; i++) {
      e.push(rect(570 + i * 34, y + 13, 18, 18, i < r[1] ? C.lilac : C.lineDark, { geometry: "ellipse" }));
      e.push(rect(886 + i * 34, y + 13, 18, 18, i < r[2] ? C.amber : C.lineDark, { geometry: "ellipse" }));
    }
  });
  e.push(tx("Mein Muster: KI wurde besonders gut, sobald ich ihr einen konkreten Fehler statt nur ein Ziel gab.", 120, 600, 1040, 30, 19, C.ivory, { font: F.display, bold: true, align: "center" }));
  compose(e, "Zielzeit: 1:40. Diese Bewertung ist meine reflektierte Selbsteinschätzung, keine quantitative Studie. Wichtigster Punkt: KI ist hervorragend in Varianten und Debugging, wenn Log, Screenshot oder Gegentest vorliegen. Sie ist schwach darin, selbst festzustellen, ob eine Implementierung wissenschaftlich belastbar ist.");
}

// 40 — Disclaimer
{
  const e = [];
  base(e, "light", "KI-Disclaimer", "40");
  title(e, "Wo KI in diesem Projekt verwendet wurde", "light", "Claude und ChatGPT · normale Chatfunktionen");
  const items = [
    ["Forschungsdesign", "Varianten für Frage, Hypothesen, Bedingungen und Metriken", C.coral],
    ["Code", "große Teile der React-/TypeScript-App, Retrieval, UI und Debugging", C.lilac],
    ["Korpus & Fragen", "Entwürfe für Knoten, Relationen, Kurztexte und Goldpfade", C.teal],
    ["Texte & Folien", "Rohfassungen, Struktur, Formulierungen und Visualisierung", C.amber],
  ];
  items.forEach((it, i) => {
    const x = 58 + (i % 2) * 604, y = 184 + Math.floor(i / 2) * 188;
    card(e, { x, y, w: 558, h: 164, title: it[0], body: it[1], accent: it[2], tone: "light" });
  });
  e.push(rect(82, 570, 1116, 54, C.ink, { radius: 16 }));
  e.push(tx("Bei mir blieben: Zielsetzung · Auswahl · Tests · Bewertung · Quellenprüfung · Verantwortung", 104, 586, 1072, 24, 17, C.ivory, { bold: true, align: "center" }));
  compose(e, "Zielzeit: 1:20. Wörtlich offenlegen: Der KI-Anteil ist substanziell und nicht auf Korrektur beschränkt. Die Modelle erzeugten umfangreiche Rohfassungen und Code. Ich wählte Richtungen, testete, korrigierte und trage Verantwortung. Lokale LLMs im Experiment sind Untersuchungsgegenstand; das optionale Online-Modell ist Demo und wird nicht als Messdatum verwendet.");
}

// 41 — Sources theory
{
  const e = [];
  base(e, "dark", "Quellen", "41");
  title(e, "Quellen I · Theorie und Experiment", "dark", "Primärquellen, die die zentralen Aussagen tragen");
  const sources = [
    ["Lewis et al. (2020)", "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks · NeurIPS 33", "papers.nips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5"],
    ["Edge et al. (2024)", "From Local to Global: A Graph RAG Approach to Query-Focused Summarization", "microsoft.com/research/publication/from-local-to-global-a-graph-rag-approach"],
    ["Gutierrez et al. (2024)", "HippoRAG: Neurobiologically Inspired Long-Term Memory for LLMs · NeurIPS 37", "proceedings.neurips.cc/paper_files/paper/2024/hash/6ddc001d07ca4f319af96a3024f6dbd1"],
    ["Yang et al. (2018)", "HotpotQA: A Dataset for Diverse, Explainable Multi-hop Question Answering · EMNLP", "aclanthology.org/D18-1259"],
    ["Abdin et al. (2024)", "Phi-3 Technical Report: A Highly Capable Language Model Locally on Your Phone", "arxiv.org/abs/2404.14219"],
  ];
  sources.forEach((s, i) => {
    const y = 176 + i * 88;
    e.push(tx(s[0], 70, y, 250, 25, 16, C.coral2, { font: F.display, bold: true }));
    e.push(tx(s[1], 330, y, 820, 28, 15.5, C.ivory, { bold: true }));
    e.push(tx(s[2], 330, y + 34, 820, 20, 11.5, C.muted, { font: F.mono }));
    e.push(rule(70, y + 67, 1080, 0, C.lineDark, 1));
  });
  e.push(tx("Hinweis: Das Projekt adaptiert die Graph-RAG-Grundidee; es behauptet keine Replikation der Microsoft-GraphRAG-Pipeline.", 88, 612, 1100, 24, 14, C.amber, { align: "center" }));
  compose(e, "Zielzeit: 0:35. Quellen nicht einzeln vorlesen. Nur die Abgrenzung erwähnen: RAG-Grundidee, Graph-RAG, Multi-Hop und mobile Kleinmodelle. Die vollständigen Links stehen zusätzlich in docs/QUELLENPRUEFUNG.md.");
}

// 42 — Sources tech
{
  const e = [];
  base(e, "dark", "Quellen", "42");
  title(e, "Quellen II · Technik, Daten und Sprache", "dark", "Dokumentation und offene Attribution");
  const sources = [
    ["MLC AI", "WebLLM-Dokumentation und WebLLM-Paper", "webllm.mlc.ai/docs · arxiv.org/abs/2412.15803"],
    ["MediaWiki", "Action API: Search, Query und prop=links", "mediawiki.org/wiki/API:Search · mediawiki.org/wiki/API:Query"],
    ["W3C Web Speech CG", "Web Speech API", "webaudio.github.io/web-speech-api"],
    ["Piper", "Piper, Piper-TTS-Web und de_DE-thorsten-medium", "github.com/rhasspy/piper · huggingface.co/rhasspy/piper-voices"],
    ["Projektstand", "Repository GladosV27/Proseminar_new · Arbeitsstand Juli 2026", "github.com/GladosV27/Proseminar_new · Commit 9b72cad"],
  ];
  sources.forEach((s, i) => {
    const y = 176 + i * 88;
    e.push(tx(s[0], 70, y, 250, 25, 16, C.teal, { font: F.display, bold: true }));
    e.push(tx(s[1], 330, y, 820, 28, 15.5, C.ivory, { bold: true }));
    e.push(tx(s[2], 330, y + 34, 820, 20, 11.5, C.muted, { font: F.mono }));
    e.push(rule(70, y + 67, 1080, 0, C.lineDark, 1));
  });
  e.push(tx("Noch offen: permanente Wikipedia-Versionen und konkrete Attribution aller 75 Knoten vor der Abgabe ergänzen.", 100, 612, 1080, 24, 14, C.amber, { bold: true, align: "center" }));
  compose(e, "Zielzeit: 0:35. Technische Quellen und die offene Wikipedia-Attribution nennen. Wichtig: Literatur begründet Theorie und Machbarkeit, ersetzt aber keine eigenen Messdaten.");
}

// 43 — Closing
{
  const e = [];
  e.push(img(assets.journey, 0, 0, W, H, { alt: "Abstrakte Entwicklung vom Entwurf zum System" }));
  e.push(rect(0, 0, W, H, C.ink));
  e.push(img(assets.journey, 360, 0, 920, H, { alt: "Wissensgraph und fertiges Interface", crop: { left: 0.18, top: 0, right: 0, bottom: 0 } }));
  e.push(rect(0, 0, 760, H, C.ink));
  e.push(rect(0, 0, 10, H, C.coral));
  e.push(tx("LET CHATGPT DO THE WORK?", 72, 74, 540, 24, 14, C.coral2, { bold: true }));
  e.push(tx("Ja — aber die KI wusste nicht zuverlässig, wann ihre Arbeit wirklich fertig war.", 72, 146, 640, 222, 47, C.ivory, { font: F.display, bold: true }));
  e.push(rule(74, 406, 180, 0, C.coral, 4));
  e.push(tx("Claude und ChatGPT erledigten einen erheblichen Teil der Entwurfs- und Implementierungsarbeit. Tests, Grenzen, Interpretation und Verantwortung blieben bei mir.", 74, 448, 600, 112, 21, C.paper2));
  chip(e, "Fragen?", 74, 592, 140, "dark", C.coral);
  e.push(tx("Optional jetzt: Noesis-Live-Demo oder Arena", 238, 600, 410, 22, 15, C.muted));
  compose(e, "Zielzeit: 1:00 plus Diskussion/Demo. Schlussformel wörtlich oder sinngemäß sprechen. Danach je nach Zeit eine kurze Noesis-Demo: dieselbe Frage mit Vektor und Graph beantworten, den Evidenzpfad öffnen und ausdrücklich sagen, dass dies eine Demonstration und kein Hauptlaufergebnis ist. Gesamtrahmen mit zwei kurzen Demos: ungefähr 43–48 Minuten.");
}

const file = await PresentationFile.exportPptx(presentation);
await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await file.save(OUTPUT);
console.log(OUTPUT);
