import type { Community, GraphEdge, GraphNode, KnowledgeGraph } from './types'

/**
 * Kuratierter Wissensgraph: Cluster »Deutscher Idealismus«.
 *
 * Der Korpus ist ein eingefrorener, manuell kuratierter Auszug aus dem
 * Themenfeld der entsprechenden Wikipedia-Artikel (Stand: Sommer 2026).
 * Artikel = Knoten, semantische Beziehungen = typisierte Kanten.
 * Die Zusammenfassungen dienen zugleich als Retrieval-Chunks für Vektor-RAG –
 * beide Bedingungen arbeiten also auf identischem Textmaterial (Kontrolle
 * der Konfundierung »Korpusinhalt«).
 *
 * Knoten, typisierte Kanten und die fünf thematischen Communities wurden
 * manuell kuratiert und als reproduzierbarer Messstand eingefroren.
 */

export const COMMUNITIES: Community[] = [
  {
    id: 'kritik',
    name: 'Kritische Philosophie',
    description: 'Kant, seine Quellen und die unmittelbare Kant-Rezeption (Königsberg, Aufklärung).',
  },
  {
    id: 'idealismus',
    name: 'Hochidealismus · Jena & Tübingen',
    description: 'Fichte, Schelling, Hegel, Hölderlin – Tübinger Stift, Universität Jena, Berlin.',
  },
  {
    id: 'weimar',
    name: 'Weimarer Klassik',
    description: 'Goethe, Schiller, Herder und das kulturelle Umfeld um 1800.',
  },
  {
    id: 'romantik',
    name: 'Jenaer Frühromantik',
    description: 'Die Brüder Schlegel, Novalis, Caroline – der romantische Kreis in Jena um 1800.',
  },
  {
    id: 'rezeption',
    name: 'Kritiker & Nachhegelianer',
    description: 'Schopenhauer, Feuerbach, Marx, Engels, Kierkegaard – Kritik und Transformation des Idealismus.',
  },
]

export const NODES: GraphNode[] = [
  // ────────────────────────── Community: Kritische Philosophie ──────────────────────────
  {
    id: 'kant',
    title: 'Immanuel Kant',
    type: 'person',
    community: 'kritik',
    aliases: ['Kant'],
    summary:
      'Immanuel Kant (1724–1804) war ein deutscher Philosoph der Aufklärung und Begründer der Transzendentalphilosophie. Er verbrachte sein gesamtes Leben in Königsberg, wo er an der Universität lehrte und die Umgebung der Stadt nie verließ. Mit der »Kritik der reinen Vernunft« (1781) vollzog er die »kopernikanische Wende« der Erkenntnistheorie; in der Ethik entwickelte er den kategorischen Imperativ. Nach eigener Aussage weckte ihn die Lektüre David Humes aus dem »dogmatischen Schlummer«; Rousseau lehrte ihn, »die Menschen zu ehren«.',
  },
  {
    id: 'hume',
    title: 'David Hume',
    type: 'person',
    community: 'kritik',
    aliases: ['Hume'],
    summary:
      'David Hume (1711–1776) war ein schottischer Philosoph, Ökonom und Historiker und Hauptvertreter des Empirismus. Seine skeptische Analyse des Kausalitätsbegriffs – Ursache-Wirkungs-Beziehungen sind nicht beobachtbar, sondern Gewohnheit – erschütterte die rationalistische Metaphysik. Kant bekannte, Hume habe ihn aus dem »dogmatischen Schlummer« geweckt und der kritischen Philosophie die Richtung gegeben.',
  },
  {
    id: 'rousseau',
    title: 'Jean-Jacques Rousseau',
    type: 'person',
    community: 'kritik',
    aliases: ['Rousseau'],
    summary:
      'Jean-Jacques Rousseau (1712–1778) war ein Genfer Philosoph und Schriftsteller. Mit dem »Gesellschaftsvertrag« (1762) und dem Erziehungsroman »Émile« prägte er die politische Philosophie der Moderne und wurde zu einem geistigen Wegbereiter der Französischen Revolution. Kant verehrte ihn tief; Rousseaus Aufwertung der Würde des einfachen Menschen beeinflusste Kants Ethik nachhaltig.',
  },
  {
    id: 'spinoza',
    title: 'Baruch de Spinoza',
    type: 'person',
    community: 'kritik',
    aliases: ['Spinoza'],
    summary:
      'Baruch de Spinoza (1632–1677) war ein niederländischer Philosoph. Seine »Ethik« entwirft einen Substanzmonismus, in dem Gott und Natur zusammenfallen (»Deus sive Natura«). Der Pantheismusstreit von 1785 löste eine regelrechte Spinoza-Renaissance aus: Goethe, Schelling und Hegel beriefen sich ausdrücklich auf ihn, und der Deutsche Idealismus ist ohne die Auseinandersetzung mit Spinoza nicht denkbar.',
  },
  {
    id: 'mendelssohn',
    title: 'Moses Mendelssohn',
    type: 'person',
    community: 'kritik',
    aliases: ['Mendelssohn'],
    summary:
      'Moses Mendelssohn (1729–1786) war ein deutsch-jüdischer Philosoph der Aufklärung und zentrale Figur der Haskala. Im Pantheismusstreit verteidigte er seinen verstorbenen Freund Gotthold Ephraim Lessing gegen Friedrich Heinrich Jacobis Vorwurf, Lessing sei Spinozist gewesen. Die »Morgenstunden« (1785) waren seine philosophische Antwort in diesem Streit.',
  },
  {
    id: 'jacobi',
    title: 'Friedrich Heinrich Jacobi',
    type: 'person',
    community: 'kritik',
    aliases: ['Jacobi'],
    summary:
      'Friedrich Heinrich Jacobi (1743–1819) war ein deutscher Philosoph und Schriftsteller. Mit der Schrift »Über die Lehre des Spinoza« (1785) löste er den Pantheismusstreit mit Moses Mendelssohn über den angeblichen Spinozismus Lessings aus. Er kritisierte Kants Begriff des Dings an sich mit dem berühmten Diktum, ohne diese Voraussetzung könne man nicht in das System hineinkommen, mit ihr nicht darin bleiben. Später wurde er Präsident der Bayerischen Akademie der Wissenschaften.',
  },
  {
    id: 'reinhold',
    title: 'Karl Leonhard Reinhold',
    type: 'person',
    community: 'kritik',
    aliases: ['Reinhold'],
    summary:
      'Karl Leonhard Reinhold (1757–1823) machte mit seinen »Briefen über die Kantische Philosophie« (1786/87) Kants Denken einem breiten Publikum bekannt. 1787 erhielt er in Jena den ersten Lehrstuhl für kritische Philosophie und entwickelte dort seine Elementarphilosophie. Als er 1794 nach Kiel wechselte, wurde Johann Gottlieb Fichte sein Nachfolger auf dem Jenaer Lehrstuhl.',
  },
  {
    id: 'krv',
    title: 'Kritik der reinen Vernunft',
    type: 'werk',
    community: 'kritik',
    aliases: ['KrV', 'Kritik der reinen Vernunft'],
    summary:
      'Die »Kritik der reinen Vernunft« (1781, stark überarbeitete zweite Auflage 1787) ist Immanuel Kants erkenntnistheoretisches Hauptwerk und Gründungsdokument der Transzendentalphilosophie. Sie untersucht die Bedingungen der Möglichkeit von Erkenntnis: Raum, Zeit und die Kategorien strukturieren jede Erfahrung, während das Ding an sich unerkennbar bleibt. Das Werk begrenzt die Metaphysik auf den Bereich möglicher Erfahrung.',
  },
  {
    id: 'kategorischer_imperativ',
    title: 'Kategorischer Imperativ',
    type: 'konzept',
    community: 'kritik',
    summary:
      'Der kategorische Imperativ ist das Grundprinzip von Kants Ethik, formuliert in der »Grundlegung zur Metaphysik der Sitten« (1785): »Handle nur nach derjenigen Maxime, durch die du zugleich wollen kannst, dass sie ein allgemeines Gesetz werde.« Die Menschheitsformel verbietet, Personen bloß als Mittel zu gebrauchen. Er begründet eine Pflichtethik, die vom Nutzen einer Handlung unabhängig ist.',
  },
  {
    id: 'ding_an_sich',
    title: 'Ding an sich',
    type: 'konzept',
    community: 'kritik',
    summary:
      'Das »Ding an sich« bezeichnet bei Kant die Wirklichkeit, wie sie unabhängig von unserer Anschauung ist – prinzipiell unerkennbar, da alle Erkenntnis an Raum, Zeit und Kategorien gebunden bleibt. Jacobi kritisierte den Begriff früh als inkonsistent; der Deutsche Idealismus versuchte, ihn ganz zu überwinden. Schopenhauer deutete das Ding an sich später als »Wille« um.',
  },
  {
    id: 'transzendentalphilosophie',
    title: 'Transzendentalphilosophie',
    type: 'konzept',
    community: 'kritik',
    summary:
      'Transzendentalphilosophie fragt nicht nach Gegenständen, sondern nach den Bedingungen der Möglichkeit ihrer Erkenntnis. Kant begründete sie mit der »Kritik der reinen Vernunft« als »kopernikanische Wende«: Nicht unsere Erkenntnis richtet sich nach den Gegenständen, sondern die Gegenstände der Erfahrung nach den Strukturen unseres Erkennens. Fichte, Schelling und Hegel entwickelten diesen Ansatz zum Deutschen Idealismus weiter.',
  },
  {
    id: 'aufklaerung',
    title: 'Aufklärung',
    type: 'konzept',
    community: 'kritik',
    summary:
      'Die Aufklärung war die europäische Geistesbewegung des 17. und 18. Jahrhunderts, die Vernunft, Kritik und Mündigkeit zum Maßstab machte. Kant definierte sie 1784 als »Ausgang des Menschen aus seiner selbstverschuldeten Unmündigkeit« unter dem Wahlspruch »Sapere aude!«. Ihre Ideen bereiteten die Französische Revolution geistig vor.',
  },
  {
    id: 'koenigsberg',
    title: 'Königsberg',
    type: 'ort',
    community: 'kritik',
    summary:
      'Königsberg (heute Kaliningrad) war die Hauptstadt Ostpreußens und Universitätsstadt an der Ostsee. Immanuel Kant wurde hier 1724 geboren, lehrte an der Albertus-Universität und verließ die Umgebung der Stadt zeitlebens nicht. Auch Johann Gottfried Herder studierte hier und hörte Kants Vorlesungen.',
  },
  {
    id: 'pantheismusstreit',
    title: 'Pantheismusstreit',
    type: 'ereignis',
    community: 'kritik',
    aliases: ['Spinozastreit'],
    summary:
      'Der Pantheismusstreit (ab 1785) war die Kontroverse zwischen Friedrich Heinrich Jacobi und Moses Mendelssohn über die Frage, ob Lessing Spinozist gewesen sei. Jacobi wollte damit vor den nihilistischen Konsequenzen der reinen Vernunftphilosophie warnen, bewirkte aber das Gegenteil: eine Spinoza-Renaissance, die Goethe, Schelling und Hegel tief prägte und dem Deutschen Idealismus den Weg bereitete.',
  },

  // ────────────────────────── Community: Hochidealismus ──────────────────────────
  {
    id: 'fichte',
    title: 'Johann Gottlieb Fichte',
    type: 'person',
    community: 'idealismus',
    aliases: ['Fichte'],
    summary:
      'Johann Gottlieb Fichte (1762–1814) war der erste große Systemdenker des Deutschen Idealismus. 1794 wurde er als Nachfolger Reinholds Professor in Jena, wo seine »Wissenschaftslehre« entstand. Im Atheismusstreit verlor er 1799 seine Jenaer Professur und ging nach Berlin; dort hielt er die »Reden an die deutsche Nation« (1807/08) und wurde 1811 erster gewählter Rektor der neu gegründeten Berliner Universität, an der er bis zu seinem Tod lehrte. Sein Berliner Lehrstuhl ging 1818 an Hegel über.',
  },
  {
    id: 'schelling',
    title: 'Friedrich Wilhelm Joseph Schelling',
    type: 'person',
    community: 'idealismus',
    aliases: ['Schelling'],
    summary:
      'Friedrich Wilhelm Joseph Schelling (1775–1854) trat schon mit 15 Jahren in das Tübinger Stift ein, wo er die Stube mit Hegel und Hölderlin teilte. Auf Betreiben Goethes wurde er 1798 mit nur 23 Jahren außerordentlicher Professor in Jena; 1800 erschien sein »System des transzendentalen Idealismus«. Er begründete die Naturphilosophie des Idealismus. 1841 wurde er auf Hegels verwaisten Berliner Lehrstuhl berufen, um den Hegelianismus zurückzudrängen – unter seinen Hörern saßen Kierkegaard, Engels, Bakunin und Burckhardt.',
  },
  {
    id: 'hegel',
    title: 'Georg Wilhelm Friedrich Hegel',
    type: 'person',
    community: 'idealismus',
    aliases: ['Hegel'],
    summary:
      'Georg Wilhelm Friedrich Hegel (geboren am 27. August 1770 in Stuttgart, gestorben am 14. November 1831 in Berlin) war der Vollender des Deutschen Idealismus. Er studierte am Tübinger Stift gemeinsam mit Schelling und Hölderlin, lehrte ab 1801 in Jena, wurde nach Stationen in Bamberg und Nürnberg 1816 Professor in Heidelberg und übernahm 1818 Fichtes ehemaligen Lehrstuhl in Berlin, wo er bis zu seinem Tod während der Cholera-Epidemie wirkte. Seine Dialektik und der absolute Idealismus prägten das Denken des 19. Jahrhunderts wie kein zweites System.',
  },
  {
    id: 'hoelderlin',
    title: 'Friedrich Hölderlin',
    type: 'person',
    community: 'idealismus',
    aliases: ['Hölderlin', 'Hoelderlin'],
    summary:
      'Friedrich Hölderlin (1770–1843) war einer der bedeutendsten deutschen Lyriker. Im Tübinger Stift verband ihn eine enge Freundschaft mit seinen Stubengenossen Hegel und Schelling; die drei begeisterten sich gemeinsam für die Französische Revolution. Sein Briefroman »Hyperion« (1797/99) verklärt Griechenland als Ideal. Ab 1806 lebte er, als unheilbar geltend, sechsunddreißig Jahre im Tübinger Turm bei der Familie Zimmer.',
  },
  {
    id: 'wissenschaftslehre',
    title: 'Wissenschaftslehre',
    type: 'werk',
    community: 'idealismus',
    aliases: ['Grundlage der gesamten Wissenschaftslehre'],
    summary:
      'Die »Grundlage der gesamten Wissenschaftslehre« (1794/95) ist Johann Gottlieb Fichtes Hauptwerk, entstanden zu Beginn seiner Jenaer Professur. Ausgehend vom sich selbst setzenden Ich entwickelt sie die Philosophie als System aus einem einzigen Prinzip – radikaler als Kant, dessen Ding an sich Fichte verwarf. Das Werk wurde zum Ausgangspunkt des Deutschen Idealismus.',
  },
  {
    id: 'system_ti',
    title: 'System des transzendentalen Idealismus',
    type: 'werk',
    community: 'idealismus',
    summary:
      'Das »System des transzendentalen Idealismus« (1800) ist Schellings Jenaer Hauptwerk. Es führt theoretische und praktische Philosophie zusammen und erklärt die Kunst zum »Organon der Philosophie«: Im Kunstwerk wird die Identität von Natur und Geist anschaubar. Das Werk markiert den Höhepunkt von Schellings früher Systemphase vor der Naturphilosophie des Identitätssystems.',
  },
  {
    id: 'phaenomenologie',
    title: 'Phänomenologie des Geistes',
    type: 'werk',
    community: 'idealismus',
    aliases: ['Phänomenologie'],
    summary:
      'Die »Phänomenologie des Geistes« (1807) ist Hegels erstes Hauptwerk, vollendet in Jena, während in der Nähe die Schlacht von Jena und Auerstedt tobte. Sie beschreibt den Bildungsweg des Bewusstseins von der sinnlichen Gewissheit bis zum absoluten Wissen; berühmt ist das Kapitel über Herrschaft und Knechtschaft. Mit diesem Werk löste sich Hegel philosophisch von Schelling.',
  },
  {
    id: 'logik',
    title: 'Wissenschaft der Logik',
    type: 'werk',
    community: 'idealismus',
    summary:
      'Die »Wissenschaft der Logik« (1812–1816) verfasste Hegel während seiner Zeit als Gymnasialrektor in Nürnberg. Sie entfaltet die reinen Denkbestimmungen in den drei Büchern Sein, Wesen und Begriff und bildet das methodische Fundament seines Systems. Die dialektische Bewegung der Begriffe – jede Bestimmung treibt über sich hinaus – wird hier in Reinform durchgeführt.',
  },
  {
    id: 'rechtsphilosophie',
    title: 'Grundlinien der Philosophie des Rechts',
    type: 'werk',
    community: 'idealismus',
    aliases: ['Rechtsphilosophie'],
    summary:
      'Die »Grundlinien der Philosophie des Rechts« (1820) sind Hegels Berliner Hauptwerk zur praktischen Philosophie. Der Satz aus der Vorrede – »Was vernünftig ist, das ist wirklich; und was wirklich ist, das ist vernünftig« – wurde zum meistdiskutierten Diktum des Werkes. Es entwickelt Recht, Moralität und Sittlichkeit bis hin zur Theorie des modernen Staates.',
  },
  {
    id: 'dialektik',
    title: 'Dialektik',
    type: 'konzept',
    community: 'idealismus',
    summary:
      'Dialektik bezeichnet bei Hegel die Bewegungsform des Denkens und der Wirklichkeit selbst: Jede Bestimmung erzeugt ihren Widerspruch und wird in einer höheren Einheit »aufgehoben« – im dreifachen Sinn von negieren, bewahren und emporheben. Karl Marx übernahm die Methode, stellte sie aber materialistisch »vom Kopf auf die Füße«. Das populäre Schema These–Antithese–Synthese stammt der Sache nach eher aus der Fichte-Rezeption.',
  },
  {
    id: 'absoluter_idealismus',
    title: 'Absoluter Idealismus',
    type: 'konzept',
    community: 'idealismus',
    aliases: ['Absoluter Geist'],
    summary:
      'Der absolute Idealismus ist Hegels Position, nach der die gesamte Wirklichkeit Entfaltung des Geistes ist: Substanz muss »ebensosehr als Subjekt« gedacht werden. Der Geist erkennt sich in Kunst, Religion und Philosophie selbst – als absoluter Geist. Damit überwindet Hegel die kantische Grenze des Dings an sich vollständig.',
  },
  {
    id: 'deutscher_idealismus',
    title: 'Deutscher Idealismus',
    type: 'konzept',
    community: 'idealismus',
    summary:
      'Der Deutsche Idealismus ist die philosophische Epoche zwischen Kants »Kritik der reinen Vernunft« (1781) und Hegels Tod (1831), getragen von Fichte, Schelling und Hegel. Ausgehend von Kants Transzendentalphilosophie suchte er die Wirklichkeit insgesamt aus dem Prinzip des Geistes bzw. der Subjektivität zu begreifen. Universitäre Zentren waren Jena um 1800 und später Berlin.',
  },
  {
    id: 'atheismusstreit',
    title: 'Atheismusstreit',
    type: 'ereignis',
    community: 'idealismus',
    summary:
      'Der Atheismusstreit (1798/99) entzündete sich an einem Aufsatz aus Fichtes Umfeld über den Religionsbegriff. Fichte wurde Atheismus vorgeworfen; nach einer trotzig angebotenen Rücktrittsdrohung wurde er 1799 tatsächlich aus seiner Jenaer Professur entlassen und ging nach Berlin. Jacobi prägte in seinem offenen »Brief an Fichte« das Schlagwort vom Nihilismus.',
  },
  {
    id: 'tuebinger_stift',
    title: 'Tübinger Stift',
    type: 'institution',
    community: 'idealismus',
    aliases: ['Stift'],
    summary:
      'Das Tübinger Stift ist ein 1536 gegründetes evangelisches Studienhaus in Tübingen. Legendär wurde die Stube, die sich ab 1790 Hegel, Schelling und Hölderlin teilten – drei Stiftler, die die deutsche Geistesgeschichte prägen sollten und sich gemeinsam für die Französische Revolution begeisterten. Auch Johannes Kepler war zwei Jahrhunderte zuvor Stipendiat des Stifts.',
  },
  {
    id: 'uni_jena',
    title: 'Universität Jena',
    type: 'institution',
    community: 'idealismus',
    aliases: ['Jena'],
    summary:
      'Die Universität Jena war um 1800 das intellektuelle Zentrum Deutschlands: Reinhold, Fichte, Schelling und Hegel lehrten hier Philosophie, Schiller Geschichte; zugleich versammelte sich in Jena die Frühromantik um die Brüder Schlegel und Novalis. Die Berufungspolitik wurde maßgeblich vom Weimarer Minister Goethe gesteuert. Nach der Schlacht von Jena 1806 verlor die Universität rasch an Bedeutung.',
  },
  {
    id: 'uni_berlin',
    title: 'Universität Berlin',
    type: 'institution',
    community: 'idealismus',
    aliases: ['Berliner Universität', 'Berlin'],
    summary:
      'Die Universität Berlin wurde 1810 nach den Reformideen Wilhelm von Humboldts gegründet – Einheit von Forschung und Lehre. Fichte wurde 1811 ihr erster gewählter Rektor; 1818 übernahm Hegel dessen Lehrstuhl und machte Berlin zum Zentrum des Hegelianismus. 1841 berief Friedrich Wilhelm IV. Schelling nach Berlin, um eben diesen Hegelianismus zurückzudrängen.',
  },
  {
    id: 'uni_heidelberg',
    title: 'Universität Heidelberg',
    type: 'institution',
    community: 'idealismus',
    aliases: ['Heidelberg'],
    summary:
      'Die 1386 gegründete Universität Heidelberg ist die älteste Universität auf dem Gebiet des heutigen Deutschland. Hegel erhielt hier 1816 seine erste ordentliche Professur und veröffentlichte die »Enzyklopädie der philosophischen Wissenschaften« (1817), bevor er 1818 dem Ruf nach Berlin folgte.',
  },
  {
    id: 'stuttgart',
    title: 'Stuttgart',
    type: 'ort',
    community: 'idealismus',
    summary:
      'Stuttgart, die Residenzstadt des Herzogtums Württemberg, ist die Geburtsstadt Georg Wilhelm Friedrich Hegels, der hier am 27. August 1770 zur Welt kam und das Gymnasium illustre besuchte, bevor er 1788 in das Tübinger Stift eintrat.',
  },
  {
    id: 'franzoesische_revolution',
    title: 'Französische Revolution',
    type: 'ereignis',
    community: 'idealismus',
    summary:
      'Die Französische Revolution (ab 1789) stürzte das Ancien Régime und proklamierte Freiheit, Gleichheit, Brüderlichkeit. Die jungen Tübinger Stiftler Hegel, Schelling und Hölderlin begeisterten sich für sie; Hegel nannte sie später einen »herrlichen Sonnenaufgang«. Ideengeschichtlich war sie von der Aufklärung und Rousseau vorbereitet und wurde zum Bezugspunkt der gesamten idealistischen Freiheitsphilosophie.',
  },
  {
    id: 'berliner_vorlesungen',
    title: 'Schellings Berliner Vorlesungen (1841)',
    type: 'ereignis',
    community: 'idealismus',
    aliases: ['Berliner Vorlesungen'],
    summary:
      'Im Winter 1841/42 hielt der 66-jährige Schelling auf Einladung Friedrich Wilhelms IV. seine Berliner Antrittsvorlesungen über die »Philosophie der Offenbarung« – erklärtes Ziel war es, den Einfluss des verstorbenen Hegel zu brechen. Im überfüllten Auditorium saßen Sören Kierkegaard, Friedrich Engels, Michail Bakunin und Jacob Burckhardt. Die meisten Hörer, darunter Kierkegaard und Engels, reagierten enttäuscht bis polemisch.',
  },

  // ────────────────────────── Community: Weimarer Klassik ──────────────────────────
  {
    id: 'goethe',
    title: 'Johann Wolfgang von Goethe',
    type: 'person',
    community: 'weimar',
    aliases: ['Goethe'],
    summary:
      'Johann Wolfgang von Goethe (1749–1832) war Dichter, Naturforscher und Weimarer Staatsminister – die Zentralfigur der Weimarer Klassik. Als für die Universität Jena zuständiger Minister betrieb er die Berufungen Fichtes (1794) und des erst 23-jährigen Schelling (1798). Sein Denken war tief von Spinoza geprägt; die Freundschaft mit Schiller ab 1794 wurde zum Kern der Klassik. Sein Lebenswerk gipfelt im »Faust«.',
  },
  {
    id: 'schiller',
    title: 'Friedrich Schiller',
    type: 'person',
    community: 'weimar',
    aliases: ['Schiller'],
    summary:
      'Friedrich Schiller (1759–1805) war Dichter, Dramatiker und ab 1789 Professor für Geschichte in Jena. Seine Schrift »Über die ästhetische Erziehung des Menschen« (1795) verbindet Kants Philosophie mit einer Theorie der Kunst als Weg zur Freiheit. Die enge Freundschaft und der Briefwechsel mit Goethe ab 1794 begründeten die Weimarer Klassik.',
  },
  {
    id: 'herder',
    title: 'Johann Gottfried Herder',
    type: 'person',
    community: 'weimar',
    aliases: ['Herder'],
    summary:
      'Johann Gottfried Herder (1744–1803) studierte in Königsberg und hörte dort als Schüler Kants dessen Vorlesungen. Später wurde er Generalsuperintendent in Weimar und einer der Wegbereiter der Weimarer Klassik. Mit den »Ideen zur Philosophie der Geschichte der Menschheit« begründete er die moderne Geschichts- und Kulturphilosophie; in der »Metakritik« (1799) wandte er sich scharf gegen seinen einstigen Lehrer Kant.',
  },
  {
    id: 'weimarer_klassik',
    title: 'Weimarer Klassik',
    type: 'konzept',
    community: 'weimar',
    summary:
      'Die Weimarer Klassik (ca. 1786–1805) ist die von Goethe und Schiller geprägte Blütezeit der deutschen Literatur, mit Herder und Wieland als weiteren Repräsentanten. Ihr Ideal der ästhetischen Bildung des Menschen stand in engem Austausch mit der Philosophie in Jena – räumlich wie geistig lagen Klassik und Idealismus nur wenige Kilometer auseinander.',
  },
  {
    id: 'hyperion',
    title: 'Hyperion',
    type: 'werk',
    community: 'weimar',
    summary:
      '»Hyperion oder Der Eremit in Griechenland« (1797/99) ist Friedrich Hölderlins Briefroman. Der junge Grieche Hyperion kämpft für die Befreiung seines Landes und scheitert an der Wirklichkeit; berühmt ist die »Scheltrede« auf die Deutschen. Der Roman verdichtet die idealistische Sehnsucht nach Einheit von Mensch, Natur und Schönheit.',
  },

  // ────────────────────────── Community: Kritiker & Nachhegelianer ──────────────────────────
  {
    id: 'schopenhauer',
    title: 'Arthur Schopenhauer',
    type: 'person',
    community: 'rezeption',
    aliases: ['Schopenhauer'],
    summary:
      'Arthur Schopenhauer (1788–1860) knüpfte an Kant an und deutete das Ding an sich als blinden, drängenden »Willen«. Sein Hauptwerk »Die Welt als Wille und Vorstellung« erschien 1819. Als Privatdozent in Berlin legte er seine Vorlesung aus Rivalität absichtlich auf dieselbe Stunde wie die Hegels – und blieb ohne Hörer. Seine Polemik gegen Hegel (»geistloser Scharlatan«) ist legendär; gewirkt hat er erst spät, dann aber auf Nietzsche, Wagner und Freud.',
  },
  {
    id: 'wwv',
    title: 'Die Welt als Wille und Vorstellung',
    type: 'werk',
    community: 'rezeption',
    summary:
      '»Die Welt als Wille und Vorstellung« (1819) ist Arthur Schopenhauers Hauptwerk in vier Büchern. Die Welt ist einerseits Vorstellung (Erscheinung), andererseits Wille – Schopenhauers Umdeutung des kantischen Dings an sich. Erlösung vom Leiden am Willen bieten die ästhetische Kontemplation, die Mitleidsethik und schließlich die Verneinung des Willens.',
  },
  {
    id: 'feuerbach',
    title: 'Ludwig Feuerbach',
    type: 'person',
    community: 'rezeption',
    aliases: ['Feuerbach'],
    summary:
      'Ludwig Feuerbach (1804–1872) studierte in Berlin und hörte dort begeistert Hegels Vorlesungen, wandte sich später aber vom Idealismus ab. In »Das Wesen des Christentums« (1841) deutete er Religion anthropologisch: Gott ist die Projektion menschlicher Wesenskräfte. Sein sinnlicher Materialismus wurde zum entscheidenden Bindeglied zwischen Hegel und Marx (»Feuerbachthesen«).',
  },
  {
    id: 'wesen_christentums',
    title: 'Das Wesen des Christentums',
    type: 'werk',
    community: 'rezeption',
    summary:
      '»Das Wesen des Christentums« (1841) ist Ludwig Feuerbachs Hauptwerk. Es deutet die Theologie als verkappte Anthropologie: Der Mensch schafft Gott nach seinem Bilde, indem er die eigenen Wesenskräfte – Vernunft, Liebe, Wille – in ein jenseitiges Wesen projiziert. Das Buch elektrisierte die Junghegelianer und bereitete die Religionskritik von Marx vor.',
  },
  {
    id: 'marx',
    title: 'Karl Marx',
    type: 'person',
    community: 'rezeption',
    aliases: ['Marx'],
    summary:
      'Karl Marx (1818–1883) kam als Student in Berlin in den Kreis der Junghegelianer (»Doktorklub«). Er übernahm Hegels Dialektik, stellte sie aber materialistisch »vom Kopf auf die Füße«: Nicht das Bewusstsein bestimmt das Sein, sondern das gesellschaftliche Sein das Bewusstsein. Mit seinem Freund und Mitstreiter Friedrich Engels verfasste er das »Manifest der Kommunistischen Partei« (1848); sein ökonomisches Hauptwerk »Das Kapital« (Band 1, 1867) begründete den historischen Materialismus als Kritik der politischen Ökonomie.',
  },
  {
    id: 'engels',
    title: 'Friedrich Engels',
    type: 'person',
    community: 'rezeption',
    aliases: ['Engels'],
    summary:
      'Friedrich Engels (1820–1895) hörte 1841 als Gasthörer Schellings Berliner Antrittsvorlesungen und attackierte sie in Streitschriften wie »Schelling und die Offenbarung« – aus Treue zur Hegelschen Dialektik. Als engster Freund und Mitarbeiter von Karl Marx verfasste er mit ihm das Kommunistische Manifest und gab nach Marx’ Tod die Bände 2 und 3 des »Kapital« aus dem Nachlass heraus.',
  },
  {
    id: 'kapital',
    title: 'Das Kapital',
    type: 'werk',
    community: 'rezeption',
    summary:
      '»Das Kapital. Kritik der politischen Ökonomie« ist Karl Marx’ ökonomisches Hauptwerk; Band 1 erschien 1867 in Hamburg. Zentrale Begriffe sind Ware, Wert, Mehrwert und der Warenfetisch. Die Darstellungsmethode ist erklärtermaßen der Hegelschen Dialektik verpflichtet – materialistisch umgestülpt. Die Bände 2 und 3 gab Friedrich Engels nach Marx’ Tod aus dem Nachlass heraus.',
  },
  {
    id: 'kierkegaard',
    title: 'Sören Kierkegaard',
    type: 'person',
    community: 'rezeption',
    aliases: ['Kierkegaard', 'Søren Kierkegaard'],
    summary:
      'Sören Kierkegaard (1813–1855) war ein dänischer Philosoph und Begründer der Existenzphilosophie. 1841/42 reiste er eigens nach Berlin, um Schellings Vorlesungen gegen den Hegelianismus zu hören – und kehrte tief enttäuscht zurück. Sein Werk (»Entweder – Oder«, 1843) verteidigt den existierenden Einzelnen gegen Hegels System: Die Wahrheit der Existenz geht in keiner Weltvernunft auf.',
  },
  {
    id: 'junghegelianer',
    title: 'Junghegelianer',
    type: 'konzept',
    community: 'rezeption',
    aliases: ['Linkshegelianer', 'Doktorklub'],
    summary:
      'Die Junghegelianer (Linkshegelianer) waren eine Gruppe radikaler Hegel-Schüler der 1830er/40er Jahre, die Hegels Dialektik gegen Religion und preußischen Staat wendeten – im Berliner »Doktorklub« verkehrte auch der junge Karl Marx. Zu ihrem Umfeld zählten Bruno Bauer, Max Stirner und Ludwig Feuerbach, dessen Religionskritik die Bewegung radikalisierte.',
  },
  {
    id: 'historischer_materialismus',
    title: 'Historischer Materialismus',
    type: 'konzept',
    community: 'rezeption',
    summary:
      'Der historische Materialismus ist die von Karl Marx und Friedrich Engels begründete Geschichtsauffassung: Die Entwicklung der Produktivkräfte und die Klassenkämpfe – nicht Ideen – treiben die Geschichte. Er entstand aus der materialistischen Umkehrung der Hegelschen Dialektik und über die Zwischenstation von Feuerbachs Religionskritik.',
  },

  // ────────────────────────── Erweiterung: Vorläufer & Aufklärung ──────────────────────────
  {
    id: 'leibniz',
    title: 'Gottfried Wilhelm Leibniz',
    type: 'person',
    community: 'kritik',
    aliases: ['Leibniz'],
    summary:
      'Gottfried Wilhelm Leibniz (1646–1716) war Universalgelehrter: Philosoph, Mathematiker (Infinitesimalrechnung parallel zu Newton), Diplomat. Seine Monadologie und die Theodizee mit der These von der »besten aller möglichen Welten« prägten den deutschen Rationalismus. Über die Systematisierung durch Christian Wolff wurde sein Denken zur Schulmetaphysik, an der sich Kants Kritik entzündete.',
  },
  {
    id: 'wolff',
    title: 'Christian Wolff',
    type: 'person',
    community: 'kritik',
    aliases: ['Wolff'],
    summary:
      'Christian Wolff (1679–1754) systematisierte die Philosophie Leibniz’ zum Leibniz-Wolffschen Schulsystem und machte Deutsch zur Philosophiesprache. 1723 wurde er auf Betreiben der Hallenser Pietisten des Landes verwiesen, später ehrenvoll zurückberufen. Der »dogmatische Schlummer«, aus dem Hume Kant weckte, meint genau diese rationalistische Schulmetaphysik.',
  },
  {
    id: 'lessing',
    title: 'Gotthold Ephraim Lessing',
    type: 'person',
    community: 'kritik',
    aliases: ['Lessing'],
    summary:
      'Gotthold Ephraim Lessing (1729–1781) war der bedeutendste Dichter der deutschen Aufklärung (»Nathan der Weise« mit der Ringparabel) und eng mit Moses Mendelssohn befreundet. Jacobis Behauptung, Lessing habe sich ihm gegenüber zum Spinozismus (»Hen kai pan«) bekannt, löste nach Lessings Tod den Pantheismusstreit aus.',
  },
  {
    id: 'grundlegung',
    title: 'Grundlegung zur Metaphysik der Sitten',
    type: 'werk',
    community: 'kritik',
    summary:
      'Die »Grundlegung zur Metaphysik der Sitten« (1785) ist Kants ethische Programmschrift. Hier formuliert er erstmals den kategorischen Imperativ und den Begriff des uneingeschränkt Guten – des guten Willens. Die »Kritik der praktischen Vernunft« (1788) führte das Programm aus.',
  },
  {
    id: 'ethik_spinoza',
    title: 'Ethik (Spinoza)',
    type: 'werk',
    community: 'kritik',
    aliases: ['Ethica'],
    summary:
      'Die »Ethik, in geometrischer Ordnung dargestellt« (posthum 1677) ist Spinozas Hauptwerk. In Definitionen, Axiomen und Lehrsätzen entwickelt sie den Substanzmonismus (»Deus sive Natura«), die Affektenlehre und den Weg zur Freiheit durch Erkenntnis. Über den Pantheismusstreit wurde sie zum Schlüsseltext für Goethe und den Deutschen Idealismus.',
  },

  // ────────────────────────── Erweiterung: Idealismus-Umfeld ──────────────────────────
  {
    id: 'humboldt',
    title: 'Wilhelm von Humboldt',
    type: 'person',
    community: 'idealismus',
    aliases: ['Humboldt'],
    summary:
      'Wilhelm von Humboldt (1767–1835) war Bildungsreformer, Sprachforscher und preußischer Staatsmann. Nach seinen Reformideen – Einheit von Forschung und Lehre, Bildung durch Wissenschaft – wurde 1810 die Universität Berlin gegründet. Er stand in engem Austausch mit Goethe und Schiller.',
  },
  {
    id: 'enzyklopaedie',
    title: 'Enzyklopädie der philosophischen Wissenschaften',
    type: 'werk',
    community: 'idealismus',
    aliases: ['Enzyklopädie'],
    summary:
      'Die »Enzyklopädie der philosophischen Wissenschaften im Grundrisse« (1817, erweitert 1827/1830) veröffentlichte Hegel während seiner Heidelberger Professur. Sie stellt sein Gesamtsystem in drei Teilen dar: Logik – Naturphilosophie – Philosophie des Geistes, und diente als Leitfaden seiner Vorlesungen.',
  },
  {
    id: 'reden_nation',
    title: 'Reden an die deutsche Nation',
    type: 'werk',
    community: 'idealismus',
    summary:
      'Die »Reden an die deutsche Nation« (1807/08) hielt Fichte im französisch besetzten Berlin. Sie rufen zu einer Nationalerziehung auf, die aus der Niederlage gegen Napoleon herausführen soll, und machten Fichte zu einer öffentlichen Figur weit über die Philosophie hinaus.',
  },
  {
    id: 'naturphilosophie',
    title: 'Naturphilosophie',
    type: 'konzept',
    community: 'idealismus',
    summary:
      'Die Naturphilosophie ist Schellings eigenständiger Beitrag zum Deutschen Idealismus (ab den »Ideen zu einer Philosophie der Natur«, 1797): Die Natur ist »sichtbarer Geist«, der Geist »unsichtbare Natur« – beide sind Entwicklungsstufen desselben Absoluten. Damit setzte sich Schelling vom Ich-Zentrismus Fichtes ab.',
  },
  {
    id: 'nuernberg',
    title: 'Nürnberg',
    type: 'ort',
    community: 'idealismus',
    summary:
      'In Nürnberg wirkte Hegel von 1808 bis 1816 als Rektor des Ägidiengymnasiums – eine Zeit knapper Mittel, in der er dennoch sein methodisches Hauptwerk schrieb: die »Wissenschaft der Logik« entstand vollständig in den Nürnberger Jahren.',
  },
  {
    id: 'schlacht_jena',
    title: 'Schlacht bei Jena und Auerstedt',
    type: 'ereignis',
    community: 'idealismus',
    aliases: ['Schlacht von Jena'],
    summary:
      'In der Doppelschlacht bei Jena und Auerstedt (14. Oktober 1806) vernichtete Napoleon die preußische Armee. Hegel, der in denselben Tagen die »Phänomenologie des Geistes« vollendete, sah Napoleon durch Jena reiten – die »Weltseele zu Pferde«. Für die Universität Jena bedeutete die Schlacht den Anfang ihres Niedergangs.',
  },

  // ────────────────────────── Erweiterung: Jenaer Frühromantik ──────────────────────────
  {
    id: 'fruehromantik',
    title: 'Jenaer Frühromantik',
    type: 'konzept',
    community: 'romantik',
    aliases: ['Frühromantik'],
    summary:
      'Die Jenaer Frühromantik (ca. 1796–1801) war der Kreis um die Brüder Schlegel, Novalis, Tieck und Schleiermacher, der sich in Jena – im Salon Carolines – versammelte. Ihre Zeitschrift »Athenäum« (1798–1800) proklamierte die »progressive Universalpoesie«. Philosophisch lebte die Gruppe vom engen Austausch mit Fichte und dem jungen Schelling.',
  },
  {
    id: 'novalis',
    title: 'Novalis',
    type: 'person',
    community: 'romantik',
    aliases: ['Friedrich von Hardenberg'],
    summary:
      'Novalis (Georg Philipp Friedrich von Hardenberg, 1772–1801) war der Dichter-Philosoph der Frühromantik. Seine intensiven »Fichte-Studien« (1795/96) verwandelten die Wissenschaftslehre in Poetik; die »blaue Blume« aus »Heinrich von Ofterdingen« wurde zum Symbol der Romantik schlechthin. Er starb mit 28 Jahren.',
  },
  {
    id: 'f_schlegel',
    title: 'Friedrich Schlegel',
    type: 'person',
    community: 'romantik',
    summary:
      'Friedrich Schlegel (1772–1829) war der Theoretiker der Frühromantik: Seine Athenäums-Fragmente definierten die romantische Poesie als »progressive Universalpoesie«. Mit seinem Bruder August Wilhelm gab er das »Athenäum« heraus. Später konvertierte er in Wien zum Katholizismus und wandte sich der Restauration zu.',
  },
  {
    id: 'aw_schlegel',
    title: 'August Wilhelm Schlegel',
    type: 'person',
    community: 'romantik',
    summary:
      'August Wilhelm Schlegel (1767–1845) war Kritiker, Übersetzer (seine Shakespeare-Übertragung gilt bis heute als maßstäblich) und ab 1798 Professor in Jena. 1796 heiratete er Caroline Michaelis; die Ehe wurde 1803 geschieden, woraufhin Caroline Schelling heiratete. Später begleitete er Madame de Staël durch Europa.',
  },
  {
    id: 'caroline',
    title: 'Caroline Schelling',
    type: 'person',
    community: 'romantik',
    aliases: ['Caroline Schlegel', 'Caroline Michaelis'],
    summary:
      'Caroline Schelling (1763–1809), geborene Michaelis, war die intellektuelle Zentralgestalt der Jenaer Frühromantik – ihr Haus war der Treffpunkt des Kreises. 1796 heiratete sie August Wilhelm Schlegel; nach der Scheidung 1803 wurde sie die Frau des Philosophen Schelling, dem sie nach Würzburg folgte.',
  },

  // ────────────────────────── Erweiterung: Weimar ──────────────────────────
  {
    id: 'weimar',
    title: 'Weimar',
    type: 'ort',
    community: 'weimar',
    summary:
      'Weimar, Residenz des Herzogtums Sachsen-Weimar, wurde durch Goethe (ab 1775), Herder, Wieland und Schiller (ab 1799) zum kulturellen Zentrum Deutschlands – Namensgeber der Weimarer Klassik. Die Universitätsstadt Jena lag nur wenige Kilometer entfernt und wurde von Weimar aus regiert.',
  },
  {
    id: 'faust',
    title: 'Faust',
    type: 'werk',
    community: 'weimar',
    summary:
      '»Faust« ist Goethes Lebenswerk: Der erste Teil erschien 1808, den zweiten vollendete er kurz vor seinem Tod 1832. Die Tragödie um den nach Erkenntnis strebenden Gelehrten und seinen Pakt mit Mephistopheles gilt als das bedeutendste Werk der deutschen Literatur.',
  },
  {
    id: 'ideen_herder',
    title: 'Ideen zur Philosophie der Geschichte der Menschheit',
    type: 'werk',
    community: 'weimar',
    summary:
      'Die »Ideen zur Philosophie der Geschichte der Menschheit« (1784–1791) schrieb Herder in Weimar. Das Werk deutet die Geschichte als Entfaltung der Humanität durch die Vielfalt der Völker und Kulturen und begründete die moderne Geschichts- und Kulturphilosophie.',
  },

  // ────────────────────────── Erweiterung: Rezeption ──────────────────────────
  {
    id: 'bauer',
    title: 'Bruno Bauer',
    type: 'person',
    community: 'rezeption',
    summary:
      'Bruno Bauer (1809–1882) war Theologe, radikaler Bibelkritiker und der Kopf des Berliner »Doktorklubs« der Junghegelianer, in dem er den jungen Karl Marx förderte. Nach dem Entzug seiner Lehrerlaubnis (1842) wurde er zum Gegner seiner früheren Weggefährten; Marx und Engels rechneten in der »Heiligen Familie« mit ihm ab.',
  },
  {
    id: 'stirner',
    title: 'Max Stirner',
    type: 'person',
    community: 'rezeption',
    summary:
      'Max Stirner (1806–1856) gehörte zum Berliner Kreis der Junghegelianer (»Die Freien«). Sein Buch »Der Einzige und sein Eigentum« (1844) radikalisierte die Religionskritik zum konsequenten Egoismus: Auch »Menschheit«, »Staat« und »Humanität« sind nur neue Götzen. Marx und Engels antworteten mit einer ausufernden Polemik in der »Deutschen Ideologie«.',
  },
  {
    id: 'einzige',
    title: 'Der Einzige und sein Eigentum',
    type: 'werk',
    community: 'rezeption',
    summary:
      '»Der Einzige und sein Eigentum« (1844) ist Max Stirners Hauptwerk. Es erklärt alle Allgemeinbegriffe – Gott, Menschheit, Staat, Gesellschaft – zu »Spuk«, dem der Einzige nichts schuldet: »Ich hab’ mein Sach’ auf Nichts gestellt.« Das Buch gilt als Vorläufer von Individualanarchismus und Existenzphilosophie.',
  },
  {
    id: 'heine',
    title: 'Heinrich Heine',
    type: 'person',
    community: 'rezeption',
    summary:
      'Heinrich Heine (1797–1856) hörte als Student in Berlin Hegels Vorlesungen. Aus dem Pariser Exil erklärte er den Franzosen in »Zur Geschichte der Religion und Philosophie in Deutschland« (1834) den Deutschen Idealismus – mit der berühmten Warnung, aus den stillen deutschen Denksystemen werde einst eine Revolution hervorbrechen, gegen die die französische ein »harmloses Idyll« sei.',
  },
  {
    id: 'nietzsche',
    title: 'Friedrich Nietzsche',
    type: 'person',
    community: 'rezeption',
    aliases: ['Nietzsche'],
    summary:
      'Friedrich Nietzsche (1844–1900) entdeckte 1865 in einem Leipziger Antiquariat Schopenhauers »Die Welt als Wille und Vorstellung« – das Erweckungserlebnis seines Denkens (»Schopenhauer als Erzieher«). Später überwand er den Pessimismus seines Lehrmeisters und stellte dem verneinten Willen die Bejahung des Lebens entgegen.',
  },
  {
    id: 'manifest',
    title: 'Manifest der Kommunistischen Partei',
    type: 'werk',
    community: 'rezeption',
    aliases: ['Kommunistisches Manifest'],
    summary:
      'Das »Manifest der Kommunistischen Partei« (London 1848) verfassten Karl Marx und Friedrich Engels im Auftrag des Bundes der Kommunisten. Beginnend mit »Ein Gespenst geht um in Europa«, deutet es alle Geschichte als Geschichte von Klassenkämpfen – die wirkmächtigste Kampfschrift des 19. Jahrhunderts.',
  },
  {
    id: 'entweder_oder',
    title: 'Entweder – Oder',
    type: 'werk',
    community: 'rezeption',
    summary:
      '»Entweder – Oder« (1843) veröffentlichte Kierkegaard unter dem Pseudonym Victor Eremita unmittelbar nach seinem Berliner Aufenthalt bei Schellings Vorlesungen. Das Werk stellt die ästhetische und die ethische Existenzweise gegeneinander und setzt der Hegelschen Vermittlung das unausweichliche Entweder-Oder der persönlichen Entscheidung entgegen.',
  },
]

export const EDGES: GraphEdge[] = [
  // Kant & Umfeld
  { source: 'kant', target: 'krv', relation: 'verfasste', label: 'verfasste' },
  { source: 'kant', target: 'kategorischer_imperativ', relation: 'entwickelte', label: 'entwickelte' },
  { source: 'kant', target: 'ding_an_sich', relation: 'praegte', label: 'prägte den Begriff' },
  { source: 'kant', target: 'transzendentalphilosophie', relation: 'begruendete', label: 'begründete' },
  { source: 'kant', target: 'koenigsberg', relation: 'wirkte_in', label: 'lebte und lehrte in' },
  { source: 'kant', target: 'aufklaerung', relation: 'vertrat', label: 'war Hauptvertreter der' },
  { source: 'kant', target: 'herder', relation: 'lehrer_von', label: 'war Lehrer von' },
  { source: 'hume', target: 'kant', relation: 'beeinflusste', label: 'weckte aus dem »dogmatischen Schlummer«' },
  { source: 'rousseau', target: 'kant', relation: 'beeinflusste', label: 'beeinflusste' },
  { source: 'rousseau', target: 'franzoesische_revolution', relation: 'beeinflusste', label: 'bereitete geistig vor' },
  { source: 'aufklaerung', target: 'franzoesische_revolution', relation: 'beeinflusste', label: 'bereitete geistig vor' },
  { source: 'krv', target: 'transzendentalphilosophie', relation: 'begruendete', label: 'ist Gründungsdokument der' },
  { source: 'krv', target: 'deutscher_idealismus', relation: 'ausgangspunkt_von', label: 'ist Ausgangspunkt des' },
  { source: 'jacobi', target: 'pantheismusstreit', relation: 'ausloeser_von', label: 'löste aus' },
  { source: 'mendelssohn', target: 'pantheismusstreit', relation: 'beteiligt_an', label: 'war Kontrahent im' },
  { source: 'pantheismusstreit', target: 'spinoza', relation: 'handelte_von', label: 'drehte sich um die Lehre von' },
  { source: 'jacobi', target: 'ding_an_sich', relation: 'kritisierte', label: 'kritisierte' },
  { source: 'jacobi', target: 'atheismusstreit', relation: 'beteiligt_an', label: 'prägte im Umfeld den Nihilismus-Vorwurf' },
  { source: 'spinoza', target: 'schelling', relation: 'beeinflusste', label: 'beeinflusste' },
  { source: 'spinoza', target: 'hegel', relation: 'beeinflusste', label: 'beeinflusste' },
  { source: 'spinoza', target: 'goethe', relation: 'beeinflusste', label: 'beeinflusste' },
  { source: 'reinhold', target: 'kant', relation: 'popularisierte', label: 'popularisierte' },
  { source: 'reinhold', target: 'uni_jena', relation: 'lehrte_an', label: 'lehrte an' },
  { source: 'kant', target: 'reinhold', relation: 'beeinflusste', label: 'beeinflusste' },
  { source: 'kant', target: 'fichte', relation: 'beeinflusste', label: 'beeinflusste' },
  { source: 'kant', target: 'schiller', relation: 'beeinflusste', label: 'beeinflusste' },
  { source: 'kant', target: 'schopenhauer', relation: 'beeinflusste', label: 'beeinflusste' },
  { source: 'kant', target: 'deutscher_idealismus', relation: 'ausgangspunkt_von', label: 'ist Ausgangspunkt des' },

  // Fichte
  { source: 'fichte', target: 'wissenschaftslehre', relation: 'verfasste', label: 'verfasste' },
  { source: 'fichte', target: 'reinhold', relation: 'nachfolger_von', label: 'wurde Nachfolger von (Jena, 1794)' },
  { source: 'fichte', target: 'uni_jena', relation: 'lehrte_an', label: 'lehrte an (1794–1799)' },
  { source: 'fichte', target: 'uni_berlin', relation: 'lehrte_an', label: 'lehrte an, erster gewählter Rektor' },
  { source: 'atheismusstreit', target: 'fichte', relation: 'betraf', label: 'kostete die Jenaer Professur von' },
  { source: 'atheismusstreit', target: 'uni_jena', relation: 'fand_statt_an', label: 'fand statt an' },
  { source: 'fichte', target: 'schelling', relation: 'beeinflusste', label: 'beeinflusste' },
  { source: 'fichte', target: 'hegel', relation: 'beeinflusste', label: 'beeinflusste' },
  { source: 'fichte', target: 'deutscher_idealismus', relation: 'teil_von', label: 'ist Hauptvertreter des' },
  { source: 'fichte', target: 'ding_an_sich', relation: 'kritisierte', label: 'verwarf' },

  // Schelling
  { source: 'schelling', target: 'system_ti', relation: 'verfasste', label: 'verfasste' },
  { source: 'schelling', target: 'tuebinger_stift', relation: 'studierte_an', label: 'studierte am' },
  { source: 'schelling', target: 'uni_jena', relation: 'lehrte_an', label: 'lehrte an (ab 1798)' },
  { source: 'schelling', target: 'uni_berlin', relation: 'lehrte_an', label: 'wurde 1841 berufen an' },
  { source: 'schelling', target: 'berliner_vorlesungen', relation: 'hielt', label: 'hielt' },
  { source: 'schelling', target: 'hegel', relation: 'freund_von', label: 'war Stubengenosse und früher Weggefährte von' },
  { source: 'schelling', target: 'hoelderlin', relation: 'freund_von', label: 'war Stubengenosse von' },
  { source: 'schelling', target: 'deutscher_idealismus', relation: 'teil_von', label: 'ist Hauptvertreter des' },
  { source: 'goethe', target: 'schelling', relation: 'foerderte', label: 'betrieb die Jenaer Berufung von' },
  { source: 'berliner_vorlesungen', target: 'uni_berlin', relation: 'fand_statt_an', label: 'fanden statt an der' },
  { source: 'berliner_vorlesungen', target: 'hegel', relation: 'gerichtet_gegen', label: 'richteten sich gegen den Einfluss von' },

  // Hegel
  { source: 'hegel', target: 'stuttgart', relation: 'geboren_in', label: 'wurde geboren in' },
  { source: 'hegel', target: 'tuebinger_stift', relation: 'studierte_an', label: 'studierte am' },
  { source: 'hegel', target: 'uni_jena', relation: 'lehrte_an', label: 'lehrte an (1801–1806)' },
  { source: 'hegel', target: 'uni_heidelberg', relation: 'lehrte_an', label: 'lehrte an (1816–1818)' },
  { source: 'hegel', target: 'uni_berlin', relation: 'lehrte_an', label: 'lehrte an (1818–1831)' },
  { source: 'hegel', target: 'fichte', relation: 'nachfolger_von', label: 'übernahm 1818 den Berliner Lehrstuhl von' },
  { source: 'hegel', target: 'phaenomenologie', relation: 'verfasste', label: 'verfasste' },
  { source: 'hegel', target: 'logik', relation: 'verfasste', label: 'verfasste' },
  { source: 'hegel', target: 'rechtsphilosophie', relation: 'verfasste', label: 'verfasste' },
  { source: 'hegel', target: 'dialektik', relation: 'entwickelte', label: 'entwickelte die spekulative' },
  { source: 'hegel', target: 'absoluter_idealismus', relation: 'begruendete', label: 'begründete den' },
  { source: 'hegel', target: 'hoelderlin', relation: 'freund_von', label: 'war Stubengenosse von' },
  { source: 'hegel', target: 'deutscher_idealismus', relation: 'teil_von', label: 'gilt als Vollender des' },
  { source: 'hegel', target: 'feuerbach', relation: 'lehrer_von', label: 'war akademischer Lehrer von' },
  { source: 'hegel', target: 'junghegelianer', relation: 'beeinflusste', label: 'ist Bezugspunkt der' },
  { source: 'franzoesische_revolution', target: 'hegel', relation: 'beeinflusste', label: 'begeisterte' },
  { source: 'franzoesische_revolution', target: 'hoelderlin', relation: 'beeinflusste', label: 'begeisterte' },
  { source: 'franzoesische_revolution', target: 'schelling', relation: 'beeinflusste', label: 'begeisterte' },
  { source: 'phaenomenologie', target: 'uni_jena', relation: 'entstand_in', label: 'wurde vollendet in' },
  { source: 'logik', target: 'dialektik', relation: 'entfaltet', label: 'führt methodisch durch' },

  // Hölderlin
  { source: 'hoelderlin', target: 'hyperion', relation: 'verfasste', label: 'verfasste' },
  { source: 'hoelderlin', target: 'tuebinger_stift', relation: 'studierte_an', label: 'studierte am' },

  // Weimar
  { source: 'goethe', target: 'weimarer_klassik', relation: 'teil_von', label: 'ist Zentralfigur der' },
  { source: 'schiller', target: 'weimarer_klassik', relation: 'teil_von', label: 'ist Hauptvertreter der' },
  { source: 'herder', target: 'weimarer_klassik', relation: 'teil_von', label: 'ist Wegbereiter der' },
  { source: 'goethe', target: 'schiller', relation: 'freund_von', label: 'war eng befreundet mit' },
  { source: 'goethe', target: 'uni_jena', relation: 'foerderte', label: 'steuerte als Minister die Berufungspolitik der' },
  { source: 'goethe', target: 'fichte', relation: 'foerderte', label: 'betrieb die Jenaer Berufung von' },
  { source: 'schiller', target: 'uni_jena', relation: 'lehrte_an', label: 'lehrte Geschichte an' },
  { source: 'herder', target: 'koenigsberg', relation: 'studierte_an', label: 'studierte in' },
  { source: 'herder', target: 'kant', relation: 'kritisierte', label: 'kritisierte später in der »Metakritik«' },

  // Rezeption & Kritik
  { source: 'schopenhauer', target: 'wwv', relation: 'verfasste', label: 'verfasste' },
  { source: 'schopenhauer', target: 'hegel', relation: 'kritisierte', label: 'polemisierte gegen' },
  { source: 'schopenhauer', target: 'uni_berlin', relation: 'lehrte_an', label: 'war Privatdozent an' },
  { source: 'schopenhauer', target: 'ding_an_sich', relation: 'deutete_um', label: 'deutete um als »Wille«' },
  { source: 'wwv', target: 'ding_an_sich', relation: 'handelt_von', label: 'deutet um als Wille' },
  { source: 'feuerbach', target: 'wesen_christentums', relation: 'verfasste', label: 'verfasste' },
  { source: 'feuerbach', target: 'hegel', relation: 'kritisierte', label: 'wandte sich ab von' },
  { source: 'feuerbach', target: 'marx', relation: 'beeinflusste', label: 'beeinflusste' },
  { source: 'feuerbach', target: 'junghegelianer', relation: 'teil_von', label: 'zählte zum Umfeld der' },
  { source: 'marx', target: 'kapital', relation: 'verfasste', label: 'verfasste' },
  { source: 'marx', target: 'junghegelianer', relation: 'teil_von', label: 'verkehrte im Kreis der' },
  { source: 'marx', target: 'hegel', relation: 'kritisierte', label: 'stellte dessen Dialektik »vom Kopf auf die Füße«' },
  { source: 'marx', target: 'dialektik', relation: 'deutete_um', label: 'wendete materialistisch' },
  { source: 'marx', target: 'historischer_materialismus', relation: 'begruendete', label: 'begründete den' },
  { source: 'marx', target: 'engels', relation: 'freund_von', label: 'war engster Freund und Mitstreiter von' },
  { source: 'engels', target: 'historischer_materialismus', relation: 'begruendete', label: 'begründete mit' },
  { source: 'engels', target: 'berliner_vorlesungen', relation: 'hoerte', label: 'hörte als Gasthörer' },
  { source: 'engels', target: 'schelling', relation: 'kritisierte', label: 'attackierte in Streitschriften' },
  { source: 'engels', target: 'kapital', relation: 'herausgeber_von', label: 'gab Band 2 und 3 heraus von' },
  { source: 'kierkegaard', target: 'berliner_vorlesungen', relation: 'hoerte', label: 'hörte' },
  { source: 'kierkegaard', target: 'hegel', relation: 'kritisierte', label: 'kritisierte das System von' },
  { source: 'wesen_christentums', target: 'junghegelianer', relation: 'beeinflusste', label: 'elektrisierte die' },
  { source: 'wesen_christentums', target: 'marx', relation: 'beeinflusste', label: 'bereitete die Religionskritik vor von' },
  { source: 'junghegelianer', target: 'hegel', relation: 'bezog_sich_auf', label: 'wendeten die Dialektik von' },
  { source: 'historischer_materialismus', target: 'dialektik', relation: 'entstand_aus', label: 'entstand aus der Umkehrung der' },

  // Erweiterung: Vorläufer & Aufklärung
  { source: 'leibniz', target: 'wolff', relation: 'beeinflusste', label: 'wurde systematisiert von' },
  { source: 'leibniz', target: 'kant', relation: 'beeinflusste', label: 'prägte die Schulmetaphysik vor' },
  { source: 'wolff', target: 'kant', relation: 'beeinflusste', label: 'prägte die Ausbildung von' },
  { source: 'kant', target: 'wolff', relation: 'kritisierte', label: 'kritisierte den Dogmatismus von' },
  { source: 'wolff', target: 'aufklaerung', relation: 'vertrat', label: 'war Schulphilosoph der' },
  { source: 'lessing', target: 'aufklaerung', relation: 'vertrat', label: 'war Hauptdichter der' },
  { source: 'lessing', target: 'mendelssohn', relation: 'freund_von', label: 'war eng befreundet mit' },
  { source: 'pantheismusstreit', target: 'lessing', relation: 'handelte_von', label: 'entzündete sich am angeblichen Spinozismus von' },
  { source: 'spinoza', target: 'lessing', relation: 'beeinflusste', label: 'beeinflusste' },
  { source: 'kant', target: 'grundlegung', relation: 'verfasste', label: 'verfasste' },
  { source: 'grundlegung', target: 'kategorischer_imperativ', relation: 'formuliert', label: 'formuliert erstmals den' },
  { source: 'spinoza', target: 'ethik_spinoza', relation: 'verfasste', label: 'verfasste' },
  { source: 'ethik_spinoza', target: 'pantheismusstreit', relation: 'gegenstand_von', label: 'wurde Schlüsseltext im' },

  // Erweiterung: Idealismus-Umfeld
  { source: 'humboldt', target: 'uni_berlin', relation: 'gruendete', label: 'gründete 1810 die' },
  { source: 'humboldt', target: 'goethe', relation: 'freund_von', label: 'stand in engem Austausch mit' },
  { source: 'humboldt', target: 'schiller', relation: 'freund_von', label: 'stand in engem Austausch mit' },
  { source: 'hegel', target: 'enzyklopaedie', relation: 'verfasste', label: 'verfasste' },
  { source: 'enzyklopaedie', target: 'uni_heidelberg', relation: 'entstand_in', label: 'entstand während der Professur an der' },
  { source: 'fichte', target: 'reden_nation', relation: 'verfasste', label: 'hielt' },
  { source: 'schelling', target: 'naturphilosophie', relation: 'begruendete', label: 'begründete die' },
  { source: 'naturphilosophie', target: 'deutscher_idealismus', relation: 'teil_von', label: 'ist Strömung des' },
  { source: 'hegel', target: 'nuernberg', relation: 'wirkte_in', label: 'war Gymnasialrektor in (1808–1816)' },
  { source: 'logik', target: 'nuernberg', relation: 'entstand_in', label: 'entstand in' },
  { source: 'schlacht_jena', target: 'uni_jena', relation: 'betraf', label: 'leitete den Niedergang ein der' },
  { source: 'schlacht_jena', target: 'phaenomenologie', relation: 'zeitgleich_mit', label: 'fiel zusammen mit der Vollendung der' },
  { source: 'schlacht_jena', target: 'hegel', relation: 'betraf', label: 'wurde miterlebt von' },

  // Erweiterung: Jenaer Frühromantik
  { source: 'fruehromantik', target: 'uni_jena', relation: 'entstand_in', label: 'versammelte sich in' },
  { source: 'fichte', target: 'fruehromantik', relation: 'beeinflusste', label: 'war philosophischer Bezugspunkt der' },
  { source: 'schelling', target: 'fruehromantik', relation: 'austausch_mit', label: 'stand in engem Austausch mit der' },
  { source: 'novalis', target: 'fruehromantik', relation: 'teil_von', label: 'ist Hauptdichter der' },
  { source: 'novalis', target: 'fichte', relation: 'gepraegt_von', label: 'studierte intensiv die Wissenschaftslehre von' },
  { source: 'novalis', target: 'f_schlegel', relation: 'freund_von', label: 'war eng befreundet mit' },
  { source: 'f_schlegel', target: 'fruehromantik', relation: 'teil_von', label: 'ist Theoretiker der' },
  { source: 'f_schlegel', target: 'aw_schlegel', relation: 'bruder_von', label: 'ist Bruder von' },
  { source: 'aw_schlegel', target: 'fruehromantik', relation: 'teil_von', label: 'ist Mitbegründer der' },
  { source: 'aw_schlegel', target: 'uni_jena', relation: 'lehrte_an', label: 'lehrte an (ab 1798)' },
  { source: 'aw_schlegel', target: 'caroline', relation: 'ehe_mit', label: 'war verheiratet mit (1796–1803)' },
  { source: 'caroline', target: 'fruehromantik', relation: 'teil_von', label: 'ist Zentralgestalt der' },
  { source: 'caroline', target: 'schelling', relation: 'ehe_mit', label: 'heiratete 1803' },

  // Erweiterung: Weimar
  { source: 'goethe', target: 'weimar', relation: 'wirkte_in', label: 'wirkte ab 1775 in' },
  { source: 'schiller', target: 'weimar', relation: 'wirkte_in', label: 'lebte ab 1799 in' },
  { source: 'herder', target: 'weimar', relation: 'wirkte_in', label: 'war Generalsuperintendent in' },
  { source: 'weimarer_klassik', target: 'weimar', relation: 'verortet_in', label: 'hat ihr Zentrum in' },
  { source: 'goethe', target: 'faust', relation: 'verfasste', label: 'verfasste' },
  { source: 'herder', target: 'ideen_herder', relation: 'verfasste', label: 'verfasste' },

  // Erweiterung: Rezeption
  { source: 'bauer', target: 'junghegelianer', relation: 'teil_von', label: 'war Kopf der' },
  { source: 'bauer', target: 'marx', relation: 'beeinflusste', label: 'förderte den jungen' },
  { source: 'marx', target: 'bauer', relation: 'kritisierte', label: 'rechnete in der »Heiligen Familie« ab mit' },
  { source: 'stirner', target: 'junghegelianer', relation: 'teil_von', label: 'gehörte zu den' },
  { source: 'stirner', target: 'einzige', relation: 'verfasste', label: 'verfasste' },
  { source: 'marx', target: 'stirner', relation: 'kritisierte', label: 'polemisierte in der »Deutschen Ideologie« gegen' },
  { source: 'heine', target: 'hegel', relation: 'hoerte_bei', label: 'hörte in Berlin die Vorlesungen von' },
  { source: 'heine', target: 'uni_berlin', relation: 'studierte_an', label: 'studierte an' },
  { source: 'heine', target: 'deutscher_idealismus', relation: 'vermittelte', label: 'erklärte Frankreich den' },
  { source: 'schopenhauer', target: 'nietzsche', relation: 'beeinflusste', label: 'wurde Erweckungserlebnis für' },
  { source: 'wwv', target: 'nietzsche', relation: 'beeinflusste', label: 'prägte' },
  { source: 'marx', target: 'manifest', relation: 'verfasste', label: 'verfasste' },
  { source: 'engels', target: 'manifest', relation: 'verfasste', label: 'verfasste mit' },
  { source: 'kierkegaard', target: 'entweder_oder', relation: 'verfasste', label: 'verfasste' },
  { source: 'entweder_oder', target: 'hegel', relation: 'gerichtet_gegen', label: 'wendet sich gegen das System von' },
]

export const BASE_GRAPH: KnowledgeGraph = { nodes: NODES, edges: EDGES }

/**
 * Zeitspannen für den Zeitreise-Modus des Explorers [von, bis].
 * Personen: Lebensdaten · Werke: ab Erscheinen · Konzepte/Ereignisse: Wirkzeit.
 * Orte/Institutionen ohne Eintrag gelten als durchgehend existent.
 */
export const TIMELINE_RANGE: [number, number] = [1650, 1900]

export const NODE_YEARS: Record<string, [number, number]> = {
  // Personen
  spinoza: [1650, 1677],
  leibniz: [1650, 1716],
  wolff: [1679, 1754],
  hume: [1711, 1776],
  rousseau: [1712, 1778],
  kant: [1724, 1804],
  lessing: [1729, 1781],
  mendelssohn: [1729, 1786],
  jacobi: [1743, 1819],
  herder: [1744, 1803],
  goethe: [1749, 1832],
  reinhold: [1757, 1823],
  schiller: [1759, 1805],
  fichte: [1762, 1814],
  caroline: [1763, 1809],
  humboldt: [1767, 1835],
  aw_schlegel: [1767, 1845],
  hegel: [1770, 1831],
  hoelderlin: [1770, 1843],
  novalis: [1772, 1801],
  f_schlegel: [1772, 1829],
  schelling: [1775, 1854],
  schopenhauer: [1788, 1860],
  heine: [1797, 1856],
  feuerbach: [1804, 1872],
  stirner: [1806, 1856],
  bauer: [1809, 1882],
  kierkegaard: [1813, 1855],
  marx: [1818, 1883],
  engels: [1820, 1895],
  nietzsche: [1844, 1900],
  // Werke (ab Erscheinen)
  ethik_spinoza: [1677, 1900],
  krv: [1781, 1900],
  ideen_herder: [1784, 1900],
  grundlegung: [1785, 1900],
  wissenschaftslehre: [1794, 1900],
  hyperion: [1797, 1900],
  system_ti: [1800, 1900],
  phaenomenologie: [1807, 1900],
  faust: [1808, 1900],
  reden_nation: [1808, 1900],
  logik: [1812, 1900],
  enzyklopaedie: [1817, 1900],
  wwv: [1819, 1900],
  rechtsphilosophie: [1820, 1900],
  wesen_christentums: [1841, 1900],
  entweder_oder: [1843, 1900],
  einzige: [1844, 1900],
  manifest: [1848, 1900],
  kapital: [1867, 1900],
  // Konzepte (Wirkzeit)
  aufklaerung: [1650, 1800],
  transzendentalphilosophie: [1781, 1900],
  ding_an_sich: [1781, 1900],
  deutscher_idealismus: [1781, 1831],
  kategorischer_imperativ: [1785, 1900],
  weimarer_klassik: [1786, 1805],
  fruehromantik: [1796, 1801],
  naturphilosophie: [1797, 1854],
  dialektik: [1807, 1900],
  absoluter_idealismus: [1807, 1900],
  junghegelianer: [1835, 1848],
  historischer_materialismus: [1845, 1900],
  // Ereignisse
  pantheismusstreit: [1785, 1789],
  franzoesische_revolution: [1789, 1799],
  atheismusstreit: [1798, 1800],
  schlacht_jena: [1806, 1806],
  berliner_vorlesungen: [1841, 1842],
  // Institutionen mit Gründung im Zeitfenster
  uni_berlin: [1810, 1900],
}

/** Statistik-Helfer für die Übersicht */
export function graphStats(g: KnowledgeGraph) {
  const byType = new Map<string, number>()
  for (const n of g.nodes) byType.set(n.type, (byType.get(n.type) ?? 0) + 1)
  return {
    nodes: g.nodes.length,
    edges: g.edges.length,
    communities: new Set(g.nodes.map((n) => n.community)).size,
    byType,
  }
}
