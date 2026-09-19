'use client'

/**
 * StudyCard – Client Component
 *
 * Displays a single study guide card with Edit, View Live, and Copy URL actions.
 * Extracted as a Client Component so the onClick clipboard handler works without
 * making the entire admin page a Client Component.
 */

import { useState } from 'react'
import Link from 'next/link'
import { Edit2, ExternalLink, Copy, CheckCheck, Calendar, Link2 } from 'lucide-react'

interface StudyCardProps {
  id: string
  title: string
  slug: string
  createdAt: string
}

export function StudyCard({ id, title, slug, createdAt }: StudyCardProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopyUrl() {
    const url = `${window.location.origin}/${slug}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers / insecure contexts
      window.prompt('Copy this URL:', url)
    }
  }

  const formattedDate = new Date(createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <article className="group flex flex-col h-full rounded-2xl border border-gray-800 bg-gray-900 hover:border-indigo-500/40 transition-all duration-200 overflow-hidden">
      {/* Coloured accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-indigo-500 to-violet-500 flex-shrink-0" />

      {/* Card body */}
      <div className="flex-1 px-5 pt-5 pb-4 space-y-3">
        <h2 className="text-base font-semibold text-gray-100 leading-snug line-clamp-2 group-hover:text-white transition-colors">
          {title}
        </h2>

        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Link2 className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="font-mono truncate">/{slug}</span>
        </div>

        {createdAt && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Calendar className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <time dateTime={createdAt}>{formattedDate}</time>
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-1 border-t border-gray-800 px-4 py-3">
        {/* Edit */}
        <Link
          href={`/admin/editor/${id}`}
          id={`edit-${id}`}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors"
        >
          <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </Link>

        <span className="text-gray-700 select-none">·</span>

        {/* View Live */}
        <Link
          href={`/${slug}`}
          id={`view-${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-800 hover:text-gray-100 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          View Live
        </Link>

        <span className="text-gray-700 select-none">·</span>

        {/* Copy URL */}
        <button
          type="button"
          id={`copy-${id}`}
          onClick={handleCopyUrl}
          aria-label={copied ? 'URL copied!' : `Copy URL for ${title}`}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors text-gray-400 hover:bg-gray-800 hover:text-gray-100"
        >
          {copied ? (
            <>
              <CheckCheck className="h-3.5 w-3.5 text-green-400" aria-hidden="true" />
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copy URL
            </>
          )}
        </button>
      </div>
    </article>
  )
}
