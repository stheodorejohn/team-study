import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase'
import { verifyAdminSession } from '@/lib/auth'
import { GuideFlipbook } from './GuideFlipbook'
import { PlusCircle } from 'lucide-react'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Dashboard – Study Guide Architect',
  description: 'Manage your study guides.',
}

export default async function AdminDashboardPage() {
  // Auth guard
  const isAuthenticated = await verifyAdminSession()
  if (!isAuthenticated) {
    redirect('/login')
  }

  // Data fetch
  const client = createServiceClient()
  const { data, error } = await client
    .from('study_materials')
    .select('id, title, slug, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Supabase Admin Fetch Error:', error)
  }

  const guides = data ?? []

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -mx-4 sm:-mx-6 lg:-mx-8 -my-8">

      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-100 tracking-tight">Discussions</h1>
          {!error && guides.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {guides.length} discussion{guides.length !== 1 ? 's' : ''} · use ← → to flip
            </p>
          )}
        </div>

        <Link
          id="create-new-guide-btn"
          href="/admin/editor/new"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20"
        >
          <PlusCircle className="h-4 w-4" aria-hidden="true" />
          New Discussion
        </Link>
      </header>

      {/* ── Error banner ── */}
      {error && (
        <div
          role="alert"
          className="mx-6 mt-4 rounded-xl border border-red-800 bg-red-950/40 px-4 py-4 text-sm space-y-2 flex-shrink-0"
        >
          <p className="font-semibold text-red-300">⚠ Supabase query failed</p>
          <dl className="space-y-1 font-mono text-xs text-red-400">
            {error.code && (
              <div className="flex gap-2">
                <dt className="text-red-600 flex-shrink-0">code</dt>
                <dd>{error.code}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="text-red-600 flex-shrink-0">message</dt>
              <dd>{error.message}</dd>
            </div>
            {error.details && (
              <div className="flex gap-2">
                <dt className="text-red-600 flex-shrink-0">details</dt>
                <dd>{error.details}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* ── Flipbook ── */}
      {!error && <GuideFlipbook guides={guides} />}
    </div>
  )
}
