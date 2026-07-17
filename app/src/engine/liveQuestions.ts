import type { LiveDeckCard } from './liveQuiz'

/**
 * Niedrigschwellige Live-Fragen für die Präsentation.
 * Anders als der Pfad-Quizmodus verlangen sie keine Mehrschritt-Navigation:
 * Eine Runde ist in wenigen Sekunden aus Allgemeinwissen und den sichtbaren
 * Begriffen des Vortrags lösbar. Die Inhalte bleiben trotzdem im kuratierten
 * Graph-Korpus verankert.
 */
const QUESTIONS: Array<Omit<LiveDeckCard, 'classification' | 'graphNodeIds'>> = [
  {
    question: { id: 'quick-hegel-work', category: '⚡ Blitzwissen', prompt: 'Wer schrieb die »Phänomenologie des Geistes«?', options: [{ id: 'hegel', title: 'Georg Wilhelm Friedrich Hegel' }, { id: 'kant', title: 'Immanuel Kant' }, { id: 'marx', title: 'Karl Marx' }, { id: 'nietzsche', title: 'Friedrich Nietzsche' }] },
    correctId: 'hegel', explanation: 'Hegel vollendete die »Phänomenologie des Geistes« 1807 in Jena.',
  },
  {
    question: { id: 'quick-kant-work', category: '📚 Werkstatt', prompt: 'Von wem stammt die »Kritik der reinen Vernunft«?', options: [{ id: 'fichte', title: 'Johann Gottlieb Fichte' }, { id: 'kant', title: 'Immanuel Kant' }, { id: 'schelling', title: 'Friedrich Schelling' }, { id: 'feuerbach', title: 'Ludwig Feuerbach' }] },
    correctId: 'kant', explanation: 'Kants Hauptwerk erschien erstmals 1781.',
  },
  {
    question: { id: 'quick-1781', category: '⏳ Zeitreise', prompt: 'In welchem Jahr erschien Kants »Kritik der reinen Vernunft« erstmals?', options: [{ id: '1770', title: '1770' }, { id: '1781', title: '1781' }, { id: '1807', title: '1807' }, { id: '1848', title: '1848' }] },
    correctId: '1781', explanation: 'Die erste Auflage der »Kritik der reinen Vernunft« erschien 1781.',
  },
  {
    question: { id: 'quick-hume', category: '🔗 Wer passt?', prompt: 'Welcher Philosoph weckte Kant nach eigener Aussage aus dem »dogmatischen Schlummer«?', options: [{ id: 'hume', title: 'David Hume' }, { id: 'plato', title: 'Platon' }, { id: 'hegel', title: 'Hegel' }, { id: 'spinoza', title: 'Spinoza' }] },
    correctId: 'hume', explanation: 'Kant bezeichnete David Hume als den Anstoß für seine kritische Philosophie.',
  },
  {
    question: { id: 'quick-wwv', category: '📚 Werkstatt', prompt: 'Wer verfasste »Die Welt als Wille und Vorstellung«?', options: [{ id: 'schopenhauer', title: 'Arthur Schopenhauer' }, { id: 'hegel', title: 'Hegel' }, { id: 'engels', title: 'Friedrich Engels' }, { id: 'herder', title: 'Johann Gottfried Herder' }] },
    correctId: 'schopenhauer', explanation: 'Schopenhauers Hauptwerk erschien 1819.',
  },
  {
    question: { id: 'quick-hegel-city', category: '📍 Orte', prompt: 'In welcher Stadt wurde Hegel geboren?', options: [{ id: 'berlin', title: 'Berlin' }, { id: 'jena', title: 'Jena' }, { id: 'stuttgart', title: 'Stuttgart' }, { id: 'weimar', title: 'Weimar' }] },
    correctId: 'stuttgart', explanation: 'Hegel wurde 1770 in Stuttgart geboren.',
  },
  {
    question: { id: 'quick-kant-city', category: '📍 Orte', prompt: 'In welcher Stadt verbrachte Immanuel Kant sein gesamtes Leben?', options: [{ id: 'koenigsberg', title: 'Königsberg' }, { id: 'berlin', title: 'Berlin' }, { id: 'tuebingen', title: 'Tübingen' }, { id: 'heidelberg', title: 'Heidelberg' }] },
    correctId: 'koenigsberg', explanation: 'Kant lebte in Königsberg, dem heutigen Kaliningrad.',
  },
  {
    question: { id: 'quick-atheismus', category: '💥 Drama', prompt: 'Durch welchen Streit verlor Fichte 1799 seine Professur in Jena?', options: [{ id: 'pantheismus', title: 'Pantheismusstreit' }, { id: 'atheismus', title: 'Atheismusstreit' }, { id: 'erbstreit', title: 'Erbstreit' }, { id: 'methoden', title: 'Methodenstreit' }] },
    correctId: 'atheismus', explanation: 'Der Atheismusstreit von 1798/99 kostete Fichte seine Professur in Jena.',
  },
  {
    question: { id: 'quick-spinoza', category: '🔗 Wer passt?', prompt: 'Um wessen Lehre drehte sich der Pantheismusstreit?', options: [{ id: 'spinoza', title: 'Baruch de Spinoza' }, { id: 'aristoteles', title: 'Aristoteles' }, { id: 'rousseau', title: 'Jean-Jacques Rousseau' }, { id: 'hume', title: 'David Hume' }] },
    correctId: 'spinoza', explanation: 'Im Pantheismusstreit ging es um Spinozas Lehre und ihren vermeintlichen Einfluss auf Lessing.',
  },
  {
    question: { id: 'quick-marx', category: '🔄 Ideen-Remix', prompt: 'Wessen Dialektik stellte Marx nach eigenen Worten »vom Kopf auf die Füße«?', options: [{ id: 'hegel', title: 'Hegels Dialektik' }, { id: 'kant', title: 'Kants Erkenntnistheorie' }, { id: 'hume', title: 'Humes Empirismus' }, { id: 'fichte', title: 'Fichtes Wissenschaftslehre' }] },
    correctId: 'hegel', explanation: 'Marx übernahm Hegels Dialektik, deutete sie aber materialistisch um.',
  },
  {
    question: { id: 'quick-berlin', category: '📍 Orte', prompt: 'An welcher Universität lehrte Hegel zuletzt?', options: [{ id: 'uni-berlin', title: 'Universität Berlin' }, { id: 'uni-jena', title: 'Universität Jena' }, { id: 'uni-bonn', title: 'Universität Bonn' }, { id: 'uni-leipzig', title: 'Universität Leipzig' }] },
    correctId: 'uni-berlin', explanation: 'Hegel lehrte von 1818 bis 1831 an der Universität Berlin.',
  },
  {
    question: { id: 'quick-feuerbach', category: '📚 Werkstatt', prompt: 'Wer schrieb 1841 »Das Wesen des Christentums«?', options: [{ id: 'feuerbach', title: 'Ludwig Feuerbach' }, { id: 'engels', title: 'Friedrich Engels' }, { id: 'herder', title: 'Johann Gottfried Herder' }, { id: 'goethe', title: 'Johann Wolfgang von Goethe' }] },
    correctId: 'feuerbach', explanation: 'Feuerbach deutete Religion als Projektion menschlicher Wesenskräfte.',
  },
  {
    question: { id: 'quick-hyperion', category: '📚 Werkstatt', prompt: 'Wer schrieb den Briefroman »Hyperion«?', options: [{ id: 'hoelderlin', title: 'Friedrich Hölderlin' }, { id: 'schiller', title: 'Friedrich Schiller' }, { id: 'goethe', title: 'Goethe' }, { id: 'schelling', title: 'Schelling' }] },
    correctId: 'hoelderlin', explanation: 'Hölderlin schrieb den Briefroman »Hyperion oder Der Eremit in Griechenland«.',
  },
  {
    question: { id: 'quick-revolution', category: '⏳ Zeitreise', prompt: 'Welches Ereignis von 1789 begeisterte Hegel, Hölderlin und Schelling?', options: [{ id: 'revolution', title: 'Die Französische Revolution' }, { id: 'wiener-kongress', title: 'Der Wiener Kongress' }, { id: 'industrialisierung', title: 'Die Industrialisierung' }, { id: 'reichsgruendung', title: 'Die Reichsgründung' }] },
    correctId: 'revolution', explanation: 'Die drei Tübinger Stiftler reagierten begeistert auf die Französische Revolution.',
  },
  {
    question: { id: 'quick-schelling', category: '🔗 Wer passt?', prompt: 'Welcher Philosoph hielt 1841/42 in Berlin viel beachtete Vorlesungen?', options: [{ id: 'schelling', title: 'Friedrich Schelling' }, { id: 'hegel', title: 'Hegel' }, { id: 'kant', title: 'Kant' }, { id: 'marx', title: 'Marx' }] },
    correctId: 'schelling', explanation: 'Schelling wurde 1841 auf Hegels verwaisten Berliner Lehrstuhl berufen.',
  },
  {
    question: { id: 'quick-wille', category: '🔄 Ideen-Remix', prompt: 'Wer deutete Kants »Ding an sich« als »Wille« um?', options: [{ id: 'schopenhauer', title: 'Arthur Schopenhauer' }, { id: 'nietzsche', title: 'Friedrich Nietzsche' }, { id: 'fichte', title: 'Johann Gottlieb Fichte' }, { id: 'jacobi', title: 'Friedrich Heinrich Jacobi' }] },
    correctId: 'schopenhauer', explanation: 'Schopenhauer verband Kants Ding an sich mit seinem Begriff des Willens.',
  },
  {
    question: { id: 'quick-materialismus', category: '🔄 Ideen-Remix', prompt: 'Wer begründete den historischen Materialismus?', options: [{ id: 'marx', title: 'Karl Marx' }, { id: 'hegel', title: 'Hegel' }, { id: 'fichte', title: 'Fichte' }, { id: 'mendelssohn', title: 'Moses Mendelssohn' }] },
    correctId: 'marx', explanation: 'Karl Marx entwickelte den historischen Materialismus; Friedrich Engels wurde sein engster Mitstreiter.',
  },
]

const GRAPH_CONTEXT: Record<string, Pick<LiveDeckCard, 'classification' | 'graphNodeIds'>> = {
  'quick-hegel-work': { classification: 'Direktes Werkswissen · 1 Kante', graphNodeIds: ['hegel', 'phaenomenologie'] },
  'quick-kant-work': { classification: 'Direktes Werkswissen · 1 Kante', graphNodeIds: ['kant', 'krv'] },
  'quick-1781': { classification: 'Direktes Faktenwissen · 1 Knoten', graphNodeIds: ['krv'] },
  'quick-hume': { classification: 'Personenbeziehung · 1 Kante', graphNodeIds: ['kant', 'hume'] },
  'quick-wwv': { classification: 'Direktes Werkswissen · 1 Kante', graphNodeIds: ['schopenhauer', 'wwv'] },
  'quick-hegel-city': { classification: 'Biografisches Faktenwissen · 1 Kante', graphNodeIds: ['hegel', 'stuttgart'] },
  'quick-kant-city': { classification: 'Biografisches Faktenwissen · 1 Kante', graphNodeIds: ['kant', 'koenigsberg'] },
  'quick-atheismus': { classification: 'Ereignis + Person · 1 Kante', graphNodeIds: ['fichte', 'atheismusstreit'] },
  'quick-spinoza': { classification: 'Kontroverse + Idee · 1 Kante', graphNodeIds: ['pantheismusstreit', 'spinoza'] },
  'quick-marx': { classification: 'Ideentransfer · 1 Kante', graphNodeIds: ['marx', 'hegel'] },
  'quick-berlin': { classification: 'Institution + Person · 1 Kante', graphNodeIds: ['hegel', 'uni_berlin'] },
  'quick-feuerbach': { classification: 'Direktes Werkswissen · 1 Kante', graphNodeIds: ['feuerbach', 'wesen_christentums'] },
  'quick-hyperion': { classification: 'Direktes Werkswissen · 1 Kante', graphNodeIds: ['hoelderlin', 'hyperion'] },
  'quick-revolution': { classification: 'Gemeinsamer Kontext · Mini-Subgraph', graphNodeIds: ['tuebinger_stift', 'hegel', 'hoelderlin', 'schelling', 'franzoesische_revolution'] },
  'quick-schelling': { classification: 'Vorlesung + Person · 1 Kante', graphNodeIds: ['schelling', 'berliner_vorlesungen'] },
  'quick-wille': { classification: 'Begriffs-Umdeutung · 3 Knoten', graphNodeIds: ['kant', 'ding_an_sich', 'schopenhauer', 'wwv'] },
  'quick-materialismus': { classification: 'Idee + Autor · 1 Kante', graphNodeIds: ['marx', 'historischer_materialismus', 'engels'] },
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function makeLiveQuestionDeck(total: number): LiveDeckCard[] {
  return shuffle(QUESTIONS.map((question) => ({ ...question, ...GRAPH_CONTEXT[question.question.id] }))).slice(0, total)
}
