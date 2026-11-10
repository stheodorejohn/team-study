import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import type { StudyMaterial } from '@/lib/supabase'
import { BookWrapper } from './BookWrapper'
import type { Metadata } from 'next'

export const revalidate = 300

export const getStudyMaterial = cache(async (slug: string): Promise<StudyMaterial | null> => {
  try {
    const client = createServiceClient()
    const { data, error } = await client
      .from('study_materials')
      .select('*, study_sections(*, questions(*))')
      .eq('slug', slug)
      .maybeSingle()

    if (error || !data) return null

    const material = data as StudyMaterial
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
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const material = await getStudyMaterial(slug)
  if (!material) return { title: 'Guide Not Found' }
  return {
    title: `${material.title} – Study Guide`,
    description: [material.subtitle, material.organization].filter(Boolean).join(' · '),
  }
}

export default async function StudyGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const material = await getStudyMaterial(slug)
  if (!material) notFound()

  return <BookWrapper slug={slug} studyMaterial={material} />
}
