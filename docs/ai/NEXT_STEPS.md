# Next Steps

Execute in small, verifiable phases. Preserve existing routes and user journeys unless a change is required for security or correctness.

## P0 — Contain security exposure
1. Disable the mock login and remove all references to `admin/admin123`, `admin_active`, and the forgeable `auth_token`.
2. Implement Supabase Auth with `@supabase/ssr` using separate browser/server clients and Next.js 16 `proxy.ts` session refresh as prescribed by the installed/current package docs.
3. Verify the admin identity on the server (`getClaims()` or `getUser()` as appropriate); never trust a client-side user object or an unverified cookie.
4. Protect every admin page and every mutation endpoint independently. Layout redirects are UX, not API authorization.
5. Restrict admin access by an explicit allowlist/role claim. Keep service-role operations server-only and only after authorization.
6. Add CSRF/origin protection to cookie-authenticated mutations; reject unexpected Origin/Host, require JSON/custom request headers as appropriate, and use secure cookie settings.
7. Rotate any credentials that may have been deployed. Do not put secrets in docs, source, client env variables, or logs.

**Stop condition:** Do not deploy or expose admin functionality until P0 is complete.

## P1 — Make writes safe
1. Validate request bodies with a schema validator (or equivalent explicit runtime validation), enforce payload limits and per-field length/count limits.
2. Validate slug format and uniqueness; reject unknown question types and malformed options.
3. Replace the multi-request destructive PUT with one PostgreSQL function/RPC transaction. Validate all input before mutation; update parent and replace child rows in one transaction.
4. Check and handle every Supabase error. Do not return raw database error details to public clients.
5. Add optimistic concurrency (`updated_at` or integer `content_version`) to prevent one admin tab overwriting another.
6. Add database constraints and indexes: unique `study_materials.slug`, foreign keys with deliberate delete behavior, and indexes on `study_sections.study_id`, `questions.section_id`, plus sort columns where justified.
7. Review RLS for all tables. Public reads should expose only published content; service-role bypass must remain server-only.

## P2 — Public content delivery and database load
1. Create one shared server-side loader used by both `generateMetadata` and the route page. Use React request memoization / Next-supported caching for duplicate calls in a render.
2. Replace blanket `force-dynamic` only after verifying the public data is truly public and the cache invalidation model is correct.
3. Use a published content version and an explicit cache tag/key per guide. Revalidate only the affected guide after a successful publish.
4. Return a minimal public DTO (only fields required by the viewer); do not send internal admin fields.
5. Do not create participant rows, sessions, analytics writes, heartbeats, or answer writes in Supabase.
6. Measure database reads under concurrent opens. A CDN/cache hit should not create a database query per participant when the content is unchanged.

## P3 — IndexedDB participant storage
1. Introduce a small typed repository module with a versioned IndexedDB schema. Avoid putting IndexedDB calls directly in components.
2. Suggested object stores:
   - `guideMeta`: key `[guideId]`, content version and last opened timestamp.
   - `answers`: key `[guideId, localParticipantKey, questionId]`, value, updated timestamp, question/content version.
   - `drafts` (optional): larger draft payloads if needed.
3. Use a random, browser-local participant key only to partition local profiles on the same device. It is not an identity or server session.
4. Use async transactions, catch `QuotaExceededError`, expose a visible save status, and never silently claim data is saved if persistence failed.
5. Debounce/batch writes (e.g. 250–500 ms) while updating in-memory state immediately. Flush pending writes on blur, page transition and `visibilitychange`; do not rely only on `beforeunload`.
6. Hydrate before mounting uncontrolled form fields. Prefer controlled values where practical; if uncontrolled is retained for flipbook performance, gate rendering until hydration completes and update inputs deliberately.
7. Migrate existing localStorage answer records once, validate the payload, write to IndexedDB, and only remove the old key after successful commit. Migration must be idempotent.
8. Keep a schema version and migration tests. Handle browser storage denial and eviction gracefully.
9. Offer export/import of local answers as a user-controlled backup if data-loss impact warrants it. Never upload automatically.

## P4 — Edit mode and gesture isolation
1. Introduce an explicit `isEditing` state at the active field/page level.
2. Add a visible edit icon button adjacent to the answer field (not inside the input hit target). Use accessible name such as “Edit answer”.
3. When edit mode opens:
   - Disable page-flip gesture handling and click-to-flip navigation.
   - Disable the flipbook animation for this state or render a stable non-flipping editing surface.
   - Focus the field and show the floating bottom action island.
4. The island contains Previous, Next, Save, and a clear close/cancel action if needed. Save persists locally to IndexedDB; it must not call Supabase.
5. Previous/Next inside edit mode should navigate fields/pages without starting a page-turn animation. Preserve unsaved draft state when moving between fields.
6. On Save, commit the local draft, show “Saved on this device”, exit edit mode and restore page gestures.
7. Do not attach global touch listeners to form containers. Prefer gesture ownership at a dedicated page-turn surface. Use pointer/touch cancellation and axis thresholds only on that surface.
8. Inputs, textareas, selects, labels, buttons, links and scrollable areas must never be interpreted as page-turn gestures.
9. On mobile, use `touch-action: pan-y` for vertical reading/scroll areas and a dedicated horizontal navigation gesture area only when not editing.
10. Respect reduced-motion preferences and keyboard navigation.

## P5 — Quality and release
- Add unit tests for IndexedDB repository, migrations, content-version reconciliation and validation.
- Add integration tests for login/session expiry, unauthorized API requests, CSRF rejection, transactional rollback and public cache invalidation.
- Add browser tests for public open with zero participant writes, answer save/reload/offline, edit mode, no flip while typing, floating island controls, print/export and storage failure.
- Run `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`, and the test suite.
- Run dependency audit and review lockfile changes. Do not run automated dependency upgrades blindly.
- Verify no service-role key or admin secret appears in client bundles, source maps, logs or public environment variables.
- Load test public guide opens and compare database query counts before/after caching.
