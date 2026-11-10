import { NextRequest, NextResponse } from 'next/server'
import {
  createServerSupabaseClient,
  SESSION_COOKIE_NAME,
  validateCsrfOrOrigin,
} from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!validateCsrfOrOrigin(request)) {
    return NextResponse.json({ error: 'CSRF / origin mismatch' }, { status: 403 })
  }

  try {
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()
  } catch {
    // Ignore signout error if session was already expired
  }

  const response = NextResponse.json({ success: true })
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}

