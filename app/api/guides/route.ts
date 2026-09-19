import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { cookies } from 'next/headers'

const AUTH_COOKIE_NAME = 'auth_token'
const AUTH_COOKIE_VALUE = 'admin_active'

async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)
  return token?.value === AUTH_COOKIE_VALUE
}

// ─── Types matching the request body sent by EditorClient ────────────────────

type QuestionPayload = {
  prompt: string
  type: 'text' | 'textarea' | 'radio' | 'checkbox'
  options: string[]
  is_required: boolean
}

type SectionPayload = {
  title: string
  scripture_reference: string
  scripture_text: string
  summary: string
  questions: QuestionPayload[]
}

type GuidePayload = {
  id?: string
  title: string
  slug: string
  subtitle: string
  organization: string
  memory_verse: string
  sections: SectionPayload[]
}

// ─── Shared helper: insert sections + questions after material is known ───────

async function insertSectionsAndQuestions(
  client: ReturnType<typeof createServiceClient>,
  materialId: string,
  sections: SectionPayload[]
): Promise<void> {
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]

    const { data: sectionRow, error: sectionErr } = await client
      .from('study_sections')
      .insert({
        study_id: materialId,
        title: s.title,
        scripture_reference: s.scripture_reference || null,
        scripture_text: s.scripture_text || null,
        summary: s.summary || null,
        order_index: i,
      })
      .select('id')
      .single()

    if (sectionErr) throw new Error(`Section insert failed: ${sectionErr.message}`)

    if (s.questions.length > 0) {
      const questionsToInsert = s.questions.map((q, j) => ({
        section_id: sectionRow.id,
        prompt: q.prompt,
        type: q.type,
        options: q.options?.length > 0 ? q.options : null,
        is_required: q.is_required ?? false,
        order_index: j,
      }))

      const { error: questionsErr } = await client
        .from('questions')
        .insert(questionsToInsert)

      if (questionsErr) throw new Error(`Questions insert failed: ${questionsErr.message}`)
    }
  }
}

// ─── POST /api/guides — Create a new study guide ─────────────────────────────

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: GuidePayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { title, slug, subtitle, organization, memory_verse, sections = [] } = body

  if (!title?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: 'title and slug are required' }, { status: 400 })
  }

  const client = createServiceClient()

  // 1. Insert the material
  const { data: material, error: materialErr } = await client
    .from('study_materials')
    .insert({
      title,
      slug,
      subtitle: subtitle || null,
      organization: organization || null,
      memory_verse: memory_verse || null,
    })
    .select('id')
    .single()

  if (materialErr) {
    return NextResponse.json({ error: materialErr.message }, { status: 500 })
  }

  // 2. Insert sections and questions
  try {
    await insertSectionsAndQuestions(client, material.id, sections)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to insert sections' },
      { status: 500 }
    )
  }

  return NextResponse.json({ id: material.id }, { status: 201 })
}

// ─── PUT /api/guides — Update an existing study guide ────────────────────────
//
// Strategy: update the material row, then delete all existing sections
// (questions cascade-delete if FK has ON DELETE CASCADE, otherwise we
// delete questions first manually), then re-insert sections + questions.

export async function PUT(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: GuidePayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id, title, slug, subtitle, organization, memory_verse, sections = [] } = body

  if (!id || !title?.trim() || !slug?.trim()) {
    return NextResponse.json(
      { error: 'id, title and slug are required' },
      { status: 400 }
    )
  }

  const client = createServiceClient()

  // 1. Update the material row
  const { error: updateErr } = await client
    .from('study_materials')
    .update({
      title,
      slug,
      subtitle: subtitle || null,
      organization: organization || null,
      memory_verse: memory_verse || null,
    })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // 2. Fetch existing section IDs so we can delete questions first
  const { data: existingSections } = await client
    .from('study_sections')
    .select('id')
    .eq('study_id', id)

  if (existingSections && existingSections.length > 0) {
    const sectionIds = existingSections.map((s: { id: string }) => s.id)

    // Delete questions first (handles DBs without ON DELETE CASCADE)
    await client.from('questions').delete().in('section_id', sectionIds)
  }

  // 3. Delete all sections for this material
  await client.from('study_sections').delete().eq('study_id', id)

  // 4. Re-insert sections and questions
  try {
    await insertSectionsAndQuestions(client, id, sections)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to insert sections' },
      { status: 500 }
    )
  }

  return NextResponse.json({ id })
}
