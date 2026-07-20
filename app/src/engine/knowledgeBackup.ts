import type { CustomKnowledge } from './store'

export const KNOWLEDGE_BACKUP_KIND = 'noesis-local-knowledge'
export const KNOWLEDGE_BACKUP_SCHEMA = 1
export const MAX_KNOWLEDGE_BACKUP_BYTES = 20 * 1024 * 1024
const MAX_BACKUP_NODES = 20_000
const MAX_BACKUP_EDGES = 60_000

export interface KnowledgeBackup {
  kind: typeof KNOWLEDGE_BACKUP_KIND
  schemaVersion: typeof KNOWLEDGE_BACKUP_SCHEMA
  exportedAt: string
  knowledge: CustomKnowledge
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasValidShape(knowledge: unknown): knowledge is CustomKnowledge {
  if (!isRecord(knowledge) || !Array.isArray(knowledge.nodes) || !Array.isArray(knowledge.edges)) return false
  if (knowledge.nodes.length > MAX_BACKUP_NODES || knowledge.edges.length > MAX_BACKUP_EDGES) return false
  return knowledge.nodes.every((entry) => isRecord(entry)
    && typeof entry.id === 'string'
    && typeof entry.title === 'string'
    && typeof entry.summary === 'string')
    && knowledge.edges.every((entry) => isRecord(entry)
      && typeof entry.source === 'string'
      && typeof entry.target === 'string'
      && typeof entry.relation === 'string'
      && typeof entry.label === 'string')
}

export function createKnowledgeBackup(knowledge: CustomKnowledge, now = new Date()): string {
  const backup: KnowledgeBackup = {
    kind: KNOWLEDGE_BACKUP_KIND,
    schemaVersion: KNOWLEDGE_BACKUP_SCHEMA,
    exportedAt: now.toISOString(),
    knowledge,
  }
  return JSON.stringify(backup, null, 2)
}

/**
 * Prüft Typ, Version, Größe und Grundform vor jedem Restore. Die zentrale
 * Store-Sanitierung validiert anschließend Knoten-IDs, entfernt dangling
 * Kanten und persistiert den neuen Stand atomar.
 */
export function parseKnowledgeBackup(source: string): KnowledgeBackup {
  if (new Blob([source]).size > MAX_KNOWLEDGE_BACKUP_BYTES) {
    throw new Error('Das Wissens-Backup ist größer als 20 MB.')
  }
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error('Die ausgewählte Datei ist kein gültiges JSON-Backup.')
  }
  if (!isRecord(value) || value.kind !== KNOWLEDGE_BACKUP_KIND) {
    throw new Error('Diese Datei ist kein Noesis-Wissens-Backup.')
  }
  if (value.schemaVersion !== KNOWLEDGE_BACKUP_SCHEMA) {
    throw new Error(`Diese Backup-Version wird nicht unterstützt (${String(value.schemaVersion)}).`)
  }
  if (typeof value.exportedAt !== 'string' || !hasValidShape(value.knowledge)) {
    throw new Error('Das Wissens-Backup ist unvollständig oder beschädigt.')
  }
  return value as unknown as KnowledgeBackup
}
