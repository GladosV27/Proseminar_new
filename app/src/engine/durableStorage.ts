const DB_NAME = 'noesis-local-v1'
const STORE_NAME = 'snapshots'

export interface DurableSnapshot<T = unknown> {
  key: string
  updatedAt: number
  value: T
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

export async function writeDurableSnapshot<T>(key: string, value: T, updatedAt = Date.now()): Promise<void> {
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const current = store.get(key)
    current.onsuccess = () => {
      const existing = current.result as DurableSnapshot<T> | undefined
      // Mehrere schnelle Messspeicherungen dürfen nicht durch eine später
      // fertig werdende, aber ältere asynchrone Transaktion zurückrollen.
      if (!existing || existing.updatedAt <= updatedAt) {
        store.put({ key, value, updatedAt } satisfies DurableSnapshot<T>)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
  db.close()
}

export async function readDurableSnapshot<T>(key: string): Promise<DurableSnapshot<T> | null> {
  const db = await openDatabase()
  if (!db) return null
  const value = await new Promise<DurableSnapshot<T> | null>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve((request.result as DurableSnapshot<T> | undefined) ?? null)
    request.onerror = () => resolve(null)
  })
  db.close()
  return value
}
