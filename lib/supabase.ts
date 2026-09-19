import { createClient } from '@supabase/supabase-js'

// ─── Strict env guards ────────────────────────────────────────────────────────
// These fire at module load time, so a mis-named or missing env var surfaces
// immediately in the terminal instead of producing a cryptic Supabase error.

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL in environment variables. ' +
      'Copy .env.example to .env.local and set the value.'
  )
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables. ' +
      'Copy .env.example to .env.local and set the value.'
  )
}

// Normalise the URL:
//  1. Strip any /rest/v1 path that was accidentally included in the env var.
//     The Supabase JS client appends /rest/v1 itself — if the URL already
//     contains it the final path becomes /rest/v1//rest/v1/… → PGRST125.
//  2. Strip trailing slashes for the same reason.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  .replace(/\/rest\/v1\/?$/, '') // remove accidental /rest/v1 suffix
  .replace(/\/+$/, '')           // remove any remaining trailing slashes
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Browser-safe Supabase client. Uses the anon key.
 * For server-only privileged operations use createServiceClient() instead.
 *
 * `db.schema: 'public'` is set explicitly so PostgREST never has to guess
 * which schema to resolve table names against (prevents PGRST125).
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'public' },
})

/**
 * Server-side only Supabase client using the service-role key.
 * NEVER import this in Client Components or expose it to the browser.
 */
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
        'This client must only be used in server-side code.'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: { schema: 'public' },
  })
}

// ─── Normalised relational types ──────────────────────────────────────────────
// Mirrors the live Supabase schema exactly as shown in the schema visualiser:
//   study_materials → study_sections → questions

export type QuestionType = 'text' | 'textarea' | 'radio' | 'checkbox'

export type Question = {
  id: string
  section_id: string
  prompt: string
  type: QuestionType
  /** Populated for radio / checkbox questions only */
  options: string[] | null
  is_required: boolean
  order_index: number
  created_at: string
  updated_at: string
}

export type StudySection = {
  id: string
  study_id: string
  title: string
  scripture_reference: string | null
  /** Full scripture passage text */
  scripture_text: string | null
  /** Section summary / commentary */
  summary: string | null
  order_index: number
  created_at: string
  updated_at: string
  /** Populated when fetched with `.select('*, questions(*)')` */
  questions: Question[]
}

export type StudyMaterial = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  organization: string | null
  memory_verse: string | null
  created_at: string
  updated_at: string
  /** Populated when fetched with `.select('*, study_sections(*, questions(*)')` */
  study_sections: StudySection[]
}

/** Lightweight shape used in the admin list (no joins needed) */
export type StudyMaterialSummary = {
  id: string
  slug: string
  title: string
  created_at: string
}
