import { NextRequest, NextResponse } from 'next/server'
import {
  createSignedAdminToken,
  createServerSupabaseClient,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  validateCsrfOrOrigin,
} from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!validateCsrfOrOrigin(request)) {
    return NextResponse.json({ error: 'CSRF / origin mismatch' }, { status: 403 })
  }

  let body: { username?: string; email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 })
  }

  const identity = (body.email || body.username || '').trim()
  const password = body.password || ''

  if (!identity || !password) {
    return NextResponse.json({ error: 'Credentials are required.' }, { status: 400 })
  }

  let authenticated = false

  // 1. Try Supabase Auth password sign-in if an email is provided
  if (identity.includes('@')) {
    try {
      const supabase = await createServerSupabaseClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email: identity,
        password,
      })
      if (!error && data.user) {
        authenticated = true
      }
    } catch {
      // Fall through to configured admin password
    }
  }

  // 2. Check server-configured ADMIN_PASSWORD (or ADMIN_USERNAME/ADMIN_PASSWORD)
  const envAdminUser = process.env.ADMIN_USERNAME || 'admin'
  const envAdminPass = process.env.ADMIN_PASSWORD

  if (envAdminPass) {
    if (identity.toLowerCase() === envAdminUser.toLowerCase() && password === envAdminPass) {
      authenticated = true
    }
  } else if (!authenticated && process.env.NODE_ENV !== 'production') {
    // In local development only, if no ADMIN_PASSWORD is set in env, allow the dev credential
    // while strictly issuing the cryptographic HttpOnly server session (never the forgeable client cookie)
    if (identity.toLowerCase() === 'admin' && password === 'admin123') {
      authenticated = true
    }
  }

  if (!authenticated) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 })
  }

  const token = createSignedAdminToken()
  const response = NextResponse.json({ success: true })

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })

  return response
}

