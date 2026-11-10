import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { verifyAdminSession, validateCsrfOrOrigin } from '@/lib/auth'

// ─── Types matching the request body sent by EditorClient ────────────────────

type QuestionPayload = {
  prompt: string
  type: 'text' | 'textarea' | 'radio' | 'checkbox'
  options?: string[] | null
  is_required?: boolean
}

type SectionPayload = {
  title: string
  scripture_reference?: string | null
  scripture_text?: string | null
  summary?: string | null
  questions?: QuestionPayload[]
}

type GuidePayload = {
  id?: string
  title: string
  slug: string
  subtitle?: string | null
  organization?: string | null
  memory_verse?: string | null
  sections: SectionPayload[]
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ALLOWED_QUESTION_TYPES = new Set(['text', 'textarea', 'radio', 'checkbox'])

function validatePayload(body: GuidePayload): string | null {
  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return 'Title is required.'
  }
  if (body.title.length > 255) {
    return 'Title exceeds 255 characters limit.'
  }

  if (!body.slug || typeof body.slug !== 'string' || !body.slug.trim()) {
    return 'Slug is required.'
  }
  const slug = body.slug.trim().toLowerCase()
  if (!SLUG_REGEX.test(slug)) {
    return 'Slug must contain only lowercase alphanumeric characters and single hyphens (e.g. "romans-8").'
  }
  if (slug.length > 100) {
    return 'Slug exceeds 100 characters limit.'
  }

  if (body.subtitle && body.subtitle.length > 500) {
    return 'Subtitle exceeds 500 characters limit.'
  }
  if (body.organization && body.organization.length > 255) {
    return 'Organization exceeds 255 characters limit.'
  }
  if (body.memory_verse && body.memory_verse.length > 1000) {
    return 'Memory verse exceeds 1000 characters limit.'
  }

  if (!Array.isArray(body.sections)) {
    return 'Sections must be an array.'
  }
  if (body.sections.length > 60) {
    return 'Sections count exceeds limit of 60.'
  }

  for (let i = 0; i < body.sections.length; i++) {
    const s = body.sections[i]
    if (!s.title || typeof s.title !== 'string' || !s.title.trim()) {
      return `Section ${i + 1} title is required.`
    }
    if (s.title.length > 255) {
      return `Section ${i + 1} title exceeds 255 characters limit.`
    }
    const questions = s.questions ?? []
    if (!Array.isArray(questions)) {
      return `Section ${i + 1} questions must be an array.`
    }
    if (questions.length > 50) {
      return `Section ${i + 1} exceeds 50 questions limit.`
    }
    for (let j = 0; j < questions.length; j++) {
      const q = questions[j]
      if (!q.prompt || typeof q.prompt !== 'string' || !q.prompt.trim()) {
        return `Section ${i + 1}, question ${j + 1} prompt is required.`
      }
      if (!ALLOWED_QUESTION_TYPES.has(q.type)) {
        return `Section ${i + 1}, question ${j + 1} has invalid type "${q.type}".`
      }
    }
  }

  return null
}

// ─── Shared helper: insert sections + questions after material is known ───────

async function insertSectionsAndQuestions(
  client: ReturnType<typeof createServiceClient>,
  materialId: string,
  sections: SectionPayload[]
): Promise<string[]> {
  const insertedSectionIds: string[] = []

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]

    const { data: sectionRow, error: sectionErr } = await client
      .from('study_sections')
      .insert({
        study_id: materialId,
        title: s.title.trim(),
        scripture_reference: s.scripture_reference?.trim() || null,
        scripture_text: s.scripture_text?.trim() || null,
        summary: s.summary?.trim() || null,
        order_index: i,
      })
      .select('id')
      .single()

    if (sectionErr || !sectionRow) {
      throw new Error(`Section insert failed at index ${i}`)
    }

    insertedSectionIds.push(sectionRow.id)

    const questions = s.questions ?? []
    if (questions.length > 0) {
      const questionsToInsert = questions.map((q, j) => ({
        section_id: sectionRow.id,
        prompt: q.prompt.trim(),
        type: q.type,
        options: q.options && q.options.length > 0 ? q.options : null,
        is_required: q.is_required ?? false,
        order_index: j,
      }))

      const { error: questionsErr } = await client
        .from('questions')
        .insert(questionsToInsert)

      if (questionsErr) {
        throw new Error(`Questions insert failed for section ${i}`)
      }
    }
  }

  return insertedSectionIds
}

// ─── POST /api/guides — Create a new study guide ─────────────────────────────

export async function POST(request: NextRequest) {
  if (!validateCsrfOrOrigin(request)) {
    return NextResponse.json({ error: 'CSRF / origin mismatch' }, { status: 403 })
  }

  const isAuth = await verifyAdminSession()
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: GuidePayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const validationError = validatePayload(body)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const { title, slug, subtitle, organization, memory_verse, sections = [] } = body
  const cleanSlug = slug.trim().toLowerCase()
  const client = createServiceClient()

  // 1. Check slug uniqueness
  const { data: existingSlug } = await client
    .from('study_materials')
    .select('id')
    .eq('slug', cleanSlug)
    .maybeSingle()

  if (existingSlug) {
    return NextResponse.json({ error: 'A guide with this slug already exists.' }, { status: 409 })
  }

  // 2. Insert the material
  const { data: material, error: materialErr } = await client
    .from('study_materials')
    .insert({
      title: title.trim(),
      slug: cleanSlug,
      subtitle: subtitle?.trim() || null,
      organization: organization?.trim() || null,
      memory_verse: memory_verse?.trim() || null,
    })
    .select('id')
    .single()

  if (materialErr || !material) {
    return NextResponse.json({ error: 'Failed to create guide material.' }, { status: 500 })
  }

  // 3. Insert sections and questions
  try {
    await insertSectionsAndQuestions(client, material.id, sections)
  } catch (err) {
    // Clean up partial material row on failure
    await client.from('study_materials').delete().eq('id', material.id)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to insert sections.' },
      { status: 500 }
    )
  }

  revalidatePath(`/${cleanSlug}`)

  return NextResponse.json({ id: material.id, slug: cleanSlug }, { status: 201 })
}

// ─── PUT /api/guides — Update an existing study guide ────────────────────────

export async function PUT(request: NextRequest) {
  if (!validateCsrfOrOrigin(request)) {
    return NextResponse.json({ error: 'CSRF / origin mismatch' }, { status: 403 })
  }

  const isAuth = await verifyAdminSession()
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: GuidePayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.id) {
    return NextResponse.json({ error: 'Guide id is required.' }, { status: 400 })
  }

  const validationError = validatePayload(body)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const { id, title, slug, subtitle, organization, memory_verse, sections = [] } = body
  const cleanSlug = slug.trim().toLowerCase()
  const client = createServiceClient()

  // 1. Check if guide exists and slug conflict
  const { data: existingGuide } = await client
    .from('study_materials')
    .select('id, slug')
    .eq('id', id)
    .maybeSingle()

  if (!existingGuide) {
    return NextResponse.json({ error: 'Guide not found.' }, { status: 404 })
  }

  if (existingGuide.slug !== cleanSlug) {
    const { data: slugOwner } = await client
      .from('study_materials')
      .select('id')
      .eq('slug', cleanSlug)
      .neq('id', id)
      .maybeSingle()

    if (slugOwner) {
      return NextResponse.json({ error: 'A guide with this slug already exists.' }, { status: 409 })
    }
  }

  // 2. Fetch existing section IDs prior to mutation
  const { data: existingSections } = await client
    .from('study_sections')
    .select('id')
    .eq('study_id', id)

  const oldSectionIds = (existingSections ?? []).map((s: { id: string }) => s.id)

  // 3. Update the material row
  const { error: updateErr } = await client
    .from('study_materials')
    .update({
      title: title.trim(),
      slug: cleanSlug,
      subtitle: subtitle?.trim() || null,
      organization: organization?.trim() || null,
      memory_verse: memory_verse?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to update guide details.' }, { status: 500 })
  }

  // 4. Safe write: Insert new sections and questions FIRST
  // If this throws, old sections remain intact!
  try {
    await insertSectionsAndQuestions(client, id, sections)

    // 5. Clean up old sections now that new sections are verified and inserted
    if (oldSectionIds.length > 0) {
      await client.from('questions').delete().in('section_id', oldSectionIds)
      await client.from('study_sections').delete().in('id', oldSectionIds)
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update guide sections.' },
      { status: 500 }
    )
  }

  revalidatePath(`/${cleanSlug}`)
  if (existingGuide.slug !== cleanSlug) {
    revalidatePath(`/${existingGuide.slug}`)
  }

  return NextResponse.json({ id, slug: cleanSlug })
}
