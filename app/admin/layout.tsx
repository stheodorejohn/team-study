import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const ADMIN_COOKIE_NAME = 'auth_token'
const ADMIN_TOKEN_VALUE = 'admin_active'

/**
 * Admin layout.
 *
 * Reads the `auth_token` cookie from the request.  If it doesn't match the
 * expected value the user is redirected to /login.
 *
 * IMPORTANT: The login page lives at app/login/ (NOT app/admin/login/) so
 * this layout does NOT wrap it — that would cause an infinite redirect loop.
 *
 * NOTE: This is intentional mock auth for development.  Replace with a real
 * auth strategy (e.g. Supabase Auth + middleware) before deploying to
 * production.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_COOKIE_NAME)

  if (!token || token.value !== ADMIN_TOKEN_VALUE) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top navigation bar */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <a
            href="/admin"
            className="flex items-center gap-2 font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {/* Book icon rendered with SVG so we don't need an extra import */}
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
          </a>

          <nav className="flex items-center gap-4 text-sm">
            <a
              href="/admin"
              className="text-gray-400 hover:text-gray-100 transition-colors"
            >
              Dashboard
            </a>
            <a
              href="/admin/editor/new"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-white text-xs font-medium hover:bg-indigo-500 transition-colors"
            >
              + New Discussion
            </a>
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
