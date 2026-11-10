/**
 * IndexedDB Participant Storage Repository
 *
 * Persists participant answers locally in browser storage without sending
 * any participant data to Supabase.
 */

const DB_NAME = 'fellowship_study_db'
const DB_VERSION = 1
const ANSWERS_STORE = 'answers'
const META_STORE = 'guideMeta'

export type AnswerValue = string | string[]

export type StoredAnswerRecord = {
  key: string // composite: `${slug}:${questionId}`
  slug: string
  questionId: string
  value: AnswerValue
  updatedAt: string
}

export type StoredGuideMeta = {
  slug: string
  lastVisited: string
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this environment.'))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(ANSWERS_STORE)) {
        const store = db.createObjectStore(ANSWERS_STORE, { keyPath: 'key' })
        store.createIndex('slug', 'slug', { unique: false })
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'slug' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open database'))
  })
}

/**
 * Loads all answers for a given guide slug from IndexedDB.
 * If none exist yet, checks for legacy localStorage data and migrates idempotently.
 */
export async function getGuideAnswers(slug: string): Promise<Record<string, AnswerValue>> {
  if (typeof window === 'undefined') return {}

  try {
    const db = await openDatabase()
    const answers: Record<string, AnswerValue> = {}

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ANSWERS_STORE, 'readonly')
      const store = tx.objectStore(ANSWERS_STORE)
      const index = store.index('slug')
      const request = index.getAll(IDBKeyRange.only(slug))

      request.onsuccess = () => {
        const records = request.result as StoredAnswerRecord[]
        for (const record of records) {
          answers[record.questionId] = record.value
        }
        resolve()
      }
      request.onerror = () => reject(request.error)
    })

    // If IndexedDB had answers, record visit and return
    if (Object.keys(answers).length > 0) {
      await touchGuideMeta(slug).catch(() => {})
      return answers
    }

    // Attempt migration from legacy localStorage if IndexedDB was empty
    const migrated = await migrateLegacyLocalStorage(slug)
    if (migrated && Object.keys(migrated).length > 0) {
      return migrated
    }

    return {}
  } catch (err) {
    // Fallback: try reading from localStorage if IndexedDB is blocked
    console.warn('IndexedDB unavailable, falling back to localStorage:', err)
    return readLegacyLocalStorage(slug)
  }
}

/**
 * Saves a batch of answers for a guide slug.
 */
export async function saveGuideAnswersBatch(
  slug: string,
  answers: Record<string, AnswerValue>
): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    const db = await openDatabase()
    const now = new Date().toISOString()

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([ANSWERS_STORE, META_STORE], 'readwrite')
      const store = tx.objectStore(ANSWERS_STORE)
      const metaStore = tx.objectStore(META_STORE)

      for (const [questionId, value] of Object.entries(answers)) {
        store.put({
          key: `${slug}:${questionId}`,
          slug,
          questionId,
          value,
          updatedAt: now,
        })
      }

      metaStore.put({
        slug,
        lastVisited: now,
      })

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'))
    })
  } catch (err) {
    console.warn('Failed to save answers to IndexedDB, fallback to localStorage:', err)
    saveLegacyLocalStorage(slug, answers)
  }
}

/**
 * Saves a single answer for a question in a guide.
 */
export async function saveGuideAnswer(
  slug: string,
  questionId: string,
  value: AnswerValue
): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    const db = await openDatabase()
    const now = new Date().toISOString()

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([ANSWERS_STORE, META_STORE], 'readwrite')
      const store = tx.objectStore(ANSWERS_STORE)
      const metaStore = tx.objectStore(META_STORE)

      store.put({
        key: `${slug}:${questionId}`,
        slug,
        questionId,
        value,
        updatedAt: now,
      })

      metaStore.put({
        slug,
        lastVisited: now,
      })

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'))
    })
  } catch (err) {
    console.warn('Failed to save answer to IndexedDB, fallback to localStorage:', err)
    const existing = readLegacyLocalStorage(slug)
    existing[questionId] = value
    saveLegacyLocalStorage(slug, existing)
  }
}

/**
 * Clears all answers for a guide (Reset Answers).
 */
export async function clearGuideAnswers(slug: string): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    const db = await openDatabase()

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([ANSWERS_STORE], 'readwrite')
      const store = tx.objectStore(ANSWERS_STORE)
      const index = store.index('slug')
      const request = index.openCursor(IDBKeyRange.only(slug))

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          resolve()
        }
      }
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.warn('Failed to clear answers from IndexedDB:', err)
  }

  // Also remove localStorage key
  try {
    localStorage.removeItem(`fellowship_answers_${slug}`)
  } catch {
    // Ignore
  }
}

async function touchGuideMeta(slug: string): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction(META_STORE, 'readwrite')
  tx.objectStore(META_STORE).put({ slug, lastVisited: new Date().toISOString() })
}

// ─── Legacy localStorage helpers & idempotent migration ───────────────────────

function readLegacyLocalStorage(slug: string): Record<string, AnswerValue> {
  try {
    const raw = localStorage.getItem(`fellowship_answers_${slug}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    }
  } catch {
    // Ignore
  }
  return {}
}

function saveLegacyLocalStorage(slug: string, answers: Record<string, AnswerValue>): void {
  try {
    localStorage.setItem(`fellowship_answers_${slug}`, JSON.stringify(answers))
  } catch {
    // Ignore
  }
}

export async function migrateLegacyLocalStorage(
  slug: string
): Promise<Record<string, AnswerValue> | null> {
  const legacyAnswers = readLegacyLocalStorage(slug)
  if (!legacyAnswers || Object.keys(legacyAnswers).length === 0) {
    return null
  }

  try {
    await saveGuideAnswersBatch(slug, legacyAnswers)
    // Remove old key only after successful IndexedDB write
    try {
      localStorage.removeItem(`fellowship_answers_${slug}`)
    } catch {
      // Ignore
    }
    return legacyAnswers
  } catch {
    return legacyAnswers
  }
}

