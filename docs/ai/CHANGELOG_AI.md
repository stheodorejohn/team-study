# AI Change Log

## 2026-11-10 — Overhaul Edit Mode UI and Question Affordance in FlipBookViewer
- **Intuitive Question Card States:**
  - **Active Editing State:** Distinct 2px indigo border (`border-2 border-indigo-500`), subtle ring (`ring-4 ring-indigo-500/10`), elevation shadow, active `[ ● Editing ]` pill with pulsing dot, and high-contrast focused textarea.
  - **Inline Action Buttons:** Placed `Cancel` and `Save Answer` buttons directly beneath the active textarea so participants can save immediately without searching across the screen.
  - **Answered Preview State:** Completed answers now render as clean formatted workbook entries with `✓ Saved` status, `Click to edit →`, and an explicit `[✏️ Edit]` button.
  - **Empty Unanswered State:** Unanswered prompts display an inviting dashed placeholder with an explicit `[✏️ Add answer]` button.
  - **Focus Isolation:** Non-active questions gently dim (`opacity-40`) while another question is in edit mode.
- **Fixed Floating Island Overlap & Hierarchy:**
  - Increased bottom scroll padding from `pb-12` (48px) to `pb-48` (192px) in `QuestionsPageContent`, ensuring the bottom-most question can scroll completely above the floating island with no obstruction.
  - Streamlined floating island into a sleek, single-line dock displaying the exact question being edited: `Editing Question {N} · Page turning paused so you can type`, along with `Cancel` and `Save Answer`.
  - Added `pointer-events-none` on outer wrapper to allow taps outside the dock to pass cleanly through to the page.
- **Validation:**
  - Passed `pnpm exec tsc --noEmit` (0 errors).
  - Passed `pnpm lint` (0 errors).
  - Passed `pnpm build` (all static & dynamic routes compiled cleanly).

## 2026-11-10 — Fix edit mode typing visibility in FlipBookViewer
- Fixed issue where typing in `AutoTextarea` was not visible:
  - `HTMLFlipBook` has `renderOnlyPageLengthChange={true}` which prevented new child props from propagating when state changed on keystroke, causing controlled inputs to be reset back to empty strings.
  - Converted `AutoTextarea` to an uncontrolled textarea using `defaultValue` with native DOM change management and external sync on hydration.
  - Updated `handleStringAnswer` and `handleCheckboxToggle` to store keystrokes immediately in `answersRef.current` with debounced IndexedDB persistence, avoiding full flipbook re-renders on every keystroke.
  - Added auto-scroll into view when entering edit mode and added `onFocus` trigger on textareas.
  - Verified `pnpm exec tsc --noEmit` (0 errors), `pnpm lint` (0 errors), and `pnpm build` (clean build).

## 2026-11-10 — Remediation of audit findings (P0 - P4)
- **P0 Security:**
  - Implemented `lib/auth.ts` providing cryptographic HMAC-SHA256 signed HttpOnly cookie sessions and Supabase SSR auth verification (`verifyAdminSession`).
  - Added `app/api/auth/login/route.ts` and `app/api/auth/logout/route.ts` with CSRF/origin checks (`validateCsrfOrOrigin`).
  - Replaced client-side forgeable `auth_token=admin_active` with secure credentials verification in `app/login/page.tsx`.
  - Added independent server-side authorization checks in `app/admin/layout.tsx`, `app/admin/page.tsx`, and `app/admin/editor/[id]/page.tsx`.
  - Replaced legacy `<a>` links with `<Link>` and added a secure signout action in the admin header.
- **P1 Data Integrity:**
  - Added input validation in `app/api/guides/route.ts` for title, slug regex, payload bounds, and allowed question types.
  - Replaced destructive section deletion with safe insertion of new sections before cleaning up obsolete IDs, preventing partial failure data loss.
  - Added slug conflict detection for both POST and PUT endpoints.
- **P2 Public Scalability & Caching:**
  - Wrapped `getStudyMaterial` in `app/[slug]/page.tsx` with `React.cache()` to deduplicate reads between `generateMetadata` and page component.
  - Removed `export const dynamic = 'force-dynamic'`, added 5-minute ISR revalidation, and integrated on-demand `revalidatePath` on guide mutations.
- **P3 IndexedDB Participant Storage:**
  - Built `lib/studyDb.ts` native IndexedDB repository with versioned object stores (`answers`, `guideMeta`), batched writes, and idempotent migration from legacy `localStorage`.
  - Updated both `FlipBookViewer.tsx` and `StudyGuideViewer.tsx` to read and write from IndexedDB.
  - Fixed hydration race condition by gating flipbook mounting on `isHydrated` and synchronizing controlled form fields.
- **P4 Edit-mode UX & Gesture Isolation:**
  - Implemented explicit edit state (`editingQuestionId`) in `FlipBookViewer.tsx` with edit icon (pencil) next to each question prompt.
  - Added floating bottom action island with Previous, Next, Save, and Close controls.
  - Suspended page-flip gestures and edge page-turn clicks during active editing.
  - Added "Saved on this device" feedback notification upon committing answers to IndexedDB.
  - Fixed React 19 ESLint render-phase ref access errors in `FlipBookViewer.tsx`, `ScriptureModal.tsx`, and `EditorClient.tsx`.
- **Validation:**
  - Passed `pnpm exec tsc --noEmit` (clean 0 exit).
  - Passed `pnpm lint` (clean 0 exit, 0 errors, 0 warnings).
  - Passed `pnpm build` (all routes built and optimized).

## 2026-11-10 — Initial repository audit and handoff documentation
- Inspected uploaded source archive and identified Next.js 16 / React 19 / Supabase application boundaries.
- Documented critical mock-admin-auth flaw: literal cookie can be forged and protects service-role operations.
- Documented missing CSRF/origin protections on cookie-authenticated guide mutations.
- Documented destructive non-transactional guide update sequence.
- Documented forced-dynamic public route and duplicate metadata/page content fetch opportunity.
- Documented localStorage persistence in both participant viewers, hydration risk for uncontrolled fields, and missing IndexedDB repository.
- Documented edit-mode UX requirement and gesture isolation design.
- Added resumable execution protocol and architecture decisions.
