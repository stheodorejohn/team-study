/**
 * This route no longer serves the login UI.
 * The login page has moved to /login (app/login/page.tsx).
 *
 * Visitors to /admin/login without a valid cookie will be redirected to
 * /login automatically by app/admin/layout.tsx before this page renders.
 */
export default function OldLoginStub() {
  // Unreachable without admin_token cookie — layout redirects first.
  return null
}
