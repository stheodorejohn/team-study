# Architecture

## Logical boundaries

```text
Admin browser
  └─ Supabase Auth session (HttpOnly cookie via @supabase/ssr)
       └─ Next.js admin pages / Route Handler
            └─ server-side authorization
                 └─ validated transactional publish
                      └─ Supabase (canonical guide content)

Participant browser
  └─ shared /[slug] URL
       └─ Next.js public read-only loader
            └─ cacheable published guide DTO + content_version
                 └─ React viewer
                      ├─ in-memory UI state
                      ├─ IndexedDB answer repository
                      ├─ edit mode / bottom action island
                      └─ print / share (local)
```

## Data ownership
| Data | Owner | Storage |
|---|---|---|
| Guide title/subtitle/organization | Admin | Supabase |
| Sections and scripture metadata | Admin | Supabase |
| Questions/options/order | Admin | Supabase |
| Published version | Server/database | Supabase |
| Current page and edit mode | Participant UI | React state |
| Participant answers | Participant | IndexedDB |
| Local draft/backup metadata | Participant | IndexedDB |
| Admin session | Authentication layer | Secure cookie session |
| Participant session | None | None |

## Public content request lifecycle
1. Validate the slug format.
2. Load only a published guide using a server-side read-only query.
3. Select only fields required by the participant UI.
4. Sort sections/questions deterministically.
5. Return a stable DTO with `guideId`, `slug`, `contentVersion`, and content.
6. Cache by guide/version or tag with a bounded revalidation policy.
7. Invalidate only that guide after a successful publish.
8. Participant reads local answers and reconciles against the DTO. No answer request is sent to the server.

Do not use a service-role client for public reads unless the database policy design requires it. Prefer a narrowly privileged read-only server client or RLS-protected public query. Never expose service-role credentials.

## IndexedDB repository contract
Suggested API (names are illustrative):
- `openStudyDb()`
- `getAnswers(guideId, localProfileId)`
- `putAnswer(guideId, localProfileId, questionId, answer)`
- `putAnswersBatch(records)`
- `clearAnswers(guideId, localProfileId)`
- `getGuideMeta(guideId)`
- `reconcileAnswers(guideId, contentVersion, validQuestionIds)`
- `migrateLocalStorageAnswers(slug, guideId)`

All repository operations are asynchronous and return typed results. Components should not know object-store names or transaction mechanics.

Suggested indexes:
- Answers primary key: compound `[guideId, localProfileId, questionId]`.
- Index: `[guideId, localProfileId]` for loading/clearing a guide's answers.
- Guide metadata primary key: `guideId`.

Keep the database versioned. Use transactions for related writes. Catch `QuotaExceededError`, `AbortError`, blocked upgrades and unavailable storage. Do not silently swallow errors.

## Save lifecycle
- Update React/ref state immediately.
- Queue an IndexedDB write (debounce small text changes; batch where possible).
- Flush on blur, explicit Save, navigation and visibility change.
- Expose `Saving…`, `Saved on this device`, or `Could not save — export your answers`.
- Do not claim persistence until the transaction completes.
- `beforeunload` is not a reliable persistence mechanism; persistence should happen continuously.

## Edit-mode state machine
```text
READING
  └─ Edit action → EDITING
       ├─ disable flip gestures and click-to-turn
       ├─ remove/disable page-turn animation
       ├─ focus field
       ├─ show floating bottom island
       ├─ Previous / Next → change edit target, retain draft
       ├─ Save → commit IndexedDB → READING
       └─ Cancel → restore last saved local value → READING
```

The page-flip component must not own pointer/touch events while `EDITING`. Prefer a stable editor overlay or a non-flipping field surface rather than trying to stop events after the page-flip library has already registered listeners.

## Caching and database-load model
- Cache only public published content.
- Do not cache personalized/admin responses in a shared cache.
- Use a shared loader to avoid duplicate reads in metadata + page render.
- Revalidation is publish-driven; participant answer changes do not revalidate anything.
- Measure actual query count, cache hit ratio and origin reads under load.

## Security boundaries
- Admin route guard is not enough: authorize in each mutation handler.
- Service role is server-only and follows authorization.
- Validate Origin/CSRF for cookie-authenticated writes.
- Validate payload shape, lengths, counts, allowed enum values and request size.
- Use parameterized Supabase query builders / SQL parameters.
- Avoid exposing database error details to clients.
- Public endpoint exposes only published data and only required columns.
