import type {
  Condition,
  RetrievalMode,
  Score,
  TrialExecutionEnvironment,
  TrialGenerationMetrics,
  TrialModelProvenance,
  TrialResult,
} from '../data/types'

export const RESULTS_IMPORT_MAX_BYTES = 25 * 1024 * 1024
export const RESULTS_IMPORT_MAX_ROWS = 50_000

export type ResultsImportFormat = 'json' | 'submission-bundle' | 'csv'
export type ResultsImportMode = 'merge' | 'replace-runs' | 'replace-all'

export interface ResultsImportPreview {
  format: ResultsImportFormat
  results: TrialResult[]
  sourceRows: number
  duplicateRows: number
  schemaVersion: number | null
  warnings: string[]
  runIds: string[]
  engines: string[]
}

export interface ResultsImportPlan {
  results: TrialResult[]
  imported: number
  added: number
  duplicatesSkipped: number
  conflictsSkipped: number
  existingRemoved: number
}

export class ResultsImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResultsImportError'
  }
}

const CONDITIONS = new Set<Condition>(['baseline', 'vector', 'graph', 'vector_budget', 'hybrid', 'graph_no_edges'])
const RETRIEVAL_MODES = new Set<RetrievalMode>(['tfidf', 'dense'])
const SCORES = new Set<Score>(['korrekt', 'teilweise', 'falsch', 'enthaltung'])

const CSV_COLUMNS = [
  'id',
  'runId',
  'repetitionId',
  'repetition',
  'order',
  'seed',
  'questionOrder',
  'conditionOrder',
  'orderStrategy',
  'questionId',
  'condition',
  'retrieval',
  'engine',
  'autoScore',
  'manualScore',
  'blindA',
  'blindB',
  'latencyMs',
  'latencyScope',
  'prepareMs',
  'retrievalMs',
  'generationMs',
  'contextChars',
  'evidenceRecall',
  'evidencePrecision',
  'retrievedIds',
  'timestamp',
  'answer',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function own(value: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined
}

function stringField(value: unknown, field: string, row: number, max = 300, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    throw new ResultsImportError(`Zeile ${row}: „${field}“ muss ein${allowEmpty ? '' : ' nicht leeres'} Textfeld sein.`)
  }
  if (value.length > max) throw new ResultsImportError(`Zeile ${row}: „${field}“ ist länger als ${max} Zeichen.`)
  return value
}

function finiteNumber(value: unknown, field: string, row: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ResultsImportError(`Zeile ${row}: „${field}“ liegt außerhalb des erlaubten Zahlenbereichs.`)
  }
  return value
}

function integer(value: unknown, field: string, row: number, min: number, max: number): number {
  const result = finiteNumber(value, field, row, min, max)
  if (!Number.isInteger(result)) throw new ResultsImportError(`Zeile ${row}: „${field}“ muss eine ganze Zahl sein.`)
  return result
}

function nullableInteger(value: unknown, field: string, row: number, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null
  return integer(value, field, row, min, max)
}

function nullableNumber(value: unknown, field: string, row: number, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null
  return finiteNumber(value, field, row, min, max)
}

function score(value: unknown, field: string, row: number, optional = false): Score | undefined {
  if (optional && (value === undefined || value === null || value === '')) return undefined
  if (typeof value !== 'string' || !SCORES.has(value as Score)) {
    throw new ResultsImportError(`Zeile ${row}: „${field}“ enthält keinen gültigen Score.`)
  }
  return value as Score
}

function executionEnvironment(value: unknown, row: number): TrialExecutionEnvironment | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (!isRecord(value)) throw new ResultsImportError(`Zeile ${row}: „executionEnvironment“ ist ungültig.`)
  const hardware = nullableInteger(own(value, 'hardwareConcurrency'), 'executionEnvironment.hardwareConcurrency', row, 1, 1_024)
  const memory = nullableNumber(own(value, 'deviceMemoryGiB'), 'executionEnvironment.deviceMemoryGiB', row, 0, 1_024)
  if (typeof own(value, 'webgpu') !== 'boolean') throw new ResultsImportError(`Zeile ${row}: „executionEnvironment.webgpu“ ist ungültig.`)
  return {
    capturedAt: integer(own(value, 'capturedAt'), 'executionEnvironment.capturedAt', row, 0, 9_007_199_254_740_991),
    userAgent: stringField(own(value, 'userAgent'), 'executionEnvironment.userAgent', row, 2_000, true),
    platform: stringField(own(value, 'platform'), 'executionEnvironment.platform', row, 300, true),
    language: stringField(own(value, 'language'), 'executionEnvironment.language', row, 100, true),
    origin: stringField(own(value, 'origin'), 'executionEnvironment.origin', row, 2_000, true),
    hardwareConcurrency: hardware,
    deviceMemoryGiB: memory,
    webgpu: own(value, 'webgpu') as boolean,
  }
}

function optionalText(value: unknown, field: string, row: number, max = 2_000): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return stringField(value, field, row, max)
}

function generationMetrics(value: unknown, row: number): TrialGenerationMetrics | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (!isRecord(value)) throw new ResultsImportError(`Zeile ${row}: „generationMetrics“ ist ungültig.`)
  const metric = (name: keyof TrialGenerationMetrics, max: number) =>
    nullableNumber(own(value, name), `generationMetrics.${name}`, row, 0, max) ?? undefined
  return {
    ...(metric('ttftMs', 604_800_000) !== undefined ? { ttftMs: metric('ttftMs', 604_800_000) } : {}),
    ...(metric('promptTokens', 10_000_000) !== undefined ? { promptTokens: metric('promptTokens', 10_000_000) } : {}),
    ...(metric('completionTokens', 10_000_000) !== undefined ? { completionTokens: metric('completionTokens', 10_000_000) } : {}),
    ...(metric('tokensPerSecond', 1_000_000) !== undefined ? { tokensPerSecond: metric('tokensPerSecond', 1_000_000) } : {}),
    ...(metric('modelLoadMs', 604_800_000) !== undefined ? { modelLoadMs: metric('modelLoadMs', 604_800_000) } : {}),
    ...(metric('promptEvalMs', 604_800_000) !== undefined ? { promptEvalMs: metric('promptEvalMs', 604_800_000) } : {}),
    ...(metric('modelTotalMs', 604_800_000) !== undefined ? { modelTotalMs: metric('modelTotalMs', 604_800_000) } : {}),
  }
}

function modelProvenance(value: unknown, row: number): TrialModelProvenance | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (!isRecord(value)) throw new ResultsImportError(`Zeile ${row}: „modelProvenance“ ist ungültig.`)
  const rawParameters = own(value, 'parameters')
  if (!isRecord(rawParameters)) throw new ResultsImportError(`Zeile ${row}: „modelProvenance.parameters“ ist ungültig.`)
  const think = own(rawParameters, 'think')
  if (typeof think !== 'boolean') throw new ResultsImportError(`Zeile ${row}: „modelProvenance.parameters.think“ ist ungültig.`)
  const optionalNumber = (name: string) => nullableNumber(own(value, name), `modelProvenance.${name}`, row, 0, 1_000_000_000_000_000) ?? undefined
  return {
    provider: stringField(own(value, 'provider'), 'modelProvenance.provider', row, 100),
    model: stringField(own(value, 'model'), 'modelProvenance.model', row, 300),
    ...(optionalText(own(value, 'digest'), 'modelProvenance.digest', row, 500) ? { digest: own(value, 'digest') as string } : {}),
    ...(optionalText(own(value, 'runtime'), 'modelProvenance.runtime', row, 500) ? { runtime: own(value, 'runtime') as string } : {}),
    ...(optionalText(own(value, 'endpoint'), 'modelProvenance.endpoint', row) ? { endpoint: own(value, 'endpoint') as string } : {}),
    ...(optionalText(own(value, 'parameterSize'), 'modelProvenance.parameterSize', row, 100) ? { parameterSize: own(value, 'parameterSize') as string } : {}),
    ...(optionalText(own(value, 'quantization'), 'modelProvenance.quantization', row, 100) ? { quantization: own(value, 'quantization') as string } : {}),
    ...(optionalNumber('modelSizeBytes') !== undefined ? { modelSizeBytes: optionalNumber('modelSizeBytes') } : {}),
    ...(optionalNumber('residentVramBytes') !== undefined ? { residentVramBytes: optionalNumber('residentVramBytes') } : {}),
    parameters: {
      temperature: finiteNumber(own(rawParameters, 'temperature'), 'modelProvenance.parameters.temperature', row, 0, 10),
      seed: integer(own(rawParameters, 'seed'), 'modelProvenance.parameters.seed', row, 0, 4_294_967_295),
      numCtx: integer(own(rawParameters, 'numCtx'), 'modelProvenance.parameters.numCtx', row, 128, 10_000_000),
      numPredict: integer(own(rawParameters, 'numPredict'), 'modelProvenance.parameters.numPredict', row, 1, 1_000_000),
      think,
      keepAlive: stringField(own(rawParameters, 'keepAlive'), 'modelProvenance.parameters.keepAlive', row, 100),
    },
  }
}

function validateTrial(value: unknown, row: number): TrialResult {
  if (!isRecord(value)) throw new ResultsImportError(`Zeile ${row}: Der Trial ist kein Objekt.`)

  const conditionValue = own(value, 'condition')
  if (typeof conditionValue !== 'string' || !CONDITIONS.has(conditionValue as Condition)) {
    throw new ResultsImportError(`Zeile ${row}: unbekannte Bedingung „${String(conditionValue ?? '')}“.`)
  }
  const retrievalValue = own(value, 'retrieval')
  if (typeof retrievalValue !== 'string' || !RETRIEVAL_MODES.has(retrievalValue as RetrievalMode)) {
    throw new ResultsImportError(`Zeile ${row}: unbekanntes Retrieval-Backend „${String(retrievalValue ?? '')}“.`)
  }
  const latencyScope = own(value, 'latencyScope')
  if (latencyScope !== 'end-to-end' && latencyScope !== 'generation-only') {
    throw new ResultsImportError(`Zeile ${row}: „latencyScope“ ist ungültig.`)
  }

  const ids = own(value, 'retrievedIds')
  if (!Array.isArray(ids) || ids.length > 200 || ids.some((id) => typeof id !== 'string' || !id || id.length > 200)) {
    throw new ResultsImportError(`Zeile ${row}: „retrievedIds“ ist keine gültige Knoten-ID-Liste.`)
  }
  const blindValue = own(value, 'blind')
  let blind: TrialResult['blind']
  if (blindValue !== undefined && blindValue !== null) {
    if (!isRecord(blindValue)) throw new ResultsImportError(`Zeile ${row}: „blind“ ist ungültig.`)
    const A = score(own(blindValue, 'A'), 'blind.A', row, true)
    const B = score(own(blindValue, 'B'), 'blind.B', row, true)
    if (A || B) blind = { ...(A ? { A } : {}), ...(B ? { B } : {}) }
  }
  const environment = executionEnvironment(own(value, 'executionEnvironment'), row)
  const metrics = generationMetrics(own(value, 'generationMetrics'), row)
  const provenance = modelProvenance(own(value, 'modelProvenance'), row)

  return {
    id: stringField(own(value, 'id'), 'id', row, 200),
    runId: stringField(own(value, 'runId'), 'runId', row, 200),
    repetitionId: stringField(own(value, 'repetitionId'), 'repetitionId', row, 240),
    repetition: integer(own(value, 'repetition'), 'repetition', row, 1, 10_000),
    order: integer(own(value, 'order'), 'order', row, 1, 1_000_000),
    seed: nullableInteger(own(value, 'seed'), 'seed', row, 0, 4_294_967_295),
    questionOrder: nullableInteger(own(value, 'questionOrder'), 'questionOrder', row, 1, 100_000),
    conditionOrder: nullableInteger(own(value, 'conditionOrder'), 'conditionOrder', row, 1, 100),
    orderStrategy: stringField(own(value, 'orderStrategy'), 'orderStrategy', row, 300),
    questionId: stringField(own(value, 'questionId'), 'questionId', row, 200),
    condition: conditionValue as Condition,
    answer: stringField(own(value, 'answer'), 'answer', row, 200_000, true),
    contextChars: integer(own(value, 'contextChars'), 'contextChars', row, 0, 10_000_000),
    retrievedIds: [...ids],
    latencyMs: finiteNumber(own(value, 'latencyMs'), 'latencyMs', row, 0, 604_800_000),
    latencyScope,
    prepareMs: nullableNumber(own(value, 'prepareMs'), 'prepareMs', row, 0, 604_800_000),
    retrievalMs: nullableNumber(own(value, 'retrievalMs'), 'retrievalMs', row, 0, 604_800_000),
    generationMs: finiteNumber(own(value, 'generationMs'), 'generationMs', row, 0, 604_800_000),
    ...(metrics ? { generationMetrics: metrics } : {}),
    autoScore: score(own(value, 'autoScore'), 'autoScore', row)!,
    manualScore: score(own(value, 'manualScore'), 'manualScore', row, true),
    ...(blind ? { blind } : {}),
    engine: stringField(own(value, 'engine'), 'engine', row, 300),
    retrieval: retrievalValue as RetrievalMode,
    evidenceRecall: nullableNumber(own(value, 'evidenceRecall'), 'evidenceRecall', row, 0, 1),
    evidencePrecision: nullableNumber(own(value, 'evidencePrecision'), 'evidencePrecision', row, 0, 1),
    ...(environment ? { executionEnvironment: environment } : {}),
    ...(provenance ? { modelProvenance: provenance } : {}),
    timestamp: integer(own(value, 'timestamp'), 'timestamp', row, 0, 9_007_199_254_740_991),
  }
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"' && field.length === 0) {
      quoted = true
    } else if (char === ';') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field.endsWith('\r') ? field.slice(0, -1) : field)
      if (row.some((cell) => cell.length > 0)) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (quoted) throw new ResultsImportError('CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.')
  row.push(field.endsWith('\r') ? field.slice(0, -1) : field)
  if (row.some((cell) => cell.length > 0)) rows.push(row)
  return rows
}

function csvNumber(value: string, field: string, row: number, nullable = false): number | null {
  if (nullable && value === '') return null
  if (value.trim() === '') throw new ResultsImportError(`Zeile ${row}: „${field}“ fehlt.`)
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new ResultsImportError(`Zeile ${row}: „${field}“ ist keine Zahl.`)
  return parsed
}

function parseCsv(text: string): unknown[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''))
  if (rows.length < 2) throw new ResultsImportError('Die CSV-Datei enthält keine Ergebniszeilen.')
  const header = rows[0]
  const duplicateHeaders = header.filter((name, index) => header.indexOf(name) !== index)
  if (duplicateHeaders.length) throw new ResultsImportError(`CSV-Kopf enthält doppelte Spalten: ${[...new Set(duplicateHeaders)].join(', ')}.`)
  const missing = CSV_COLUMNS.filter((column) => !header.includes(column))
  if (missing.length) throw new ResultsImportError(`CSV-Kopf ist unvollständig. Fehlend: ${missing.join(', ')}.`)
  const index = new Map(header.map((name, column) => [name, column]))
  const valueAt = (row: string[], name: typeof CSV_COLUMNS[number]) => row[index.get(name)!] ?? ''
  const optionalValueAt = (row: string[], name: string) => {
    const column = index.get(name)
    return column === undefined ? '' : row[column] ?? ''
  }

  return rows.slice(1).map((row, rowIndex) => {
    const line = rowIndex + 2
    if (row.length !== header.length) {
      throw new ResultsImportError(`Zeile ${line}: ${row.length} statt ${header.length} CSV-Felder.`)
    }
    const blindA = valueAt(row, 'blindA')
    const blindB = valueAt(row, 'blindB')
    const environmentJson = optionalValueAt(row, 'executionEnvironment')
    const metricsJson = optionalValueAt(row, 'generationMetrics')
    const provenanceJson = optionalValueAt(row, 'modelProvenance')
    let environment: unknown
    let metrics: unknown
    let provenance: unknown
    if (environmentJson) {
      try {
        environment = JSON.parse(environmentJson)
      } catch {
        throw new ResultsImportError(`Zeile ${line}: „executionEnvironment“ ist kein gültiges JSON.`)
      }
    }
    for (const [field, json, assign] of [
      ['generationMetrics', metricsJson, (value: unknown) => { metrics = value }],
      ['modelProvenance', provenanceJson, (value: unknown) => { provenance = value }],
    ] as const) {
      if (!json) continue
      try {
        assign(JSON.parse(json))
      } catch {
        throw new ResultsImportError(`Zeile ${line}: „${field}“ ist kein gültiges JSON.`)
      }
    }
    return {
      id: valueAt(row, 'id'),
      runId: valueAt(row, 'runId'),
      repetitionId: valueAt(row, 'repetitionId'),
      repetition: csvNumber(valueAt(row, 'repetition'), 'repetition', line),
      order: csvNumber(valueAt(row, 'order'), 'order', line),
      seed: csvNumber(valueAt(row, 'seed'), 'seed', line, true),
      questionOrder: csvNumber(valueAt(row, 'questionOrder'), 'questionOrder', line, true),
      conditionOrder: csvNumber(valueAt(row, 'conditionOrder'), 'conditionOrder', line, true),
      orderStrategy: valueAt(row, 'orderStrategy'),
      questionId: valueAt(row, 'questionId'),
      condition: valueAt(row, 'condition'),
      retrieval: valueAt(row, 'retrieval'),
      engine: valueAt(row, 'engine'),
      autoScore: valueAt(row, 'autoScore'),
      manualScore: valueAt(row, 'manualScore'),
      blind: blindA || blindB ? { A: blindA || undefined, B: blindB || undefined } : undefined,
      latencyMs: csvNumber(valueAt(row, 'latencyMs'), 'latencyMs', line),
      latencyScope: valueAt(row, 'latencyScope'),
      prepareMs: csvNumber(valueAt(row, 'prepareMs'), 'prepareMs', line, true),
      retrievalMs: csvNumber(valueAt(row, 'retrievalMs'), 'retrievalMs', line, true),
      generationMs: csvNumber(valueAt(row, 'generationMs'), 'generationMs', line),
      generationMetrics: metrics,
      contextChars: csvNumber(valueAt(row, 'contextChars'), 'contextChars', line),
      evidenceRecall: csvNumber(valueAt(row, 'evidenceRecall'), 'evidenceRecall', line, true),
      evidencePrecision: csvNumber(valueAt(row, 'evidencePrecision'), 'evidencePrecision', line, true),
      retrievedIds: valueAt(row, 'retrievedIds') ? valueAt(row, 'retrievedIds').split('|') : [],
      timestamp: csvNumber(valueAt(row, 'timestamp'), 'timestamp', line),
      executionEnvironment: environment,
      modelProvenance: provenance,
      answer: valueAt(row, 'answer'),
    }
  })
}

function trialIdentity(result: TrialResult): string {
  return [result.runId, result.repetition, result.questionId, result.condition, result.engine, result.retrieval].join('\u001f')
}

function deduplicateIncoming(results: TrialResult[]): { results: TrialResult[]; duplicates: number; conflicts: number } {
  const ids = new Map<string, string>()
  const identities = new Set<string>()
  const unique: TrialResult[] = []
  let duplicates = 0
  let conflicts = 0
  for (const result of results) {
    const identity = trialIdentity(result)
    const previousIdentity = ids.get(result.id)
    if (previousIdentity !== undefined) {
      if (previousIdentity === identity) duplicates++
      else conflicts++
      continue
    }
    if (identities.has(identity)) {
      duplicates++
      continue
    }
    ids.set(result.id, identity)
    identities.add(identity)
    unique.push(result)
  }
  return { results: unique, duplicates, conflicts }
}

export function parseResultsImport(text: string, fileName = '', knownQuestionIds?: ReadonlySet<string>): ResultsImportPreview {
  if (!text.trim()) throw new ResultsImportError('Die ausgewählte Datei ist leer.')
  if (new TextEncoder().encode(text).byteLength > RESULTS_IMPORT_MAX_BYTES) {
    throw new ResultsImportError('Die Datei ist größer als 25 MB.')
  }

  const csvByName = fileName.toLowerCase().endsWith('.csv')
  let format: ResultsImportFormat
  let schemaVersion: number | null = null
  let rawResults: unknown[]
  if (csvByName || (!text.trimStart().startsWith('{') && !text.trimStart().startsWith('['))) {
    format = 'csv'
    rawResults = parseCsv(text)
  } else {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new ResultsImportError(`JSON konnte nicht gelesen werden: ${detail}`)
    }
    if (Array.isArray(parsed)) {
      format = 'json'
      rawResults = parsed
    } else if (isRecord(parsed) && isRecord(own(parsed, 'metadata_and_results'))) {
      format = 'submission-bundle'
      const metadata = own(parsed, 'metadata_and_results') as Record<string, unknown>
      const results = own(metadata, 'results')
      if (!Array.isArray(results)) throw new ResultsImportError('Das Abgabe-Paket enthält kein Ergebnis-Array.')
      rawResults = results
      const version = own(metadata, 'schemaVersion')
      schemaVersion = typeof version === 'number' && Number.isInteger(version) ? version : null
    } else if (isRecord(parsed)) {
      format = 'json'
      const results = own(parsed, 'results')
      if (!Array.isArray(results)) throw new ResultsImportError('Der JSON-Export enthält kein Ergebnis-Array.')
      rawResults = results
      const version = own(parsed, 'schemaVersion')
      schemaVersion = typeof version === 'number' && Number.isInteger(version) ? version : null
    } else {
      throw new ResultsImportError('Die JSON-Struktur ist weder Ergebnisexport noch Abgabe-Paket.')
    }
  }

  if (schemaVersion !== null && schemaVersion > 4) {
    throw new ResultsImportError(`Schema-Version ${schemaVersion} ist neuer als diese App unterstützt.`)
  }
  if (!rawResults.length) throw new ResultsImportError('Die Datei enthält keine Ergebnisse.')
  if (rawResults.length > RESULTS_IMPORT_MAX_ROWS) {
    throw new ResultsImportError(`Die Datei enthält mehr als ${RESULTS_IMPORT_MAX_ROWS.toLocaleString('de-DE')} Trials.`)
  }

  const validated = rawResults.map((result, index) => validateTrial(result, index + 1))
  const deduplicated = deduplicateIncoming(validated)
  if (deduplicated.conflicts) {
    throw new ResultsImportError(`${deduplicated.conflicts} Trial-ID-Konflikt(e) innerhalb der Datei. Der Import wurde vollständig abgebrochen.`)
  }
  const warnings: string[] = []
  if (deduplicated.duplicates) warnings.push(`${deduplicated.duplicates} Dublette(n) innerhalb der Datei werden übersprungen.`)
  if (schemaVersion === null && format !== 'csv') warnings.push('Keine Schema-Version vorhanden; die Felder wurden einzeln validiert.')
  if (knownQuestionIds) {
    const unknown = [...new Set(deduplicated.results.map((result) => result.questionId).filter((id) => !knownQuestionIds.has(id)))]
    if (unknown.length) {
      throw new ResultsImportError(
        `${unknown.length} unbekannte Frage-ID(s): ${unknown.slice(0, 5).join(', ')}. `
        + 'Der Import wurde abgelehnt, damit Gesamt- und Fragetyp-Auswertung dieselbe Stichprobe verwenden.',
      )
    }
  }

  return {
    format,
    results: deduplicated.results,
    sourceRows: rawResults.length,
    duplicateRows: deduplicated.duplicates,
    schemaVersion,
    warnings,
    runIds: [...new Set(deduplicated.results.map((result) => result.runId))],
    engines: [...new Set(deduplicated.results.map((result) => result.engine))],
  }
}

export function planResultsImport(
  current: readonly TrialResult[],
  incoming: readonly TrialResult[],
  mode: ResultsImportMode,
): ResultsImportPlan {
  const incomingDeduplicated = deduplicateIncoming([...incoming])
  const incomingUnique = incomingDeduplicated.results
  const importedRunIds = new Set(incomingUnique.map((result) => result.runId))
  const retained = mode === 'replace-all'
    ? []
    : mode === 'replace-runs'
      ? current.filter((result) => !importedRunIds.has(result.runId))
      : [...current]
  const existingRemoved = current.length - retained.length
  const ids = new Map(retained.map((result) => [result.id, trialIdentity(result)]))
  const identities = new Set(retained.map(trialIdentity))
  const accepted: TrialResult[] = []
  let duplicatesSkipped = incomingDeduplicated.duplicates
  let conflictsSkipped = incomingDeduplicated.conflicts

  for (const result of incomingUnique) {
    const identity = trialIdentity(result)
    const idIdentity = ids.get(result.id)
    if (idIdentity !== undefined) {
      if (idIdentity === identity) duplicatesSkipped++
      else conflictsSkipped++
      continue
    }
    if (identities.has(identity)) {
      duplicatesSkipped++
      continue
    }
    ids.set(result.id, identity)
    identities.add(identity)
    accepted.push(result)
  }

  return {
    results: [...retained, ...accepted],
    imported: incomingUnique.length,
    added: accepted.length,
    duplicatesSkipped,
    conflictsSkipped,
    existingRemoved,
  }
}
