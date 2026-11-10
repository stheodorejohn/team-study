import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import type { StudyMaterial } from '@/lib/supabase'
import { verifyAdminSession } from '@/lib/auth'
import { EditorClient } from './EditorClient'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Editor – Study Guide Architect',
}

async function getStudyMaterial(id: string): Promise<StudyMaterial | null> {
  try {
    const client = createServiceClient()
    const { data, error } = await client
      .from('study_materials')
      .select('*, study_sections(*, questions(*))')
      .eq('id', id)
      .single()

    if (error || !data) return null

    const material = data as StudyMaterial
    // Sort by order_index for consistent initial state
    material.study_sections = (material.study_sections ?? [])
      .sort((a, b) => a.order_index - b.order_index)
      .map((s) => ({
        ...s,
        questions: (s.questions ?? []).sort((a, b) => a.order_index - b.order_index),
      }))

    return material
  } catch {
    return null
  }
}

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const isAuthenticated = await verifyAdminSession()
  if (!isAuthenticated) {
    redirect('/login')
  }

  const { id } = await params
  const isNew = id === 'new'
  const initialData = isNew ? null : await getStudyMaterial(id)

  return <EditorClient id={id} isNew={isNew} initialData={initialData} />
}
