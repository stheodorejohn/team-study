import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'
import { createServerClient } from '@supabase/ssr'

const SESSION_COOKIE_NAME = 'study_admin_session'
const SESSION_MAX_AGE = 8 * 60 * 60 // 8 hours in seconds

function getSecretKey(): string {
  const secret = process.env.ADMIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error('Missing ADMIN_SECRET or SUPABASE_SERVICE_ROLE_KEY for admin authentication.')
  }
  return secret
}

/**
 * Creates a cryptographically signed HMAC token: timestamp.signature
 */
export function createSignedAdminToken(): string {
  const secret = getSecretKey()
  const timestamp = Date.now().toString()
  const signature = createHmac('sha256', secret).update(`admin:${timestamp}`).digest('hex')
  return `${timestamp}.${signature}`
}

/**
 * Validates the cryptographically signed admin token.
 */
export function verifySignedAdminToken(token: string | undefined | null): boolean {
  if (!token) return false
  const [timestampStr, signature] = token.split('.')
  if (!timestampStr || !signature) return false

  const timestamp = parseInt(timestampStr, 10)
  if (isNaN(timestamp)) return false

  // Check token age (max 8 hours)
  const age = (Date.now() - timestamp) / 1000
  if (age < 0 || age > SESSION_MAX_AGE) return false

  try {
    const secret = getSecretKey()
    const expectedSignature = createHmac('sha256', secret).update(`admin:${timestampStr}`).digest('hex')
    const sigBuf = Buffer.from(signature, 'hex')
    const expBuf = Buffer.from(expectedSignature, 'hex')
    if (sigBuf.length !== expBuf.length) return false
    return timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

/**
 * Creates a Supabase SSR client for server contexts (Route Handlers, Server Components).
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') ?? ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // May be called in a Server Component where setting cookies is disallowed
        }
      },
    },
  })
}

/**
 * Verifies admin identity server-side:
 * 1. Checks for a valid Supabase Auth user.
 * 2. Checks for a valid HMAC-signed session cookie.
 */
export async function verifyAdminSession(): Promise<boolean> {
  const cookieStore = await cookies()

  // 1. Check signed HMAC session cookie
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (sessionCookie && verifySignedAdminToken(sessionCookie)) {
    return true
  }

  // 2. Check Supabase Auth session via SSR
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      return true
    }
  } catch {
    // Supabase auth check failed or unavailable
  }

  return false
}

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE }

/**
 * Validates request origin against the Host header for CSRF protection on mutating methods.
 */
export function validateCsrfOrOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')

  if (!origin) {
    // Non-browser or same-origin requests without origin header: check fetch-site / referer
    const fetchSite = request.headers.get('sec-fetch-site')
    if (fetchSite === 'cross-site') return false
    return true
  }

  try {
    const originUrl = new URL(origin)
    if (host && originUrl.host !== host) {
      return false
    }
  } catch {
    return false
  }

  return true
}

