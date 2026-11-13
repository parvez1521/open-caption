# Website map — Captionit.in (discovery, Phase 1)

- Worktree: `~/workspace/oc-overnight-qa`, branch `qa/captionit-full-audit-fixes`, base main @ `b32c36a`.
- Live site checked: https://www.captionit.in (light curl only, 2026-11-14 ~02:00 IST).
- Status of everything below: mapped from code, not yet tested. No behaviour is claimed to work.
- Counts verified in code: 39 pages (`page.tsx`), 60 API routes (`route.ts`), plus 2 health routes and 1 `ads.txt` route. The parent brief said 38 pages / 63 API routes; the worktree actually holds 39 / 60. The extra page is `/create/chat`.

## 1. Route groups

| Group | Directory | Pages | Auth | Index |
|---|---|---|---|---|
| Home | `apps/frontend/src/app/(home)/` | `/` | No | Yes |
| Legal | `apps/frontend/src/app/(legal)/` | 8 pages (see §3) | No | Yes |
| Dashboard (app shell) | `apps/frontend/src/app/(dashboard)/` | 22 pages (see §4) | Yes, client-side gate (see §5) | No (`index: false`) |
| Top-level auth/flow | `apps/frontend/src/app/` | `/login`, `/pricing`, `/start`, `/onboarding`, `/pair`, `/forgot-password`, `/reset-password`, `/auto-caption-generator` | Mixed (see §6) | `/login` and `/pricing` only |
| API | `apps/frontend/src/app/api/` | 60 routes (see `route-inventory.csv`) | Mostly `requireUser` (see §7) | n/a, disallowed in robots |
| Special | `apps/frontend/src/app/` | `/health`, `/health/ready`, `/ads.txt`, `/sitemap.xml`, `/robots.txt` | No | n/a |

## 2. SEO sources of truth

- `apps/frontend/src/lib/seo.ts`:
  - `SITE_URL` / `PRODUCTION_URL` = `https://www.captionit.in` (line ~21). `NEXT_PUBLIC_APP_URL` overrides it.
  - `INDEXABLE_PATHS` = `/`, `/auto-caption-generator`, `/login`, `/pricing`, plus the 8 `LEGAL_PAGES` from `apps/frontend/src/lib/legal.ts` (lines ~29-31). Total 12 paths.
  - `APP_PATHS` (lines ~36-58) = 22 app/auth paths, all noindex: `/dashboard`, `/projects`, `/captions`, `/editor`, `/motion`, `/growth`, `/planner`, `/analytics`, `/library`, `/clipper`, `/analyzer`, `/prompter`, `/exports`, `/brand`, `/create`, `/settings`, `/start`, `/pair`, `/onboarding`, `/transcribe`, `/ai-clipper`, `/forgot-password`, `/reset-password`.
  - `pageMetadata()` (lines ~104-130): indexable pages get canonical + OG/Twitter; app pages get `robots: { index: false, follow: false }` and no canonical.
  - Homepage JSON-LD: `SoftwareApplication` (free, price 0, no ratings) + `FAQPage` built from the same `FAQS` array the page renders. Pricing page JSON-LD: `Product` with one `Offer` per plan per currency, built from `PLAN_PRICING`.
- `apps/frontend/src/app/sitemap.ts`: emits exactly `INDEXABLE_PATHS` (12 URLs). Live `/sitemap.xml` verified 2026-11-14: 12 `<loc>` entries, all `https://www.captionit.in/...`, `lastmod` 2026-11-13T19:58:46.602Z, `/` weekly priority 1, `/auto-caption-generator` monthly 0.8, `/login` 0.5, rest yearly 0.3.
- `apps/frontend/src/app/robots.ts`: `Allow: /`, disallow list = `/api/`, `/dashboard`, `/projects/`, `/captions`, `/editor`, `/motion`, `/growth`, `/planner`, `/analytics`, `/library`, `/clipper`, `/analyzer`, `/prompter`, `/exports`, `/brand`, `/create`, `/settings`, `/start`, `/pair`, `/onboarding`, `/transcribe`, `/ai-clipper`, `/forgot-password`, `/reset-password`. Live `/robots.txt` matches the file exactly. Note: `/login` and `/pricing` are NOT disallowed (they are indexable).
- Live apex check: `https://captionit.in/` returns 308 to `https://www.captionit.in/`. Canonical is www.
- Every `(dashboard)` route has its own `layout.tsx` calling `pageMetadata({ ..., index: false })`. Example: `apps/frontend/src/app/(dashboard)/dashboard/layout.tsx`. Legal pages call `pageMetadata` with `index` defaulting to true. `/login` metadata lives in `apps/frontend/src/app/login/layout.tsx`. `/auto-caption-generator` has its own `layout.tsx`; its page file carries no metadata export.

## 3. Public pages (in sitemap, in nav/footer, no auth)

| Path | In nav/footer | Notes |
|---|---|---|
| `/` | Header nav (anchor links only) + footer logo | Sections in `components/home/Sections.tsx`, see §8 |
| `/pricing` | Footer "Pricing" | Monthly only, geo currency, Product JSON-LD |
| `/login` | Header "Sign in" + footer "Sign in to app" | GIS Google button + email fallback |
| `/auto-caption-generator` | Footer "Auto caption generator" + homepage ToolDoors row | SEO landing page (competitor programme, 2026-11-13) |
| `/about` | Footer Company | Legal group |
| `/terms` | Footer Company | Legal group |
| `/privacy` | Footer Company | Legal group |
| `/cookies` | Footer Company | Legal group |
| `/acceptable-use` | Footer Company | Legal group |
| `/copyright` | Footer Company | Legal group |
| `/subprocessors` | Footer Company | Legal group |
| `/credits` | Footer Company | Legal group |

All 12 returned HTTP 200 in the light curl check. `/credits` comes from `LEGAL_PAGES` (`lib/legal.ts`); the sitemap comment notes it was once listed twice and is now deduplicated.

## 4. Dashboard pages (noindex, robots-disallowed, behind the shell)

Studio nav source of truth: `apps/frontend/src/components/studio/nav.ts` (`NAV_ITEMS`, 12 entries) rendered by `apps/frontend/src/components/studio/StudioShell.tsx` (sidebar + mobile top bar).

In nav (12):

| Path | Nav label | Group |
|---|---|---|
| `/dashboard` | Dashboard | primary |
| `/captions` | Caption Studio | primary |
| `/editor` | Video Editor | primary (also active on `/projects/*`) |
| `/motion` | Motion Studio | primary |
| `/growth` | Growth Studio | primary |
| `/planner` | Content Planner | primary |
| `/analytics` | Creator Analytics | primary |
| `/library` | Media Library | supporting |
| `/brand` | Brand Kit | supporting |
| `/transcribe` | Transcribe | supporting |
| `/exports` | Export History | supporting |
| `/settings` | Settings | supporting |

Live but NOT in nav (10):

| Path | Why / how reached | Status |
|---|---|---|
| `/clipper` | Hidden by owner order 2026-11-13. Reached from inside the Studio via `ClipperLaunchCard` (`features/studio/panels/ClipperLaunchCard.tsx`, link `/clipper?project=<id>`, rendered by `StudioPage.tsx` when the clipper tab is open). Also linked from the homepage `ClipperSection` component, which is NOT rendered (see §8). | Live route, page exists |
| `/ai-clipper` | Hidden by owner order 2026-11-13. No live link found in code outside its own page/layout and the unrendered homepage `ClipperSection`. Direct URL only. | Live route, page exists |
| `/analyzer` | Hidden by owner order 2026-11-13. No live link found outside its own page/layout. Direct URL only. | Live route, page exists |
| `/prompter` | Hidden by owner order 2026-11-13. No live link found outside its own page/layout. Direct URL only. | Live route, page exists |
| `/create` | Hidden by owner order 2026-11-13 (Creator Studio). No live link found outside its own page/layout. Direct URL only. | Live route, page exists |
| `/create/chat` | Sub-page of `/create`. Same hidden status. Direct URL only. | Live route, page exists |
| `/projects/[id]` | The Studio itself. Reached from Dashboard / Captions / Editor lists. Not a nav entry by design. | Live route |
| `/projects/[id]/settings` | Per-project settings. Reached from inside the Studio. | Live route |
| `/motion/[templateId]` | Per-template customise page. Reached from `/motion` cards and homepage Motion section cards (`/motion/<id>`). | Live route |
| `/settings/billing` | Billing. Reached from `/settings` ("Open billing") and `/pricing` paid-plan CTAs ("Get <name>"). | Live route |

All 22 dashboard URLs returned HTTP 200 in the light curl check. That only proves the server renders the shell/skeleton for anonymous requests; the client-side auth gate (see §5) decides what a signed-out visitor actually sees. It is not proof any of them work.

## 5. Auth gate for dashboard pages

- No middleware file exists in the frontend app. Auth is enforced client-side in `apps/frontend/src/app/(dashboard)/layout.tsx`:
  - Signed-in session → authorised.
  - Signed-out, browser never held an account → `startGuestSession()` creates an anonymous Supabase guest session and the page is authorised as a guest.
  - Signed-out, browser held a real account before (`hadAccountHere()`) → redirect to `/login?redirect=<path>`.
- Individual pages also re-check `authService.isAuthenticated()` and push to `/login` (or `/start` when Supabase is unconfigured). Examples: `dashboard/page.tsx`, `captions/page.tsx`, `editor/page.tsx`.
- Consequence for QA: signed-out curl 200s are expected. Real auth behaviour needs browser testing with fresh vs returning browsers.

## 6. Top-level auth/flow pages (noindex, robots-disallowed, not in sitemap)

| Path | Auth | In nav | Notes |
|---|---|---|---|
| `/start` | No (router) | Yes — header "Start free" (`/start?choose=1`), hero CTA, ToolDoors doors (`/start?mode=captions`, `?mode=editor`, `?mode=ai-edit`) | Login-first flow: brand-new visitor → `/login?mode=signup`; signed-in → onboarding (if not done) or dashboard; returning guest → latest project. `?choose=1` shows the door chooser. |
| `/onboarding` | Yes (signed-in; guests and done-users skip) | No | Two-question survey, then `/dashboard`. Skip on any step marks done. |
| `/pair` | Yes — redirects to `/login?redirect=/pair?code=...` when signed out | No | Device-pairing approval page (`/pair?code=...`). |
| `/forgot-password` | No | No (linked from login/email form) | Sends reset email via Supabase. |
| `/reset-password` | No (recovery link) | No | Sets a new password, then pushes to `/login`. |
| `/login` | No | Yes (header + footer) | Indexable. See feature inventory. |

## 7. API surface (summary; full list in `route-inventory.csv`)

- 60 routes under `apps/frontend/src/app/api/`, all under `/api/v1/` except `/api/cron/cleanup`.
- Auth pattern, read from code (method exports + helper imports):
  - `requireUser(req)` — 51 routes. Covers billing (except webhook), brand, clipper highlights, content/threads, create/generate, device approve/setup, exports, growth (except callback), guest claim, jobs, looks, projects, videos complete, workers list/detail.
  - `requireWorker(req)` — 6 worker routes (heartbeat, jobs claim, jobs complete/fail/progress/urls; the job routes also use `requireHeldJob`).
  - Webhook — `POST /api/v1/billing/webhook` verifies the Cashfree signature against raw body bytes (`verifyWebhookSignature`); bad signature → 401.
  - OAuth callback — `GET /api/v1/growth/connect/[platform]/callback` has no Authorization header by design; caller is identified only by the HMAC-signed state minted by the start route.
  - Device start/token — `POST /api/v1/device/start` and `/api/v1/device/token` require only the companions feature flag (`requireCompanionsEnabled`) plus rate limiting; no user session. Token is shown once, stored as SHA-256 hash.
  - Cron — `GET /api/cron/cleanup` requires `Authorization: Bearer <CRON_SECRET>`, else 401.
  - Health — `GET /health` returns `{"status":"ok"}` with no auth. `GET /health/ready` checks Postgres + job queue via the admin client, no auth, 200 when ready else 503. Live `/health/ready` returned 200.
- No state-changing API was called during discovery. API live status was not curl-checked (only methods + auth read from code).

## 8. Homepage sections (`apps/frontend/src/components/home/Sections.tsx`, 857 lines)

Rendered by `apps/frontend/src/app/(home)/page.tsx` in this order: `Loader` → `Nav` → `Hero` → `ToolDoors` → `HowItWorks` → `TranscribeSection` → `MotionStudioSection` → `AiEditSection` → `Control` → `#looks` showcase (`SpatialScroll`, lazy-mounted) → `Privacy` → `Faq` → `ClosingCta` → `Footer`.

- `Nav`: anchor links How it works (`#how`), Editor (`#control`), Looks (`#looks`), On your device (`#privacy`), FAQ (`#faq`); "Sign in" → `/login` (or `/dashboard` when signed in); "Start free" → `/start?choose=1`.
- `Hero`: headline, "Start free" CTA (`/start?choose=1`), "See the looks" anchor (`#looks`), "Edit a video" link (`/start?mode=editor`), rotating 3D cylinder of trending looks (`HeroCylinder`), and `HinglishClaim` — the owner's exact words (2026-11-13): "95% Hinglish caption accurate", framed as a claim, not a benchmark.
- `ToolDoors` ("Start with what you need"): 5 rows — Add captions (`/start?mode=captions`, copy says "150 looks"), Edit a video (`/start?mode=editor`), AI Edit (`/start?mode=ai-edit`), Transcribe (`/transcribe`, "in 14 languages"), Auto caption generator (`/auto-caption-generator`).
- `HowItWorks`: 4 steps (drop in a clip; speech becomes timed words; choose the look; export MP4). Step 4 copy says 1080p vertical MP4.
- `ClipperSection`: EXISTS in code but is NOT rendered on the homepage (owner order 2026-11-13, "abhi ke liye"). Its comment says restore by re-adding `<ClipperSection />` to `(home)/page.tsx` and the footer links. It contains the only homepage links to `/clipper` and `/ai-clipper`.
- `TranscribeSection`: links to `/transcribe`; copy says TXT/SRT/VTT downloads, 14 languages.
- `MotionStudioSection`: 4 featured templates playing live, each card links to `/motion/<templateId>`; "Open Motion Studio" → `/motion`.
- `AiEditSection`: demo + "Try AI Edit" → `/start?choose=1`.
- `Control`, `Privacy`, `Faq`, `ClosingCta`: in-page sections (no outbound route links found beyond anchors). `ClosingCta` links to `/start?choose=1`.
- `Footer`: 4 columns. Product: How it works (`/#how`), Pricing (`/pricing`), Auto caption generator (`/auto-caption-generator`), Transcribe (`/transcribe`), Looks gallery (`/#looks`), Precision controls (`/#control`). For creators: looks/FAQ anchor links. Help: FAQ (`/#faq`), Project studio (`/dashboard`). Company: About, Support (`mailto:work.techhacksai@gmail.com`), Sign in to app (`/login`), Terms, Privacy, Cookie policy, Acceptable use, Copyright & takedowns, Subprocessors, Credits & licences. No footer link to `/clipper`, `/ai-clipper`, `/create`, `/analyzer`, or `/prompter`.
- "Explore more" card: NOT present in this worktree. Grep for `Explore` / `explore-more` / `ExploreMore` across `apps/frontend/src` returns nothing. Per parent context it exists on a pushed branch, not deployed, and not in this worktree at `b32c36a`. Recorded as not mappable here.

## 9. Theme / brand constants (verified in code)

- Dark theme `#141412` background, `#FFFFEB` text, emerald `#34D399`, orange `#FFA946` (homepage `Sections.tsx` constants; `lib/seo.ts` feature list also names the accents).
- House SVG icons only; no Lucide in the studio nav (`nav.ts` maps ids to inline SVG). No claim made about every file.
- Legal identity (`apps/frontend/src/lib/legal.ts`): operator "Parvez Achhan Ali Siddiqui, an individual (sole proprietor) trading as Captionit", address "India", email `work.techhacksai@gmail.com`, effective 30 September 2026, minimum age 13.

## 10. Light live-check results (curl, 2026-11-14)

- 200: `/`, `/pricing`, `/login`, `/auto-caption-generator`, all 8 legal pages, `/sitemap.xml`, `/robots.txt`, `/health`, `/health/ready`, and all 22 dashboard URLs listed in §4 plus `/start`, `/onboarding`, `/pair`, `/forgot-password`, `/reset-password`, `/settings`, `/settings/billing`.
- 308: apex `https://captionit.in/` → `https://www.captionit.in/`.
- 404: `/ads.txt` — BY DESIGN. `apps/frontend/src/app/ads.txt/route.ts` returns 404 while no valid AdSense publisher id (`pub-...`) is configured in env. No ads run until the owner connects AdSense. Not a bug.
- Not checked live: any `/api/*` route (no state-changing calls; GET-only API routes were also not probed, to keep this pass strictly read-only and avoid touching auth-gated endpoints).
- Dashboard 200s for anonymous curl do not mean the pages are usable signed-out; see §5.

## 11. Could not map (with reason)

- "Explore more" homepage card: absent from this worktree (see §8). Needs the branch that holds it.
- Whether `/create/chat` is reachable from inside `/create` UI (no `href`/`router.push` to it found outside its own files in the greps run; the `/create` page itself is 895 lines and its internal links were not exhaustively traced). Flag for the testing phase.
- Whether `/analyzer` and `/prompter` have any in-app entry point besides direct URL (none found in nav, homepage, footer, dashboard, captions, editor, or studio panels greps; the full StudioPage panel list was not exhaustively traced for deep links). Flag for the testing phase.
- Live behaviour of every route (auth redirects, guest bootstrap, actual rendering): not tested by design in this phase.
- `/health/ready` live 200 confirms the endpoint answers; its `queue` detail body was not recorded (only the status code was captured).
