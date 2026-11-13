# API report — route inventory (code review half)

Scope: worktree `~/workspace/oc-overnight-qa`, branch `qa/captionit-full-audit-fixes`, base origin/main @ b32c36a.
Method: read-only code review. No builds, no test runs, no live requests.
This file is the **code half only** (guard per route, from `discovery/route-inventory.csv` + direct reads of every route file). Live-HTTP results belong to W1 and are not in this file.
Every entry below is **code review; runtime repro pending**.

## Counts

- 60 API routes under `apps/frontend/src/app/api` (59 under `v1/`, 1 cron) + 2 health routes (`/health`, `/health/ready`).
- Guards: requireUser 51, requireWorker 6 (4 of those also requireHeldJob), webhook signature 1, OAuth HMAC state 1, companions flag + rate limit only 2, cron bearer 1, public-by-design health 2.
- 57 of 60 API routes use the `route()` wrapper (`lib/api/http.ts`); the 3 exceptions are cron/cleanup, billing/webhook, growth/connect callback (all return plain Responses by design).
- No API route was found with no guard other than the two health routes.

## Guard table

| Route | Methods | Guard (code) | Notes |
|---|---|---|---|
| /api/cron/cleanup | GET | Cron bearer (`CRON_SECRET`) | `cron/cleanup/route.ts:21-22`. Plain `!==` compare (BUG-006). Deletes stale guests + old files. |
| /api/v1/billing/checkout | POST | requireUser, guest FORBIDDEN | `billing/checkout/route.ts:21-24`. Price server-side. Known live failure: Cashfree errors become generic "Something went wrong" via `route()` wrapper. |
| /api/v1/billing/me | GET | requireUser | `billing/me/route.ts:17`. Reads via RLS client; expired plan reads as Free. |
| /api/v1/billing/reconcile | POST | requireUser | `billing/reconcile/route.ts:17`. Settles only from server-to-server Cashfree PAID check; payment must belong to caller. |
| /api/v1/billing/webhook | POST | Webhook signature (HMAC, raw body, timing-safe) | `billing/webhook/route.ts:15-20`, `lib/billing/cashfree.ts:148-155`. Only channel that grants a plan on its own. Idempotent settle. |
| /api/v1/brand/profiles | GET, POST | requireUser | RLS client on `brand_kits`. |
| /api/v1/brand/profiles/[id] | PUT, DELETE | requireUser | RLS client; explicit owner filter on delete. |
| /api/v1/brand/profiles/[id]/activate | POST | requireUser | RLS client. |
| /api/v1/brand | GET, PUT | requireUser | RLS client on `brand_kits`. |
| /api/v1/clipper/highlights | GET, POST | requireUser | |
| /api/v1/content | GET, POST | requireUser | RLS client on `content_items`. |
| /api/v1/content/[id] | PATCH, DELETE | requireUser | RLS client. |
| /api/v1/content/threads | GET, POST | requireUser | RLS client on `chat_threads`. |
| /api/v1/content/threads/[id] | GET, PATCH, DELETE | requireUser | RLS client. |
| /api/v1/content/threads/[id]/messages | POST | requireUser | RLS client. |
| /api/v1/create/generate | GET, POST | requireUser | GET is the Free-AI status probe. |
| /api/v1/device/approve | GET, POST | requireUser (+ companions flag on POST only) | GET leaks any pairing code (BUG-004). POST approves/denies by code. |
| /api/v1/device/setup | POST | requireUser + companions flag | |
| /api/v1/device/start | POST | Companions flag + IP rate limit only | No user session by design; mints pairing code. |
| /api/v1/device/token | POST | Companions flag + rate limits only | No user session by design; atomic consume; token shown once, SHA-256 stored. |
| /api/v1/exports | GET | requireUser | RLS client. |
| /api/v1/exports/[id]/download | GET | requireUser | RLS read first, then mints 600 s signed link. |
| /api/v1/growth/chat | GET, POST | requireUser | |
| /api/v1/growth/competitors | GET, POST | requireUser | RLS client. |
| /api/v1/growth/competitors/[id] | PATCH, DELETE | requireUser | RLS client. |
| /api/v1/growth/connect/[platform]/start | GET | requireUser | Mints HMAC-signed OAuth state (10-min TTL). |
| /api/v1/growth/connect/[platform]/callback | GET | OAuth HMAC state only | No Authorization header by design; caller identified by signed state. |
| /api/v1/growth/connect/[platform]/disconnect | POST | requireUser | |
| /api/v1/growth/connect/[platform]/sync | POST | requireUser | |
| /api/v1/growth/connections | GET | requireUser | Admin reads scoped by caller id; token values never selected. |
| /api/v1/growth/posts | GET, POST | requireUser | RLS client. |
| /api/v1/growth/posts/[id] | PATCH, DELETE | requireUser | RLS client + explicit owner filter. |
| /api/v1/growth/posts/import | POST | requireUser | RLS client. |
| /api/v1/guest/claim | POST | requireUser, guest FORBIDDEN | Guest identity proven by guest's own tokens; rate-limited 20/hr. |
| /api/v1/jobs/[id]/browser | POST | requireUser | RLS read first, admin write by id after. |
| /api/v1/jobs/[id]/cancel | POST | requireUser | RLS read first, admin write by id after. |
| /api/v1/jobs/[id]/retry | POST | requireUser | RLS read first, admin write by id after. |
| /api/v1/looks | GET, POST | requireUser | RLS client. |
| /api/v1/looks/[id] | DELETE | requireUser | RLS client. |
| /api/v1/projects | GET, POST | requireUser | Plan maxProjects enforced server-side. |
| /api/v1/projects/[id] | GET, PATCH, DELETE | requireUser | RLS read first; DELETE via admin after RLS read. |
| /api/v1/projects/[id]/archive | POST | requireUser | |
| /api/v1/projects/[id]/unarchive | POST | requireUser | |
| /api/v1/projects/[id]/duplicate | POST | requireUser | |
| /api/v1/projects/[id]/clips | POST | requireUser | |
| /api/v1/projects/[id]/document | GET, PUT | requireUser | Revision-checked save. |
| /api/v1/projects/[id]/studio | GET | requireUser | |
| /api/v1/projects/[id]/transcribe | POST | requireUser | Server-side transcribe record; browser Whisper runs client-side. |
| /api/v1/projects/[id]/translations | GET, PUT | requireUser | |
| /api/v1/projects/[id]/exports | GET, POST | requireUser, guest FORBIDDEN on POST | Export requires a signed-in account. |
| /api/v1/projects/[id]/videos | POST | requireUser | Size/duration/MIME checks — see security-report §4 (BUG-001, BUG-002). |
| /api/v1/videos/[id]/complete | POST | requireUser | Checks object exists; does NOT re-check size cap or duration (BUG-002). |
| /api/v1/worker/heartbeat | POST | requireWorker | touch: false (writes liveness itself). |
| /api/v1/worker/jobs/claim | POST | requireWorker | |
| /api/v1/worker/jobs/[id]/complete | POST | requireWorker + requireHeldJob | allowDone: true. |
| /api/v1/worker/jobs/[id]/fail | POST | requireWorker + requireHeldJob | |
| /api/v1/worker/jobs/[id]/progress | POST | requireWorker + requireHeldJob | |
| /api/v1/worker/jobs/[id]/urls | POST | requireWorker + requireHeldJob | |
| /api/v1/workers | GET | requireUser | Lists caller's workers (RLS). |
| /api/v1/workers/[id] | PATCH, DELETE | requireUser | RLS read first; DELETE revokes via admin after RLS read; clears worker cache. |
| /health | GET | None (public) | Returns `{"status":"ok"}`. |
| /health/ready | GET | None (public) | DB + queue readiness; 200/503. Returns queue detail object. |

## Error envelope (code)

`lib/api/http.ts`: `route()` wrapper maps `ApiFailure` → `{ success: false, error: { code, message, details? } }` with status from `ERROR_STATUS` (`packages/shared/src/api.ts:7-11`); unknown errors → `INTERNAL` / "Something went wrong", message logged server-side only, no stack in response. `parseBody` strips unknown keys (zod) and returns 422 with flattened validation details. Note: `details` is echoed to the client, and ~41 sites pass Supabase `error.message` as details (BUG-005, P3).

## Data-isolation pattern (code)

Most `[id]` routes read through the caller's RLS-scoped client (`getUserClient`, `lib/supabase/admin.ts`) and 404 when the row is not theirs, then perform writes via the admin client keyed by id. RLS policies are owner-scoped in SQL (`supabase/APPLY-ALL-SCHEMA.sql:548-607` and the APPLY-*.sql files for growth/content/billing). Whether that SQL is applied on the live DB cannot be verified from code. One exception: device/approve GET (BUG-004).

---

# API / HTTP-layer report — W1 live-HTTP (2026-11-14 ~02:16–02:35 IST)

**HTTP layer only; browser/API behaviour not covered here.** This half proves HTTP
behaviour of the live site https://www.captionit.in only: status codes, headers,
sitemap/robots, served-HTML strings, and unauthenticated API responses. It does NOT
prove any feature works — dashboard/app pages return 200 as anonymous shells, and
authenticated behaviour, JS execution, and real API function are for other layers.
Full raw curl outputs: `../evidence/network/live-http-2026-11-14.md` and
`../evidence/network/raw/` (one `.headers` / `.body` / `.curlinfo` set per URL).

Method: anonymous `curl` GET only. No builds, no test runs, no dev servers, no
POST/PUT/DELETE, no state-changing calls, no approvals requested.

## Verdicts

| Item | Result |
|---|---|
| All 39 pages return 200 | **Pass** — 39/39, no redirects. Dynamic probes: `/motion/counter` (real template id) 200; `/projects/test123` and `/projects/test123/settings` (placeholder id) 200 shells. |
| /sitemap.xml, /robots.txt, /health, /health/ready | **Pass** — all 200. |
| /ads.txt | **Pass** — 404 by design (no AdSense publisher id). |
| Apex `https://captionit.in/` | **Pass** — 308 → `https://www.captionit.in/`. |
| Security headers M50 | **Pass** — all 6 headers on all 39 pages + aux endpoints + API 401s (44 responses, 0 missing). Identical CSP (1252 chars) everywhere. |
| Sitemap | **Pass** — 12 `<loc>`, all `https://www.captionit.in/...`, all 12 with `<lastmod>` (2026-11-13T19:58:46.602Z). |
| Robots | **Pass** — `/transcribe`, `/ai-clipper`, `/onboarding` disallowed; `/login`, `/pricing` NOT disallowed. Full list in evidence file. |
| Home served HTML | **Pass** — contains `Captionit` (3×), `95% Hinglish` (1×), `150 looks` (2×); zero hrefs (and zero occurrences at all) of `/clipper`, `/ai-clipper`, `/analyzer`, `/prompter`, `/create`; canonical `https://www.captionit.in`. |
| /login GIS client id | **Pass** — `401611748843` present in served JS chunk `/_next/static/chunks/168dq3d6bx0im.js` (not in the HTML itself; not hardcoded in src — env config). |
| /pricing HTML | **Pass** — `$0`/`$4`/`$6`/`$10` rendered. INR 299/499/799 present only in Product JSON-LD; no literal `₹` glyph in served HTML from this non-IN egress. Per geo rule (India INR, elsewhere USD) this is expected; INR rendering needs an India-egress check — open observation, not a bug. |
| Unauthenticated APIs M52/M53/M54 | **Pass** — GET `/api/v1/billing/me`, `/api/v1/projects`, `/api/v1/growth/connections` all 401 `{"success":false,"error":{"code":"UNAUTHORIZED","message":"Missing bearer token"}}`, no data. Wording matches `apps/frontend/src/lib/api/auth.ts:33`. |
| /health/ready body | **Pass** — 200 `{"status":"ready","checks":{"database":true,"queue":true},"queue":{"claim_fn":true,"reaper_ok":true}}`, no secrets. |

## Status table (summary)

39 pages: all 200, no redirect. Aux: `/sitemap.xml` 200, `/robots.txt` 200,
`/health` 200, `/health/ready` 200, `/ads.txt` 404 (by design), apex 308 → www.
Full table with byte sizes in the evidence file.

## Security headers (M50)

Exact values, identical on all 44 responses:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://va.vercel-scripts.com https://sdk.cashfree.com https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://api.dicebear.com https://api.producthunt.com https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://cdn.pixabay.com; font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; media-src 'self' blob: data: https://*.supabase.co https://cdn.pixabay.com; connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co https://huggingface.co https://*.huggingface.co https://*.hf.co https://va.vercel-scripts.com https://vitals.vercel-insights.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://api.cashfree.com https://sandbox-api.cashfree.com https://sdk.cashfree.com https://api.pixabay.com https://cdn.pixabay.com https://fonts.googleapis.com https://accounts.google.com; worker-src 'self' blob:; child-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src https://sdk.cashfree.com https://payments.cashfree.com https://accounts.google.com; frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=()`

Note: the apex 308 redirect carries only HSTS (no other headers). Normal for a bare
redirect with no body; not a defect.

## Unauthenticated API GETs (M52/M53/M54)

| Route | Status | Body |
|---|---|---|
| GET /api/v1/billing/me | 401 | `{"success":false,"error":{"code":"UNAUTHORIZED","message":"Missing bearer token"}}` |
| GET /api/v1/projects | 401 | `{"success":false,"error":{"code":"UNAUTHORIZED","message":"Missing bearer token"}}` |
| GET /api/v1/growth/connections | 401 | `{"success":false,"error":{"code":"UNAUTHORIZED","message":"Missing bearer token"}}` |

No tokens/secrets in any response. All 6 security headers present on the 401s too.

## Bugs filed by this layer

None. No defect found: no page 404/500, no missing header, no wrong sitemap URL,
no unauthenticated API returning data.

## Open observation (not a bug)

INR (₹) price rendering on /pricing is geo-dependent and was not observable from this
VM's non-IN egress (USD served, INR only in JSON-LD). If the coordinator wants the
Indian-visitor rendering confirmed, it needs an India-egress check.

## Test-matrix updates

`planning/test-matrix.csv`: M50, M52, M53, M54 set to `pass` with one-line notes
(new `notes` column). No other rows touched.

## Addendum — overnight session runtime API observations (recovery coordinator)
- Authenticated `GET /api/v1/projects` with a fresh guest token returns 200
  (`data:[]`) in ~3.1s when the dev server runs with `NODE_USE_ENV_PROXY=1`
  (server-side fetch needs the egress proxy; without it the route hangs 25s+).
  The proxy credential rotates — a stale dev-server credential hangs the API
  again; restart the dev server from a fresh exec.
- `GET /api/v1/projects/[id]/studio` and `/translations` take ~7.5s
  (application-code) on first load in dev — the Studio skeleton shows until then.
- No new API defects found in this session. BUG-001/002/005/006 (code layer)
  remain open as recommendations.
