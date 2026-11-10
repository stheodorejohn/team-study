# Resumable Implementation Prompt — Study Guide Architect

You are the implementation agent for this repository. Your task is to audit, secure, improve and complete the existing Next.js study-guide application while preserving its established product flow.

## Mandatory continuation protocol (read first on every run)
Before doing any work, read:
1. `AGENTS.md` and the relevant installed Next.js documentation under `node_modules/next/dist/docs/`.
2. `docs/ai/PROJECT_CONTEXT.md`
3. `docs/ai/DECISIONS.md`
4. `docs/ai/IMPLEMENTATION_STATUS.md`
5. `docs/ai/NEXT_STEPS.md`
6. `docs/ai/ARCHITECTURE.md`
7. `docs/ai/UX_AUDIT.md`
8. `docs/ai/CHANGELOG_AI.md`

Treat these files as the durable project memory. Do not assume previous chat context exists. The work must resume correctly if the model changes, context is truncated, a token expires, the agent restarts, or a different coding model takes over.

At the start of every run:
- Inspect `git status`, recent diff and current branch.
- Read the latest status and changelog.
- Identify the first incomplete item in `NEXT_STEPS.md`.
- Re-check the actual source before trusting any prior status statement.
- Do not repeat completed work.
- Do not overwrite user changes.
- If a previous task is partially complete, finish or safely revert that task before starting another.

At the end of every run:
- Update `IMPLEMENTATION_STATUS.md` with exact completed/incomplete items, files changed, tests run and test outcomes.
- Update `NEXT_STEPS.md` with the single next executable task and any blockers.
- Update `CHANGELOG_AI.md` with date, changes, rationale and validation.
- Update `DECISIONS.md` only when a real architectural decision is made; include context, decision and consequences.
- Update `PROJECT_CONTEXT.md` or `ARCHITECTURE.md` if the implementation materially changes them.
- Leave a clean, reviewable diff. Never claim tests passed unless they were actually run.
- If the task cannot safely continue (missing secrets, schema access, environment, ambiguous destructive migration), stop, document the blocker and ask for only the required input.

## Product invariants — do not violate
- Preserve existing admin dashboard → editor → save/publish → shareable public slug URL flow.
- Preserve public participant experience and flipbook reading mode except where correctness/security requires a change.
- No participant login.
- No participant answer rows, sessions, heartbeats, analytics or answer uploads in Supabase.
- Participant answers and drafts live in IndexedDB in the participant's browser/device.
- Supabase remains canonical storage for published guide content.
- No per-keystroke, per-page, per-navigation or per-participant database calls.
- Service-role credentials must never reach client bundles or public env vars.
- Every admin mutation must independently verify a real admin identity server-side.
- Editing a field must not cause a flip animation or page-turn gesture.
- Do not add heavy dependencies or global state libraries without a demonstrated need.
- Do not change routes, schema, package versions or deployment configuration without documenting why.

## Phase execution order
Follow `docs/ai/NEXT_STEPS.md` strictly: P0 security, P1 transactional writes, P2 public caching, P3 IndexedDB, P4 edit-mode UX, P5 quality/release. Do not start a later phase while a blocking Critical/High issue remains.

### P0 Security
- Remove mock credentials and predictable cookie.
- Use supported Supabase SSR auth with cookie refresh flow appropriate to installed Next.js 16 and `@supabase/ssr` versions.
- Verify claims/user server-side on every protected operation.
- Protect admin pages and API handlers independently.
- Restrict admin identity/role.
- Add CSRF/origin validation to cookie-authenticated mutations.
- Keep service-role client in server-only modules; enforce with `server-only` where appropriate.
- Review Supabase RLS and public read policy. Never guess the production schema or claim RLS is safe without evidence.
- Add tests proving forged cookies and unauthenticated requests fail.

### P1 Data integrity
- Add runtime validation, request-size and field/count limits.
- Use one PostgreSQL transaction for parent/section/question publish or update.
- Handle every database error.
- Add optimistic concurrency using content version.
- Test rollback by injecting a child insert failure.

### P2 Public read scalability
- Use one shared content loader for metadata and page.
- Cache only public published DTOs; use explicit version/tag invalidation after publish.
- Never share-cache authenticated/admin responses.
- Avoid duplicate database reads for metadata and page in one render.
- Do not add participant-specific backend state.

### P3 IndexedDB
- Build a typed, versioned repository abstraction; no direct IndexedDB access inside UI components.
- Keep immediate UI state in memory; asynchronously persist local answers.
- Hydrate before uncontrolled fields mount or deliberately synchronize controls after hydration.
- Migrate localStorage once, idempotently; delete old keys only after successful IndexedDB commit.
- Handle storage quota, blocked upgrades, transaction abort and unavailable storage visibly.
- Reconcile old/new content versions without silently discarding answers.
- Test offline reload and migration.
- Keep all answer writes local.

### P4 Edit-mode UX
Implement the requested field-edit behavior:
- Edit icon next to answer field.
- On click, enter explicit edit state and focus the field.
- Suspend page-flip gestures, click navigation and page-turn animation for the entire edit state.
- Do not use propagation hacks as the primary design.
- Show a compact floating bottom island with Previous, Next and Save (plus accessible Close/Cancel where needed).
- Previous/Next changes active edit target without triggering page flipping and preserves drafts.
- Save commits IndexedDB and announces “Saved on this device”.
- Restore reading gestures only after exiting edit mode.
- Handle mobile keyboard/safe-area overlap and reduced motion.
- Verify touch, pointer, mouse, keyboard, screen reader and mobile scrolling.

## Engineering requirements
- Read the actual Next.js docs matching the installed version before using APIs. This repository explicitly warns that Next.js APIs may differ.
- Use existing dependencies where reasonable. If adding a dependency, justify bundle/security/maintenance impact and update lockfile.
- Keep TypeScript strict; avoid `any`, unsafe casts and swallowed exceptions.
- Use server-only boundaries for privileged modules.
- Do not expose raw Supabase errors or secrets to public clients.
- Add tests alongside behavior; prefer stable semantic selectors and accessible roles.
- Avoid `console.log` in production.
- Do not make arbitrary visual redesigns. Reduce cognitive load and retain the product's visual identity.
- Keep server/client component boundaries deliberate; minimize client bundle and client-side secrets.
- Ensure cache invalidation follows successful transaction commit only.

## Validation commands
Run the scripts that exist in `package.json`, at minimum:
- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
- tests (add a test script/framework only with justification)

If dependencies are not installed or env vars are unavailable, document that limitation; do not fabricate successful results. Do not run destructive migrations against production.

## Definition of done
- No forgeable admin cookie or hardcoded credentials.
- All admin writes authenticated, authorized, CSRF-protected, validated and transactional.
- Public guide delivery is cacheable/versioned without leaking admin data.
- Public participant open does not create a database participant record.
- Participant interactions produce zero Supabase writes.
- Answers persist in IndexedDB across reloads and offline sessions, with visible failure handling.
- Edit mode cannot flip pages; floating Previous/Next/Save controls work on touch and keyboard.
- Existing guide creation, publishing, share URL, QR, reading, scripture drawer and print flows still work.
- Automated checks pass and docs reflect actual implementation.

## Output discipline
Work in small commits or reviewable batches. After each phase, summarize:
- Files changed
- Security/scalability/UX outcome
- Tests run and exact results
- Remaining risks
- Next task

Never mark a phase complete based only on code inspection. Require implementation plus tests.
