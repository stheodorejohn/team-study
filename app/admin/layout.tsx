import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyAdminSession } from '@/lib/auth'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isAuthenticated = await verifyAdminSession()

  if (!isAuthenticated) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top navigation bar */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <Link
            href="/admin"
            className="flex items-center gap-2 font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {/* Book icon rendered with SVG */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
              />
            </svg>
            Study Guide Architect
          </Link>

          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/admin"
              className="text-gray-400 hover:text-gray-100 transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/admin/editor/new"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-white text-xs font-medium hover:bg-indigo-500 transition-colors"
            >
              + New Discussion
            </Link>
            <form action="/api/auth/logout" method="POST" className="inline">
              <button
                type="submit"
                className="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
