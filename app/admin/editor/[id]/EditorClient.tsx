'use client'

/**
 * EditorClient – Client Component
 *
 * Full split-screen study guide builder.
 *
 * LEFT PANE  – Metadata (title, slug, subtitle, org, memory verse)
 *            – Section accordion (title, scripture ref, questions)
 *            – Per-question: prompt, type, options editor, required flag
 *            – QR code (when slug is set)
 *            – Save button
 *
 * RIGHT PANE – Mobile phone simulator previewing the active section
 *              with read-only rendered questions
 */

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeCanvas } from 'qrcode.react'
import {
  Plus, Trash2, Save, ChevronLeft, ChevronRight,
  Copy, CheckCheck, ExternalLink, GripVertical,
  ChevronDown, ChevronUp, Download,
} from 'lucide-react'
import type { StudyMaterial, QuestionType } from '@/lib/supabase'

// ─── Draft types (UI state — order_index derived from array position) ─────────

type DraftQuestion = {
  id: string          // temp-* for new, DB uuid for loaded
  prompt: string
  type: QuestionType
  options: string[]
  is_required: boolean
}

type DraftSection = {
  id: string
  title: string
  scripture_reference: string
  scripture_text: string
  summary: string
  questions: DraftQuestion[]
}

type DraftMaterial = {
  title: string
  slug: string
  subtitle: string
  organization: string
  memory_verse: string
  sections: DraftSection[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return `temp-${Math.random().toString(36).slice(2, 9)}`
}

function slugify(text: string) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function emptyQuestion(): DraftQuestion {
  return { id: uid(), prompt: '', type: 'text', options: [], is_required: false }
}

function emptySection(): DraftSection {
  return { id: uid(), title: 'New Section', scripture_reference: '', scripture_text: '', summary: '', questions: [emptyQuestion()] }
}

function emptyMaterial(): DraftMaterial {
  return { title: '', slug: '', subtitle: '', organization: '', memory_verse: '', sections: [emptySection()] }
}

function materialToDraft(m: StudyMaterial): DraftMaterial {
  return {
    title: m.title,
    slug: m.slug,
    subtitle: m.subtitle ?? '',
    organization: m.organization ?? '',
    memory_verse: m.memory_verse ?? '',
    sections: m.study_sections.map((s) => ({
      id: s.id,
      title: s.title,
      scripture_reference: s.scripture_reference ?? '',
      scripture_text: s.scripture_text ?? '',
      summary: s.summary ?? '',
      questions: s.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        options: q.options ?? [],
        is_required: q.is_required,
      })),
    })),
  }
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'radio', label: 'Radio (single choice)' },
  { value: 'checkbox', label: 'Checkbox (multi-select)' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditorClientProps {
  id: string
  isNew: boolean
  initialData: StudyMaterial | null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[]
  onChange: (opts: string[]) => void
}) {
  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs font-medium text-gray-500">Options</p>
      {options.map((opt, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            value={opt}
            placeholder={`Option ${i + 1}`}
            onChange={(e) => {
              const next = [...options]
              next[i] = e.target.value
              onChange(next)
            }}
            className="flex-1 rounded-lg bg-gray-950 border border-gray-700 px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            aria-label={`Remove option ${i + 1}`}
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, ''])}
        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
      >
        <Plus className="h-3 w-3" /> Add option
      </button>
    </div>
  )
}

function QuestionEditor({
  question,
  onUpdate,
  onRemove,
}: {
  question: DraftQuestion
  onUpdate: (q: DraftQuestion) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-gray-700 mt-2 flex-shrink-0" aria-hidden />
        <div className="flex-1 space-y-2">
          {/* Prompt */}
          <input
            type="text"
            value={question.prompt}
            placeholder="Question prompt…"
            onChange={(e) => onUpdate({ ...question, prompt: e.target.value })}
            className="w-full rounded-lg bg-gray-900 border border-gray-700 px-2.5 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {/* Type + Required */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={question.type}
              onChange={(e) => {
                const type = e.target.value as QuestionType
                // Clear options when switching away from choice types
                const options =
                  type === 'radio' || type === 'checkbox' ? question.options : []
                onUpdate({ ...question, type, options })
              }}
              className="rounded-lg bg-gray-900 border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={question.is_required}
                onChange={(e) => onUpdate({ ...question, is_required: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-gray-600 text-indigo-500"
              />
              Required
            </label>
          </div>

          {/* Options editor for choice types */}
          {(question.type === 'radio' || question.type === 'checkbox') && (
            <OptionsEditor
              options={question.options}
              onChange={(opts) => onUpdate({ ...question, options: opts })}
            />
          )}
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove question"
          className="mt-1 text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Mobile preview — read-only rendering of a section ───────────────────────

function SectionPreview({ section }: { section: DraftSection }) {
  return (
    <div className="h-full overflow-y-auto bg-white px-4 py-5 space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 mb-0.5">
          Section
        </p>
        <h2 className="text-base font-bold text-gray-900">
          {section.title || 'Untitled Section'}
        </h2>
        {section.scripture_reference && (
          <p className="text-xs italic text-gray-500 mt-0.5">{section.scripture_reference}</p>
        )}
      </header>

      {section.questions.map((q) => (
        <div key={q.id} className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">
            {q.prompt || '(no prompt)'}
            {q.is_required && <span className="text-red-400 ml-1">*</span>}
          </label>

          {q.type === 'text' && (
            <div className="h-7 rounded border border-gray-200 bg-gray-50" />
          )}
          {q.type === 'textarea' && (
            <div className="h-16 rounded border border-gray-200 bg-gray-50" />
          )}
          {(q.type === 'radio' || q.type === 'checkbox') && (
            <div className="space-y-1">
              {q.options.length > 0
                ? q.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className={`h-3.5 w-3.5 border border-gray-300 flex-shrink-0 ${q.type === 'radio' ? 'rounded-full' : 'rounded'}`} />
                      <span className="text-xs text-gray-600">{opt || `Option ${i + 1}`}</span>
                    </div>
                  ))
                : <p className="text-xs text-gray-400 italic">No options yet</p>
              }
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export function EditorClient({ id, isNew, initialData }: EditorClientProps) {
  const router = useRouter()
  const slugEdited = useRef(Boolean(initialData))

  const [draft, setDraft] = useState<DraftMaterial>(
    initialData ? materialToDraft(initialData) : emptyMaterial()
  )
  const [activeSectionIdx, setActiveSectionIdx] = useState(0)
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [copied, setCopied] = useState(false)

  // ── Derive QR URL safely without set-state-in-effect ──
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const qrUrl = draft.slug && origin ? `${origin}/${draft.slug}` : ''

  // ── Helpers: material-level ──
  function setField<K extends keyof DraftMaterial>(key: K, value: DraftMaterial[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function handleTitleChange(value: string) {
    setDraft((prev) => ({
      ...prev,
      title: value,
      slug: slugEdited.current ? prev.slug : slugify(value),
    }))
  }

  // ── Helpers: section-level ──
  function updateSection(idx: number, updated: DraftSection) {
    setDraft((prev) => {
      const sections = [...prev.sections]
      sections[idx] = updated
      return { ...prev, sections }
    })
  }

  function addSection() {
    const next = emptySection()
    setDraft((prev) => ({ ...prev, sections: [...prev.sections, next] }))
    const newIdx = draft.sections.length
    setActiveSectionIdx(newIdx)
    setExpandedSections(new Set([newIdx]))
  }

  function removeSection(idx: number) {
    if (draft.sections.length <= 1) return
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== idx),
    }))
    setActiveSectionIdx(Math.min(idx, draft.sections.length - 2))
    setExpandedSections((prev) => {
      const next = new Set(prev)
      next.delete(idx)
      return next
    })
  }

  function toggleSection(idx: number) {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
    setActiveSectionIdx(idx)
  }

  // ── Helpers: question-level ──
  function addQuestion(sectionIdx: number) {
    const section = draft.sections[sectionIdx]
    updateSection(sectionIdx, {
      ...section,
      questions: [...section.questions, emptyQuestion()],
    })
  }

  function updateQuestion(sectionIdx: number, qIdx: number, updated: DraftQuestion) {
    const section = draft.sections[sectionIdx]
    const questions = [...section.questions]
    questions[qIdx] = updated
    updateSection(sectionIdx, { ...section, questions })
  }

  function removeQuestion(sectionIdx: number, qIdx: number) {
    const section = draft.sections[sectionIdx]
    updateSection(sectionIdx, {
      ...section,
      questions: section.questions.filter((_, i) => i !== qIdx),
    })
  }

  // ── Save ──
  const handleSave = useCallback(async () => {
    if (!draft.title.trim() || !draft.slug.trim()) {
      setSaveError('Title and slug are required.')
      return
    }
    setSaving(true)
    setSaveError('')

    const payload = {
      id: isNew ? undefined : id,
      title: draft.title,
      slug: draft.slug,
      subtitle: draft.subtitle,
      organization: draft.organization,
      memory_verse: draft.memory_verse,
      sections: draft.sections.map((s) => ({
        title: s.title,
        scripture_reference: s.scripture_reference,
        scripture_text: s.scripture_text,
        summary: s.summary,
        questions: s.questions.map((q) => ({
          prompt: q.prompt,
          type: q.type,
          options: q.options,
          is_required: q.is_required,
        })),
      })),
    }

    try {
      const res = await fetch('/api/guides', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      if (isNew) router.replace(`/admin/editor/${json.id}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }, [draft, id, isNew, router])

  async function copyUrl() {
    if (!qrUrl) return
    await navigator.clipboard.writeText(qrUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadQR() {
    const canvas = document.getElementById('qr-editor') as HTMLCanvasElement
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = url
    link.download = `${draft.slug || 'qr'}-qr.png`
    link.click()
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col lg:flex-row -mx-4 sm:-mx-6 lg:-mx-8 -my-8 min-h-[calc(100vh-3.5rem)]">

      {/* ══ LEFT PANE ═══════════════════════════════════════════════════════ */}
      <aside className="lg:w-[440px] xl:w-[500px] flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-gray-800 overflow-y-auto">

        {/* ── Metadata ── */}
        <section className="p-5 border-b border-gray-800 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Metadata</h2>

          {[
            { id: 'title', label: 'Title *', value: draft.title, onChange: handleTitleChange },
            { id: 'subtitle', label: 'Subtitle', value: draft.subtitle, onChange: (v: string) => setField('subtitle', v) },
            { id: 'organization', label: 'Organization', value: draft.organization, onChange: (v: string) => setField('organization', v) },
          ].map(({ id: fid, label, value, onChange }) => (
            <div key={fid} className="space-y-1">
              <label htmlFor={fid} className="text-xs font-medium text-gray-400">{label}</label>
              <input
                id={fid}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ))}

          {/* Slug */}
          <div className="space-y-1">
            <label htmlFor="slug" className="text-xs font-medium text-gray-400">
              Slug * <span className="font-normal text-gray-600">(public URL path)</span>
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-600 text-sm">/</span>
              <input
                id="slug"
                type="text"
                value={draft.slug}
                onChange={(e) => {
                  slugEdited.current = true
                  setField('slug', slugify(e.target.value))
                }}
                className="flex-1 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-100 font-mono placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Memory verse */}
          <div className="space-y-1">
            <label htmlFor="memory_verse" className="text-xs font-medium text-gray-400">Memory Verse</label>
            <textarea
              id="memory_verse"
              rows={2}
              value={draft.memory_verse}
              onChange={(e) => setField('memory_verse', e.target.value)}
              className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="e.g. John 3:16…"
            />
          </div>
        </section>

        {/* ── Sections accordion ── */}
        <section className="flex-1 flex flex-col p-5 space-y-4 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Sections</h2>
            <button
              type="button"
              onClick={addSection}
              className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add section
            </button>
          </div>

          <div className="space-y-2">
            {draft.sections.map((section, sIdx) => {
              const isExpanded = expandedSections.has(sIdx)
              const isActive = sIdx === activeSectionIdx
              return (
                <div
                  key={section.id}
                  className={`rounded-xl border transition-colors ${isActive ? 'border-indigo-500/50 bg-gray-900' : 'border-gray-800 bg-gray-900/40'}`}
                >
                  {/* Section header */}
                  <div className="flex items-center gap-2 p-3">
                    <button
                      type="button"
                      onClick={() => toggleSection(sIdx)}
                      className="flex-1 flex items-center gap-2 text-left min-w-0"
                    >
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4 text-gray-500 flex-shrink-0" />
                        : <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
                      }
                      <span className={`text-sm font-medium truncate ${isActive ? 'text-gray-100' : 'text-gray-400'}`}>
                        {sIdx + 1}. {section.title || 'Untitled'}
                      </span>
                      <span className="text-xs text-gray-600 flex-shrink-0">
                        {section.questions.length}q
                      </span>
                    </button>
                    {draft.sections.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSection(sIdx)}
                        aria-label={`Remove section ${sIdx + 1}`}
                        className="text-gray-700 hover:text-red-400 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="border-t border-gray-800 p-3 space-y-3">
                      {/* Section title */}
                      <input
                        type="text"
                        value={section.title}
                        onChange={(e) => updateSection(sIdx, { ...section, title: e.target.value })}
                        placeholder="Section title…"
                        className="w-full rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm font-medium text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />

                      {/* Scripture reference */}
                      <input
                        type="text"
                        value={section.scripture_reference}
                        onChange={(e) => updateSection(sIdx, { ...section, scripture_reference: e.target.value })}
                        placeholder="Scripture reference (e.g. John 3:1-21)…"
                        className="w-full rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />

                      {/* Summary */}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500">Summary</label>
                        <textarea
                          rows={3}
                          value={section.summary}
                          onChange={(e) => updateSection(sIdx, { ...section, summary: e.target.value })}
                          placeholder="Brief overview or commentary for this section…"
                          className="w-full rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        />
                      </div>

                      {/* Scripture passage text */}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500">Scripture Passage Text</label>
                        <textarea
                          rows={6}
                          value={section.scripture_text}
                          onChange={(e) => updateSection(sIdx, { ...section, scripture_text: e.target.value })}
                          placeholder="Paste the full scripture passage text here…"
                          className="w-full rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y font-mono text-xs leading-relaxed"
                        />
                      </div>

                      {/* Questions */}
                      <div className="space-y-2">
                        {section.questions.map((q, qIdx) => (
                          <QuestionEditor
                            key={q.id}
                            question={q}
                            onUpdate={(updated) => updateQuestion(sIdx, qIdx, updated)}
                            onRemove={() => removeQuestion(sIdx, qIdx)}
                          />
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => addQuestion(sIdx)}
                        className="w-full rounded-lg border border-dashed border-gray-700 py-2 text-xs text-gray-500 hover:border-indigo-500/50 hover:text-indigo-400 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add question
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* ── QR code ── */}
        {qrUrl && (
          <section className="p-5 border-t border-gray-800 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">QR Code</h2>
            <div className="flex gap-4 items-start">
              <div className="rounded-xl bg-white p-2 flex-shrink-0">
                <QRCodeCanvas id="qr-editor" value={qrUrl} size={88} level="M" aria-label={`QR for ${qrUrl}`} />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-xs text-gray-500 break-all font-mono">{qrUrl}</p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={copyUrl}
                    className="inline-flex items-center gap-1.5 rounded-md bg-gray-800 hover:bg-gray-700 px-2.5 py-1.5 text-xs text-gray-300 transition-colors"
                  >
                    {copied
                      ? <><CheckCheck className="h-3.5 w-3.5 text-green-400" />Copied</>
                      : <><Copy className="h-3.5 w-3.5" />Copy URL</>
                    }
                  </button>
                  <a
                    href={qrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md bg-gray-800 hover:bg-gray-700 px-2.5 py-1.5 text-xs text-gray-300 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </a>
                  <button
                    type="button"
                    onClick={downloadQR}
                    className="inline-flex items-center gap-1.5 rounded-md bg-gray-800 hover:bg-gray-700 px-2.5 py-1.5 text-xs text-gray-300 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Save ── */}
        <div className="p-5 border-t border-gray-800">
          {saveError && (
            <p role="alert" className="text-xs text-red-400 mb-2">{saveError}</p>
          )}
          <button
            id="save-guide-btn"
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Save className="h-4 w-4" aria-hidden />
            {saving ? 'Saving…' : 'Save Guide'}
          </button>
        </div>
      </aside>

      {/* ══ RIGHT PANE — Mobile simulator ════════════════════════════════════ */}
      <div className="flex-1 flex items-center justify-center bg-gray-950/50 p-8">
        <div className="flex flex-col items-center gap-4">
          <p className="text-xs text-gray-600 uppercase tracking-widest font-medium">
            Live Preview
          </p>

          {/* Phone frame */}
          <div
            className="relative rounded-[2.5rem] bg-gray-900 shadow-2xl shadow-black/70 overflow-hidden"
            style={{ width: 320, height: 620 }}
          >
            {/* Notch */}
            <div className="absolute top-0 inset-x-0 flex justify-center z-10 pt-2">
              <div className="h-5 w-24 bg-gray-950 rounded-full" />
            </div>

            {/* Screen */}
            <div className="absolute inset-0 bg-gray-50 overflow-hidden" style={{ top: 20, borderRadius: '2.5rem' }}>
              {/* Flipbook rail */}
              <div className="relative w-full h-full overflow-hidden">
                <div
                  className="flex h-full transition-transform duration-300 ease-in-out"
                  style={{
                    width: `${draft.sections.length * 100}%`,
                    transform: `translateX(-${(activeSectionIdx / draft.sections.length) * 100}%)`,
                  }}
                >
                  {draft.sections.map((section) => (
                    <div
                      key={section.id}
                      className="h-full flex-shrink-0"
                      style={{ width: `${100 / draft.sections.length}%` }}
                    >
                      <SectionPreview section={section} />
                    </div>
                  ))}
                </div>

                {/* Dot indicators */}
                {draft.sections.length > 1 && (
                  <div className="absolute bottom-4 inset-x-0 flex justify-center gap-1.5 z-10">
                    {draft.sections.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        aria-label={`Preview section ${idx + 1}`}
                        onClick={() => setActiveSectionIdx(idx)}
                        className={`rounded-full transition-all ${idx === activeSectionIdx ? 'w-4 h-1.5 bg-indigo-500' : 'w-1.5 h-1.5 bg-gray-400'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom bar */}
            <div className="absolute bottom-2 inset-x-0 flex justify-center">
              <div className="h-1 w-20 bg-gray-700 rounded-full" />
            </div>
          </div>

          {/* Section nav controls */}
          {draft.sections.length > 1 && (
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <button
                type="button"
                onClick={() => setActiveSectionIdx((i) => Math.max(0, i - 1))}
                disabled={activeSectionIdx === 0}
                aria-label="Previous section preview"
                className="disabled:opacity-30 hover:text-gray-200 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span>{activeSectionIdx + 1} / {draft.sections.length}</span>
              <button
                type="button"
                onClick={() => setActiveSectionIdx((i) => Math.min(draft.sections.length - 1, i + 1))}
                disabled={activeSectionIdx === draft.sections.length - 1}
                aria-label="Next section preview"
                className="disabled:opacity-30 hover:text-gray-200 transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
