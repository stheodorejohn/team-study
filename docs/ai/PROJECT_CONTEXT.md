# Project Context

## Product purpose
A mobile-first study-guide/discussion application. Administrators create structured guides; participants open a shareable URL and read/answer locally in their browser. No participant account is required.

## Existing application flow to preserve
1. Admin authenticates.
2. Admin dashboard lists guides.
3. Admin creates or edits a guide containing metadata, sections, scripture references/text, summaries and questions.
4. Admin saves/publishes the guide.
5. Each guide has a public slug URL and share/QR affordances.
6. Participant opens the public URL, reads the flipbook, answers questions, navigates sections/pages and may print/share.
7. Participant answers remain on that participant's browser/device. They are not sent to Supabase.

## Current stack observed in package.json
- Next.js 16.3.5 App Router
- React / React DOM 19.2.8
- TypeScript 5, strict mode
- Supabase JS 2.116.0
- `@supabase/ssr` 0.12.7
- `react-pageflip` 2.0.3
- Tailwind CSS 4
- lucide-react
- qrcode.react
- html-to-image

Package versions are the versions declared in the uploaded package manifest; confirm the lockfile and installed package docs before changing APIs.

## Important source paths
- `app/[slug]/page.tsx`: public server route and content fetch.
- `app/[slug]/BookWrapper.tsx`: chooses/wraps public viewer.
- `app/[slug]/FlipBookViewer.tsx`: page-flip participant experience, uncontrolled inputs and localStorage persistence.
- `app/[slug]/StudyGuideViewer.tsx`: alternate horizontal section viewer and localStorage persistence.
- `app/api/guides/route.ts`: admin create/update endpoint.
- `app/admin/layout.tsx`: admin route layout guard.
- `app/admin/page.tsx`: admin dashboard.
- `app/admin/editor/[id]/EditorClient.tsx`: authoring UI.
- `app/login/page.tsx`: current mock login; must be replaced.
- `lib/supabase.ts`: browser anon client, server service-role client and data types.
- `components/ScriptureModal.tsx`: scripture bottom drawer.
- `app/globals.css`: print rules.

## Product invariants
- Do not change public URL shape or admin/editor workflow without a compelling reason.
- No participant authentication.
- No participant answer writes, analytics events, per-participant sessions or heartbeats in Supabase.
- Admin content writes only after verified admin authorization.
- The service-role key is never sent to the browser.
- Preserve the flipbook reading experience for non-edit mode.
- Editing a field must never flip the page.
- Local answers survive reloads and should remain available offline after the guide has been opened.
- A guide content update must not silently discard answers to removed/changed questions.
- Make persistence status clear to the participant.
- Keep UI focused, readable, keyboard accessible and comfortable on touch devices.

## Non-goals unless explicitly requested
- Cross-device answer sync.
- Participant accounts.
- Cloud backup of participant answers.
- Realtime subscriptions for public participants.
- A database row per participant or per answer.
- Introducing a large state-management library solely for this feature.
