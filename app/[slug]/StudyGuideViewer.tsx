'use client'

/**
 * StudyGuideViewer – Client Component
 *
 * Receives pre-fetched StudyMaterial (with nested sections + questions)
 * from the Server Component parent.
 *
 * Features:
 *  ✅ Horizontal flipbook — one section per slide, `transform: translateX`
 *  ✅ Touch-swipe with axis disambiguation (40 px threshold)
 *  ✅ Keyboard ← → navigation (skipped when focus is in an input)
 *  ✅ Controlled inputs — all answers in `userAnswers` state
 *  ✅ Auto-expanding <textarea> (resizes on value change including on hydration)
 *  ✅ Radio — single string value per question
 *  ✅ Checkbox — string[] per question (multi-select)
 *  ✅ localStorage persistence keyed by `study_answers_${slug}`
 *  ✅ Reset button clears state + storage
 *  ✅ Export PDF button (relies on globals.css @media print rules)
 *  ✅ Print layout stacks all sections with answers pre-filled
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Printer, RotateCcw, BookOpen } from 'lucide-react'
import type { StudyMaterial, StudySection, Question } from '@/lib/supabase'
import { ScriptureModal } from '@/components/ScriptureModal'
import { getGuideAnswers, saveGuideAnswersBatch, clearGuideAnswers } from '@/lib/studyDb'

// ─── Props ────────────────────────────────────────────────────────────────────

interface StudyGuideViewerProps {
  slug: string
  studyMaterial: StudyMaterial
}

// ─── Answer state ─────────────────────────────────────────────────────────────
// Key = question.id
// Value = string (text / textarea / radio) | string[] (checkbox multi-select)

type AnswerMap = Record<string, string | string[]>

// ─── Auto-expanding textarea ──────────────────────────────────────────────────

function AutoTextarea({
  value,
  onChange,
  placeholder,
  id,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  id?: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      id={id}
      value={value}
      placeholder={placeholder}
      rows={3}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      style={{ overflow: 'hidden', resize: 'none' }}
    />
  )
}

// ─── Single question renderer ─────────────────────────────────────────────────

function QuestionRenderer({
  question,
  answers,
  onStringAnswer,
  onCheckboxToggle,
}: {
  question: Question
  answers: AnswerMap
  onStringAnswer: (id: string, value: string) => void
  onCheckboxToggle: (id: string, option: string, checked: boolean) => void
}) {
  const baseInput =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition print:border-gray-400'
  const fieldId = `q-${question.id}`
  const stringVal = (answers[question.id] as string) ?? ''
  const arrayVal = (answers[question.id] as string[]) ?? []

  return (
    <div className="space-y-2 print:break-inside-avoid">
      <label
        htmlFor={question.type !== 'checkbox' && question.type !== 'radio' ? fieldId : undefined}
        className="block text-sm font-medium text-gray-800"
      >
        {question.prompt}
        {question.is_required && (
          <span className="ml-1 text-red-500 text-xs" aria-hidden="true">*</span>
        )}
      </label>

      {/* ── text ── */}
      {question.type === 'text' && (
        <input
          id={fieldId}
          type="text"
          value={stringVal}
          placeholder="Your answer…"
          onChange={(e) => onStringAnswer(question.id, e.target.value)}
          className={baseInput}
        />
      )}

      {/* ── textarea ── */}
      {question.type === 'textarea' && (
        <AutoTextarea
          id={fieldId}
          value={stringVal}
          placeholder="Your answer…"
          onChange={(v) => onStringAnswer(question.id, v)}
          className={baseInput}
        />
      )}

      {/* ── radio ── */}
      {question.type === 'radio' && (
        <fieldset>
          <legend className="sr-only">{question.prompt}</legend>
          <div className="space-y-1.5">
            {(question.options ?? []).map((opt, i) => {
              const optId = `${fieldId}-opt-${i}`
              return (
                <label
                  key={i}
                  htmlFor={optId}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <input
                    id={optId}
                    type="radio"
                    name={fieldId}
                    value={opt}
                    checked={stringVal === opt}
                    onChange={() => onStringAnswer(question.id, opt)}
                    className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-400"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                    {opt}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      )}

      {/* ── checkbox ── */}
      {question.type === 'checkbox' && (
        <fieldset>
          <legend className="sr-only">{question.prompt}</legend>
          <div className="space-y-1.5">
            {(question.options ?? []).map((opt, i) => {
              const optId = `${fieldId}-chk-${i}`
              const isChecked = arrayVal.includes(opt)
              return (
                <label
                  key={i}
                  htmlFor={optId}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <input
                    id={optId}
                    type="checkbox"
                    value={opt}
                    checked={isChecked}
                    onChange={(e) =>
                      onCheckboxToggle(question.id, opt, e.target.checked)
                    }
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                    {opt}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      )}
    </div>
  )
}

// ─── Section card (one "page" of the flipbook) ────────────────────────────────

function SectionCard({
  section,
  index,
  answers,
  onStringAnswer,
  onCheckboxToggle,
  onOpenModal,
}: {
  section: StudySection
  index: number
  answers: AnswerMap
  onStringAnswer: (id: string, v: string) => void
  onCheckboxToggle: (id: string, opt: string, checked: boolean) => void
  onOpenModal: (section: StudySection, trigger: HTMLButtonElement) => void
}) {
  const passageBtnRef = useRef<HTMLButtonElement>(null)
  const hasPassage = !!(section.scripture_reference || section.scripture_text || section.summary)

  return (
    <article
      className="h-full w-full overflow-y-auto bg-white px-6 py-8"
      aria-label={`Section ${index + 1}: ${section.title}`}
    >
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 mb-1">
          Section {index + 1}
        </p>
        <h2 className="text-xl font-bold text-gray-900">{section.title}</h2>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {section.scripture_reference && (
            <p className="text-sm italic text-gray-500">
              {section.scripture_reference}
            </p>
          )}

          {hasPassage && (
            <button
              ref={passageBtnRef}
              type="button"
              onClick={() =>
                passageBtnRef.current &&
                onOpenModal(section, passageBtnRef.current)
              }
              aria-label={`Read passage for ${section.title}`}
              className="print:hidden inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Read Passage
            </button>
          )}
        </div>
      </header>

      <div className="space-y-6">
        {section.questions.map((q) => (
          <QuestionRenderer
            key={q.id}
            question={q}
            answers={answers}
            onStringAnswer={onStringAnswer}
            onCheckboxToggle={onCheckboxToggle}
          />
        ))}
      </div>
    </article>
  )
}

// ─── Main viewer ──────────────────────────────────────────────────────────────

export function StudyGuideViewer({ slug, studyMaterial }: StudyGuideViewerProps) {
  const sections = studyMaterial.study_sections
  const total = sections.length

  const [currentSection, setCurrentSection] = useState(0)
  const [answers, setAnswers] = useState<AnswerMap>({})
  // ── Scripture modal state ──
  type ModalState = { section: StudySection; trigger: HTMLButtonElement } | null
  const [activeModal, setActiveModal] = useState<ModalState>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  function openModal(section: StudySection, trigger: HTMLButtonElement) {
    triggerRef.current = trigger
    setActiveModal({ section, trigger })
  }
  function closeModal() {
    setActiveModal(null)
  }

  // ── Rehydrate from IndexedDB (with legacy localStorage migration) ──
  useEffect(() => {
    let active = true
    getGuideAnswers(slug).then((saved) => {
      if (active && saved && Object.keys(saved).length > 0) {
        setAnswers(saved as AnswerMap)
      }
    })
    return () => {
      active = false
    }
  }, [slug])

  // ── Debounced persist to IndexedDB on answers change ──
  useEffect(() => {
    if (Object.keys(answers).length === 0) return
    const timer = setTimeout(() => {
      saveGuideAnswersBatch(slug, answers).catch(() => {})
    }, 350)
    return () => clearTimeout(timer)
  }, [slug, answers])

  // ── Answer handlers ──
  const handleStringAnswer = useCallback((id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }, [])

  const handleCheckboxToggle = useCallback(
    (id: string, option: string, checked: boolean) => {
      setAnswers((prev) => {
        const current = (prev[id] as string[]) ?? []
        return {
          ...prev,
          [id]: checked
            ? [...current, option]
            : current.filter((v) => v !== option),
        }
      })
    },
    []
  )

  // ── Touch swipe ──
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      if (dx < 0) setCurrentSection((p) => Math.min(total - 1, p + 1))
      else setCurrentSection((p) => Math.max(0, p - 1))
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  // ── Keyboard navigation ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (e.key === 'ArrowRight') setCurrentSection((p) => Math.min(total - 1, p + 1))
      if (e.key === 'ArrowLeft') setCurrentSection((p) => Math.max(0, p - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total])

  // ── Reset ──
  function clearAnswers() {
    if (!window.confirm('Clear all your answers for this guide?')) return
    setAnswers({})
    clearGuideAnswers(slug).catch(() => {})
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-100 print:bg-white print:block print:h-auto">

      {/* ── Top bar ── */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm print:hidden">
        <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-gray-900 truncate">
              {studyMaterial.title}
            </h1>
            {studyMaterial.subtitle && (
              <p className="text-xs text-gray-500 truncate">{studyMaterial.subtitle}</p>
            )}
            {studyMaterial.organization && (
              <p className="text-xs text-gray-400 truncate">{studyMaterial.organization}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={clearAnswers}
              aria-label="Reset answers"
              title="Reset all answers"
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Reset
            </button>
            <button
              id="export-pdf-btn"
              type="button"
              onClick={() => window.print()}
              aria-label="Export as PDF"
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              <Printer className="h-3 w-3" aria-hidden="true" />
              Export PDF
            </button>
          </div>
        </div>

        {/* Memory verse callout */}
        {studyMaterial.memory_verse && (
          <div className="bg-indigo-50 border-l-4 border-indigo-500 rounded-r-xl p-4 my-6">
            <p className="text-xs font-semibold text-indigo-600 mb-0.5">Memory Verse</p>
            <p className="text-indigo-900 font-medium italic leading-relaxed">
              {studyMaterial.memory_verse.replace(/^memory verse:?\s*/i, '')}
            </p>
          </div>
        )}

        <div className="px-4 pb-2 text-xs text-gray-400">
          Section {currentSection + 1} of {total}
        </div>
      </header>

      {/* ── Flipbook viewport (screen only) ── */}
      <div
        className="flex-1 relative overflow-hidden print:hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="region"
        aria-label="Study guide sections"
      >
        <div
          className="absolute inset-0 flex transition-transform duration-300 ease-in-out will-change-transform"
          style={{
            width: `${total * 100}%`,
            transform: `translateX(-${(currentSection / total) * 100}%)`,
          }}
        >
          {sections.map((section, idx) => (
            <div
              key={section.id}
              className="h-full"
              style={{ width: `${100 / total}%` }}
            >
              <SectionCard
                section={section}
                index={idx}
                answers={answers}
                onStringAnswer={handleStringAnswer}
                onCheckboxToggle={handleCheckboxToggle}
                onOpenModal={openModal}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom navigation (screen only) ── */}
      <nav
        aria-label="Section navigation"
        className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 flex-shrink-0 print:hidden"
      >
        <button
          id="prev-section-btn"
          type="button"
          onClick={() => setCurrentSection((p) => Math.max(0, p - 1))}
          disabled={currentSection === 0}
          aria-label="Previous section"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Prev
        </button>

        <div className="flex gap-1.5" role="tablist" aria-label="Sections">
          {sections.map((_, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={idx === currentSection}
              aria-label={`Section ${idx + 1}`}
              onClick={() => setCurrentSection(idx)}
              className={`rounded-full transition-all duration-200 ${idx === currentSection
                  ? 'w-5 h-2 bg-indigo-500'
                  : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'
                }`}
            />
          ))}
        </div>

        <button
          id="next-section-btn"
          type="button"
          onClick={() => setCurrentSection((p) => Math.min(total - 1, p + 1))}
          disabled={currentSection === total - 1}
          aria-label="Next section"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </nav>

      {/* ── Print layout — all sections stacked, answers pre-filled ── */}
      <div className="hidden print:block">
        {/* Print header */}
        <div className="mb-6 pb-4 border-b border-gray-300">
          <h1 className="text-2xl font-bold text-gray-900">{studyMaterial.title}</h1>
          {studyMaterial.subtitle && (
            <p className="text-base text-gray-600 mt-1">{studyMaterial.subtitle}</p>
          )}
          {studyMaterial.organization && (
            <p className="text-sm text-gray-500">{studyMaterial.organization}</p>
          )}
          {studyMaterial.memory_verse && (
            <p className="mt-2 text-[10px] text-gray-700">
              <strong className="not-italic text-indigo-600">Memory Verse: </strong>
              <span className="italic">{studyMaterial.memory_verse.replace(/^memory verse:?\s*/i, '')}</span>
            </p>
          )}
        </div>
        {sections.map((section, idx) => (
          <SectionCard
            key={section.id}
            section={section}
            index={idx}
            answers={answers}
            onStringAnswer={handleStringAnswer}
            onCheckboxToggle={handleCheckboxToggle}
            // Print layout: no-op — modal button is already print:hidden
            onOpenModal={() => { }}
          />
        ))}
      </div>

      {/* ── Scripture modal ── */}
      {activeModal && (
        <ScriptureModal
          sectionTitle={activeModal.section.title}
          scriptureReference={activeModal.section.scripture_reference}
          summary={activeModal.section.summary}
          scriptureText={activeModal.section.scripture_text}
          triggerRef={triggerRef as React.RefObject<HTMLElement>}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
