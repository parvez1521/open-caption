# Feature inventory — Captionit.in (discovery, Phase 1)

- Worktree: `~/workspace/oc-overnight-qa`, branch `qa/captionit-full-audit-fixes`, base main @ `b32c36a`.
- Every feature below: testing status **not yet tested**. This file maps what the code says each feature is and does. Nothing here claims a feature works.
- Counts carry their source file and line. No number is invented.
- Short sentences throughout, per the owner's reply style.

## Verified counts

| Count | Value | Source |
|---|---|---|
| Caption looks in the gallery | 150 | `packages/templates/src/looks/numbers.ts` — `LOOK_NUMBER_ORDER` has 178 entries; `RETIRED_LOOK_NUMBERS` has 28 entries; `LOOKS` in `packages/templates/src/registry.ts` (line ~173) = numbered looks minus retired = 150. Homepage, ToolDoors, and HowItWorks copy all say "150 looks". `registry.test.ts` line 29 asserts the same formula. |
| Motion templates | 46 | `packages/motion/src/registry.ts` — `MOTION_TEMPLATES` built from 46 `entry({...})` calls; `packages/motion/src/registry.test.ts` line 47 asserts `toHaveLength(46)`. 19 categories (`MOTION_CATEGORIES`). 14 featured (`featured: true` count in registry). |
| Transcription languages | 14 | `apps/frontend/src/features/transcribe/runtime.ts` lines 266-280 — `SHIPPED_LANGUAGES`: en, hinglish (gated by `HINGLISH_AVAILABLE`, line 81, on unless `NEXT_PUBLIC_HINGLISH_DISABLED=1`), hindi, tamil, telugu, bengali, marathi, punjabi, urdu, spanish, french, german, arabic, portuguese = 14. Homepage and TranscribeSection copy both say 14. |
| Plan limits | See plans table below | `packages/shared/src/plans.ts` |
| Sitemap URLs | 12 | `apps/frontend/src/lib/seo.ts` `INDEXABLE_PATHS`; live `/sitemap.xml` verified with 12 `<loc>` entries. |
| Pages | 39 | `find apps/frontend/src/app -name page.tsx` (parent brief said 38; the 39th is `/create/chat`). |
| API routes | 60 | `find apps/frontend/src/app/api -name route.ts` (parent brief said 63; the worktree holds 60). |

### Plans — `packages/shared/src/plans.ts`

Plan ids are `free | starter | growth | pro`. Display name for `growth` is "Plus" (renamed 2026-11-11; the id stays `growth` because it is the billing/webhook identity). Paid plans are 30-day passes (`PLAN_PERIOD_DAYS = 30`); no auto-renew. Prices: Free ₹0/$0; Starter ₹299/$4; Plus ₹499/$6; Pro ₹799/$10. Currency rule: India sees INR, elsewhere USD; never both together.

| Plan | maxUploadBytes | maxLocalBytes | maxDurationSec | cloudAsrMinutesPerMonth | exportRetentionDays | maxProjects |
|---|---|---|---|---|---|---|
| Free | 50 MB | 2 GB | 5 min (300s) | 30 | 7 | 10 |
| Starter | 200 MB | 4 GB | 30 min | 120 | 30 | 50 |
| Plus (`growth`) | 500 MB | 8 GB | 1 hour | 300 | 60 | 200 |
| Pro | 2 GB | 8 GB | 3 hours | 600 | 60 | 1,000 |

Notes from the file: no editor feature is paywalled; paid plans buy headroom only. Limits are enforced server-side (project count in the projects route, upload size + duration in the videos route, export retention in the exports route). `effectivePlanId()` treats an expired paid plan as free. Monthly video quotas (Free 3 / Starter 10 / Plus 20 / Pro 40) are NOT in this worktree at `b32c36a` — grep for `quota` in `plans.ts` and `lib/billing/` finds nothing except the word "quota" in a storage comment. That quota work lives on another branch; do not expect it here.

---

## 1. Homepage + hero

- URL: `/`. Purpose: marketing landing page and front door.
- User input: none, except clicks on CTAs and the draggable looks cylinder.
- Expected behavior: loader curtain, then hero with headline, "Start free" CTA (`/start?choose=1`), looks anchor, and a rotating 3D cylinder of trending looks (`HeroCylinder`, drag to spin). Hinglish claim chip: "95% Hinglish caption accurate" — owner's words, framed as a claim.
- Sections, in order: Nav, Hero, ToolDoors, HowItWorks, TranscribeSection, MotionStudioSection, AiEditSection, Control, #looks showcase (`SpatialScroll`, lazy-mounted), Privacy, Faq, ClosingCta, Footer. `ClipperSection` exists in code but is not rendered (owner order 2026-11-13).
- Related API calls: none on load (model prefetch only on real "Start free" click, `warmModel` in `Sections.tsx`).
- Output format: static marketing page; JSON-LD `SoftwareApplication` + `FAQPage`.
- Dependencies: GSAP + Lenis scroll choreography, `SpatialScroll` showcase.
- Testing status: not yet tested.

## 2. Start-for-free flow

- URL: `/start` (doors: `/start?mode=captions`, `?mode=editor`, `?mode=ai-edit`; chooser: `/start?choose=1`).
- Purpose: route every visitor to the right next step.
- User input: optional door choice.
- Expected behavior (from `apps/frontend/src/app/start/page.tsx`):
  - Signed-in: move any pending guest project over, then go to the saved `after` destination, else `/onboarding` if the survey is not done, else `/dashboard`.
  - Returning guest: straight to their latest project (or the chooser when `?choose=1`).
  - Brand-new visitor: login first — `/login?mode=signup`. No guest session is created on this path.
  - Browser that held a real account before: `/login`.
  - An explicit `?mode=` creates a project and routes to `/projects/<id>?mode=<mode>`.
- Related API calls: `GET /api/v1/projects` (list), `POST /api/v1/projects` (create), `POST /api/v1/guest/claim` (pending guest move).
- Output format: a project in the Studio, or the login/onboarding/dashboard page.
- Dependencies: Supabase auth, guest-session service (`services/auth/guest.ts`).
- Testing status: not yet tested.

## 3. Google sign-in (GIS button + OAuth fallback)

- URL: `/login` (also `/login?mode=signup`, `?email=...`).
- Purpose: sign in or create an account with Google; email sign-in for existing email accounts.
- User input: Google account chooser tap, or email + password.
- Expected behavior (from `apps/frontend/src/app/login/page.tsx`):
  - Google is the only way to create an account. "Sign in with email" is a small link for people who already made an email account.
  - GIS (Google Identity Services) button renders when enabled; states are `checking` / `gis` / `oauth`. If GIS fails or no client id is set, the older Supabase OAuth button stays.
  - GIS button renders in both modes (google branch and below the email form).
  - No Supabase backend connected: Google/email sign-in cannot work (page shows a notice).
- Related API calls: Supabase auth (GIS id-token flow via `services/auth/googleIdToken.ts`, `renderGoogleSignInButton`); no app API route.
- Output format: signed-in session; redirect to the `redirect` param or `/start`.
- Dependencies: Google client id env, Supabase.
- Testing status: not yet tested. Owner GIS sign-in was proven live 2026-11-14 ~01:02 IST on the deployed site; this worktree was not re-proven here.

## 4. Email login

- URL: `/login` (email mode), `/forgot-password`, `/reset-password`.
- Purpose: sign in with email + password; recover a forgotten password.
- User input: email, password; new password on reset.
- Expected behavior: email form validates format and non-empty password, then `authService.login`. Forgot sends a reset email (`requestPasswordReset`). Reset sets a new password (`updatePassword`) then pushes to `/login` after 2 seconds.
- Related API calls: Supabase auth directly; no app API route.
- Output format: session, or a reset email.
- Dependencies: Supabase auth + email delivery.
- Testing status: not yet tested.

## 5. Guest sessions

- URL: none (automatic). Entry points: deep links into `(dashboard)` pages, `/transcribe`.
- Purpose: let a first-time visitor use the Studio without an account.
- User input: none.
- Expected behavior (from `apps/frontend/src/app/(dashboard)/layout.tsx` + `services/auth/guest.ts`):
  - First-time guest on a deep link: `startGuestSession()` creates an anonymous Supabase session and the page opens.
  - Browser that held a real account: no guest session; redirect to `/login`.
  - Guests cannot buy a plan (`POST /api/v1/billing/checkout` throws FORBIDDEN for guests).
  - A guest who signs up moves their project over via `POST /api/v1/guest/claim`.
  - Stale guests (anonymous, no email, not back in 7 days) are deleted by the daily cron (`GET /api/cron/cleanup`).
- Related API calls: `POST /api/v1/guest/claim`; cron cleanup.
- Output format: an anonymous session with a project.
- Dependencies: Supabase anonymous auth.
- Testing status: not yet tested.

## 6. Dashboard / projects

- URL: `/dashboard`. Per-project: `/projects/[id]` (renders the Studio), `/projects/[id]/settings`.
- Purpose: project list at a glance; open, create, duplicate, archive projects.
- User input: project name, search/filter (page is 300+ lines; exact controls not exhaustively traced).
- Expected behavior: signed-in or guest list of projects; each project opens the Studio. `/editor` is the front door to the most recent project.
- Related API calls: `GET/POST /api/v1/projects`, `GET/PATCH/DELETE /api/v1/projects/[id]`, `POST .../archive`, `POST .../unarchive`, `POST .../duplicate`.
- Output format: project rows/cards; Studio on open.
- Dependencies: Supabase projects table; plan `maxProjects` enforced server-side.
- Testing status: not yet tested.

## 7. Media library

- URL: `/library`.
- Purpose: media assets for projects, including derived-asset cache management.
- User input: asset selection, cleanup actions.
- Expected behavior (from `apps/frontend/src/app/(dashboard)/library/page.tsx` + `features/studio/derivedCache.ts` + `mediaStore.ts`): lists referenced assets, classifies derived assets (reversed copies and others), plans cleanup of unreferenced derived files.
- Related API calls: none found as a dedicated library route; assets live in IndexedDB on the device (`mediaStore.ts`) plus project video records.
- Output format: asset list with cleanup plan.
- Dependencies: browser IndexedDB, project video records.
- Testing status: not yet tested.

## 8. Studio editor (`/projects/[id]`)

- URL: `/projects/[id]`. Entry page: `/editor`.
- Purpose: the main video editor. One project, one video, captions, looks, effects, audio, motion overlays, export.
- User input: video file (upload/pick), caption text edits, look choice, style controls, timeline trims/splits, overlay text/colour/image, audio adjustments.
- Expected behavior: `features/studio/StudioPage.tsx` (large) + panels in `features/studio/panels/`:
  - `CaptionsPanel.tsx` — caption list, per-line controls.
  - Inline word editor — edit single words and timings in place.
  - `LooksPanel.tsx` — looks/templates picker (150 looks, live previews under a shared preview budget, `livePreviewBudget.ts`).
  - `Timeline.tsx` — timeline with playhead, split, trim (`trim.ts`, `playheadSplit.ts`).
  - `StylePanel.tsx`, `AdjustPanel.tsx`, `FontPicker.tsx` — caption styling.
  - `ElementsPanel.tsx`, `TextPanel.tsx`, `TitleCard` — text/element layers.
  - `AudioPanel.tsx` + `features/studio/audio/` (decode, denoise, DSP, mixdown, export mix) — audio studio.
  - `MotionPicker.tsx`, `MotionStudioPanel.tsx`, `OverlayEditor.tsx` — motion overlays.
  - `ClipperPanel.tsx` + `ClipperLaunchCard.tsx` — clipper entry (card links to `/clipper?project=<id>` in a new tab).
  - `AiEditPanel.tsx` + `features/studio/aiEdit.ts` — describe-the-edit flow; drafts a checklist plan; nothing applies until approved; steps previewable and undoable.
  - `EditAssistantPanel.tsx`, `PolishPanel.tsx`, `EmphasisSuggestions.tsx`, `TranslatePanel.tsx` — assistant/polish/emphasis/translation.
  - `MediaPanel.tsx`, `StockAudioSection.tsx`, `SoundEffectsPanel.tsx` — media and stock audio (Pexels/Pixabay per `pixabay.ts`, `stockCatalogue.ts`).
  - `TutorialTour.tsx` — first-visit mini tutorial.
  - `SignupGate.tsx` — prompts guests to sign up at the right moment.
  - `ExportModal.tsx` + `browserExport.ts` — export dialog and in-browser render.
- Related API calls: `GET /api/v1/projects/[id]/studio`, `GET/PUT .../document`, `GET/PUT .../translations`, `POST .../videos`, `POST .../transcribe`, `GET/POST .../exports`, `POST .../clips`.
- Output format: captioned video preview (Remotion Player), MP4/SRT/VTT/TXT exports (see §18).
- Dependencies: Remotion Player, browser Whisper (see §9), IndexedDB media store.
- Testing status: not yet tested. Known open items from parent context, not re-verified here: timeline-cursor bug; template previews not previewing (all 150 to check).

## 9. Transcription (in-browser Whisper, 14 languages)

- URL: inside the Studio (project transcribe) and standalone `/transcribe`.
- Purpose: turn speech into word-timed captions without uploading the file.
- User input: video/audio file; language choice.
- Expected behavior (from `apps/frontend/src/features/transcribe/runtime.ts`):
  - The speech model runs in the browser (ONNX Whisper base, WebGPU or WASM). English uses the stock multilingual base; Hinglish uses the fine-tuned `ishaan-g/whisper-hinglish-swift_timestamped` model (env-overridable); Hindi and 11 more languages share the stock base with a forced language token.
  - 14 shipped languages (see counts table). A language ships only when wired end to end (model map, worker language token, caption-engine alignment gate).
  - Word-level timestamps feed the caption engine; Devanagari fixtures live in the caption-engine suite.
- Related API calls: `POST /api/v1/projects/[id]/transcribe` (server record). Model files download from the model host, not from the app API.
- Output format: timed transcript; word-timed caption document.
- Dependencies: ONNX runtime, WebGPU/WASM, model files.
- Testing status: not yet tested.

## 10. `/transcribe` standalone tool

- URL: `/transcribe`.
- Purpose: a file in, a timed transcript out. No Studio project is created and nothing is uploaded.
- User input: video/audio file upload only. Link mode was removed (deployed live 2026-11-13); subcopy: "Upload a file. Get its transcript."
- Expected behavior (from `apps/frontend/src/app/(dashboard)/transcribe/page.tsx`, 374 lines): upload → browser Whisper → transcript view → copy or download TXT, SRT, VTT. Guest-friendly by construction: the page never asks who the user is; the dashboard layout boots a guest session for signed-out visitors.
- Related API calls: none for the transcribe itself (fully client-side). See `features/transcribe/standalone.ts`.
- Output format: TXT / SRT / VTT downloads.
- Dependencies: same browser Whisper runtime as §9.
- Testing status: not yet tested.

## 11. Caption Studio (`/captions`)

- URL: `/captions`.
- Purpose: caption projects and transcripts in the workspace; the project list that opens the Studio for caption work.
- User input: project selection.
- Expected behavior: list of caption projects; each opens `/projects/[id]`.
- Related API calls: `GET /api/v1/projects`, `GET /api/v1/projects/[id]/document`.
- Output format: project list.
- Dependencies: projects + caption documents.
- Testing status: not yet tested.

## 12. Motion Studio (`/motion`, `/motion/[templateId]`)

- URL: `/motion`; per-template `/motion/[templateId]`.
- Purpose: animated motion graphics (subscribe pills, follow cards, counters, titles) to drop into a project.
- User input: template search/filter/sort; text lines, accent colour, avatar/QR image; duration.
- Expected behavior:
  - `/motion` (from `apps/frontend/src/app/(dashboard)/motion/page.tsx`): every template in the registry, searchable/filterable/sortable via registry helpers; each card plays the real graphic (`MotionPreview` renders the same `OverlayView` as the Studio and export).
  - `/motion/[templateId]`: one template, controls generated from the registry entry's `fields[]` (text/colour/image) plus duration bounds from `MotionConfigSchema`; big stage plays the real graphic on a controlled clock; save preset; add to project (`features/motion/addToProject.ts`, staging project id `MOTION_STAGING_PROJECT_ID`); export section (`MotionExportSection`).
  - Homepage Motion section shows 4 featured templates live, each linking to `/motion/<id>`.
- Related API calls: none (templates are a client-side registry; adding to a project uses the projects/studio APIs).
- Output format: motion overlay item inside a project; standalone motion export per `MotionExportSection`.
- Dependencies: `@capseasy/motion` registry (46 templates, 19 categories), `@capseasy/compositions` social overlays.
- Testing status: not yet tested. Parent context notes a template-preview fix in progress ("none previewing, all 150 to check" refers to looks; motion preview state is separately not yet tested here).

## 13. AI Clipper (`/ai-clipper`) and Clipper (`/clipper`)

- URLs: `/ai-clipper`, `/clipper`. Both hidden from nav/homepage/footer (owner order 2026-11-13); routes stay live.
- Purpose: cut one long video into postable clips.
- User input: pick a captioned project; trim segment edges; create clip.
- Expected behavior:
  - `/clipper` (from `apps/frontend/src/app/(dashboard)/clipper/page.tsx`, 153 lines): proposes segments measured from the transcript, audio silences, and scene changes. Silences split runs; short runs merge; long runs split at the biggest pause. A clip is a range on the same file, kept on the device; the source video is not re-encoded or cut. Creating a clip makes its own captioned project.
  - `/ai-clipper` (144 lines): separate section, same highlight engine underneath, plus Slice 1: cross-window rerank calibration, durable runs that resume where they stopped. AI ranks moments with an Editorial score — an estimate, never a performance prediction. Measured suggestions show the signals behind their order.
- Related API calls: `GET/POST /api/v1/clipper/highlights`, `POST /api/v1/projects/[id]/clips`.
- Output format: a new captioned project per clip.
- Dependencies: transcript, audio analysis, local/cloud AI model (`features/ai-clipper/`, `features/clipper/highlightAi.ts`, `features/create/service.ts`).
- Testing status: not yet tested.

## 14. Reel Analyzer (`/analyzer`)

- URL: `/analyzer`. Hidden from nav/homepage/footer (owner order 2026-11-13); route stays live.
- Purpose: a measured breakdown of one reel — hook, beats, call to action, pacing.
- User input: pick a project/reel to analyse.
- Expected behavior (from `apps/frontend/src/app/(dashboard)/analyzer/page.tsx`, 647 lines): measures only what the app can actually measure on the device — the project's spoken transcript and (per the file header) a second on-device signal. Breakdown items feed the content library as `analysis` items (`features/analyzer/breakdownItem.ts`).
- Related API calls: project/document reads; no dedicated analyzer API route found.
- Output format: analysis breakdown; saved analysis items in the content library.
- Dependencies: transcript, content library (`features/create/library.ts`).
- Testing status: not yet tested.

## 15. Teleprompter (`/prompter`)

- URL: `/prompter`. Hidden from nav/homepage/footer (owner order 2026-11-13); route stays live.
- Purpose: a full reading stage for a script.
- User input: script imported verbatim from a saved Script Studio script, or pasted in; scroll speed, font size, text position, mirror mode.
- Expected behavior (from `apps/frontend/src/app/(dashboard)/prompter/page.tsx`, 636 lines): scrolling script stage with adjustable speed/size/position and mirror mode.
- Related API calls: content library reads for saved scripts; no dedicated prompter API route found.
- Output format: on-screen scrolling script (no file output).
- Dependencies: content library scripts.
- Testing status: not yet tested.

## 16. Creator Studio (`/create`, `/create/chat`)

- URLs: `/create`, `/create/chat`. Hidden from nav/homepage/footer (owner order 2026-11-13); routes stay live.
- Purpose: AI content generation — generators (niche/audience/tone = brand-voice inputs in this version), Script Studio, and AI chat.
- User input: niche, audience, tone; prompts; chat messages.
- Expected behavior (from `apps/frontend/src/app/(dashboard)/create/page.tsx`, 895 lines; `create/chat/page.tsx`, 509 lines):
  - Generators page with brand-voice profile (section 3.2 in code comments).
  - Chat page with threads (`features/create/chat.ts`); the source note records what wrote each item and, for cloud, that the topic text was sent to the model.
  - "Free AI" (from `features/create/cloudAi.ts`): server route is `POST /api/v1/create/generate` (full-size model on a server, Groq free tier, per `features/create/model.ts`). A status probe (`GET /api/v1/create/generate`) is cached; if the probe fails, the answer is "not configured" and `/create` behaves accordingly. There is also a local model path (`features/create/localModel.ts`, used by the AI Clipper too).
- Related API calls: `GET/POST /api/v1/create/generate`; `GET/POST /api/v1/content/threads`, `GET/PATCH/DELETE /api/v1/content/threads/[id]`, `POST .../messages`; `GET/POST /api/v1/content`.
- Output format: generated scripts/ideas saved to the content library; chat threads.
- Dependencies: Groq free tier (server), local model (client), brand profiles.
- Testing status: not yet tested.

## 17. Growth Studio (`/growth`)

- URL: `/growth`.
- Purpose: connect YouTube/Instagram, sync posts, see performance, ask the Growth Coach.
- User input: connect/disconnect clicks; coach questions; competitor entries.
- Expected behavior (from `apps/frontend/src/app/(dashboard)/growth/page.tsx`):
  - Accounts bar at the top (connected YouTube/Instagram, sync, disconnect) and the Growth Coach filling the rest.
  - Coach starter questions read the same report sections the chat route builds server-side: overview, best hours, top/bottom, trend (`features/growth/report.ts`: `computeOverview`, `computeBestHours`, `computeTopBottom`, `computeTrend`).
  - Connect platforms are exactly `youtube | instagram` (`lib/api/connections/config.ts` line 14).
  - OAuth: start route mints HMAC-signed state; callback verifies it and redirects to `/growth?connected=<platform>` or `?connect_error=<platform>` (with `&sync=failed` when sync failed). Details of failures stay server-side.
  - YouTube connect worked with 50 posts under a guest session (parent context, not re-verified here).
  - Instagram connect is BLOCKED on the owner's Meta Authenticity passkey (parent context; recorded as blocked, connect flow not tested beyond noting the UI state from code). The page also carries the open items: API test call per permission, missing Privacy policy URL (Publish disabled), irreversible Tech Provider decision needing the owner's explicit decision, Graph API v21.0 bump.
- Related API calls: `GET /api/v1/growth/connections`, `GET /api/v1/growth/connect/[platform]/start`, `GET .../callback`, `POST .../disconnect`, `POST .../sync`, `GET/POST /api/v1/growth/posts`, `PATCH/DELETE /api/v1/growth/posts/[id]`, `POST /api/v1/growth/posts/import`, `GET/POST /api/v1/growth/chat`, `GET/POST /api/v1/growth/competitors`, `PATCH/DELETE /api/v1/growth/competitors/[id]`.
- Output format: synced post list, coach answers, analytics inputs.
- Dependencies: Google/YouTube OAuth, Meta Instagram OAuth, Supabase connections store.
- Testing status: not yet tested. Instagram connect: blocked (see above).

## 18. Planner

- URL: `/planner`.
- Purpose: content planning — weekly plan, reminders, content items.
- User input: content items (title, status, date), weekly-plan import.
- Expected behavior (from `apps/frontend/src/app/(dashboard)/planner/page.tsx`): content library CRUD, planner statuses (`PLANNER_STATUSES`), reminders (`computeReminders`), weekly-plan import (`importWeeklyPlan`), drag/drop (`planDrop`).
- Related API calls: `GET/POST /api/v1/content`, `PATCH/DELETE /api/v1/content/[id]`.
- Output format: planner board/calendar; reminders.
- Dependencies: content library.
- Testing status: not yet tested.

## 19. Brand Voice / Brand Kit

- URL: `/brand` (Brand Kit); brand-voice inputs live inside `/create` (see §16).
- Purpose: save brand profiles (voice, colours, fonts) and reuse them across generations and captions.
- User input: profile name, voice/tone fields, brand-kit form.
- Expected behavior (from `apps/frontend/src/app/(dashboard)/brand/page.tsx`): create/list/update/delete brand profiles; activate one (`brandKitMode`, `formFromProfile`).
- Related API calls: `GET/POST /api/v1/brand/profiles`, `PUT/DELETE /api/v1/brand/profiles/[id]`, `POST .../activate`, `GET/PUT /api/v1/brand`.
- Output format: active brand kit applied in Studio/generators.
- Dependencies: Supabase brand tables.
- Testing status: not yet tested.

## 20. Exports (browser MP4 via Remotion, SRT/VTT/TXT)

- URLs: export dialog inside the Studio; history at `/exports`; per-project `GET/POST /api/v1/projects/[id]/exports`.
- Purpose: render the finished video and download caption files.
- User input: export options (format, size, quality) in `ExportModal.tsx` / `exportOptions.ts`.
- Expected behavior:
  - Browser MP4: `features/studio/browserExport.ts` — renders in the browser with `@remotion/web-renderer` (WebCodecs + Mediabunny); nothing is uploaded. Preview uses `@remotion/player`. Homepage copy says 1080p vertical MP4; the HowItWorks artifact says 1080×1920, 60fps.
  - Text kinds (`exportOptions.ts` lines 16, 44-74): SRT, VTT, ASS, TXT, JSON — generated from the whole caption document; one SRT and one VTT per language, built after the primary options.
  - `/exports` page: status filters `ready`, `expired`, `queued`, `rendering`, `failed`, `cancelled`. Re-download mints a fresh 600s signed link per click while the export is ready and inside retention (`exports/[id]/download`).
  - Retention follows the plan (`exportRetentionDays`: Free 7, Starter 30, Plus/Pro 60).
- Related API calls: `GET /api/v1/exports`, `GET /api/v1/exports/[id]/download`, `GET/POST /api/v1/projects/[id]/exports`.
- Output format: MP4 file download; SRT/VTT/ASS/TXT/JSON files.
- Dependencies: Remotion web-renderer, WebCodecs, Mediabunny, Supabase storage.
- Testing status: not yet tested.

## 21. Settings + billing

- URL: `/settings`; billing at `/settings/billing`.
- Purpose: profile settings; plan, limits, and payment history.
- User input: display name; plan choice; checkout confirmation.
- Expected behavior:
  - `/settings` (from `apps/frontend/src/app/(dashboard)/settings/page.tsx`): display name edit, avatar (comes from the sign-in provider; dicebear-generated fallback noted in code), password-reset request, "Plan & billing" section linking to `/settings/billing` with the note that paid plans are 30-day passes.
  - `/settings/billing` (from `apps/frontend/src/app/(dashboard)/settings/billing/page.tsx`): current plan + payment rows (`PaymentRow`: `cf_order_id`, plan, amount, currency, status, `created_at`, `paid_at`, `period_end`); "Get <plan>" buttons call `POST /api/v1/billing/checkout`, then open the Cashfree SDK checkout with the returned `paymentSessionId` (mode from the server response, `sandbox` expected); returning from Cashfree with `?order_id=` triggers `POST /api/v1/billing/reconcile`. When checkout is not configured, the page says payments are not switched on yet.
  - KNOWN LIVE FAILURE (recorded, not re-investigated): sandbox test 2026-11-14 ~01:04–01:07 IST — Get Starter/Plus/Pro all fail with generic "Something went wrong", Cashfree checkout never opens, no money moved, plan still Free, one payments row "Started, not completed". Suspected cause per parent context: the checkout route's Cashfree error is a plain Error surfaced as a generic message; the real error is only in Vercel runtime logs. Most likely 401 bad credentials or Cashfree validation. Do not re-investigate in discovery; the fix phase owns it.
  - Billing is Cashfree sandbox. Webhook: `POST /api/v1/billing/webhook` (signature-verified; the only channel that can grant a plan on its own).
- Related API calls: `POST /api/v1/billing/checkout`, `GET /api/v1/billing/me`, `POST /api/v1/billing/reconcile`, `POST /api/v1/billing/webhook`.
- Output format: plan grant (30-day pass) via webhook/reconcile; payment history rows.
- Dependencies: Cashfree (sandbox keys in Vercel env), Supabase `payments` + `profiles` tables.
- Testing status: not yet tested. Checkout: known failing (see above).

## 22. Pricing page

- URL: `/pricing`.
- Purpose: show plans and send visitors to start or billing.
- User input: plan choice click.
- Expected behavior (from `apps/frontend/src/app/pricing/page.tsx`): renders `PLAN_PRICING` cards; monthly only (no annual toggle); one currency per visitor (INR for India, USD elsewhere, via `currencyForCountry` on `x-vercel-ip-country`); Free CTA → `/start`; paid CTAs → `/settings/billing` ("Get <name>"). `Product` JSON-LD from the same config, one Offer per plan per currency. Footer note states prices are shown in the visitor's currency.
- Related API calls: none on the page itself (checkout happens on `/settings/billing`).
- Output format: pricing cards.
- Dependencies: `packages/shared/src/plans.ts`, geo header.
- Testing status: not yet tested.

## 23. Legal pages

- URLs: `/about`, `/terms`, `/privacy`, `/cookies`, `/acceptable-use`, `/copyright`, `/subprocessors`, `/credits`.
- Purpose: legal and attribution pages.
- User input: none.
- Expected behavior: static pages rendered from `lib/legal.ts` facts (operator, India, `work.techhacksai@gmail.com`, effective 30 September 2026, min age 13). `/credits` covers sources and licences of footage and on-device translation models.
- Related API calls: none.
- Output format: static pages, all in the sitemap.
- Dependencies: none.
- Testing status: not yet tested (content accuracy vs the facts file is a testing-phase check).

## 24. Forgot / reset password

- URLs: `/forgot-password`, `/reset-password`.
- Purpose: recover access to an email account.
- User input: email (forgot); new password (reset).
- Expected behavior: forgot sends a reset email; reset sets the new password and pushes to `/login` after 2 seconds. Both pages are noindex + robots-disallowed.
- Related API calls: Supabase auth directly; no app API route.
- Output format: email sent; password changed.
- Dependencies: Supabase auth + email delivery.
- Testing status: not yet tested.

## 25. `/pair` device flow

- URL: `/pair?code=...`.
- Purpose: approve a companion device pairing from the signed-in browser.
- User input: approve/deny the pairing code.
- Expected behavior (from `apps/frontend/src/app/pair/page.tsx` + device API): signed-in user opens `/pair?code=<code>`; the page approves via `POST /api/v1/device/approve`. The device polls `POST /api/v1/device/token` and receives a long-lived token (shown once, stored as SHA-256 hash) when approved. Device setup starts with `POST /api/v1/device/start` (companions flag + rate limit; no user session). All device routes require the companions feature flag.
- Related API calls: `POST /api/v1/device/start`, `POST /api/v1/device/setup`, `GET/POST /api/v1/device/approve`, `POST /api/v1/device/token`.
- Output format: an approved companion/worker token on the device.
- Dependencies: companions flag, Supabase workers table.
- Testing status: not yet tested.

## 26. `/auto-caption-generator` landing page

- URL: `/auto-caption-generator`.
- Purpose: SEO tool landing page — how automatic captions work, what they cost, what they cannot do.
- User input: none except clicks (linked from homepage ToolDoors and footer).
- Expected behavior (from `apps/frontend/src/app/auto-caption-generator/page.tsx`, 195 lines + `faqs.ts`): explainer content + FAQs; indexable (priority 0.8, monthly in the sitemap).
- Related API calls: none.
- Output format: static landing page.
- Dependencies: none.
- Testing status: not yet tested.

## 27. Analytics (`/analytics`)

- URL: `/analytics`.
- Purpose: Creator Analytics dashboard over the Growth Studio store.
- User input: none (reads synced/imported posts); view selection.
- Expected behavior (from `apps/frontend/src/app/(dashboard)/analytics/page.tsx` + `features/analytics/analytics.ts`): totals with coverage, an engagement rate with its formula and denominator stated, best-performing content, weekly trend where empty weeks are gaps, not zeros. Every figure is one the creator entered or imported.
- Related API calls: `GET /api/v1/growth/posts` (underlying data).
- Output format: analytics dashboard; CSV columns defined in `ANALYTICS_CSV_COLUMNS`.
- Dependencies: Growth Studio post store.
- Testing status: not yet tested.

## 28. Translation

- URL: inside the Studio (`TranslatePanel.tsx`); API `GET/PUT /api/v1/projects/[id]/translations`.
- Purpose: translate captions to another language, on-device.
- User input: target language.
- Expected behavior (from `features/translate/browserTranslate.ts`, `translate.worker.ts`, `translateDoc.ts`): on-device translation models (see `/credits` for model licences); one SRT/VTT per language in export.
- Related API calls: `GET/PUT /api/v1/projects/[id]/translations`.
- Output format: translated caption document; per-language subtitle files.
- Dependencies: on-device translation models.
- Testing status: not yet tested.

## 29. Companion / worker system (supporting, no user-facing page)

- URLs: API only (`/api/v1/device/*`, `/api/v1/worker/*`, `/api/v1/workers/*`); status via `/health/ready`.
- Purpose: companion devices and background workers for jobs (render/transcribe queue in Postgres; pg_cron reaper).
- User input: device pairing approval (see §25).
- Expected behavior: workers claim jobs (`POST /api/v1/worker/jobs/claim`), report progress, complete/fail with `requireHeldJob`; heartbeat keeps them alive. No Redis/Celery; the queue lives in Postgres.
- Related API calls: all `/api/v1/worker/*` + `/api/v1/workers/*` + `/api/v1/jobs/[id]/*`.
- Output format: job results (exports, transcripts).
- Dependencies: Postgres queue functions, pg_cron.
- Testing status: not yet tested.

## 30. Things deliberately not in this inventory

- The "Explore more" homepage card: absent from this worktree (see `website-map.md` §8). Not inventoried.
- Monthly video quotas (Free 3 / Starter 10 / Plus 20 / Pro 40): not in this worktree's `plans.ts` (see counts table). Not inventoried as a feature here.
- PWA: a PWA branch exists per parent context but is not in this worktree at `b32c36a` (no manifest/service-worker evidence checked; not inventoried).
- AdSense: no ads run; `/ads.txt` 404s by design until a publisher id is configured. Not a feature to test.
