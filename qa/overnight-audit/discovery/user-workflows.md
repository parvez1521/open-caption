# User workflows — Captionit.in (discovery, Phase 1)

- Worktree: `~/workspace/oc-overnight-qa`, branch `qa/captionit-full-audit-fixes`, base main @ `b32c36a`.
- These are the main end-to-end journeys as the code describes them. Testing status: not yet tested. No step below is claimed to work.
- Short sentences throughout, per the owner's reply style.

## (a) First visit → sign up → first captioned video export

- Entry URL: `/` (or any `/start?mode=...` door link).
- Exit / output: a captioned MP4 downloaded to the device, plus a saved project.
- Steps:
  1. Visitor lands on `/`. Hero shows the looks cylinder and the Hinglish claim. Visitor clicks "Start free" (`/start?choose=1`).
  2. `/start` sees a brand-new visitor and sends them to `/login?mode=signup`. No guest session is created on this path.
  3. Visitor taps the Google button (GIS). Google chooser opens. On success Supabase creates the account and returns to `/start`.
  4. `/start` sees a signed-in user with no pending guest project and no survey done, and sends them to `/onboarding`.
  5. Visitor answers two questions (or skips; skip marks the survey done). Survey finish goes to `/dashboard`.
  6. Visitor picks a door. Example: "Add captions" (`/start?mode=captions`). `/start` creates a project and routes to `/projects/<id>?mode=captions`.
  7. Studio opens. Visitor uploads a video file. The file stays on the device (IndexedDB media store).
  8. Visitor picks a language (14 shipped: en, Hinglish, Hindi, Tamil, Telugu, Bengali, Marathi, Punjabi, Urdu, Spanish, French, German, Arabic, Portuguese). The browser Whisper model runs in-browser and stamps every word with its moment.
  9. Visitor fixes words in the inline word editor, picks one of 150 looks, drags the caption box, tunes hero word and body line apart.
  10. Visitor opens export. The browser renders the MP4 with Remotion (WebCodecs + Mediabunny). Nothing is uploaded.
  11. Visitor downloads the MP4. The project stays saved; the export row appears in `/exports` with the plan's retention (Free: 7 days).
- Notes: if the visitor picks the email path instead of Google, sign-up is not possible — Google is the only way to create an account; email sign-in is for existing email accounts only. If Google/Supabase refuses, the visitor lands back on their project as a guest (per `/start` code comments).

## (b) Guest transcribe → export SRT

- Entry URL: `/transcribe` (linked from homepage ToolDoors and TranscribeSection, and footer).
- Exit / output: TXT, SRT, or VTT file downloaded.
- Steps:
  1. Visitor opens `/transcribe`. No sign-in is asked. The dashboard layout boots an anonymous guest session for a signed-out visitor.
  2. Visitor uploads a video or audio file. Link mode does not exist; upload only.
  3. Visitor picks a language (same 14 as workflow (a)).
  4. Browser Whisper transcribes on-device. A timed transcript appears.
  5. Visitor copies the transcript, or downloads TXT, SRT, or VTT.
  6. No Studio project is created. Nothing is uploaded.
- Notes: guest sessions are anonymous Supabase users. Stale guests (no email, not back in 7 days) are deleted by the daily cron.

## (c) Returning user opens project → edits captions → exports MP4

- Entry URL: `/dashboard` (or `/captions`, or `/editor`).
- Exit / output: updated project; new MP4 and/or subtitle files downloaded.
- Steps:
  1. User signs in at `/login` (Google GIS button or email). Session restores.
  2. `/dashboard` lists projects. User opens one. `/projects/<id>` renders the Studio.
  3. Studio loads the saved caption document (`GET /api/v1/projects/<id>/document`) and the video from the device store. If the video file is gone from the device, the user re-selects it (videos live on the device, not on the server).
  4. User edits captions: inline word edits, timing fixes, emphasis, translation (per-language SRT/VTT available at export).
  5. User changes the look (150-look picker), adjusts style, adds motion overlays from Motion Studio, trims/splits on the timeline.
  6. User opens export, picks options, and renders in-browser (Remotion). MP4 downloads. SRT/VTT/TXT/ASS/JSON can also be downloaded.
  7. Export history updates at `/exports`; re-download mints a fresh 600s link while the export is ready and inside retention.
- Notes: the Studio is per-project; `/editor` is the front door to the most recent project. AI Edit (describe the edit → approve the plan) is available as a panel; nothing applies until approved.

## (d) Buy a plan

- Entry URL: `/pricing` → `/settings/billing` (paid-plan CTAs point at `/settings/billing`; billing is also linked from `/settings`).
- Exit / output: a 30-day pass on the chosen plan (Free 3 / Starter 10 / Plus 20 / Pro 40 monthly video quotas are NOT in this worktree; plan headroom here is projects, upload size, duration, retention per `plans.ts`).
- Steps (read-only description, from code):
  1. Visitor opens `/pricing`. One currency shows: INR for India, USD elsewhere. Monthly only; no annual toggle.
  2. Visitor clicks "Get Starter" (₹299), "Get Plus" (₹499), or "Get Pro" (₹799). Free goes to `/start`.
  3. Paid CTA goes to `/settings/billing`. The user must be signed in with a real account; guests get FORBIDDEN ("Guests can't buy a plan — create a free account first, then upgrade").
  4. On `/settings/billing`, the user clicks the plan button. The page calls `POST /api/v1/billing/checkout` with the plan id.
  5. The server takes the price from `PLAN_PRICING` (never the client), picks currency from the visitor's country, writes a `payments` row first (status `created`), then creates a Cashfree order and returns a `paymentSessionId` and env (`sandbox`).
  6. The page loads the Cashfree SDK and opens checkout with that session id.
  7. The user pays in the Cashfree checkout. Cashfree redirects back to `/settings/billing?order_id=<id>`.
  8. The page calls `POST /api/v1/billing/reconcile`, which confirms with Cashfree directly. Separately, the Cashfree webhook (`POST /api/v1/billing/webhook`, signature-verified) grants the plan on its own.
  9. Plan shows as active with a 30-day period end. No auto-renew; the user pays again for another pass.
- KNOWN LIVE FAILURE (recorded, not re-investigated): sandbox test 2026-11-14 ~01:04–01:07 IST — Get Starter/Plus/Pro all fail with generic "Something went wrong". Cashfree checkout never opens. No money moved. Plan still Free. One payments row "Started, not completed". Suspected cause: the checkout route's Cashfree error is a plain Error surfaced as a generic message; the real error is only in Vercel runtime logs. Most likely 401 bad credentials or Cashfree validation. The fix phase owns this; discovery does not re-investigate it.
- Notes: if Cashfree keys are not configured, checkout answers `{ configured: false }` and the billing page says payments are not switched on yet. There is no fake checkout and no simulated success.

## (e) Growth connect + sync

- Entry URL: `/growth`.
- Exit / output: connected YouTube and/or Instagram accounts; synced posts; coach answers.
- Steps:
  1. User opens `/growth`. The accounts bar shows connected platforms (or connect buttons) and the Growth Coach below.
  2. User clicks connect for YouTube (or Instagram). The app calls `GET /api/v1/growth/connect/<platform>/start`, which mints an HMAC-signed state and redirects to Google (or Meta) OAuth.
  3. User approves in the provider. The provider redirects to `GET /api/v1/growth/connect/<platform>/callback` with code + state.
  4. The callback verifies the HMAC state (the only caller identification; there is no Authorization header on a browser redirect), exchanges the code, stores the connection, and syncs posts. It redirects to `/growth?connected=<platform>` (or `?connect_error=<platform>`, plus `&sync=failed` when sync failed).
  5. User clicks sync to re-sync posts (`POST /api/v1/growth/connect/<platform>/sync`). Posts list under the accounts bar.
  6. User asks the Growth Coach questions (`GET/POST /api/v1/growth/chat`). Coach answers use the same report sections as the page: overview, best hours, top/bottom, trend.
  7. User can disconnect (`POST /api/v1/growth/connect/<platform>/disconnect`) or import posts (`POST /api/v1/growth/posts/import`).
- Notes: YouTube connect worked with 50 posts under a guest session (parent context, not re-verified). Instagram connect is BLOCKED on the owner's Meta Authenticity passkey. Recorded as blocked. The connect flow was not tested beyond noting its UI state from code. Open items from parent context: API test call per permission, missing Privacy policy URL (Publish disabled), irreversible Tech Provider decision (owner's explicit decision needed), Graph API v21.0 bump.

## (f) Motion template → add to project

- Entry URL: `/motion` (or homepage Motion Studio section, or a template card).
- Exit / output: a motion overlay inside a project.
- Steps:
  1. User opens `/motion`. All 46 templates show, searchable/filterable/sortable, each card playing the real graphic.
  2. User opens a template (`/motion/<templateId>`). Controls are generated from the registry entry's fields: text lines, accent colour, avatar/QR image where the template has one, duration bounds.
  3. The big stage plays the real graphic on a controlled clock (play, pause, scrub). The user edits text and colour live.
  4. User saves a preset (optional) or clicks add to project. The overlay is built (`features/motion/addToProject.ts`) and added to the staging project, then to the chosen project.
  5. In the Studio, the overlay appears on the timeline/stage and renders in preview and in the MP4 export (same `OverlayView` as the picker preview).
- Notes: the homepage Motion section shows 4 featured templates live, each card linking to its `/motion/<id>` page.

## (g) AI Clipper on a long video

- Entry URL: `/ai-clipper` (direct URL only; hidden from nav/homepage/footer). The measured Clipper is `/clipper` (direct URL, or Studio ClipperLaunchCard → `/clipper?project=<id>` in a new tab).
- Exit / output: one or more new captioned projects, each a clip of the long video.
- Steps:
  1. User opens `/ai-clipper` (or `/clipper`). Picks a captioned project with a long video.
  2. The workspace proposes segments. Measured Clipper: segments from the transcript, audio silences, and scene changes (silences split runs; short runs merge; long runs split at the biggest pause). AI Clipper: same highlight engine plus Slice 1 cross-window rerank calibration; moments ranked with an Editorial score (an estimate, never a performance prediction); measured suggestions show the signals behind their order.
  3. User trims segment edges in the workspace.
  4. User clicks "Create clip" on a segment. The clip becomes its own captioned project (a range on the same file; the source video is not re-encoded or cut; the file stays on the device).
  5. The new clip project opens in the Studio for styling and export, like any other project.
  6. AI Clipper runs are durable and resume where they stopped.
- Notes: both clipper routes are live but unlinked by owner order 2026-11-13. The only in-app link to `/clipper` is the Studio's ClipperLaunchCard. No in-app link to `/ai-clipper` was found in code.
