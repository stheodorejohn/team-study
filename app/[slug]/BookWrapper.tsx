'use client'

/**
 * BookWrapper – Client Component
 *
 * next/dynamic with ssr:false is only legal inside a Client Component.
 * This wrapper owns the dynamic import so the Server Component page
 * can remain a pure async server component.
 */

import dynamic from 'next/dynamic'
import type { FlipBookViewerProps } from './FlipBookViewer'

const FlipBookViewer = dynamic(
  () => import('./FlipBookViewer').then((m) => m.FlipBookViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="w-[330px] h-[500px] rounded-xl bg-white shadow-2xl animate-pulse" />
      </div>
    ),
  }
)

export function BookWrapper(props: FlipBookViewerProps) {
  return <FlipBookViewer {...props} />
}
