import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Study Guide Architect',
  description:
    'Create interactive, QR-linked study guides that students can fill in on their phones and print as PDFs.',
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Hero ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        {/* Icon */}
        <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-indigo-100 border border-indigo-200">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-9 w-9 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.6}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
            />
          </svg>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight max-w-2xl">
          Study Guide{' '}
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            Architect
          </span>
        </h1>

        <p className="mt-4 text-lg text-gray-600 max-w-xl leading-relaxed">
          Build interactive, QR-linked study guides that students open on their
          phone, fill in, and print as a PDF — no app install required.
        </p>

        {/* CTA buttons */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link
            id="go-to-admin"
            href="/admin"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition-colors px-6 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-600/20"
          >
            Open Dashboard
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>

        {/* Feature chips */}
        <div className="mt-14 flex flex-wrap justify-center gap-3">
          {[
            '📱 Mobile flipbook',
            '✏️ Auto-expanding fields',
            '🔗 QR code sharing',
            '🖨️ PDF print export',
            '⚡ Supabase backend',
          ].map((feat) => (
            <span
              key={feat}
              className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm text-gray-600"
            >
              {feat}
            </span>
          ))}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="py-6 text-center text-xs text-gray-500">
        Fellowship Study · Study Guide Architect
      </footer>
    </div>
  )
}
