'use client'

/**
 * FlipBookViewer – react-pageflip powered study-guide book
 *
 * Architecture:
 *  • Flat "pages" array built from StudyMaterial (cover → sections → back)
 *  • Questions split into dynamically-calculated chunks per page (based on
 *    available book height and current font size)
 *  • ForwardRef <Page> wrapper required by react-pageflip
 *  • showPageCorners + corner affordance overlays for click-to-flip
 *  • Prev / Next buttons + page counter at the bottom
 *  • Print layout is a simple stacked version (no flipbook in PDF)
 *  • Answer state lives here; persisted to localStorage by slug
 */

import React, {
  forwardRef,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from 'react'
import HTMLFlipBook from 'react-pageflip'
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Printer,
  RotateCcw,
  Maximize,
  X,
  Settings,
  Share2,
  Pencil,
  Check,
  // Sun,
  // Moon,
} from 'lucide-react'
import { toBlob } from 'html-to-image'
import type { StudyMaterial, StudySection, Question } from '@/lib/supabase'
import { ScriptureModal } from '@/components/ScriptureModal'
import { getGuideAnswers, saveGuideAnswersBatch, clearGuideAnswers } from '@/lib/studyDb'
import { ShareCard } from './ShareCard'

// ─── Answer state ─────────────────────────────────────────────────────────────

type AnswerMap = Record<string, string | string[]>

function storageKey(slug: string) {
  return `study_answers_${slug}`
}

// ─── Page data model ──────────────────────────────────────────────────────────

type CoverPageData = { kind: 'cover'; material: StudyMaterial }
type SectionHeaderData = { kind: 'section-header'; section: StudySection; sectionIdx: number; total: number }
type QuestionsPageData = { kind: 'questions'; section: StudySection; sectionIdx: number; questions: Question[]; partNum: number; totalParts: number }
type BlankPageData = { kind: 'blank' }
type BackPageData = { kind: 'back'; material: StudyMaterial }

type PageData = CoverPageData | SectionHeaderData | QuestionsPageData | BlankPageData | BackPageData

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}


function buildPages(material: StudyMaterial, questionsPerPage: number): PageData[] {
  const pages: PageData[] = []
  pages.push({ kind: 'cover', material })

  material.study_sections.forEach((section, si) => {
    pages.push({
      kind: 'section-header',
      section,
      sectionIdx: si,
      total: material.study_sections.length,
    })

    const chunks = chunk(section.questions, questionsPerPage)
    chunks.forEach((qs, ci) =>
      pages.push({
        kind: 'questions',
        section,
        sectionIdx: si,
        questions: qs,
        partNum: ci + 1,
        totalParts: chunks.length,
      })
    )
  })

  pages.push({ kind: 'back', material })

  return pages
}

// Section accent colours (cycles)
const ACCENTS = [
  '#4F46E5', '#7C3AED', '#0EA5E9',
  '#10B981', '#F59E0B', '#EC4899',
]
function accent(idx: number) {
  return ACCENTS[idx % ACCENTS.length]
}

// ─── Patch page-flip for mobile ────────────────────────────────────────────────
// The page-flip library calculates `boundsRect.left` in portrait mode such that the 
// visible page is the right half of a virtual two-page spread. Its `isPointOnCorners`
// checks absolute bounds [0, width], which only matches the right-side corners.
// This patch correctly identifies left-hand corner clicks.
type Point = { x: number; y: number }

type PatchedPageFlip = {
  getFlipController: () => {
    isPointOnCorners: (globalPos: Point) => boolean
    _patchedIsPointOnCorners?: boolean
  } | undefined
  getRender: () => {
    getOrientation: () => 'portrait' | 'landscape'
    getRect: () => { pageWidth: number; height: number; width: number }
    convertToBook: (globalPos: Point) => Point
  }
}

function fixPortraitCorners(pf: PatchedPageFlip | null | undefined) {
  const flipController = pf?.getFlipController?.()
  if (!flipController || flipController._patchedIsPointOnCorners) return

  const originalIsPointOnCorners = flipController.isPointOnCorners.bind(flipController)

  flipController.isPointOnCorners = (globalPos: Point) => {
    const render = pf!.getRender()
    if (render.getOrientation() !== 'portrait') {
      return originalIsPointOnCorners(globalPos)
    }

    const { pageWidth, height } = render.getRect()
    const reach = Math.sqrt(pageWidth ** 2 + height ** 2) / 5
    const book = render.convertToBook(globalPos)
    const x = book.x - pageWidth

    return (
      x > 0 &&
      x < pageWidth &&
      book.y > 0 &&
      book.y < height &&
      (x < reach || x > pageWidth - reach) &&
      (book.y < reach || book.y > height - reach)
    )
  }

  flipController._patchedIsPointOnCorners = true
}

// ─── ForwardRef page wrapper (required by react-pageflip) ─────────────────────

interface PageProps {
  children: React.ReactNode
  pageNum?: number
  totalPages?: number
  density?: 'hard' | 'soft'
  isDark?: boolean
  onPageClick?: (e: React.MouseEvent<HTMLDivElement>) => void
}

const Page = forwardRef<HTMLDivElement, PageProps>(
  ({ children, pageNum, totalPages, density = 'soft', isDark = false, onPageClick }, ref) => (
    <div
      ref={ref}
      onClick={onPageClick}
      data-density={density}
      className={`relative overflow-x-hidden overflow-y-auto touch-pan-y ${isDark ? 'bg-gray-900' : 'bg-white'}`}
      // overflow-x-hidden clips page content horizontally (prevents visual bleed),
      // overflow-y-auto lets the page scroll vertically when font is large.
      // This is a CSS class rule — survives the library's style.cssText rewrites
      // (which only clear inline styles, not class-based rules).
      style={{ height: '100%', width: '100%' }}
    >
      {children}
      {/* Page number footer */}
      {pageNum !== undefined && (
        <div style={{ fontSize: '0.65em' }} className={`absolute bottom-2 inset-x-0 text-center pointer-events-none ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>
          {pageNum} / {totalPages}
        </div>
      )}
    </div>
  )
)
Page.displayName = 'Page'

// ─── Page content components ──────────────────────────────────────────────────

function CoverContent({ material }: { material: StudyMaterial }) {
  return (
    <div
      className="h-full w-full flex flex-col justify-between px-7 py-8"
      style={{
        background: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
      }}
    >
      {/* Top ornament */}
      <div className="flex flex-col items-center gap-1">
        <BookOpen className="h-9 w-9 text-indigo-300 opacity-70" aria-hidden />
        {material.organization && (
          <p style={{ fontSize: '0.75em' }} className="text-indigo-300 font-medium tracking-widest uppercase mt-1">
            {material.organization}
          </p>
        )}
      </div>

      {/* Centre title */}
      <div className="space-y-3 text-center">
        <h1 style={{ fontSize: '1.5em' }} className="font-extrabold text-white leading-tight tracking-tight">
          {material.title}
        </h1>
        {material.subtitle && (
          <p style={{ fontSize: '0.875em' }} className="text-indigo-200 leading-relaxed">{material.subtitle}</p>
        )}
      </div>

      {/* Memory verse */}
      {material.memory_verse && (() => {
        const trimmedVerse = material.memory_verse.replace(/^memory verse:?\s*/i, '')
        return (
          <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 px-4 py-3">
            <p style={{ fontSize: '0.65em' }} className="font-semibold text-indigo-300 uppercase tracking-widest mb-1">
              Memory Verse
            </p>
            <p style={{ fontSize: '0.75em' }} className="text-indigo-100 italic leading-relaxed">
              {trimmedVerse}
            </p>
          </div>
        )
      })()}

      <p style={{ fontSize: '0.65em' }} className="text-center text-indigo-400">Click Next / Prev button to turn pages →</p>
    </div>
  )
}

function SectionHeaderContent({
  section,
  sectionIdx,
  total,
  onOpenModal,
  isDark = false,
}: {
  section: StudySection
  sectionIdx: number
  total: number
  onOpenModal: () => void
  isDark?: boolean
}) {
  const color = accent(sectionIdx)
  const hasPassage = !!(section.scripture_reference || section.scripture_text || section.summary)

  return (
    <div className="h-full flex flex-col">
      {/* Coloured top band */}
      <div
        className="px-6 pt-6 pb-5 flex-shrink-0"
        style={{ background: `linear-gradient(135deg, ${color}22, ${color}11)` }}
      >
        <span
          style={{ fontSize: '0.65em', background: `${color}22`, color }}
          className="inline-block rounded-full px-2.5 py-0.5 font-bold tracking-widest uppercase mb-3"
        >
          Section {sectionIdx + 1} of {total}
        </span>
        <h2 style={{ fontSize: '1.25em' }} className={`font-extrabold leading-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          {section.title}
        </h2>
        {section.scripture_reference && (
          <p style={{ fontSize: '0.75em' }} className={`italic mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{section.scripture_reference}</p>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 px-6 py-5 flex flex-col gap-4">
        {section.summary && (
          <p style={{ fontSize: '0.75em' }} className={`leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{section.summary}</p>
        )}

        {hasPassage && (
          <button
            type="button"
            onClick={onOpenModal}
            style={{ fontSize: '0.75em', borderColor: `${color}50`, color, background: `${color}10` }}
            className="self-start inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-semibold transition-colors"
          >
            📖 Read Passage
          </button>
        )}

        <div className="flex-1 flex items-end">
          <p style={{ fontSize: '0.75em' }} className={`italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Turn the page to begin answering →
          </p>
        </div>
      </div>

      {/* Bottom accent bar */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
    </div>
  )
}


// ─── Auto-expanding textarea ──────────────────────────────────────────────────

function AutoTextarea({
  defaultValue,
  placeholder,
  onChange,
  onFocus,
  className,
  autoFocus,
}: {
  defaultValue: string
  placeholder: string
  onChange: (v: string) => void
  onFocus?: () => void
  className: string
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Auto-focus and scroll into view when entering edit mode
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus()
      const len = ref.current.value.length
      ref.current.setSelectionRange(len, len)
      setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
    }
  }, [autoFocus])

  // Sync if defaultValue updates from external source (e.g. hydration)
  useEffect(() => {
    if (ref.current && defaultValue !== undefined) {
      if (ref.current.value !== defaultValue) {
        ref.current.value = defaultValue
      }
      ref.current.style.height = 'auto'
      ref.current.style.height = `${ref.current.scrollHeight}px`
    }
  }, [defaultValue])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
    onChange(el.value)
  }

  return (
    <textarea
      ref={ref}
      defaultValue={defaultValue}
      placeholder={placeholder}
      rows={3}
      onFocus={onFocus}
      onChange={handleChange}
      className={className}
      style={{ overflow: 'hidden', resize: 'none' }}
    />
  )
}

function QuestionInput({
  question,
  value,
  onStringAnswer,
  onCheckboxToggle,
  isEditing,
  isAnyEditing,
  onStartEditing,
  onSaveEditing,
  onCancelEditing,
  isDark = false,
}: {
  question: Question
  value: string | string[] | undefined
  onStringAnswer: (id: string, v: string) => void
  onCheckboxToggle: (id: string, opt: string, checked: boolean) => void
  isEditing?: boolean
  isAnyEditing?: boolean
  onStartEditing?: (id: string) => void
  onSaveEditing?: () => void
  onCancelEditing?: () => void
  isDark?: boolean
}) {
  const stringVal = typeof value === 'string' ? value : ''
  const arrayVal = Array.isArray(value) ? value : []
  const hasAnswer = question.type === 'checkbox' ? arrayVal.length > 0 : Boolean(stringVal.trim())

  // Attach native listeners to stop propagation at DOM level before page-flip gets it.
  const containerNodeRef = useRef<HTMLDivElement | null>(null)
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    const prev = containerNodeRef.current
    const stopNative = (e: Event) => e.stopPropagation()
    const events = [
      'mousedown', 'mouseup', 'click',
      'touchstart', 'touchmove', 'touchend',
      'pointerdown', 'pointerup',
      'wheel',
    ]

    if (prev) {
      events.forEach((evt) => prev.removeEventListener(evt, stopNative))
    }
    if (node) {
      events.forEach((evt) => node.addEventListener(evt, stopNative, { passive: true }))
    }
    containerNodeRef.current = node
  }, [])

  return (
    <div
      className={`rounded-2xl transition-all duration-200 ${
        isEditing
          ? isDark
            ? 'bg-gray-800/90 border-2 border-indigo-500 shadow-xl ring-4 ring-indigo-500/20 p-4'
            : 'bg-white border-2 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-4 ring-indigo-500/10 p-4'
          : isAnyEditing
            ? 'opacity-40 p-3 rounded-xl border border-transparent'
            : isDark
              ? 'hover:bg-gray-800/50 p-3 rounded-xl border border-gray-800/60'
              : 'hover:bg-gray-50/80 p-3 rounded-xl border border-gray-100'
      }`}
    >
      {/* Header: Prompt and Action Badge */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <label
          style={{ fontSize: '0.9em' }}
          className={`block font-semibold leading-snug flex-1 ${
            isEditing
              ? isDark ? 'text-indigo-200' : 'text-indigo-950 font-bold'
              : isDark ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          {question.prompt}
          {question.is_required && <span className="text-red-500 ml-0.5">*</span>}
        </label>

        {isEditing ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-600 text-white shadow-sm shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            Editing
          </span>
        ) : (
          onStartEditing && (
            <button
              type="button"
              onClick={() => onStartEditing(question.id)}
              aria-label={`Edit answer: ${question.prompt}`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                hasAnswer
                  ? isDark
                    ? 'text-gray-400 hover:text-indigo-400 hover:bg-gray-800 border border-gray-700'
                    : 'text-gray-600 hover:text-indigo-600 hover:bg-indigo-50/70 border border-gray-200 bg-white shadow-xs'
                  : isDark
                    ? 'text-indigo-400 hover:bg-indigo-950/50 border border-indigo-800/60'
                    : 'text-indigo-600 hover:bg-indigo-50 border border-indigo-200 bg-indigo-50/40'
              }`}
            >
              <Pencil className="h-3 w-3" />
              <span>{hasAnswer ? 'Edit' : 'Answer'}</span>
            </button>
          )
        )}
      </div>

      {/* Body: Inputs or Display */}
      <div
        ref={setContainerRef}
        style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
      >
        {(question.type === 'text' || question.type === 'textarea' || !question.type) && (
          isEditing ? (
            <div className="space-y-3">
              <AutoTextarea
                defaultValue={stringVal}
                placeholder="Type your response here…"
                onChange={(v) => onStringAnswer(question.id, v)}
                className={`w-full rounded-xl border-2 px-3 py-2 text-[max(16px,1em)] placeholder-gray-400 focus:outline-none transition min-h-[96px] shadow-inner ${
                  isDark
                    ? 'border-indigo-500/80 bg-gray-900 text-gray-100 ring-2 ring-indigo-500/30'
                    : 'border-indigo-500 bg-white text-gray-900 ring-2 ring-indigo-500/20'
                }`}
                autoFocus={true}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-indigo-100 dark:border-indigo-900/50">
                <p className="text-[11px] text-gray-400 dark:text-gray-400 italic">
                  Page turning is paused while typing
                </p>
                <div className="flex items-center gap-2">
                  {onCancelEditing && (
                    <button
                      type="button"
                      onClick={onCancelEditing}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        isDark
                          ? 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-sm'
                      }`}
                    >
                      Cancel
                    </button>
                  )}
                  {onSaveEditing && (
                    <button
                      type="button"
                      onClick={onSaveEditing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm active:scale-95 transition"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Save Answer
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : hasAnswer ? (
            <div
              onClick={() => onStartEditing?.(question.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onStartEditing?.(question.id)
              }}
              className={`group relative rounded-xl border p-3 cursor-pointer transition-all ${
                isDark
                  ? 'bg-gray-900/60 border-gray-800 hover:border-indigo-600/60 hover:bg-gray-800/80 text-gray-200'
                  : 'bg-slate-50/80 border-slate-200/80 hover:border-indigo-300 hover:bg-white text-gray-800 shadow-xs'
              }`}
              title="Click to edit this answer"
            >
              <p className="text-[max(14px,0.92em)] whitespace-pre-wrap break-words leading-relaxed font-normal">
                {stringVal}
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400 group-hover:text-indigo-500 transition-colors">
                <span className="flex items-center gap-1 font-medium">
                  <Check className="h-3 w-3 text-emerald-500" /> Saved
                </span>
                <span className="italic opacity-80 group-hover:opacity-100 flex items-center gap-0.5">
                  Click to edit <ChevronRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onStartEditing?.(question.id)}
              className={`w-full text-left rounded-xl border-2 border-dashed p-3.5 transition-all group flex items-center justify-between ${
                isDark
                  ? 'border-gray-800 bg-gray-900/30 hover:border-indigo-500/50 hover:bg-gray-900/60'
                  : 'border-gray-200 bg-slate-50/40 hover:border-indigo-400 hover:bg-indigo-50/20'
              }`}
            >
              <span className={`text-xs italic ${isDark ? 'text-gray-500 group-hover:text-gray-300' : 'text-gray-400 group-hover:text-indigo-600'}`}>
                Write your response here…
              </span>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                <Pencil className="h-3 w-3" />
                Add answer
              </span>
            </button>
          )
        )}

        {question.type === 'radio' && (
          <div className="space-y-1.5 pt-1">
            {(question.options ?? []).map((opt, i) => {
              const isSelected = stringVal === opt
              return (
                <label
                  key={i}
                  className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition ${
                    isSelected
                      ? isDark
                        ? 'bg-indigo-950/60 border border-indigo-700 text-white'
                        : 'bg-indigo-50 border border-indigo-300 text-indigo-900 font-medium'
                      : isDark
                        ? 'hover:bg-gray-800/80 text-gray-300 border border-transparent'
                        : 'hover:bg-gray-50 text-gray-700 border border-transparent'
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    value={opt}
                    checked={isSelected}
                    onChange={() => {
                      onStringAnswer(question.id, opt)
                      if (!isEditing) onStartEditing?.(question.id)
                    }}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs flex-1">{opt}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                </label>
              )
            })}
            {isEditing && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-indigo-100 dark:border-indigo-900/50">
                {onCancelEditing && (
                  <button
                    type="button"
                    onClick={onCancelEditing}
                    className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
                  >
                    Cancel
                  </button>
                )}
                {onSaveEditing && (
                  <button
                    type="button"
                    onClick={onSaveEditing}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                  >
                    <Check className="h-3 w-3" /> Save
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {question.type === 'checkbox' && (
          <div className="space-y-1.5 pt-1">
            {(question.options ?? []).map((opt, i) => {
              const isSelected = arrayVal.includes(opt)
              return (
                <label
                  key={i}
                  className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition ${
                    isSelected
                      ? isDark
                        ? 'bg-indigo-950/60 border border-indigo-700 text-white'
                        : 'bg-indigo-50 border border-indigo-300 text-indigo-900 font-medium'
                      : isDark
                        ? 'hover:bg-gray-800/80 text-gray-300 border border-transparent'
                        : 'hover:bg-gray-50 text-gray-700 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    value={opt}
                    checked={isSelected}
                    onChange={(e) => {
                      onCheckboxToggle(question.id, opt, e.target.checked)
                      if (!isEditing) onStartEditing?.(question.id)
                    }}
                    className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs flex-1">{opt}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                </label>
              )
            })}
            {isEditing && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-indigo-100 dark:border-indigo-900/50">
                {onCancelEditing && (
                  <button
                    type="button"
                    onClick={onCancelEditing}
                    className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
                  >
                    Cancel
                  </button>
                )}
                {onSaveEditing && (
                  <button
                    type="button"
                    onClick={onSaveEditing}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                  >
                    <Check className="h-3 w-3" /> Save
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function QuestionsPageContent({
  section,
  sectionIdx,
  questions,
  partNum,
  totalParts,
  answers,
  editingQuestionId,
  onStartEditing,
  onSaveEditing,
  onCancelEditing,
  onStringAnswer,
  onCheckboxToggle,
  isDark = false,
}: {
  section: StudySection
  sectionIdx: number
  questions: Question[]
  partNum: number
  totalParts: number
  answers: AnswerMap
  editingQuestionId: string | null
  onStartEditing: (id: string) => void
  onSaveEditing: () => void
  onCancelEditing: () => void
  onStringAnswer: (id: string, v: string) => void
  onCheckboxToggle: (id: string, opt: string, checked: boolean) => void
  isDark?: boolean
}) {
  const color = accent(sectionIdx)

  // Attach native scroll-isolation to the questions container
  const questionsScrollRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const stop = (e: Event) => e.stopPropagation()
    node.addEventListener('touchstart', stop, { passive: true })
    node.addEventListener('touchmove', stop, { passive: true })
    node.addEventListener('wheel', stop, { passive: true })
  }, [])

  return (
    <div ref={questionsScrollRef} className="flex flex-col px-5 py-4 pb-48">
      {/* Mini section header (scrolls with page) */}
      <div className={`flex flex-wrap items-start gap-x-2 gap-y-0.5 mb-3 pb-2 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
        <div className="h-2.5 w-2.5 rounded-full mt-0.5 shrink-0" style={{ background: color }} />
        <span style={{ fontSize: '0.65em' }} className={`font-semibold uppercase tracking-wider break-words flex-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {section.title}
        </span>
        {totalParts > 1 && (
          <span style={{ fontSize: '0.65em' }} className={`ml-auto shrink-0 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>
            {partNum}/{totalParts}
          </span>
        )}
      </div>

      {/* Questions list */}
      <div className="space-y-4">
        {questions.map((q) => (
          <QuestionInput
            key={q.id}
            question={q}
            value={answers[q.id]}
            isEditing={editingQuestionId === q.id}
            isAnyEditing={Boolean(editingQuestionId)}
            onStartEditing={onStartEditing}
            onSaveEditing={onSaveEditing}
            onCancelEditing={onCancelEditing}
            onStringAnswer={onStringAnswer}
            onCheckboxToggle={onCheckboxToggle}
            isDark={isDark}
          />
        ))}
      </div>
    </div>
  )
}

function BackContent({ material }: { material: StudyMaterial }) {
  return (
    <div
      className="h-full flex flex-col items-center justify-center gap-5 px-6 text-center"
      style={{
        background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%)',
      }}
    >
      <BookOpen className="h-10 w-10 text-indigo-400 opacity-60" aria-hidden />
      <div>
        <p style={{ fontSize: '1.125em' }} className="font-bold text-white">{material.title}</p>
        {material.organization && (
          <p style={{ fontSize: '0.75em' }} className="text-indigo-300 mt-1">{material.organization}</p>
        )}
      </div>
      <p style={{ fontSize: '0.75em' }} className="text-indigo-400 italic leading-relaxed max-w-[200px]">
        &ldquo;Those who wait on the Lord shall renew their strength.&rdquo;
      </p>
    </div>
  )
}

// ─── Main FlipBookViewer ────────────────────────────────────────────────      

export interface FlipBookViewerProps {
  slug: string
  studyMaterial: StudyMaterial
}

const emptySubscribe = () => () => {}

export function FlipBookViewer({ slug, studyMaterial }: FlipBookViewerProps) {
  // ── State ──
  const [currentPage, setCurrentPage] = useState(0)
  const [fontSize, setFontSize] = useState(14)   // px, range 10–20
  const [answers, setAnswers] = useState<AnswerMap>({})
  const answersRef = useRef<AnswerMap>({})
  const [isHydrated, setIsHydrated] = useState(false)
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)

  // ── Theme: read system preference, fall back to dark ──
  // const [isDark, setIsDark] = useState(() => {
  //   if (typeof window === 'undefined') return true
  //   const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  //   // If media query is not supported, default to dark
  //   return mq ? mq.matches : true
  // })
  const isDark = false; // Hardcoded to light mode for now

  // ── Customize panel (mobile inline toolbar) ──
  const [customizeOpen, setCustomizeOpen] = useState(false)
  // No outside-click-to-close: the toolbar is a full-width inline panel,
  // not a floating dropdown. Users dismiss it by tapping Options/Close again.

  // ── Reset confirmation drawer ──
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

  // Measured available size for the flipbook (stage content area, inside 10px padding)
  const [bookSize, setBookSize] = useState({ width: 320, height: 480 })
  const stageRef = useRef<HTMLDivElement>(null)

  // Track a stable layout height that doesn't shrink when virtual keyboard opens
  const [stableLayout, setStableLayout] = useState({ width: 0, height: 0 })

  // ── Responsive layout: 1-page vs 2-page spread ──
  // Show a two-page book spread when the device is in landscape AND wide enough
  // to be a tablet.
  const isLandscape = bookSize.width > bookSize.height
  const showTwoPages = isLandscape
  
  // pageWidth is the width of a single page. In two-page mode react-pageflip
  // renders the full spread as 2 × pageWidth.
  const pageWidth = showTwoPages ? Math.floor(bookSize.width / 2) : bookSize.width

  // ── All questions across sections (for the probe) ──
  const allQuestions = useMemo(
    () => studyMaterial.study_sections.flatMap((s) => s.questions),
    [studyMaterial]
  )
  const activeQuestion = useMemo(
    () => (editingQuestionId ? allQuestions.find((q) => q.id === editingQuestionId) : null),
    [editingQuestionId, allQuestions]
  )
  const activeQuestionIndex = useMemo(
    () => (editingQuestionId ? allQuestions.findIndex((q) => q.id === editingQuestionId) : -1),
    [editingQuestionId, allQuestions]
  )
  const activeQuestionLabel = useMemo(() => {
    if (!activeQuestion) return 'Question'
    const match = activeQuestion.prompt.match(/^(\d+)\./)
    if (match) return `Question ${match[1]}`
    if (activeQuestionIndex >= 0) return `Question ${activeQuestionIndex + 1}`
    return 'Question'
  }, [activeQuestion, activeQuestionIndex])
  // Stable primitive key so the useEffect dep array never changes size.
  // React requires hook dep arrays to have a constant length between renders;
  // spreading an array of questions would violate that rule.
  const questionsKey = useMemo(
    () => allQuestions.map((q) => q.id).join(','),
    [allQuestions]
  )

  // ── Fullscreen ──
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => { })
    } else {
      document.exitFullscreen().catch(() => { })
    }
  }

  // Default 3 is used until the first measurement fires after mount.
  const [questionsPerPage, setQuestionsPerPage] = useState(3)
  const probeRef = useRef<HTMLDivElement>(null)

  // ── Dynamic pages (rebuilt when questionsPerPage or study material changes) ──
  const pages = useMemo(
    () => buildPages(studyMaterial, questionsPerPage),
    [studyMaterial, questionsPerPage]
  )
  const totalPages = pages.length

  // Scripture modal state
  type ModalSection = StudySection | null
  const [modalSection, setModalSection] = useState<ModalSection>(null)

  // ── Book ref ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookRef = useRef<any>(null)
  const shareCardRef = useRef<HTMLDivElement>(null)
  const [isSharing, setIsSharing] = useState(false)

  // ── Mount guard (react-pageflip uses DOM APIs) ──
  useEffect(() => {
    let rafId: number
    let attempts = 0
    function tryPatch() {
      const pf = bookRef.current?.pageFlip()
      if (pf) {
        fixPortraitCorners(pf as PatchedPageFlip)
      } else if (attempts < 50) {
        attempts++
        rafId = requestAnimationFrame(tryPatch)
      }
    }
    rafId = requestAnimationFrame(tryPatch)

    return () => cancelAnimationFrame(rafId)
  }, [])

  // ── Measure stage size ──
  // A ResizeObserver on the stage div gives us the content-box size (excludes
  // the 10px CSS padding on each side), which is the exact area available for
  // the book. No extra subtraction needed.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      const w = Math.max(220, width)
      const h = Math.max(320, height)
      setBookSize({ width: w, height: h })
      setStableLayout((prev) => {
        if (prev.width === 0) return { width: w, height: h }
        if (Math.abs(prev.width - w) > 10) return { width: w, height: h }
        if (h > prev.height) return { width: prev.width, height: h }
        return prev
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Fix mobile viewport height ──
  // `100vh` on mobile browsers includes the browser chrome (address bar +
  // navigation), making the layout taller than the visible area and allowing
  // the shell to scroll. We use three layers:
  //   1. `100dvh`  — modern CSS unit, adjusts as chrome shows/hides (Chrome 108+,
  //                   Firefox 101+, Safari 15.4+)
  //   2. `-webkit-fill-available` — Safari legacy (applied via inline style)
  //   3. `visualViewport` JS listener — belt-and-suspenders for older browsers;
  //      sets `--app-height` which the outer div uses as its height.
  useEffect(() => {
    const setHeight = () => {
      const h = window.visualViewport?.height ?? window.innerHeight
      document.documentElement.style.setProperty('--app-height', `${h}px`)
    }
    setHeight()
    window.visualViewport?.addEventListener('resize', setHeight)
    window.addEventListener('resize', setHeight)
    return () => {
      window.visualViewport?.removeEventListener('resize', setHeight)
      window.removeEventListener('resize', setHeight)
    }
  }, [])

  // ── Measure probe to compute questionsPerPage ──
  // Runs after every render where bookSize or fontSize changes.
  // The probe div (rendered off-screen below) contains all questions with the
  // same width/fontSize as a real page, so getBoundingClientRect gives true heights.
  useEffect(() => {
    const probe = probeRef.current
    if (!probe) return
    const items = Array.from(probe.children) as HTMLElement[]
    if (items.length === 0) return

    // QuestionsPageContent layout:
    //   px-5 py-4  →  top padding: 16px, bottom padding: 16px
    //   mini header (dot + title + border + mb-3): ~52px
    //   space-y-4 gap between questions: 16px
    //   page-number footer (absolute, doesn’t push content): 0px
    const PADDING_TOP = 16
    const HEADER_HEIGHT = 52
    const PADDING_BOTTOM = 16
    const GAP = 16  // space-y-4
    const SAFETY = 8   // a little breathing room
    const available = (stableLayout.height || bookSize.height) - PADDING_TOP - HEADER_HEIGHT - PADDING_BOTTOM - SAFETY

    let cumulative = 0
    let count = 0
    for (let i = 0; i < items.length; i++) {
      const h = items[i].getBoundingClientRect().height
      cumulative += h + (i > 0 ? GAP : 0)
      if (cumulative <= available) count++
      else break
    }

    setQuestionsPerPage(Math.max(1, count))
  }, [stableLayout.height, bookSize.height, fontSize, questionsKey])

  // The page-flip library calls `element.style.cssText = '...'` on every animation
  // frame (HTMLPage.simpleDraw, drawSoft, drawHard, and clear in HTMLRender).
  // This completely overwrites any inline font-size we set on the page div.
  //
  // The only value that survives cssText replacement is one in a CSS *stylesheet*
  // rule with `!important`. We inject a <style id="__page-fs"> tag and update it
  // whenever fontSize changes. The rule targets .stf__item, which the library adds
  // to every page element it manages.
  useEffect(() => {
    const styleId = '__page-fs'
    let tag = document.getElementById(styleId) as HTMLStyleElement | null
    if (!tag) {
      tag = document.createElement('style')
      tag.id = styleId
      document.head.appendChild(tag)
    }
    const bg = isDark ? '#111827' : '#ffffff' // gray-900 : white
    tag.textContent = `.stf__item { font-size: ${fontSize}px !important; background: ${bg} !important; }`
  }, [fontSize, isDark])

  // ── Rehydrate answers from IndexedDB (with automatic localStorage migration) ──
  useEffect(() => {
    let active = true
    getGuideAnswers(slug).then((saved) => {
      if (active) {
        if (saved && Object.keys(saved).length > 0) {
          setAnswers(saved as AnswerMap)
          answersRef.current = saved as AnswerMap
        }
        setIsHydrated(true)
      }
    })
    return () => {
      active = false
    }
  }, [slug])

  // Debounced persistence helper
  const pendingSaveRef = useRef<NodeJS.Timeout | null>(null)
  const scheduleSave = useCallback(() => {
    if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current)
    pendingSaveRef.current = setTimeout(() => {
      saveGuideAnswersBatch(slug, answersRef.current).catch(() => {})
    }, 400)
  }, [slug])

  // ── Answer handlers ──
  const handleStringAnswer = useCallback(
    (id: string, value: string) => {
      answersRef.current[id] = value
      scheduleSave()
    },
    [scheduleSave]
  )

  const handleCheckboxToggle = useCallback(
    (id: string, option: string, checked: boolean) => {
      const current = (answersRef.current[id] as string[]) ?? []
      const nextList = checked
        ? [...current, option]
        : current.filter((v) => v !== option)
      answersRef.current[id] = nextList
      scheduleSave()
    },
    [scheduleSave]
  )

  // ── Edit Mode Save / Cancel ──
  const handleEditSave = useCallback(() => {
    saveGuideAnswersBatch(slug, answersRef.current).catch(() => {})
    setAnswers({ ...answersRef.current })
    setEditingQuestionId(null)
    setSaveNotice('Saved on this device')
    setTimeout(() => setSaveNotice(null), 2500)
  }, [slug])

  const handleEditCancel = useCallback(() => {
    if (editingQuestionId) {
      answersRef.current[editingQuestionId] = answers[editingQuestionId]
      setAnswers((prev) => ({ ...prev }))
    }
    setEditingQuestionId(null)
  }, [editingQuestionId, answers])

  // ── Font size ──
  const MIN_FONT = 10
  const DEFAULT_FONT = 14
  const MAX_FONT = 20
  function biggerFont() { setFontSize((f) => Math.min(MAX_FONT, f + 1)) }
  function smallerFont() { setFontSize((f) => Math.max(MIN_FONT, f - 1)) }
  function resetFont() { setFontSize(DEFAULT_FONT) }

  // ── Navigation ──
  function goNext() {
    const pf = bookRef.current?.pageFlip()
    if (!pf) return
    try {
      pf.flipNext()
    } catch {
      pf.turnToNextPage()
    }
  }

  function goPrev() {
    const pf = bookRef.current?.pageFlip()
    if (!pf) return
    try {
      const render = pf.getRender()
      const rect = render?.getRect()

      if (rect && render.getOrientation() === 'portrait') {
        /**
         * Portrait-mode bug in page-flip v2.0.7:
         *   flipPrev() calls flip({ x: 10, y: ... }) using a GLOBAL x of 10.
         *   In portrait mode, rect.left is very negative (≈ -(pageWidth * 1.5 - blockWidth/2)),
         *   so convertToBook({ x: 10 }) → bookPos.x = 10 - rect.left ≈ large positive,
         *   which getDirectionByPoint() classifies as FORWARD instead of BACK.
         *
         * Fix: supply the correct global coordinate so that after convertToBook
         *   bookPos.x = pageWidth - 10, which falls inside the BACK threshold.
         *   global_x = rect.left + (pageWidth - 10)
         *
         * Additionally, pf.flip() checks disableFlipByClick and bails out early
         *   if the point is not on a corner. We temporarily override that setting
         *   so our programmatic call is never gated by the corner check.
         */
        const settings = pf.getSettings() as Record<string, unknown>
        const savedDisable = settings.disableFlipByClick
        settings.disableFlipByClick = false
        try {
          pf.getFlipController()?.flip({
            x: rect.left + rect.pageWidth - 10,
            y: rect.height - 2,          // bottom corner → natural peel direction
          })
        } finally {
          settings.disableFlipByClick = savedDisable
        }
      } else {
        // Landscape / desktop: standard API works correctly
        pf.flipPrev()
      }
    } catch {
      pf.turnToPrevPage()
    }
  }

  const handlePageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // When editing an answer, suspend page turn clicks
    if (editingQuestionId) return

    // Ignore if clicking on interactive elements
    const target = e.target as HTMLElement
    if (target.closest('button, input, textarea, a, label, .scripture-modal')) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left

    // Use a wider touch area on mobile, 30% from edges
    if (x < rect.width * 0.3) {
      goPrev()
    } else if (x > rect.width * 0.7) {
      goNext()
    }
  }, [editingQuestionId])

  // ── Reset ──
  function openResetConfirm() { setResetConfirmOpen(true) }
  function doResetAnswers() {
    answersRef.current = {}
    setAnswers({})
    clearGuideAnswers(slug).catch(() => {})
    setResetConfirmOpen(false)
  }

  // ── Share as Image ──
  const handleShare = async () => {
    if (!shareCardRef.current || isSharing) return
    setIsSharing(true)
    try {
      const blob = await toBlob(shareCardRef.current, {
        cacheBust: true,
        pixelRatio: 2
      })
      if (!blob) throw new Error('Failed to generate image')

      const file = new File([blob], `${studyMaterial.slug}-share.png`, { type: 'image/png' })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: studyMaterial.title,
          files: [file]
        })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${studyMaterial.slug}-share.png`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Error sharing:', err)
      alert('Could not share the image.')
    } finally {
      setIsSharing(false)
    }
  }

  // ── Render a page's inner content ──
  function renderPageContent(page: PageData): React.ReactNode {
    switch (page.kind) {
      case 'cover':
        return <CoverContent material={page.material} />
      case 'section-header':
        return (
          <SectionHeaderContent
            section={page.section}
            sectionIdx={page.sectionIdx}
            total={page.total}
            onOpenModal={() => setModalSection(page.section)}
            isDark={isDark}
          />
        )
      case 'questions':
        return (
          <QuestionsPageContent
            section={page.section}
            sectionIdx={page.sectionIdx}
            questions={page.questions}
            partNum={page.partNum}
            totalParts={page.totalParts}
            answers={answers}
            editingQuestionId={editingQuestionId}
            onStartEditing={setEditingQuestionId}
            onSaveEditing={handleEditSave}
            onCancelEditing={handleEditCancel}
            onStringAnswer={handleStringAnswer}
            onCheckboxToggle={handleCheckboxToggle}
            isDark={isDark}
          />
        )
      case 'blank':
        return <div className={`h-full ${isDark ? 'bg-gray-900' : 'bg-white'}`} />
      case 'back':
        return <BackContent material={page.material} />
      default:
        return null
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRINT — opens a new plain-text window and prints it
  // (avoids all CSS/overflow-hidden conflicts with the flipbook container)
  // ─────────────────────────────────────────────────────────────────────────────

  function handlePrint() {
    // Read latest answers from localStorage (uncontrolled inputs update the ref
    // and localStorage, but don't trigger React re-renders)
    let answers: AnswerMap = {}
    try {
      const raw = localStorage.getItem(storageKey(slug))
      if (raw) answers = JSON.parse(raw) as AnswerMap
    } catch { /* ignore */ }
    // Merge with in-memory ref in case localStorage write was skipped
    answers = { ...answers, ...answersRef.current }

    function ans(id: string): string {
      const val = answers[id]
      if (!val) return ''
      return Array.isArray(val) ? val.join(', ') : val
    }

    function esc(s: string): string {
      return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }

    const sectionsHtml = studyMaterial.study_sections.map((section, si) => {
      const questionsHtml = section.questions.map((q, qi) => `
        <div class="question">
          <p class="prompt">${qi + 1}. ${esc(q.prompt)}${q.is_required ? ' <span class="req">*</span>' : ''}</p>
          <div class="answer-box">${esc(ans(q.id))}</div>
        </div>
      `).join('')

      return `
        <div class="section">
          <div class="section-header">
            <p class="section-label">Section ${si + 1} of ${studyMaterial.study_sections.length}</p>
            <h2>${esc(section.title)}</h2>
            ${section.scripture_reference ? `<p class="scripture">${esc(section.scripture_reference)}</p>` : ''}
            ${section.summary ? `<p class="summary">${esc(section.summary)}</p>` : ''}
          </div>
          ${questionsHtml}
        </div>
      `
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(studyMaterial.title)} — Study Guide</title>
  <style>
    @page { margin: 18mm 16mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; color: #111; background: #fff; }
    h1 { font-size: 20pt; font-weight: 700; margin-bottom: 6pt; }
    h2 { font-size: 14pt; font-weight: 700; margin-bottom: 4pt; }
    .cover { padding-bottom: 24pt; border-bottom: 1pt solid #ccc; margin-bottom: 24pt; }
    .subtitle { font-size: 12pt; color: #444; margin-top: 4pt; }
    .org { font-size: 10pt; color: #666; margin-top: 3pt; }
    .verse { margin-top: 12pt; border-left: 3pt solid #666; padding-left: 10pt; font-style: italic; font-size: 10pt; color: #333; }
    .section { page-break-before: always; padding-top: 8pt; }
    .section-header { border-bottom: 1pt solid #999; padding-bottom: 8pt; margin-bottom: 14pt; }
    .section-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 3pt; }
    .scripture { font-size: 9.5pt; font-style: italic; color: #555; margin-top: 3pt; }
    .summary { font-size: 9.5pt; color: #444; margin-top: 6pt; }
    .question { margin-bottom: 14pt; page-break-inside: avoid; }
    .prompt { font-size: 10pt; font-weight: 600; margin-bottom: 4pt; }
    .req { color: #c00; }
    .answer-box { border: 0.5pt solid #bbb; border-radius: 3pt; min-height: 32pt; padding: 5pt 7pt; font-size: 10pt; color: #222; white-space: pre-wrap; word-break: break-word; background: #fafafa; }
  </style>
</head>
<body>
  <div class="cover">
    <h1>${esc(studyMaterial.title)}</h1>
    ${studyMaterial.subtitle ? `<p class="subtitle">${esc(studyMaterial.subtitle)}</p>` : ''}
    ${studyMaterial.organization ? `<p class="org">${esc(studyMaterial.organization)}</p>` : ''}
    ${studyMaterial.memory_verse ? `<blockquote class="verse">${esc(studyMaterial.memory_verse)}</blockquote>` : ''}
  </div>
  ${sectionsHtml}
</body>
</html>`

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)

    const win = iframe.contentWindow
    if (!win) {
      document.body.removeChild(iframe)
      return
    }

    win.document.open()
    win.document.write(html)
    win.document.close()

    // Clean up after print dialog is closed (or cancelled)
    // Most modern browsers support afterprint on the iframe's window
    win.addEventListener('afterprint', () => {
      // Need a small timeout to ensure the print process is completely finished
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe)
        }
      }, 100)
    })

    // Small delay so the browser finishes painting before print dialog
    setTimeout(() => {
      win.focus()
      win.print()
    }, 400)
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`flex flex-col overflow-hidden print:bg-white ${isDark
        ? 'bg-gray-950'
        : 'bg-gradient-to-b from-slate-100 to-slate-200'
        }`}
      style={{
        // Layer 1: JS-measured exact visible height (visualViewport, most accurate)
        // Layer 2: 100dvh — dynamic viewport, excludes chrome on modern browsers
        // Layer 3: -webkit-fill-available — Safari < 15.4 legacy
        // Layer 4: 100vh — universal fallback (may include chrome on old mobile)
        height: 'var(--app-height, 100dvh)',
        // @ts-expect-error — non-standard but required for Safari < 15.4
        WebkitHeight: '-webkit-fill-available',
        minHeight: '-webkit-fill-available',
      }}
    >

      {/* Hidden Share Card for image generation */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <ShareCard
          ref={shareCardRef}
          title={studyMaterial.title}
          slug={studyMaterial.slug}
          date={new Date(studyMaterial.created_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
          })}
          url={typeof window !== 'undefined' ? window.location.href : ''}
        />
      </div>

      {/* ── Top bar ── */}
      <header className={`flex-shrink-0 flex items-center justify-between px-4 py-2.5 backdrop-blur-sm border-b print:hidden ${isDark ? 'bg-gray-900/80 border-gray-800' : 'bg-white/80 border-gray-200'}`}>
        {/* Left: title */}
        <div className="min-w-0 flex-1 mr-2">
          <h1 className={`text-sm font-bold break-words ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{studyMaterial.title}</h1>
          {studyMaterial.organization && (
            <p className={`text-xs break-words ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{studyMaterial.organization}</p>
          )}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-1 flex-shrink-0">

          {/* ── Tablet-only inline controls (hidden on mobile, shown on md+) ── */}
          <div className="hidden md:flex items-center gap-1">
            {/* A− */}
            <button
              type="button"
              onClick={smallerFont}
              disabled={fontSize <= MIN_FONT}
              title="Decrease font size"
              className={`inline-flex flex-col items-center justify-center gap-0.5 h-10 w-10 rounded-xl border text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${isDark ? 'border-gray-700 text-gray-400 hover:bg-gray-800' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >
              A<span className="text-[9px] align-super">−</span>
            </button>

            {/* A reset + size badge */}
            <div className="inline-flex flex-col items-center justify-center gap-0 h-10 px-2">
              <button
                type="button"
                onClick={resetFont}
                disabled={fontSize === DEFAULT_FONT}
                title="Reset font size"
                className={`inline-flex items-center justify-center w-8 h-6 rounded-lg border text-sm font-bold transition-colors ${fontSize === DEFAULT_FONT
                  ? isDark ? 'border-gray-700 bg-gray-800 text-gray-600 cursor-not-allowed' : 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                  : 'border-indigo-500 bg-indigo-900/40 text-indigo-400 hover:bg-indigo-900/60'
                  }`}
              >
                A
              </button>
              <span className={`text-[9px] leading-none mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{fontSize}px</span>
            </div>

            {/* A+ */}
            <button
              type="button"
              onClick={biggerFont}
              disabled={fontSize >= MAX_FONT}
              title="Increase font size"
              className={`inline-flex flex-col items-center justify-center gap-0.5 h-10 w-10 rounded-xl border text-base font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${isDark ? 'border-gray-700 text-gray-400 hover:bg-gray-800' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >
              A<span className="text-[9px] align-super">+</span>
            </button>

            <div className={`w-px h-8 mx-0.5 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />

            {/* Share */}
            <button
              type="button"
              onClick={handleShare}
              disabled={isSharing}
              title="Share via WhatsApp"
              className={`inline-flex flex-col items-center justify-center gap-0.5 h-10 px-3 rounded-xl border transition-colors ${isDark ? 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50'}`}
            >
              <Share2 className="h-4 w-4" />
              <span className="text-[9px] font-medium leading-none">{isSharing ? '...' : 'Share'}</span>
            </button>

            <div className={`w-px h-8 mx-0.5 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />

            {/* Reset answers */}
            <button
              type="button"
              onClick={openResetConfirm}
              title="Reset answers"
              className={`inline-flex flex-col items-center justify-center gap-0.5 h-10 px-3 rounded-xl border hover:text-red-400 hover:border-red-800 hover:bg-red-950/40 transition-colors ${isDark ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50'}`}
            >
              <RotateCcw className="h-4 w-4" />
              <span className="text-[9px] font-medium leading-none">Reset</span>
            </button>

            {/* PDF */}
            <button
              type="button"
              onClick={handlePrint}
              title="Save as PDF"
              className={`inline-flex flex-col items-center justify-center gap-0.5 h-10 px-3 rounded-xl border transition-colors ${isDark ? 'border-indigo-700 bg-indigo-900/40 text-indigo-400 hover:bg-indigo-900/60' : 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:border-indigo-300'}`}
            >
              <Printer className="h-4 w-4" />
              <span className="text-[9px] font-medium leading-none">PDF</span>
            </button>

            <div className={`w-px h-8 mx-0.5 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />

            {/* Light / Dark theme toggle */}
            {/* <div className={`flex h-10 rounded-xl border overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                <button
                  type="button"
                  onClick={() => setIsDark(false)}
                  title="Light mode"
                  className={`inline-flex flex-col items-center justify-center gap-0.5 px-3 transition-colors border-r ${!isDark ? 'bg-amber-50 text-amber-600 border-amber-200' : isDark ? 'bg-gray-900 text-gray-500 hover:bg-gray-800 border-gray-700' : 'bg-white text-gray-400 hover:bg-gray-50 border-gray-200'}`}
                >
                  <Sun className="h-4 w-4" />
                  <span className="text-[9px] font-medium leading-none">Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsDark(true)}
                  title="Dark mode"
                  className={`inline-flex flex-col items-center justify-center gap-0.5 px-3 transition-colors ${isDark ? 'bg-indigo-900/50 text-indigo-300' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
                >
                  <Moon className="h-4 w-4" />
                  <span className="text-[9px] font-medium leading-none">Dark</span>
                </button>
              </div>

              <div className={`w-px h-8 mx-0.5 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} /> */}

          </div>

          {/* ── Mobile-only Style gear (md:hidden) ── */}
          <div className="md:hidden">
            <button
              type="button"
              onClick={() => setCustomizeOpen((o) => !o)}
              title="Customize"
              className={`inline-flex flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-1.5 transition-colors min-w-[44px] ${customizeOpen
                ? isDark ? 'border-indigo-700 bg-indigo-900/40 text-indigo-400' : 'border-indigo-300 bg-indigo-50 text-indigo-600'
                : isDark ? 'border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
            >
              <Settings className="h-4 w-4" />
              <span className="text-[9px] font-medium leading-none">
                {customizeOpen ? 'Close' : 'Options'}
              </span>
            </button>
          </div>

          <div className={`w-px h-8 mx-0.5 md:hidden ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />

          {/* Fullscreen — always visible */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className={`inline-flex flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-1.5 transition-colors min-w-[44px] ${isFullscreen
                ? isDark ? 'border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600' : 'border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200'
                : isDark ? 'border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
          >
            {isFullscreen ? <X className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            <span className="text-[9px] font-medium leading-none">
              {isFullscreen ? 'Exit' : 'Full'}
            </span>
          </button>
        </div>
      </header>

      {/* ── Customize toolbar — inline panel, mobile only ──
          Renders as a sibling to the header (not inside it), so it's never
          clipped by overflow and doesn't need z-index tricks. Hidden on md+. */}
      {customizeOpen && (
        <div className={`md:hidden flex-shrink-0 border-b px-4 py-3 print:hidden ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center gap-3">
            {/* Font size label */}
            <span className={`text-[10px] font-semibold uppercase tracking-widest w-16 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Font</span>
            {/* A− */}
            <button
              type="button"
              onClick={smallerFont}
              disabled={fontSize <= MIN_FONT}
              className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${isDark ? 'border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-400' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600'}`}
            >
              A<span className="text-[9px] align-super">−</span>
            </button>
            {/* A reset */}
            <button
              type="button"
              onClick={resetFont}
              disabled={fontSize === DEFAULT_FONT}
              className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border text-sm font-bold transition-colors ${fontSize === DEFAULT_FONT
                ? isDark ? 'border-gray-700 bg-gray-800 text-gray-600 cursor-not-allowed' : 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                : 'border-indigo-500 bg-indigo-900/40 text-indigo-400 hover:bg-indigo-900/60'
                }`}
            >
              A
            </button>
            {/* A+ */}
            <button
              type="button"
              onClick={biggerFont}
              disabled={fontSize >= MAX_FONT}
              className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border text-base font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${isDark ? 'border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-400' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600'}`}
            >
              A<span className="text-[9px] align-super">+</span>
            </button>
            {/* px label */}
            <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{fontSize}px</span>

            {/* Share (Mobile) */}
            <button
              type="button"
              onClick={handleShare}
              disabled={isSharing}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${isDark ? 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50'}`}
            >
              <Share2 className="h-3.5 w-3.5" />
              {isSharing ? 'Sharing...' : 'Share'}
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Light / Dark toggle */}
            {/* <div className={`flex rounded-xl border overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                <button
                  type="button"
                  onClick={() => setIsDark(false)}
                  className={`inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium transition-colors border-r ${!isDark ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-gray-900 text-gray-500 hover:bg-gray-800 border-gray-700'}`}
                >
                  <Sun className="h-3.5 w-3.5" /> Light
                </button>
                <button
                  type="button"
                  onClick={() => setIsDark(true)}
                  className={`inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium transition-colors ${isDark ? 'bg-indigo-900/50 text-indigo-300' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
                >
                  <Moon className="h-3.5 w-3.5" /> Dark
                </button>
              </div> */}
          </div>

          {/* ── Row 2: Actions ── */}
          <div className={`h-px -mx-4 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`} />
          <div className="flex items-center gap-3 pt-2">
            <span className={`text-[10px] font-semibold uppercase tracking-widest w-16 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Actions</span>
            <button
              type="button"
              onClick={openResetConfirm}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium transition-colors hover:text-red-400 hover:border-red-800 hover:bg-red-950/40 ${isDark ? 'border-gray-700 bg-gray-800 text-gray-400' : 'border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-600'}`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset answers
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium transition-colors ${isDark ? 'border-indigo-700 bg-indigo-900/40 text-indigo-400 hover:bg-indigo-900/60' : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-600'}`}
            >
              <Printer className="h-3.5 w-3.5" />
              Save PDF
            </button>
          </div>
        </div>
      )}

      {/*
        ── Hidden question-height probe ───────────────────────────────────────
        Rendered off-screen (position:fixed, top:-9999px) so the browser lays
        it out at bookSize.width content width and the current fontSize, giving
        real getBoundingClientRect heights for each question item.
        The useEffect above reads these heights to compute questionsPerPage.
      */}
      <div
        ref={probeRef}
        aria-hidden
        style={{
          position: 'fixed',
          top: -9999,
          left: 0,
          // Probe uses single-page width so measurements match the real rendered page.
          // In two-page mode pageWidth = bookSize.width/2; in single-page mode it equals bookSize.width.
          width: pageWidth,
          fontSize: fontSize,
          visibility: 'hidden',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        {allQuestions.map((q) => (
          <div key={q.id} className="space-y-1">
            {/* Label — same style as QuestionInput */}
            <label style={{ fontSize: '0.9em' }} className="block font-medium text-gray-700 leading-snug">
              {q.prompt}
            </label>
            {/* Input area — mirrors QuestionInput rendering */}
            {(q.type === 'text' || q.type === 'textarea' || !q.type) && (
              <textarea
                rows={3}
                readOnly
                tabIndex={-1}
                className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 min-h-[72px] resize-y"
              />
            )}
            {q.type === 'radio' && (
              <div className="space-y-1">
                {(q.options ?? []).map((opt, i) => (
                  <label key={i} className="flex items-center gap-1.5">
                    <input type="radio" readOnly tabIndex={-1} className="h-3 w-3" />
                    <span className="text-xs text-gray-600">{opt}</span>
                  </label>
                ))}
              </div>
            )}
            {q.type === 'checkbox' && (
              <div className="space-y-1">
                {(q.options ?? []).map((opt, i) => (
                  <label key={i} className="flex items-center gap-1.5">
                    <input type="checkbox" readOnly tabIndex={-1} className="h-3 w-3 rounded" />
                    <span className="text-xs text-gray-600">{opt}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Book stage ── */}
      <div
        ref={stageRef}
        className="relative flex-1 flex flex-col items-center justify-start overflow-hidden print:hidden p-[10px]"
      >

        {mounted && isHydrated && pageWidth > 0 ? (
          <HTMLFlipBook
            key={`${pageWidth}-${bookSize.height}-${questionsPerPage}`}
            ref={bookRef}
            width={pageWidth}
            height={bookSize.height}
            size="fixed"
            minWidth={220}
            maxWidth={pageWidth}
            minHeight={320}
            maxHeight={bookSize.height}
            drawShadow
            flippingTime={700}
            usePortrait={!showTwoPages}
            showCover={true}
            mobileScrollSupport={true}
            clickEventForward={false}
            useMouseEvents={false}
            showPageCorners={false}
            disableFlipByClick={true}
            maxShadowOpacity={0.4}
            className="shadow-2xl"
            style={{}}
            startPage={0}
            startZIndex={0}
            autoSize={false}
            swipeDistance={editingQuestionId ? 999999 : 60}
            renderOnlyPageLengthChange={true}
            onFlip={(e) => setCurrentPage(e.data)}
          >
            {pages.map((page, idx) => {
              const isCover = page.kind === 'cover'
              const isBack = page.kind === 'back'
              const showNum = !isCover && !isBack && page.kind !== 'blank'
              return (
                <Page
                  key={idx}
                  density="soft"
                  pageNum={showNum ? idx : undefined}
                  totalPages={totalPages}
                  isDark={isDark}
                  onPageClick={handlePageClick}
                >
                  {renderPageContent(page)}
                </Page>
              )
            })}
          </HTMLFlipBook>
        ) : (
          // Pre-mount skeleton
          <div className="w-[330px] h-[500px] rounded-lg bg-white shadow-2xl animate-pulse" />
        )}
      </div>

      {/* ── Bottom nav ── */}
      <nav className={`flex-shrink-0 flex items-center justify-between px-6 py-3 backdrop-blur-sm border-t print:hidden ${isDark ? 'bg-gray-900/80 border-gray-800' : 'bg-white/80 border-gray-200'}`}>
        <button
          type="button"
          onClick={goPrev}
          disabled={currentPage === 0}
          aria-label="Previous page"
          className={`inline-flex items-center gap-1 rounded-xl border disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-4 py-1.5 text-sm font-medium ${isDark ? 'border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-300' : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'}`}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>

        <span className={`text-xs font-medium ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {currentPage + 1} / {totalPages}
        </span>

        {/* ── Font size controls removed — moved to Customize dropdown ── */}

        <button
          type="button"
          onClick={goNext}
          disabled={currentPage >= totalPages - 1}
          aria-label="Next page"
          className={`inline-flex items-center gap-1 rounded-xl border disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-4 py-1.5 text-sm font-medium ${isDark ? 'border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-300' : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'}`}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>

      {/* ── Edit Mode Floating Action Island ── */}
      {editingQuestionId && (
        <div
          className="fixed bottom-16 sm:bottom-6 inset-x-0 mx-auto max-w-lg z-50 px-4 pointer-events-none"
          role="region"
          aria-label="Answer editing controls"
        >
          <div className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl shadow-2xl border backdrop-blur-md ${
            isDark
              ? 'bg-gray-900/95 border-gray-700 text-gray-100 shadow-black/50'
              : 'bg-white/95 border-indigo-100 text-gray-900 shadow-indigo-900/10'
          }`}>
            {/* Polite message explaining edit state & paused page turn animation */}
            <div className="flex items-center gap-2.5 text-xs min-w-0">
              <span className="flex h-2.5 w-2.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600"></span>
              </span>
              <div className="truncate text-xs">
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  Editing {activeQuestionLabel}
                </span>
                <span className="mx-1.5 opacity-40">·</span>
                <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                  Page turning paused so you can type
                </span>
              </div>
            </div>

            {/* Actions: Cancel & Save */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleEditCancel}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                  isDark
                    ? 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSave}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 active:scale-95 transition"
              >
                <Check className="h-3.5 w-3.5" />
                Save Answer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save status notification ── */}
      {saveNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg border border-gray-700 flex items-center gap-2"
        >
          <Check className="h-3.5 w-3.5 text-emerald-400" />
          <span>{saveNotice}</span>
        </div>
      )}


      {/* Print layout is generated in a new window via handlePrint() — no in-DOM component needed */}


      {/* ── Scripture modal ── */}
      {modalSection && (
        <ScriptureModal
          sectionTitle={modalSection.title}
          scriptureReference={modalSection.scripture_reference}
          summary={modalSection.summary}
          scriptureText={modalSection.scripture_text}
          fontSize={fontSize}
          onClose={() => setModalSection(null)}
        />
      )}
      {/* Reset-answers confirmation drawer */}
      {resetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end print:hidden" role="presentation">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" onClick={() => setResetConfirmOpen(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-confirm-heading"
            className={`relative z-10 w-full rounded-t-2xl border-t border-x shadow-2xl px-5 pt-4 pb-8 ${isDark
                ? 'bg-gray-900 border-gray-700'
                : 'bg-white border-gray-200'
              }`}
            style={{ animation: 'slideUp 300ms cubic-bezier(0.22,1,0.36,1) both' }}
          >
            <div className="flex justify-center mb-4" aria-hidden="true">
              <div className={`h-1 w-10 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} />
            </div>
            <div className="flex items-start gap-3 mb-3">
              <div className={`flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full border ${isDark ? 'bg-red-950/40 border-red-800' : 'bg-red-50 border-red-200'
                }`}>
                <RotateCcw className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h2 id="reset-confirm-heading" className={`text-base font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Reset all answers?</h2>
                <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>This will permanently clear every answer you have entered for this study guide. This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setResetConfirmOpen(false)} className={`flex-1 rounded-xl border py-3 text-sm font-semibold transition-colors ${isDark ? 'border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-300' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600'
                }`}>Cancel</button>
              <button type="button" onClick={doResetAnswers} className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 py-3 text-sm font-semibold text-white transition-colors">Yes, reset</button>
            </div>
          </div>
          <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        </div>
      )}
    </div>
  )
}
