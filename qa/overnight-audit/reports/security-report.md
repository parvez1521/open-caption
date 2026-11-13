# Security report — code review (W2)

Scope: worktree `~/workspace/oc-overnight-qa`, branch `qa/captionit-full-audit-fixes`, base origin/main @ b32c36a.
Method: read-only code review. No builds, no test runs, no dev servers, no live requests.
Every finding below is **code review; runtime repro pending** (needs CDP/live repro by another worker).
Known live failure NOT re-fixed here: Cashfree checkout fails live with generic "Something went wrong" (error-surface fix is on another branch).

## 1. Security headers

Source: `apps/frontend/src/lib/securityHeaders.ts`, wired in `apps/frontend/next.config.ts:24-26` as `{ source: "/:path*", headers: securityHeaders }` — applies to every route including API routes. Extra `Cache-Control: public, max-age=31536000, immutable` rules for `/looks`, `/hero`, `/brand`, `/images` merge on top; security headers still apply there.

| Header | Value | Notes |
|---|---|---|
| Content-Security-Policy | built by `buildContentSecurityPolicy()` (see below) | `securityHeaders.ts:151-155` |
| X-Content-Type-Options | `nosniff` | `securityHeaders.ts:156` |
| Referrer-Policy | `strict-origin-when-cross-origin` | `securityHeaders.ts:157` |
| X-Frame-Options | `DENY` | `securityHeaders.ts:158` |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` | `securityHeaders.ts:159` — present, strong |
| Permissions-Policy | `camera=(self), microphone=(self), geolocation=(), payment=()` | `securityHeaders.ts:163` — camera/mic `(self)` is deliberate (Teleprompter recorder) |

CSP directives (`securityHeaders.ts:50-149`):

| Directive | Value |
|---|---|
| default-src | `'self'` |
| script-src | `'self' 'unsafe-inline' 'wasm-unsafe-eval'` (+ `'unsafe-eval'` in dev only), `https://va.vercel-scripts.com`, `https://sdk.cashfree.com`, `https://accounts.google.com` |
| style-src | `'self' 'unsafe-inline'` |
| img-src | `'self' data: blob:`, `https://*.supabase.co`, `https://images.unsplash.com`, `https://api.dicebear.com`, `https://api.producthunt.com`, `https://lh3.googleusercontent.com`, `https://avatars.githubusercontent.com`, `https://cdn.pixabay.com` |
| font-src | `'self' data:`, `https://fonts.gstatic.com`, `https://cdn.jsdelivr.net` |
| media-src | `'self' blob: data:`, `https://*.supabase.co`, `https://cdn.pixabay.com` |
| connect-src | `'self' blob:`, `https://*.supabase.co`, `wss://*.supabase.co`, `https://huggingface.co`, `https://*.huggingface.co`, `https://*.hf.co`, `https://va.vercel-scripts.com`, `https://vitals.vercel-insights.com`, `https://*.ingest.sentry.io`, `https://*.ingest.us.sentry.io`, `https://api.cashfree.com`, `https://sandbox-api.cashfree.com`, `https://sdk.cashfree.com`, `https://api.pixabay.com`, `https://cdn.pixabay.com`, `https://fonts.googleapis.com`, `https://accounts.google.com` |
| worker-src / child-src | `'self' blob:` |
| manifest-src | `'self'` |
| object-src | `'none'` |
| base-uri / form-action | `'self'` |
| frame-src | `https://sdk.cashfree.com`, `https://payments.cashfree.com`, `https://accounts.google.com` |
| frame-ancestors | `'none'` |

Findings:

- **CSP covers every host the app needs (code review).** Google GIS (`accounts.google.com` in script/frame/connect-src), Google Fonts (`fonts.googleapis.com` connect-src, `fonts.gstatic.com` font-src), Supabase (`*.supabase.co` + wss), Cashfree SDK/API (`sdk.cashfree.com`, `api.cashfree.com`, `sandbox-api.cashfree.com`, `payments.cashfree.com` frame-src), Hugging Face model hosts, Pixabay, Sentry ingest, Vercel Analytics — all present. No host the code loads was found missing. Runtime repro pending.
- **Over-permissive, deliberate and documented (P3 observation, not a bug):** `script-src 'unsafe-inline'` (`securityHeaders.ts:53`) and `style-src 'unsafe-inline'` (`securityHeaders.ts:70`) — no nonce pipeline; comment at `securityHeaders.ts:44-48` says this is a known trade-off because Next.js App Router emits inline bootstrap scripts. `'wasm-unsafe-eval'` (`securityHeaders.ts:54`) is required for ONNX WASM. `'unsafe-eval'` is dev-only (`securityHeaders.ts:56`). No wildcard (`*`) hosts anywhere.
- **Missing (P3 notes):** no `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` — deliberately removed per `next.config.ts` comment (COOP/COEP broke the speech worker on some Android phones, Sentry SENTRY-COPPER-QUEEN-5). No `upgrade-insecure-requests`. No `Cross-Origin-Resource-Policy`. None is a defect on its own; runtime header check (W1) should confirm the headers actually arrive.
- **No route/page sets different headers.** One global rule (`/:path*`); no per-route header overrides exist in code. No middleware file exists in `apps/frontend/src` (no `middleware.ts` found) — auth on pages is client-side, not middleware-enforced (see §2 note).

## 2. Auth boundaries

Guard primitives (`apps/frontend/src/lib/api/auth.ts`):
- `requireUser` (`auth.ts:31-45`): Bearer Supabase token verified via `getAdmin().auth.getUser(token)`; returns RLS-scoped client. Verified tokens cached 20 s (`TOKEN_TTL_MS`, `auth.ts:27`) — a revoked token can still pass for up to 20 s (documented trade-off, P3 note).
- `requireWorker` (`auth.ts:85-118`): Bearer `cpe_...` token, SHA-256 lookup, revoked rejected; verified workers cached 60 s (`WORKER_CACHE_MS`, `auth.ts:69`) — revocation takes up to 60 s (documented, P3 note). Refused outright unless `COMPANIONS_ENABLED=1` (`auth.ts:81-83,86`).
- `requireHeldJob` (`lib/api/jobs.ts:74-82`): job must be `processing` and held by this worker.
- `requireCompanionsEnabled` (`auth.ts:87-90`): 403 unless `COMPANIONS_ENABLED=1`.

Route inventory (60 API routes under `src/app/api` + 2 health routes; full table in `reports/api-report.md`):

| Group | Count | Guard |
|---|---|---|
| requireUser | 51 | all v1 user routes incl. projects, exports, growth, content, brand, looks, jobs, clipper, create |
| requireWorker | 6 | heartbeat, jobs/claim, jobs/[id]/complete, fail, progress, urls (last 4 also requireHeldJob) |
| Webhook signature | 1 | billing/webhook |
| OAuth HMAC state | 1 | growth/connect/[platform]/callback |
| Companions flag + rate limit only (no user session) | 2 | device/start, device/token |
| Cron bearer | 1 | cron/cleanup |
| None (public by design) | 2 | /health, /health/ready (return status only) |

Verified per-route details:

- **Billing checkout — guests FORBIDDEN.** `app/api/v1/billing/checkout/route.ts:22-24`: `requireUser`, then `if (user.guest) throw ApiFailure("FORBIDDEN", ...)`. Price comes from server-side `PLAN_PRICING`, never the client (`checkout/route.ts:26-30`).
- **Guest claim.** `app/api/v1/guest/claim/route.ts:30-35`: `requireUser`, guests forbidden, rate-limited 20/hr, guest identity proven by the guest's own access/refresh token validated via Supabase (`guestFromTokens`, lines 16-24). Moves only rows owned by that guest id. Sound in code.
- **Device token.** `app/api/v1/device/token/route.ts:9-11,19`: companions flag + IP rate limit (600/hr) + per-code-hash limit (300/hr); atomic consume (`update ... eq("status","approved")`, line 32); token shown once, stored as SHA-256 hash (line 43). Sound in code.
- **Device start.** `app/api/v1/device/start/route.ts:14-18`: companions flag + IP rate limit 20/hr + live-pending-code cap 500. Sound in code.
- **Cron cleanup.** `app/api/cron/cleanup/route.ts:21-22`: `Authorization: Bearer CRON_SECRET`, 401 otherwise; fail-closed when secret unset. Comparison is plain `!==`, not timing-safe — see BUG-006 (P3).
- **OAuth callback HMAC state.** `lib/api/connections/state.ts:50-71`: HMAC-SHA256 over (userId, platform, expiry), keyed by service-role key, 10-min TTL, platform match, timing-safe compare (`state.ts:60-62`). Callback (`growth/connect/[platform]/callback/route.ts:15-22`) rejects bad/missing state. Sound in code.
- **Webhook signature.** `lib/billing/cashfree.ts:148-155`: `verifyWebhookSignature` HMAC-SHA256 over `timestamp + rawBody`, raw body from `req.text()` (`webhook/route.ts:15`), timing-safe compare. Sound in code. No timestamp-freshness window — a replayed signed webhook is possible in theory, but `settlePaid` is idempotent (see §3), so a replay cannot double-grant. Observation only, no bug filed.
- **No route with NO guard** among the 60 API routes, except the two health routes which are public by design and return status only (`app/health/route.ts`, `app/health/ready/route.ts`).
- **Device approve GET — wrong guard (BUG-004, P3).** `app/api/v1/device/approve/route.ts:9-16`: `requireUser` result is discarded; reads any pairing code via admin client by user code with no ownership check and no rate limit, and does not call `requireCompanionsEnabled` (POST does, line 19). POST (lines 19-31) lets any signed-in user who knows an 8-char code bind the device to their own account. Code entropy (32^8) makes guessing impractical, so P3.
- **Rate limit fails open.** `lib/api/rateLimit.ts:10-14`: if the DB call errors, the limit is skipped (`if (error) return`). Documented in code. P3 note.

## 3. Billing

- **Webhook is the only channel that grants a plan on its own.** `app/api/v1/billing/webhook/route.ts:36-40` calls `settlePaid` only on `PAYMENT_SUCCESS_WEBHOOK` after signature verification. Reconcile (`app/api/v1/billing/reconcile/route.ts:12-26`) settles only from a server-to-server `fetchCashfreeOrder` PAID result, never from browser state, and only for a payment whose `owner_id` matches the caller (line 19). It cannot grant without payment. Confirmed in code.
- **Replay / idempotency.** `lib/billing/settle.ts:38-39,59` and `75-80`: `settlePaid`/`settleClosed` return early unless status is `created`, and the update is conditional on `.eq("status", "created")` — a second settle (webhook retry, replay, or reconcile race) is a no-op. Same order_id twice cannot double-grant. Confirmed in code.
- **Fail-open plan expiry (BUG-003, P2).** `packages/shared/src/plans.ts:46-55` (`effectivePlanId`): a paid plan with an unparseable `plan_expires_at` reads as paid (`Number.isFinite(...) && ... ? "free" : id` — NaN expiry returns the paid id), and a paid plan with `plan_expires_at = null` also reads as paid (`if (id === "free" || !expiresAt) return id`). The unit test even asserts the fail-open case (`packages/shared/src/plans.test.ts:61`: `effectivePlanId("growth", "not-a-date")` → `"growth"`). `settlePaid` always writes a real `period_end`, so this needs a corrupt/null expiry row to trigger; still a fail-open. Runtime repro pending.
- **Checkout error path (known, not re-filed).** `checkout/route.ts` calls `createCashfreeOrder`, which throws a plain `Error` on Cashfree failure (`cashfree.ts:78-80`); the `route()` wrapper turns it into generic "Something went wrong" (`lib/api/http.ts:43-44`). This is the known live failure; the fix lives on another branch.

## 4. Upload validation (client vs server)

Plan limits (`packages/shared/src/plans.ts:27-31`): Free 50 MB upload / 2 GB local / 5 min; Starter 200 MB / 30 min; Growth 500 MB / 60 min; Pro 2 GB / 3 h.

| Limit | Server | Client | Verdict |
|---|---|---|---|
| File-type allowlist (MP4, MOV, WebM, MKV) | Yes — `videos/route.ts:17-19` checks `body.mime` against `VIDEO_MIME_TYPES` (`packages/shared/src/api-schemas.ts:6`) | Yes — `accept` attr (`UploadPanel.tsx:212`, `MediaPanel.tsx:132`) + `prepareVideo` | Both, but server checks only the **client-declared** MIME string, never file content (see BUG-002) |
| Size limit | Partial — `videos/route.ts:23-26` compares **client-declared** `body.size` to the plan cap | Yes — `prepareVideo.ts:78` rejects oversize files on device | Declared-size only server-side; actual stored bytes never re-checked (BUG-002, P2) |
| Duration limit | Only if client sends a probe — `videos/route.ts:27-29`: `if (body.probe && ...)`; probe is optional (`api-schemas.ts:28`) | Yes — `prepareVideo.ts:92-93` throws `TOO_LONG` | **Client-side only in practice** — omitting `probe` skips the server check entirely (BUG-001, P2). `videos/[id]/complete/route.ts:22-24` checks the object exists and records its real size but never checks duration or the plan size cap |

## 5. Error handling

- `lib/api/http.ts:34-45` (`route()` wrapper): `ApiFailure` → standard envelope with code/message/details; `ZodError` → 422; anything else → logged server-side (message only) and answered `failResponse("INTERNAL", "Something went wrong")`. No stack traces in responses. The generic path is the known checkout failure.
- **Supabase error text leaks to clients (BUG-005, P3).** `failResponse` (`http.ts:14-16`) includes the `details` field in the JSON body, and ~41 call sites pass a Supabase/Postgres `error.message` as details (or message), e.g. `checkout/route.ts` (insert error in the message), `brand/profiles/route.ts:60,69,80`, `content/route.ts:45`, `exports/route.ts:20`, `guest/claim/route.ts:42`. These expose table/constraint internals. No secrets observed in these messages (code review only).
- Routes NOT using the `route()` wrapper: `cron/cleanup/route.ts` (returns Supabase `error.message` in a 500 JSON, line 29, and user ids + error text in the `failures` list — bearer-gated), `billing/webhook/route.ts` (plain-text 401/400/500, no internals), `growth/connect/[platform]/callback/route.ts` (redirects with a generic flag, details stay server-side). All acceptable except the cron leak noted above.
- `ERROR_STATUS` (`packages/shared/src/api.ts:7-11`): UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND 404, VALIDATION 422, CONFLICT 409, LIMIT_EXCEEDED 402, RATE_LIMITED 429, UPSTREAM_FAILED 502, INTERNAL 500. Honest statuses in code.

## 6. Data isolation

- **RLS is owner-scoped in SQL** for every main table: `supabase/APPLY-ALL-SCHEMA.sql:548-607` (`profiles`, `projects`, `videos`, `transcripts`, `caption_documents`, `caption_translations`, `caption_document_versions`, `workers`, `jobs`, `exports`, `brand_kits`, `user_looks`, `favorite_looks`, `user_fonts`, `usage_events`, `job_events` — all `owner_id = auth.uid()`), plus `APPLY-GROWTH-STUDIO.sql:73-82` (growth_posts, competitor_profiles), `APPLY-GROWTH-CONNECT.sql:55` (growth_connections), `APPLY-CONTENT-LIBRARY.sql:74-87` (content_items, chat_threads, chat_messages), `APPLY-BILLING.sql:65-71` (payments, select-own only). `profiles.plan` is server-written only (`lock_profile_plan` migration). Whether this SQL is actually applied to the live DB cannot be verified from code — runtime/DB check pending.
- **Route pattern is sound in code:** `[id]` routes read through the caller's RLS-scoped `user.db` first (404 if not theirs) and only then write via admin keyed by id, e.g. `projects/[id]/route.ts:23-31,90-91,131`, `jobs/[id]/cancel/route.ts:10-16`, `workers/[id]/route.ts:10-13`, `exports/[id]/download/route.ts:9-10`, `growth/posts/[id]/route.ts:63-69` (explicit `.eq("owner_id", user.id)` as well). No route was found reading by id without an ownership check, except the device/approve GET in BUG-004 (device_codes has RLS with no user policies — service-role only by design, `APPLY-ALL-SCHEMA.sql` comment).
- **Admin-client routes that stay scoped:** billing checkout/reconcile (owner check on the payment row), guest/claim (guest id proven by token), device start/token (code hash), growth/connections (`countSyncedPosts` filters `.eq("owner_id", ownerId)` with the caller's id, `growth/connections/route.ts:15-19`). No isolation defect found in these beyond BUG-004.

## 7. Secrets in client code

**Result: none found.** Greps over `apps/frontend/src` for JWT-shaped strings (`eyJ...`), `sk-`/`ghp_`/`xox*`/AWS keys, PEM private keys, hardcoded `api_key`/`secret` assignments, and long base64 literals returned no secrets. Only hits were env-var names (`SUPABASE_SERVICE_ROLE_KEY`, `CASHFREE_SECRET_KEY` — referenced via `process.env` only, values never in code), test-file env-key lists, and public Hugging Face model revision hashes in `features/transcribe/runtime.ts` (public identifiers, not secrets). The public GIS client id `401611748843` was not found hardcoded in `src` (it is expected to come from env). No secret values are copied into this report.

## Bugs filed (code defects, runtime repro pending)

| ID | Title | Severity | File:line |
|---|---|---|---|
| BUG-001 | Video duration limit bypassed by omitting the client probe | P2 | `apps/frontend/src/app/api/v1/projects/[id]/videos/route.ts:27` |
| BUG-002 | Upload size/MIME limits enforced on client-declared values only; actual bytes never re-checked | P2 | `apps/frontend/src/app/api/v1/projects/[id]/videos/route.ts:24`, `apps/frontend/src/app/api/v1/videos/[id]/complete/route.ts:22-24` |
| BUG-003 | `effectivePlanId` fail-open: unparseable/null expiry reads as paid | P2 | `packages/shared/src/plans.ts:52-54` |
| BUG-004 | Device approve GET discloses any pairing code; POST lets any signed-in user claim it | P3 | `apps/frontend/src/app/api/v1/device/approve/route.ts:9-16,19-31` |
| BUG-005 | Supabase error text leaked to API clients in ~41 places | P3 | `apps/frontend/src/lib/api/http.ts:15` + call sites |
| BUG-006 | Cron bearer compared with plain `!==`, not timing-safe; cron 500 leaks DB error text | P3 | `apps/frontend/src/app/api/cron/cleanup/route.ts:22,29` |

Observations (not filed as bugs): CSP `unsafe-inline`/`wasm-unsafe-eval` is a deliberate documented trade-off; COOP/COEP deliberately removed after breaking Android speech workers; webhook has no timestamp-freshness window but settle idempotency neutralises replay; 20 s user-token cache and 60 s worker cache delay revocation (documented); rate limiter fails open on DB error (documented).

## Addendum — overnight session (recovery coordinator, 2026-11-14)
- **Live-HTTP verification (W1)**: M50 PASS — all 6 headers on all 39 pages + aux + API 401s (44 responses, 0 missing); identical CSP everywhere. M52/M53/M54 PASS — billing/me, projects, growth/connections all 401 unauthenticated, no data.
- **CDP runtime**: logged-out /dashboard redirects to /login (M40 PASS). Guest export is gated by design (signup gate, verified by screenshot). No secrets found in any evidence file; the QA mission created only throwaway anonymous guest sessions via the public signup endpoint (the app's own mechanism) plus one orphan guest project (`ddb90b06-a0e4-4467-9113-fc50924cfee4`, token discarded). No real user data was read, written, or exposed.
- BUG-001/002/004/005/006 remain code-confirmed without a runtime repro in this mission (each needs a server-side probe not safely runnable from this sandbox). BUG-003 stays excluded by owner decision.
