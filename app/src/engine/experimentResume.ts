import type { Condition, RetrievalMode, TrialModelProvenance, TrialResult } from '../data/types'
import type { ScheduledTrial } from './experiment'

const CHECKPOINT_KEY = 'graphrag.experiment-checkpoint.v1'

export interface ExperimentCheckpoint {
  version: 1
  runId: string
  configFingerprint: string
  createdAt: number
  total: number
}

export interface ExperimentFingerprintInput {
  engineId: string
  modelProvenance: TrialModelProvenance | null
  retrieval: RetrievalMode
  conditions: readonly Condition[]
  repetitions: number
  seed: number
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function experimentConfigFingerprint(input: ExperimentFingerprintInput): string {
  const provenance = input.modelProvenance
  const canonical = {
    engineId: input.engineId,
    model: provenance?.model ?? null,
    digest: provenance?.digest ?? null,
    runtime: provenance?.runtime ?? null,
    parameters: provenance?.parameters ?? null,
    retrieval: input.retrieval,
    conditions: [...input.conditions],
    repetitions: input.repetitions,
    seed: input.seed,
  }
  return fnv1a(JSON.stringify(canonical))
}

export function scheduledTrialKey(trial: Pick<ScheduledTrial, 'repetition' | 'condition'> & { question: { id: string } }): string {
  return `${trial.repetition}\u001f${trial.question.id}\u001f${trial.condition}`
}

export function resultTrialKey(result: Pick<TrialResult, 'repetition' | 'questionId' | 'condition'>): string {
  return `${result.repetition}\u001f${result.questionId}\u001f${result.condition}`
}

export function pendingTrials(
  schedule: readonly ScheduledTrial[],
  results: readonly TrialResult[],
  checkpoint: ExperimentCheckpoint,
  engineId: string,
  retrieval: RetrievalMode,
): { pending: ScheduledTrial[]; completed: number } {
  const completedKeys = new Set(
    results
      .filter((result) => result.runId === checkpoint.runId && result.engine === engineId && result.retrieval === retrieval)
      .map(resultTrialKey),
  )
  const pending = schedule.filter((trial) => !completedKeys.has(scheduledTrialKey(trial)))
  return { pending, completed: schedule.length - pending.length }
}

export function newCheckpoint(configFingerprint: string, total: number, now = Date.now()): ExperimentCheckpoint {
  return {
    version: 1,
    runId: `run_${now.toString(36)}_${configFingerprint}`,
    configFingerprint,
    createdAt: now,
    total,
  }
}

export function loadCheckpoint(storage: Pick<Storage, 'getItem'> = localStorage): ExperimentCheckpoint | null {
  try {
    const value = JSON.parse(storage.getItem(CHECKPOINT_KEY) ?? 'null') as Partial<ExperimentCheckpoint> | null
    if (!value || value.version !== 1 || typeof value.runId !== 'string' || typeof value.configFingerprint !== 'string') return null
    if (!Number.isFinite(value.createdAt) || !Number.isInteger(value.total) || (value.total ?? 0) < 1) return null
    return value as ExperimentCheckpoint
  } catch {
    return null
  }
}

export function saveCheckpoint(checkpoint: ExperimentCheckpoint, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint))
}

export function clearCheckpoint(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  storage.removeItem(CHECKPOINT_KEY)
}
