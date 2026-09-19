'use client'

/**
 * GuideFlipbook – Admin Dashboard Client Component
 *
 * Displays study guides as a full-screen horizontal flipbook.
 *  ✅ CSS translateX slide transitions
 *  ✅ Keyboard ← → navigation
 *  ✅ Touch swipe with axis disambiguation
 *  ✅ Dot progress indicator
 *  ✅ QR code on every card
 *  ✅ Edit / Open / Copy-link actions
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  ExternalLink,
  Copy,
  CheckCheck,
  BookOpen,
  PlusCircle,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type GuideListItem = {
  id: string
  title: string
  slug: string
  created_at: string | null
}

interface GuideFlipbookProps {
  guides: GuideListItem[]
}

// ─── Per-card gradient palettes ───────────────────────────────────────────────

const PALETTES = [
  { from: '#4F46E5', to: '#7C3AED' }, // indigo → violet
  { from: '#0EA5E9', to: '#6366F1' }, // sky → indigo
  { from: '#10B981', to: '#0EA5E9' }, // emerald → sky
  { from: '#F59E0B', to: '#EF4444' }, // amber → red
  { from: '#EC4899', to: '#8B5CF6' }, // pink → purple
  { from: '#14B8A6', to: '#3B82F6' }, // teal → blue
]

function palette(index: number) {
  return PALETTES[index % PALETTES.length]
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── Single guide card ────────────────────────────────────────────────────────

function GuideCard({
  guide,
  index,
  origin,
}: {
  guide: GuideListItem
  index: number
  origin: string
}) {
  const [copied, setCopied] = useState(false)
  const p = palette(index)
  const publicUrl = `${origin}/${guide.slug}`

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="h-full w-full flex items-center justify-center p-4 sm:p-8">
      <div
        className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl shadow-black/50 flex flex-col"
        style={{ minHeight: 480 }}
      >
        {/* ── Gradient header ── */}
        <div
          className="px-8 pt-10 pb-8 flex flex-col gap-3"
          style={{
            background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
          }}
        >
          {/* Index badge */}
          <span className="self-start rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-xs font-semibold text-white tracking-wider uppercase">
            Guide {index + 1}
          </span>

          {/* Title */}
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight tracking-tight">
            {guide.title}
          </h2>

          {/* Slug */}
          <p className="font-mono text-sm text-white/60">/{guide.slug}</p>

          {/* Date */}
          {guide.created_at && (
            <p className="text-xs text-white/50">{formatDate(guide.created_at)}</p>
          )}
        </div>

        {/* ── Card body ── */}
        <div className="flex-1 bg-gray-900 px-8 py-7 flex flex-col gap-6">
          {/* QR code */}
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 rounded-2xl bg-white p-3 shadow-lg">
              <QRCodeSVG
                value={publicUrl}
                size={96}
                level="M"
                aria-label={`QR code for ${guide.title}`}
              />
            </div>
            <div className="flex flex-col gap-1 justify-center pt-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Public URL
              </p>
              <p className="text-sm text-gray-300 font-mono break-all leading-snug">
                {publicUrl}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-800" />

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/editor/${guide.id}`}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all"
              style={{
                background: `linear-gradient(135deg, ${p.from}cc, ${p.to}cc)`,
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Link>

            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-gray-800 hover:bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>

            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-800 hover:bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition-colors"
            >
              {copied ? (
                <>
                  <CheckCheck className="h-3.5 w-3.5 text-green-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy link
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 px-8 text-center">
      <div className="rounded-full bg-gray-800 p-6">
        <BookOpen className="h-12 w-12 text-gray-600" aria-hidden />
      </div>
      <div>
        <h2 className="text-xl font-bold text-gray-200">No guides yet</h2>
        <p className="text-sm text-gray-500 mt-2 max-w-xs leading-relaxed">
          Create your first study guide — it becomes a shareable, QR-linked
          flipbook students fill in on their phones.
        </p>
      </div>
      <Link
        href="/admin/editor/new"
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition-colors px-5 py-2.5 text-sm font-semibold text-white"
      >
        <PlusCircle className="h-4 w-4" />
        Create Guide
      </Link>
    </div>
  )
}

// ─── Main flipbook ────────────────────────────────────────────────────────────

export function GuideFlipbook({ guides }: GuideFlipbookProps) {
  const total = guides.length
  const [current, setCurrent] = useState(0)
  const [origin, setOrigin] = useState('')

  // Resolve origin client-side only
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  // ── Keyboard navigation ──
  const goNext = useCallback(() => setCurrent((c) => Math.min(total - 1, c + 1)), [total])
  const goPrev = useCallback(() => setCurrent((c) => Math.max(0, c - 1)), [])

  useEffect(() => {
    if (total === 0) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, total])

  // ── Touch swipe ──
  const touchX = useRef<number | null>(null)
  const touchY = useRef<number | null>(null)

  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0].clientX
    touchY.current = e.touches[0].clientY
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current === null || touchY.current === null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    const dy = e.changedTouches[0].clientY - touchY.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      dx < 0 ? goNext() : goPrev()
    }
    touchX.current = null
    touchY.current = null
  }

  if (total === 0) {
    return (
      <div className="h-[calc(100vh-7rem)]">
        <EmptyState />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-[calc(100vh-7rem)]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Slide viewport ── */}
      <div className="flex-1 relative overflow-hidden">
        <div
          className="absolute inset-0 flex transition-transform duration-500 ease-in-out will-change-transform"
          style={{
            width: `${total * 100}%`,
            transform: `translateX(-${(current / total) * 100}%)`,
          }}
          aria-live="polite"
        >
          {guides.map((guide, idx) => (
            <div
              key={guide.id}
              className="h-full"
              style={{ width: `${100 / total}%` }}
              aria-hidden={idx !== current}
            >
              <GuideCard guide={guide} index={idx} origin={origin} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom nav bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-gray-950/80 backdrop-blur-sm">
        {/* Prev */}
        <button
          type="button"
          onClick={goPrev}
          disabled={current === 0}
          aria-label="Previous guide"
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-4 py-2 text-sm font-medium text-gray-300"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>

        {/* Dot indicators */}
        <div className="flex items-center gap-2" role="tablist" aria-label="Guides">
          {guides.map((_, idx) => {
            const p = palette(idx)
            return (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={idx === current}
                aria-label={`Guide ${idx + 1}`}
                onClick={() => setCurrent(idx)}
                className="rounded-full transition-all duration-300"
                style={{
                  width: idx === current ? 24 : 8,
                  height: 8,
                  background:
                    idx === current
                      ? `linear-gradient(90deg, ${p.from}, ${p.to})`
                      : '#374151',
                }}
              />
            )
          })}
        </div>

        {/* Next */}
        <button
          type="button"
          onClick={goNext}
          disabled={current === total - 1}
          aria-label="Next guide"
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-900 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-4 py-2 text-sm font-medium text-gray-300"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
