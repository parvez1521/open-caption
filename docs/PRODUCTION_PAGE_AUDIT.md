# Production Page Audit — Captionit

Read-only audit of production pages and states. No code was changed for this audit.
Scope: page/state coverage only — whether each item exists, is adequate, is missing,
or does not apply to this product. Findings are grounded in the repository at
`apps/frontend` (branch `fix/production-pages-audit-2026-11-23`).

### Method

A read-only Phase 1 scan supplied the evidence base. The most load-bearing
claims were spot-checked against the source before being written into this doc:

- Login email mode and Google-primary account creation — read
  `apps/frontend/src/app/login/page.tsx` in full (mode `"google" | "email"`,
  comment: "Google is the only way to create an account").
- Refund mentions — searched the whole `src` tree; "refund" appears only in
  `apps/frontend/src/app/pricing/page.tsx` and
  `apps/frontend/src/app/(legal)/about/page.tsx`.
- Billing return flow — read the reconcile block in
  `apps/frontend/src/app/(dashboard)/settings/billing/page.tsx` (`order_id`
  hint, `POST /api/v1/billing/reconcile`, "browser's return parameters are
  never trusted") and the `return_url` in
  `apps/frontend/src/lib/billing/cashfree.ts`.
- Consent banner — read `apps/frontend/src/components/ads/ConsentBanner.tsx`
  and `apps/frontend/src/lib/adConsent.ts` (key `captionit-ad-consent`,
  self-described as "NOT a Google-certified CMP").
- Legal facts and TODO — read `apps/frontend/src/lib/legal.ts` in full
  (operator, address "India", effective 30 September 2026, minimum age 13,
  "Fill every value marked TODO before launch (and have a lawyer review the
  pages)").
- Sitemap — read `apps/frontend/src/app/sitemap.ts` and `INDEXABLE_PATHS` in
  `apps/frontend/src/lib/seo.ts` (6 marketing routes + 8 legal pages;
  `/login` deliberately excluded; `/face-swap` and `/image-editor` public
  but not listed).
- Special files — confirmed `apps/frontend/src/app/not-found.tsx`,
  `error.tsx`, `global-error.tsx`,
  `apps/frontend/src/app/(dashboard)/dashboard/loading.tsx`, and
  `apps/frontend/src/proxy.ts` exist; confirmed no `forbidden.tsx` and no
  other per-segment error/loading files.
- Absent routes — confirmed no `support`, `help`, `contact`, `faq`,
  `downloads`, `checkout`, or `refund` route directories under
  `apps/frontend/src/app`.
- Plans and free window — confirmed `PLAN_PERIOD_DAYS = 30` and the four
  prices in `packages/shared/src/plans.ts`, and `FREE_LAUNCH_UNTIL_ISO` in
  `apps/frontend/src/lib/billing/freeLaunch.ts` (free until 5 Dec 2026,
  23:59:59 IST).
- GA4 wording — confirmed Privacy §12 and the Cookie Policy state GA4 "also
  runs on this site" while `gaMeasurementId()` in `src/lib/seo.ts` is
  env-gated with the comment "No id is hardcoded anywhere: none exists yet".

Claims not re-read in full are cited to the specific file that contains them
so they can be checked directly. No live site, account, or payment was used:
this audit covers what the code and copy say, not runtime behaviour.

### Coverage summary

42 checklist items: 11 `EXISTS_AND_ADEQUATE`, 18
`EXISTS_NEEDS_IMPROVEMENT`, 6 `APPLICABLE_MISSING`, 6 `NOT_APPLICABLE`, 1
`BLOCKED_BY_MISSING_INFORMATION` (Refund Policy — the owner has not decided
the window, eligibility, or process). Nothing in this audit asserts legal
compliance; see section 4.

## 1. Project snapshot

- **App type:** Captionit (`www.captionit.in`) — a consumer web tool that adds
  word-timed captions and motion graphics to short-form video, entirely in the
  browser, with MP4/SRT export. No social feed, no public user content, no
  comments, no reviews, no marketplace.
- **Codebase:** monorepo `capseasy-monorepo`; `apps/frontend` is the only app.
  Next 16.4.5, React 19.2.4, TypeScript, Tailwind 4.3.1, Supabase 2.108.2,
  Remotion, Sentry, Vercel Analytics / Speed Insights, zod, framer-motion, gsap,
  tesseract.js, `@huggingface/transformers`. Packages: `caption-engine`, `cli`,
  `cli-render`, `cli-transcribe`, `companion`, `compositions`, `motion`, `shared`,
  `templates`. `supabase/` holds 17 migrations.
- **Auth model:** Supabase Auth (`apps/frontend/src/services/auth/`).
  Google sign-in is the primary and only account-creation path (Google Identity
  Services button in `src/services/auth/googleIdToken.ts`, OAuth fallback in
  `src/services/auth/guest.ts` and `src/services/auth/supabaseAuthProvider.ts`,
  gated by `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`). A legacy email/password sign-in
  also exists on `/login`. Anonymous guest sessions are auto-started by the
  dashboard layout (`apps/frontend/src/app/(dashboard)/layout.tsx`) unless the
  visitor has an account. Session token lives in localStorage under
  `sb-<projectRef>-auth-token`. There is no server middleware auth guard:
  `apps/frontend/src/proxy.ts` only handles `/projects/:id` 404s; the dashboard
  guard is client-side.
- **Payment model:** one-time 30-day passes via Cashfree — no subscriptions, no
  auto-renewal. Single source of truth `packages/shared/src/plans.ts`
  (`PLAN_PERIOD_DAYS = 30`): Free ₹0/$0, Starter ₹149/$2, Plus (plan id
  `growth`) ₹499/$6, Pro ₹799/$10. Currency is geo-based
  (`currencyForCountry` in `apps/frontend/src/lib/billing/cashfree.ts`: India
  gets INR, elsewhere USD). Everything is free until 5 Dec 2026, 23:59:59 IST
  (`FREE_LAUNCH_UNTIL_ISO` in `apps/frontend/src/lib/billing/freeLaunch.ts`);
  paid passes return 6 Dec 2026. Checkout is
  `POST /api/v1/billing/checkout`, webhook `POST /api/v1/billing/webhook`
  (HMAC-SHA256 signature verification), settlement in
  `apps/frontend/src/lib/billing/settle.ts`. Payments are recorded in the
  `payments` table (`cf_order_id`, `cf_payment_id`, `plan`, `amount`, `currency`,
  `status` created/paid/failed/expired, `paid_at`, `period_start/end`).
- **Roles:** one user role (signed-in creator) plus anonymous guests. The only
  admin surface is owner-only (`OWNER_EMAILS` env): CSV export of
  `marketing_subscribers` at `src/app/api/v1/admin/subscribers/route.ts`.
  No teams, no business plans, no B2B offering.
- **Data-sensitive features:** Google account identity (name/email/avatar via
  Supabase Auth); projects (captions, word-level transcripts, settings, file
  name/size/length/format only); videos up to 50 MB auto-backed-up to Supabase
  Storage for multi-device sync; usage/quota events (`usage_events`,
  `video_quota_events`); marketing email capture (`marketing_subscribers`,
  via `/start` and `/api/v1/marketing/capture|preference`); hashed,
  revocable paired-computer tokens; Growth Studio connections (Instagram /
  YouTube OAuth, posts, competitors).
- **Public routes:** 43 `page.tsx` files under `apps/frontend/src/app`, 73 API
  routes, `sitemap.ts`, `robots.ts`, `manifest.ts`. Sitemap indexable paths
  (`INDEXABLE_PATHS` in `apps/frontend/src/lib/seo.ts`): `/`,
  `/auto-caption-generator`, `/auto-captions-for-reels`, `/ai-generator`,
  `/looks`, `/pricing`, plus the 8 legal pages. `/face-swap` and
  `/image-editor` are public but not in the sitemap.

## 2. Audit table

Statuses: `EXISTS_AND_ADEQUATE` | `EXISTS_NEEDS_IMPROVEMENT` |
`APPLICABLE_MISSING` | `NOT_APPLICABLE` | `BLOCKED_BY_MISSING_INFORMATION`.

| Category | Page or state | Status | Evidence | Applicability reason | Required action |
|---|---|---|---|---|---|
| Legal | Privacy Policy | EXISTS_NEEDS_IMPROVEMENT | `apps/frontend/src/app/(legal)/privacy/page.tsx` — 14 sections (collection, purposes, on-device processing, AI features, retention, advertising, rights, security, children, cookies, changes, contact + grievance officer). Linked from footer and `LEGAL_PAGES` in `apps/frontend/src/lib/legal.ts`. | A privacy policy is required for an account-based service collecting identity, content and usage data. | Fix the GA4 overstatement (see row evidence: Privacy §12 and `/cookies` state GA4 "also runs on this site" as fact, while `gaMeasurementId()` in `src/lib/seo.ts` reads `NEXT_PUBLIC_GA_MEASUREMENT_ID` from env only and comments "No id is hardcoded anywhere: none exists yet"); name the grievance officer or remove the title and use the support contact only; list Puter, Pixabay/Pexels/Openverse, DiceBear and Instagram/YouTube in `/subprocessors` or state why they are out of scope. |
| Legal | Terms of Service | EXISTS_NEEDS_IMPROVEMENT | `apps/frontend/src/app/(legal)/terms/page.tsx` — 16 sections (service, age 13+, 30-day passes + Cashfree + no auto-renewal, content ownership + licence, acceptable use, Companion licence, transcription accuracy, retention/deletion, IP, suspension/termination, disclaimers, liability cap of greater of amount paid in prior 12 months / INR 5,000, indemnity, changes with 14 days' notice, governing law India, contact). Header comment in `src/lib/legal.ts`: "Fill every value marked TODO before launch (and have a lawyer review the pages)". | Terms are required for a paid account-based service. | Add a refunds section (blocked on owner decision — see section 3); have the pages lawyer-reviewed and clear the TODO comment in `src/lib/legal.ts` once done. |
| Legal | Cookie Policy | EXISTS_NEEDS_IMPROVEMENT | `apps/frontend/src/app/(legal)/cookies/page.tsx` — storage table (`sb-…-auth-token`, `ce_tl_mode/snap/ripple`, `ce_intro`, `captionit-ad-consent`, `_ga`/`_ga_<id>` up to 2 years), analytics, advertising cookies, third-party requests, user control. | A cookie policy is required once analytics/advertising cookies and local storage are in use. | Complete the storage table: code also uses `ce:after-signin`, `ce:create-drafts`, `ce:gif-attributions`, `ce:guest-claim`, `ce:had-account`, `ce:pixabay-api-key`, `ce:speech-language`, `ce:tutorial-seen:v2`, `ce:webgpu-broken`, `oc:onboarding-answers/done`, `oc:ai-edit-project:*`, `oc:project-mode:*`, plus IndexedDB (`src/features/studio/mediaStore.ts`, `src/features/upload/localVideos.ts`); correct the GA4 "also runs on every page" statement to match deployment (env-gated, see Privacy row). |
| Legal | Cookie Preferences | EXISTS_NEEDS_IMPROVEMENT | `apps/frontend/src/components/ads/ConsentBanner.tsx` + `apps/frontend/src/lib/adConsent.ts` (localStorage key `captionit-ad-consent`, values `accepted`/`declined`), rendered in `apps/frontend/src/app/layout.tsx` only when an AdSense or GA id is set. `adConsent.ts` states the banner is "NOT a Google-certified CMP". | Consent collection exists, but a user who accepted cannot change the choice in the product. | Add a re-open/change control (footer link and/or Settings) that re-shows the banner and updates `captionit-ad-consent`; record the wording decision in section 3. For EEA/UK personalised ads, a certified CMP is still required — the banner alone does not cover that. |
| Legal | Refund Policy | BLOCKED_BY_MISSING_INFORMATION | The word "refund" appears only twice in the app: `/pricing` (`apps/frontend/src/app/pricing/page.tsx` — "plan changes, refunds and everything money-related are handled by a person, not a bot" + mailto link) and `/about` (`apps/frontend/src/app/(legal)/about/page.tsx` — "the same person … handles payments and refunds"). Terms §3 covers passes/expiry only; no refund window, eligibility, or process exists anywhere. | Refunds are applicable: paid 30-day passes are sold via Cashfree, so buyers need to know whether money comes back and how. | Owner must decide the refund window, eligibility (e.g. unused pass, failed payment, duplicate purchase) and process (email request, who approves, timing). Only then draft the policy page/section — its content cannot be written without those decisions. |
| Legal | Cancellation Policy | EXISTS_NEEDS_IMPROVEMENT | No cancellation flow, button, or policy copy exists. Correctly, there is no subscription to cancel: `packages/shared/src/plans.ts` + `POST /api/v1/billing/checkout` sell one-time passes, and the billing page states a same-plan re-buy adds 30 days. | Cancellation as an action does not apply, but the explainer does: a buyer must be told a pass cannot be cancelled and simply expires. | Add one short explainer on `/settings/billing` ("Passes cannot be cancelled — your pass simply expires on <date>") and the same line on `/pricing`. No standalone cancellation-policy page is needed. |
| Legal | Shipping Policy | NOT_APPLICABLE | `packages/shared/src/plans.ts` and `POST /api/v1/billing/checkout` sell digital 30-day passes only; no physical product, address collection, or fulfilment exists in the app. | Nothing is shipped. | None. Do not create a shipping page. |
| Legal | Return/Exchange Policy | NOT_APPLICABLE | Same evidence as Shipping Policy: digital passes only, no goods to return or exchange; money-back questions belong under the Refund Policy row above. | No physical goods exist to return or exchange. | None. Do not create a returns page; cover money-back in the Refund Policy. |
| Legal | Disclaimer | EXISTS_AND_ADEQUATE | Transcription-accuracy disclaimer lives in Terms §7 (`apps/frontend/src/app/(legal)/terms/page.tsx`); disclaimers and the liability cap live in Terms §§11–12. | The substance of a disclaimer is present where buyers agree to it; a standalone disclaimer page adds nothing for this product. | None. No separate page needed. |
| Legal | Accessibility Statement | APPLICABLE_MISSING | No `/accessibility` route exists (verified absent); no accessibility statement, conformance claim, or feedback channel for accessibility issues exists in the app. | A public statement is applicable for a consumer web tool; no compliance is claimed or verified here. | Run a basic accessibility audit of the homepage, login, and Studio shell first, then publish an honest statement describing what was checked, known limits, and how to report an issue. Do not publish a conformance claim before the audit. |
| Legal | Data Processing Agreement | NOT_APPLICABLE | `packages/shared/src/plans.ts` lists only consumer plans (Free/Starter/Plus/Pro); no business, teams, or enterprise plan, no B2B data-processing offering, and no DPA request flow exist. | A DPA applies to business customers processing personal data through the service; there are none. | None. Revisit only if a business/teams plan is introduced. |
| Legal | Acceptable Use Policy | EXISTS_AND_ADEQUATE | `apps/frontend/src/app/(legal)/acceptable-use/page.tsx`, linked from the footer and `LEGAL_PAGES` in `apps/frontend/src/lib/legal.ts`; Terms §5 points to the same rules. | An acceptable-use policy is applicable and present. | None. |
| Legal | Security Policy | APPLICABLE_MISSING | No standalone security page or `/security` route exists (verified absent). Security is described only inside Privacy §11 (`apps/frontend/src/app/(legal)/privacy/page.tsx`: HTTPS, at-rest encryption, RLS, signed links, hashed Companion tokens, breach notification). | A short public security page is applicable for a service storing user videos, transcripts, and payment records. | Publish a short security page stating the measures already in Privacy §11, without adding compliance claims. |
| Legal | Responsible Disclosure | APPLICABLE_MISSING | No vulnerability-reporting channel, security contact, or disclosure page exists; the only contact is the general support mailto `work.techhacksai@gmail.com` (`FEEDBACK_MAILTO` in `src/lib/legal.ts`). | Applicable: the app handles auth tokens, payments, and user media, so researchers need a reporting route. | Add a responsible-disclosure section (scope + reporting email + what happens next) on the Security page, reusing the existing support inbox unless the owner names a separate address. |
| Legal | Community Guidelines | NOT_APPLICABLE | No social or user-generated-content features exist: no public profiles, posts, comments, reviews, or shared content in the app (routes and `NAV_ITEMS` in `src/components/studio/nav.ts` are all single-user studio tools). | Community rules apply to shared spaces; there is no community surface. | None. Do not create community guidelines. |
| Customer lifecycle | Login | EXISTS_AND_ADEQUATE | `apps/frontend/src/app/login/page.tsx` — Google primary (GIS button + OAuth fallback) and legacy email/password form with inline validation, "Forgot password?" link, `?mode=signup` and `?redirect=` handling, and a guest path when Supabase is unconfigured. | Login is required and present for both sign-in paths. | None. |
| Customer lifecycle | Register | EXISTS_NEEDS_IMPROVEMENT | No sign-up form exists. The login page comment states "Google is the only way to create an account (no confirmation emails, one tap on phones)"; `/login?mode=signup` only changes the page copy to "Create your free account". Email mode is sign-in only for accounts made earlier (`src/app/login/page.tsx`, `authService.login`). | Registration exists only via Google; that is a deliberate product choice, but it is not explained to a visitor who expects an email sign-up. | State the choice plainly on `/login` and `/start` ("Accounts are created with Google — there is no email sign-up form") so email-only visitors are not left guessing. |
| Customer lifecycle | Email Verification | NOT_APPLICABLE | No verification route, page, or endpoint exists; no email-verification flow is referenced in auth code (`src/services/auth/`). Google OAuth verifies the email address via the provider at sign-in. | A separate verification flow is not applicable because account creation happens through Google, which already verifies the address; legacy email accounts predate any verification step. | None. If email sign-up is ever introduced, a verification flow becomes applicable. |
| Customer lifecycle | Forgot Password | EXISTS_AND_ADEQUATE | `apps/frontend/src/app/forgot-password/page.tsx` (94 lines), linked from the email login form in `src/app/login/page.tsx`. | The page exists for the legacy email/password accounts that need it. | None. |
| Customer lifecycle | Reset Password | EXISTS_AND_ADEQUATE | `apps/frontend/src/app/reset-password/page.tsx` (139 lines); Settings also offers a password-reset email button (`apps/frontend/src/app/(dashboard)/settings/page.tsx`). | The page exists for the legacy email/password accounts that need it. | None. |
| Customer lifecycle | Onboarding | EXISTS_AND_ADEQUATE | `apps/frontend/src/app/onboarding/page.tsx` (142 lines) + `src/features/onboarding/survey.ts` — 2-question survey stored in localStorage (`oc:onboarding-answers`, `oc:onboarding-done`), skippable. | Onboarding exists and is skippable. | None. |
| Customer lifecycle | Account Settings | EXISTS_NEEDS_IMPROVEMENT | `apps/frontend/src/app/(dashboard)/settings/page.tsx` (228 lines): display name (`authService.updateProfile`), email shown disabled ("changes … aren't supported from this screen yet"), Email updates toggle (`src/components/settings/EmailUpdatesSection.tsx`), link to `/settings/billing`, paired-computer revoke (`src/features/companion/PairedComputers.tsx`), password-reset email button. | Settings exist but several expected controls are absent. | Add, in priority order: self-serve account deletion (needs the backend decision in section 3), self-serve data export (Privacy §9 currently promises it only by email), email change or a clear statement that it is not supported. No avatar upload, 2FA, or sessions list exists — decide explicitly whether each is wanted before building. |
| Customer lifecycle | Billing | EXISTS_NEEDS_IMPROVEMENT | `apps/frontend/src/app/(dashboard)/settings/billing/page.tsx` (370 lines): current plan + expiry, limits, video quota remaining (or "Unlimited videos till 5 Dec"), expired-pass notice, guest warning, configured/sandbox banners, phone input, per-plan buy/switch buttons ("Available 6 Dec" during the free window), payment-history table (date/plan/amount/status/covers-until; Paid / Started, not completed / Failed / Expired), load-error + retry, loading skeleton. Data from `GET /api/v1/billing/me` (rate-limited 600/hr). | The billing page is the single money surface and is largely complete. | Add the cancel/expiry explainer (see Cancellation Policy row); show the Cashfree payment id and a downloadable receipt/invoice per paid row, or state that receipts come from Cashfree by email — decide the invoice policy first (section 3). |
| Customer lifecycle | Upgrade | EXISTS_AND_ADEQUATE | Buying a higher pass on `/settings/billing` is the upgrade path: per-plan buy/switch buttons, fresh 30 days from purchase (`settle.ts`: plan switch starts fresh 30 days). `/pricing` states the same. | Upgrading exists as buying another pass; there is no subscription tier to change. | None. |
| Customer lifecycle | Downgrade | EXISTS_AND_ADEQUATE | Same mechanism as Upgrade: buying a lower pass on `/settings/billing` starts a fresh 30 days (`settle.ts`); old pass days do not carry over, stated on the billing page and `/pricing`. | Downgrading exists as buying another pass; there is no subscription tier to change. | None. |
| Customer lifecycle | Cancel Subscription | NOT_APPLICABLE | No subscription exists to cancel: `packages/shared/src/plans.ts` (`PLAN_PERIOD_DAYS = 30`, "per 30 days, charged once via Cashfree — no subscription, no auto-renew"), checkout creates a one-time Cashfree order, and the webhook settles it once (`src/lib/billing/settle.ts`). No cancel endpoint, button, or subscription record exists. | There is nothing to cancel. | None — but add the expiry explainer copy (see Cancellation Policy row) so users do not look for a cancel button. |
| Customer lifecycle | Payment Success | EXISTS_NEEDS_IMPROVEMENT | No dedicated success page (`/payment-success` verified absent). Cashfree `return_url` is `{origin}/settings/billing?order_id=…` (`src/lib/billing/cashfree.ts`, `order_meta.return_url`); the billing page reads `order_id` and calls `POST /api/v1/billing/reconcile`, which re-checks the order server-to-server via `fetchCashfreeOrder` and settles from that — "browser's return parameters are never trusted" (`src/app/(dashboard)/settings/billing/page.tsx`). The plan and history then update on the same page. | The return flow works and is verified server-side, but the user gets no explicit success confirmation. | After a successful reconcile, show an explicit success state on the billing page (plan, amount, covers-until date, receipt note) instead of relying on the updated table alone. |
| Customer lifecycle | Payment Failed | EXISTS_NEEDS_IMPROVEMENT | No dedicated failed page (`/payment-failed` verified absent). Failure/expiry webhooks settle the payment closed (`src/lib/billing/settle.ts`); the billing page history shows Failed / Expired rows. | The failure is recorded and visible, but the user gets no dedicated failed state or retry guidance. | After reconcile reports a failed/expired payment, show an explicit failed state on the billing page with the reason the gateway gave and a retry action. |
| Customer lifecycle | Payment Pending | APPLICABLE_MISSING | No dedicated pending page (`/payment-pending` verified absent) and no pending explainer. A payment that was started but not completed appears only as a "Started, not completed" row in the billing history, with no copy explaining the payment may still complete or how long to wait. | A pending state is applicable: Cashfree payments can sit between creation and webhook settlement, and the user returns to the billing page in that window. | Add a pending state on the billing page for `created` payments ("Payment started — we will confirm it once Cashfree reports back") with the reconcile retry, and state the wait/retry guidance. |
| Customer lifecycle | Support | EXISTS_NEEDS_IMPROVEMENT | No `/support`, `/help`, `/contact`, or `/faq` route exists (verified absent). Support is a single mailto, `work.techhacksai@gmail.com`, in the footer ("Support"), on `/pricing`, in every legal contact section, and as the Feedback link in the Studio shell (`FEEDBACK_MAILTO` in `src/lib/legal.ts`). `/about` says support is "a person, not a ticket queue". | Email support exists and matches the one-person operation, but there is no response-time promise and no way to track a request. | Publish a response-time expectation (owner decision, section 3) on `/about` or the footer; keep email-only support until volume justifies more. |
| Customer lifecycle | Help Center | APPLICABLE_MISSING | No help centre, help docs, or knowledge base exists. The FAQ is a homepage anchor only (`/#faq`, content in `src/components/home/faqs.ts`, 8 Q&As) and the Studio shell has no help link — only the Feedback mailto. | A help centre is applicable: the product has many surfaces (Studio, Motion, Growth, Companion) and support is one person. | Create a minimal `/faq` route from the existing `faqs.ts` content, link it from the footer and the Studio shell, and grow it from real support emails. No ticket system is needed yet. |
| UX states | 404 | EXISTS_AND_ADEQUATE | Root `apps/frontend/src/app/not-found.tsx` ("Page not found", link home) plus `apps/frontend/src/proxy.ts`, which returns a real HTTP 404 with minimal HTML for unknown or non-UUID `/projects/<id>` (Supabase lookup, 2s timeout, fail-open). | A 404 state is required and present for both app routes and project links. | None. |
| UX states | 403 | EXISTS_NEEDS_IMPROVEMENT | No 403 page or UI exists (`forbidden.tsx` verified absent). API routes return `FORBIDDEN` (`ApiFailure` in `src/lib/api/http.ts`); clients show generic error/retry copy or redirect to login. Guests get a 403 from checkout (`POST /api/v1/billing/checkout`). | A forbidden state is applicable: guests and signed-out users hit permission boundaries (checkout, admin routes). | Add a 403 state (page or inline) that says what is restricted and what to do (sign in, or start a guest session where allowed), instead of generic error copy. |
| UX states | 500 | EXISTS_AND_ADEQUATE | Root `apps/frontend/src/app/error.tsx` (Sentry capture, "Something went wrong on this page", Try again + Go to dashboard, error digest) and `apps/frontend/src/app/global-error.tsx` (plain-HTML last resort). No per-segment error boundaries exist, but the root boundary covers the app. | A 500 state is required and present at the root. | None. Per-segment boundaries are optional; add only if a segment needs its own recovery copy. |
| UX states | Maintenance | APPLICABLE_MISSING | No maintenance-mode flag, config, or maintenance page exists in the app. | Maintenance mode is applicable: deploys, Cashfree downtime, and the free-window switch all need a way to show a holding page. | Add a maintenance flag (env) + a static maintenance page with a status message and expected return, and record the policy (who enables it, what it says) in section 3. |
| UX states | Offline | EXISTS_NEEDS_IMPROVEMENT | Service worker `apps/frontend/public/sw.js` (registered by `src/components/pwa/ServiceWorkerRegister.tsx`) serves cached pages and an honest offline HTML page ("You're offline…") for navigations; Studio has an offline save state (`src/features/studio/useStudio.ts`, "Offline · retrying"); `InstallApp.tsx` says "Works offline once loaded". But no offline banner or `navigator.onLine` detection exists in app UI, and API calls are network-only. | An offline state exists for navigation and Studio saves, but the user is not told the app is offline elsewhere. | Add a small offline banner (online/offline events) across the Studio shell; keep the service-worker offline page as-is. |
| UX states | Empty State | EXISTS_NEEDS_IMPROVEMENT | Empty states are ad hoc, with no shared component: projects list ("No projects match … / No archived projects / Nothing in this view", `src/components/workspace/ProjectsList.tsx`), billing ("No payments yet"), exports expired/failed states, stickers ("No GIFs found"), image-editor ("No text found"). | Empty states exist on the main surfaces, but the pattern is inconsistent. | Introduce one shared empty-state component and migrate the existing surfaces to it; no new copy decisions are needed. |
| UX states | No Search Results | EXISTS_AND_ADEQUATE | The two searchable surfaces handle it: projects list covers query-empty results (`src/components/workspace/ProjectsList.tsx`) and the stickers panel covers GIF search ("No GIFs found"). | No-search-results states exist where search exists. | None. |
| UX states | Loading State | EXISTS_NEEDS_IMPROVEMENT | Only one `loading.tsx` exists (`apps/frontend/src/app/(dashboard)/dashboard/loading.tsx`); elsewhere the app uses skeletons (`src/components/brand/Skeletons.tsx`: `DashboardSkeleton`, `StudioSkeleton`), a billing pulse block, and a settings pulse. | Loading states exist, but coverage is uneven across segments. | Add per-segment `loading.tsx` for the heaviest Studio routes (editor, motion, growth) reusing the existing skeletons. |
| UX states | Error State | EXISTS_NEEDS_IMPROVEMENT | Error feedback is mostly inline `role="alert"` / `role="status"` text, with `window.alert` in a few places (e.g. exports page); API `FORBIDDEN` surfaces as generic error/retry copy; billing has a load-error + retry state. | Error states exist but are inconsistent in tone and recovery. | Standardise on the inline alert pattern with a retry action, remove remaining `window.alert` calls, and give permission errors their own copy (see 403 row). |
| UX states | Success State | EXISTS_NEEDS_IMPROVEMENT | Success feedback is inline `role="status"` text where it exists; there is no shared success pattern, and payment success has no dedicated confirmation (see Payment Success row). | Success states exist in places but are not consistent. | Introduce one shared success pattern (inline status + the billing-page payment confirmation from the Payment Success row). |
| UX states | Session Expired | EXISTS_NEEDS_IMPROVEMENT | No dedicated session-expired page or UI exists. `src/services/api-client.ts` (`redirectToLoginForExpiredSession`) navigates a real user to `/login?redirect=<current>` on a 401 with an expired JWT (`isExpiredSessionToken` decodes `exp`); guests never redirect. | Session expiry is handled, but the user is not told the session ended — they just land on login. | Show a "Your session expired — sign in again" notice on `/login` when the redirect came from an expired session. |

## 3. Missing owner information

These facts are not in the repo and cannot be filled in without the owner. Any
attempt to write them would be invention. Each item names what is already stated
(where applicable) and what is still missing.

1. **Refund window, eligibility, and process.** Nothing is decided: no window
   (e.g. days after purchase), no eligibility rules (unused pass, failed
   payment, duplicate purchase, change of mind), no process (who approves, how
   the refund is issued via Cashfree, how long it takes). Blocks the Refund
   Policy row. The only existing copy is the two "handled by a person"
   mentions on `/pricing` and `/about`.
2. **Support response-time promise.** `/about` promises "a person, not a
   ticket queue" but no response time is stated anywhere. Needed before any
   support SLA or expectation copy is published.
3. **Grievance-officer name and contact.** Privacy §14 is titled "Contact and
   grievance officer" but names no officer and gives no separate contact — only
   the shared `work.techhacksai@gmail.com` inbox. Either a name/contact must be
   supplied or the section must be retitled to a plain contact section.
4. **GA4 deployment status.** `NEXT_PUBLIC_GA_MEASUREMENT_ID` is env-gated and
   the code comments say no id exists yet, while Privacy §12 and the Cookie
   Policy state GA4 "also runs on this site" as fact. The owner must confirm
   whether GA4 is actually enabled in production; the legal copy must then be
   corrected to match.
5. **Jurisdiction details beyond "India".** `src/lib/legal.ts` records
   operator, address "India", jurisdiction "India", courts "the courts of
   India", effective 30 September 2026, minimum age 13. No state, city, or
   street address is recorded (the file comment says an individual does not
   need to publish a home address). Confirm whether anything more specific is
   required; do not invent an address.
6. **Retention periods.** Already stated in Privacy §9 and usable as-is:
   projects until deleted/closed; exports 7–60 days; deleted projects up to 30
   days; account data up to 30 days after closure; logs about 30 days. Still
   missing: how long invoice/payment records are kept for legal/tax reasons
   (Privacy says "except legally-required records e.g. invoices" with no
   period) — that period must be supplied.
7. **Cookie-preference wording.** The banner copy and the accept/decline
   wording exist in `src/components/ads/ConsentBanner.tsx`, but the wording for
   a re-open/change control and for EEA/UK visitors (certified CMP) is not
   decided. Needed before the Cookie Preferences control is built.
8. **Invoice/receipt policy.** The billing page shows a payment-history table
   but no downloadable invoice and no Cashfree payment id. Decide: do buyers
   get receipts from Cashfree by email only, or must the app show/download
   them? Needed before the Billing row action is built.
9. **Account-deletion backend decision.** Terms §8 and Privacy §9 say users
   delete their account by writing to `work.techhacksai@gmail.com`, with
   account data deleted within 30 days of closure. The only deletion code is
   the cron at `src/app/api/cron/cleanup/route.ts`, which deletes stale
   anonymous guests (7 days, `GUEST_STALE_DAYS`). Decide: keep email-only
   deletion, or build a self-serve delete endpoint and UI (including what
   happens to projects, exports, and paid passes)? Until decided, the Settings
   row cannot be completed.
10. **Maintenance-mode policy.** No flag, page, or policy exists. Decide who
    enables maintenance mode, what the holding page says, and whether paid
    users are told in advance. Needed before the Maintenance row action is
    built.

## 4. Legal-review warning

This audit is a page-coverage check, not legal advice. The legal pages
(`/terms`, `/privacy`, `/cookies`, `/acceptable-use`, `/copyright`,
`/subprocessors`, `/about`, `/credits`) were written from facts centralised in
`apps/frontend/src/lib/legal.ts`, whose own header comment says to fill every
value marked TODO before launch and have a lawyer review the pages. That review
has not happened — the TODO comment is still in the file. Do not treat these
pages as final, and do not present them to users as reviewed legal documents
until a professional review is done. In particular, this audit makes no claim
about compliance with any law or standard (including data-protection,
consumer-protection, accessibility, or payment-security rules); it only notes
where the app's own Privacy page already uses rights language mentioning DPDP,
GDPR, and US state laws, without asserting that the app complies with any of
them. The discrepancies flagged above (GA4 wording, unnamed grievance officer,
missing refund terms, incomplete subprocessors list) should be resolved as part
of that review.

## 5. Implementation priority list (next phase)

Only unblocked, genuinely applicable items. Blocked items (Refund Policy) and
not-applicable items are excluded.

1. **Cookie-preferences control + correct the cookie/GA4 copy.** Add a
   re-open control for `captionit-ad-consent` (footer link and/or Settings),
   complete the Cookie Policy storage table with the keys listed in that row,
   and correct the GA4 statements to match deployment. Unblocked: the keys and
   the env-gating are already in code.
2. **Cancel/expiry explainer on billing + pricing.** One line on
   `/settings/billing` and `/pricing`: passes cannot be cancelled, they expire
   on the shown date. Unblocked: the one-time-pass model is already in code.
3. **Payment result states on the billing return.** After reconcile, show
   explicit success, failed, and pending states on `/settings/billing` (plan,
   amount, covers-until, reason, retry). Unblocked: the reconcile endpoint and
   payment statuses already exist.
4. **Minimal help centre.** Create `/faq` from the existing `faqs.ts` content
   and link it from the footer and the Studio shell. Unblocked: the content
   already exists on the homepage.
5. **403 state + session-expired notice.** Add a forbidden state for
   permission boundaries and a "session expired — sign in again" notice on
   `/login` for expiry redirects. Unblocked: the 401 handling and `FORBIDDEN`
   responses already exist.
6. **Security page + responsible disclosure.** Publish a short security page
   from Privacy §11 and add a disclosure contact reusing the existing support
   inbox. Unblocked: no new contact decision is needed unless the owner wants
   a separate address.
7. **Offline banner + shared state patterns.** Add an offline banner to the
   Studio shell and one shared empty/loading/error/success component, migrating
   the existing ad-hoc states. Unblocked: the states and skeletons already
   exist.
8. **Maintenance mode.** Add an env flag and a static maintenance page.
   Unblocked once the owner confirms the holding-page wording (short decision,
   no legal or financial content).
