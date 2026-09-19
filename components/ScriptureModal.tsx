'use client'

/**
 * ScriptureDrawer – bottom sheet for reading a passage.
 *
 * UX features (industry-standard bottom-sheet):
 *  • Slides up with spring-eased animation (cubic-bezier)
 *  • Drag handle — drag down to dismiss
 *  • Velocity threshold: fast flick OR drag > 40% height dismisses
 *  • Snaps back if threshold not met
 *  • Backdrop tap / Escape key closes
 *  • Max height 70vh
 *  • Focus trap + return focus to trigger on close
 *  • Scrollable body isolated via touch-action:pan-y (no gesture conflict)
 *  • print:hidden
 *
 * Export name kept as ScriptureModal so existing imports are unchanged.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { BookOpen } from 'lucide-react'

interface ScriptureModalProps {
  sectionTitle: string
  scriptureReference: string | null
  summary: string | null
  scriptureText: string | null
  triggerRef?: React.RefObject<HTMLElement | null>
  onClose: () => void
}

const OPEN_MS        = 400   // smooth ease-out open
const CLOSE_MS       = 400   // ease-in close (same duration as open)
const DISMISS_RATIO  = 0.4   // dismiss if dragged > 40% drawer height
const VELOCITY_PX_MS = 0.5  // fast-flick threshold (px/ms)

export function ScriptureModal({
  sectionTitle,
  scriptureReference,
  summary,
  scriptureText,
  triggerRef,
  onClose,
}: ScriptureModalProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const bodyRef   = useRef<HTMLDivElement>(null)

  const [dragY,      setDragY]      = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [closing,    setClosing]    = useState(false)
  // Starts false so the drawer is off-screen on first paint.
  // Set to true on the next animation frame → triggers the slide-up transition.
  const [isOpen,     setIsOpen]     = useState(false)

  // Mutable drag state — kept in a ref so pointer callbacks don't re-create
  const drag = useRef({ startY: 0, currentY: 0, startTime: 0, active: false })

  // ── Slide-up open animation ───────────────────────────────────────────────────
  // React paints translateY(100%) on the first frame, then this effect fires and
  // flips it to translateY(0). The CSS transition animates the move.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsOpen(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // ── Dismiss: animate out then call onClose ────────────────────────────────────
  const dismiss = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      onClose()
      triggerRef?.current?.focus()
    }, CLOSE_MS)
  }, [onClose, triggerRef])

  // ── Escape key ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); dismiss() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [dismiss])

  // ── Focus trap + initial focus ────────────────────────────────────────────────
  useEffect(() => {
    const drawer = drawerRef.current
    if (!drawer) return
    const focusable = Array.from(
      drawer.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      )
    )
    focusable[0]?.focus()

    function trap(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const first = focusable[0]
      const last  = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first?.focus() }
      }
    }
    drawer.addEventListener('keydown', trap)
    return () => drawer.removeEventListener('keydown', trap)
  }, [])

  // ── Pointer drag (unified mouse + touch via Pointer Events API) ───────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Don't start a drag when the user taps inside the scrollable text area
    if (bodyRef.current?.contains(e.target as Node)) return
    drag.current = {
      startY:    e.clientY,
      currentY:  e.clientY,
      startTime: performance.now(),
      active:    true,
    }
    setIsDragging(true)
    // Pointer capture keeps move/up firing even if pointer leaves the element
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current.active) return
    drag.current.currentY = e.clientY
    // Only allow downward drag (positive = towards bottom of screen)
    setDragY(Math.max(0, e.clientY - drag.current.startY))
  }, [])

  const onPointerUp = useCallback(() => {
    if (!drag.current.active) return
    drag.current.active = false
    setIsDragging(false)

    const drawerH  = drawerRef.current?.offsetHeight ?? 300
    const delta    = Math.max(0, drag.current.currentY - drag.current.startY)
    const elapsed  = performance.now() - drag.current.startTime
    const velocity = elapsed > 0 ? delta / elapsed : 0

    if (velocity >= VELOCITY_PX_MS || delta >= drawerH * DISMISS_RATIO) {
      dismiss()            // flick or dragged far enough → close
    } else {
      setDragY(0)          // not far enough → snap back with spring
    }
  }, [dismiss])

  // ── CSS-driven animation values ───────────────────────────────────────────────
  const cssTrans = isDragging
    ? 'none'                                                        // no lag while dragging
    : closing
      ? `transform ${CLOSE_MS}ms cubic-bezier(0.4,0,1,1)`          // ease-in (close)
      : `transform ${OPEN_MS}ms cubic-bezier(0.25,1,0.5,1)`        // ease-out (gentle open)

  // translateY: off-screen (100%) before open, follows drag offset while open,
  // back to 100% when closing.
  const translateY = (!isOpen || closing) ? '100%' : `${dragY}px`

  // Backdrop fades as drawer is dragged (proportional, max 60% opacity)
  const drawerH      = drawerRef.current?.offsetHeight ?? 300
  const dragFraction = Math.min(dragY / drawerH, 1)
  const bgAlpha      = (!isOpen || closing ? 0 : 0.6 * (1 - dragFraction * 0.7)).toFixed(2)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end print:hidden"
      role="presentation"
    >
      {/* ── Backdrop ── */}
      <div
        className="absolute inset-0"
        style={{
          background: `rgba(0,0,0,${bgAlpha})`,
          backdropFilter: !isDragging && !closing ? 'blur(4px)' : 'none',
          transition: isDragging
            ? 'none'
            : `background ${closing ? CLOSE_MS : OPEN_MS}ms ease`,
        }}
        aria-hidden="true"
        onClick={dismiss}
      />

      {/* ── Drawer ── */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scripture-drawer-heading"
        className="relative z-10 w-full flex flex-col rounded-t-2xl bg-white border-t border-x border-gray-200 shadow-2xl overflow-hidden"
        style={{
          maxHeight: '80vh',
          transform: `translateY(${translateY})`,
          transition: cssTrans,
          willChange: 'transform',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* ── Drag handle pill ── */}
        <div
          className="flex-shrink-0 flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing select-none"
          aria-hidden="true"
        >
          <div className="h-1 w-10 rounded-full bg-gray-300 transition-colors" />
        </div>

        {/* ── Header ── */}
        <div className="flex items-start gap-3 px-5 pt-1 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="mt-0.5 flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg bg-indigo-50 border border-indigo-200">
            <BookOpen className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="scripture-drawer-heading"
              className="text-base font-bold text-gray-900 leading-snug"
            >
              {sectionTitle}
            </h2>
            {scriptureReference && (
              <p className="text-sm text-indigo-600 mt-0.5 font-medium">
                {scriptureReference}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close passage drawer"
            className="flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 hover:text-gray-700 transition-colors"
          >
            Close
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div
          ref={bodyRef}
          className="flex-1 overflow-y-auto px-5 py-5 space-y-5 overscroll-contain bg-gray-50"
          style={{ touchAction: 'pan-y' }}
        >
          {summary && (
            <section aria-label="Summary">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                Summary
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">{summary}</p>
            </section>
          )}

          {scriptureText ? (
            <section aria-label="Scripture passage">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                Passage
              </h3>
              <div className="rounded-xl bg-white border border-gray-200 px-4 py-4 shadow-sm">
                <p className="text-sm text-gray-800 leading-8 whitespace-pre-wrap font-serif">
                  {scriptureText}
                </p>
              </div>
            </section>
          ) : (
            <p className="text-sm text-gray-400 italic text-center py-4">
              No passage text added yet.
            </p>
          )}

          {/* Home-indicator safe-area spacer */}
          <div className="h-4" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

