# Architecture Decisions

Record decisions here. New agents must read this file before changing architecture.

## ADR-001 — Participant answers are device-local
**Decision:** Store participant answers in IndexedDB on the participant's browser/device. Do not persist them to Supabase.

**Reason:** Privacy, low database load, offline behavior and no participant-account requirement.

**Trade-off:** No automatic cross-device synchronization; browser data can be cleared/evicted. Provide clear local-save status and consider export/import backup.

## ADR-002 — Supabase is the source of truth for published guide content
**Decision:** Admin content is persisted in Supabase. Public participants receive a read-only published DTO.

**Reason:** Central administration and a single canonical content version.

**Trade-off:** Public content must be cached/invalidation-aware. A content version is required to reconcile local answers.

## ADR-003 — No database work per participant interaction
**Decision:** Page navigation, typing, answer changes, font/theme controls, local reset, print and share are client-only operations.

**Reason:** These are user interactions, not server state changes.

## ADR-004 — Admin authorization is server-verified
**Decision:** Replace mock credentials and predictable cookies with Supabase Auth using `@supabase/ssr` cookie-based sessions (or another reviewed auth library). Verify identity/claims on the server for every protected operation.

**Reason:** Current literal cookie can be forged and gates access to service-role operations.

## ADR-005 — Guide publish/update is transactional
**Decision:** A single database transaction (e.g. PostgreSQL function/RPC) applies parent, sections and questions together. Use optimistic concurrency.

**Reason:** Avoid partially deleted or partially recreated published guides.

## ADR-006 — Explicit edit mode suspends page flipping
**Decision:** Editing is a separate interaction state. Disable flip gestures and flip animation while editing. A floating bottom action island offers Previous, Next and Save.

**Reason:** Text selection, keyboard use and touch scrolling must not trigger page turns.

## ADR-007 — Keep the current product flow and avoid unnecessary dependencies
**Decision:** Prefer native IndexedDB APIs behind a typed repository unless the project explicitly chooses a small, maintained wrapper. Do not add global state tooling unless measurements show a need.

**Reason:** Smaller dependency surface and easier long-term maintenance.

## ADR-008 — Public caching is versioned and explicit
**Decision:** Cache only published public content. Revalidate a guide when it is successfully published; never cache admin/session responses as public content.

**Reason:** Reduce database reads without leaking authenticated content or serving stale guide content indefinitely.
