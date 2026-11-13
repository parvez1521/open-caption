# Captionit — Indexability Report (per public route)

**Audited:** 2026-11-13, ~22:40–23:00 IST. Read-only; no code changed, no deploys.
**Live base:** https://www.captionit.in (apex `captionit.in` 308 → `www`).
**Repo:** main @ `584adf3` (`~/workspace/autocap-clone-2026-11-09/app`).

**How to read:** "Indexable?" is the live robots meta (absent = indexable by default). "In sitemap?" is the live `sitemap.xml` (11 URLs, fetched 2026-11-13 ~22:45 IST). Status codes are live `curl` results from this audit except where marked [A] (prior live-site audit, agent `4fdf916d-8195-449b-9e8e-c227004438a5`, 2026-11-13 ~20:13–20:30 IST). Titles are the live `<title>` (indexable pages) or the `pageMetadata` title in code (noindex pages, main @ `584adf3`).

## 1. Indexable public routes (in sitemap)

| URL | Status | Indexable? | In sitemap? | Canonical (live) | Title / meta present? |
|---|---|---|---|---|---|
| https://www.captionit.in/ | 200 | Yes | Yes | `https://captionit.in` (apex — redirects; see note N1) | Yes — "Word-timed captions for Reels, Shorts and TikTok, made in your browser \| Captionit" + description + OG + JSON-LD |
| https://www.captionit.in/login | 200 | Yes | Yes | `https://captionit.in/login` (apex) | Yes — unique title + description (per [A]; live title not re-fetched in this audit) |
| https://www.captionit.in/pricing | 200 | Yes | Yes | `https://captionit.in/pricing` (apex) | Yes — "Pricing · Captionit" + description; prices client-rendered only (no ₹/299/499/799 in SSR HTML) |
| https://www.captionit.in/about | 200 | Yes | Yes | `https://captionit.in/about` (apex) | Yes — unique title + description |
| https://www.captionit.in/terms | 200 | Yes | Yes | `https://captionit.in/terms` (apex) | Yes — unique title + description |
| https://www.captionit.in/privacy | 200 | Yes | Yes | `https://captionit.in/privacy` (apex) | Yes — unique title + description |
| https://www.captionit.in/cookies | 200 | Yes | Yes | `https://captionit.in/cookies` (apex) | Yes — unique title + description |
| https://www.captionit.in/acceptable-use | 200 | Yes | Yes | `https://captionit.in/acceptable-use` (apex) | Yes — unique title + description |
| https://www.captionit.in/copyright | 200 | Yes | Yes | `https://captionit.in/copyright` (apex) | Yes — unique title + description |
| https://www.captionit.in/subprocessors | 200 | Yes | Yes | `https://captionit.in/subprocessors` (apex) | Yes — unique title + description; **orphan: zero homepage links** |
| https://www.captionit.in/credits | 200 | Yes | Yes | `https://captionit.in/credits` (apex) | Yes — unique title + description; 9 hrefs to old `open-caption-ten.vercel.app` domain |

All 11 sitemap URLs return 200. No sitemap URL is broken. No `<lastmod>` on any entry.

## 2. Indexable but NOT in sitemap (flagged)

| URL | Status | Indexable? | In sitemap? | Canonical | Title / meta present? | Flag |
|---|---|---|---|---|---|---|
| https://www.captionit.in/onboarding | 200 | **Yes — no robots meta** | **No** | None | **Title + description byte-identical to homepage** ("Word-timed captions for Reels, Shorts and TikTok, made in your browser \| Captionit") | **NEAR-DUPLICATE / ACCIDENTAL — fix is noindex, not adding to sitemap.** Cause: no `metadata` export in `app/onboarding/page.tsx` (main @ `584adf3`); absent from `APP_PATHS` and robots disallow. |

## 3. Live 200 but noindex (correctly excluded from sitemap)

These are app/tool pages behind the dashboard shell. All carry `<meta name="robots" content="noindex, nofollow"/>` and no canonical (by design — a canonical on a noindex page would contradict it).

| URL | Status | Indexable? | In sitemap? | Canonical | Title (code, `pageMetadata`) |
|---|---|---|---|---|---|
| https://www.captionit.in/transcribe | 200 | No | No | None | "Transcribe" — "Upload a video or audio file and get its transcript, in your browser." |
| https://www.captionit.in/motion | 200 | No | No | None | "Motion Studio" — 46 templates |
| https://www.captionit.in/motion/counter | 200 | No | No | None | "Motion Studio" (inherits parent title — duplicate) |
| https://www.captionit.in/motion/subscribe-pill | 200 | No | No | None | "Motion Studio" (inherits parent title — duplicate) |
| https://www.captionit.in/motion/profile-card | 200 | No | No | None | "Motion Studio" (inherits parent title — duplicate) |
| https://www.captionit.in/motion/search-bar | 200 | No | No | None | "Motion Studio" (inherits parent title — duplicate) |
| https://www.captionit.in/motion/<any-other-template> | 200 (template ids resolve; spot-checked 4) | No | No | None | "Motion Studio" (no `generateMetadata` at main) |
| https://www.captionit.in/ai-clipper | 200 | No | No | None | "AI Clipper" — "Turn a long captioned video into ranked short clips, with scores compared across the whole video." |
| https://www.captionit.in/clipper | 200 | No | No | None | "Clipper" |
| https://www.captionit.in/analyzer | 200 | No | No | None | "Reel Analyzer" |
| https://www.captionit.in/prompter | 200 | No | No | None | "Teleprompter" |
| https://www.captionit.in/create | 200 | No | No | None | "Creator Studio" |
| https://www.captionit.in/create/chat | 200 | No | No | None | "AI Studio Chat" |
| https://www.captionit.in/analytics | 200 | No | No | None | "Creator Analytics" |
| https://www.captionit.in/brand | 200 | No | No | None | "Brand Kit" |
| https://www.captionit.in/library | 200 | No | No | None | "Media Library" |
| https://www.captionit.in/dashboard | 200 | No | No | None | "Dashboard" |
| https://www.captionit.in/editor | 200 | No | No | None | "Video Editor" |
| https://www.captionit.in/captions | 200 | No | No | None | "Caption Studio" |
| https://www.captionit.in/growth | 200 | No | No | None | "Growth Studio" |
| https://www.captionit.in/planner | 200 | No | No | None | "Content Planner" |
| https://www.captionit.in/exports | 200 | No | No | None | "Export History" |
| https://www.captionit.in/settings | 200 | No | No | None | "Settings" |
| https://www.captionit.in/settings/billing | 200 | No | No | None | Inherits "Settings" (no `metadata` export at main) |
| https://www.captionit.in/projects/<id> | 200 with valid id (dynamic; bare `/projects` → 404) | No | No | None | "Project studio" |
| https://www.captionit.in/projects/<id>/settings | 200 with valid id | No | No | None | "Project settings" |
| https://www.captionit.in/start | 200 | No | No | None | (auth-flow helper) |
| https://www.captionit.in/pair | 200 | No | No | None | (auth-flow helper) |
| https://www.captionit.in/forgot-password | 200 | No | No | None | (auth-flow helper) |
| https://www.captionit.in/reset-password | 200 | No | No | None | (auth-flow helper) |

**Robots.txt gaps (defence-in-depth):** `/transcribe`, `/ai-clipper` and `/onboarding` are NOT in the robots disallow list (verified live + at main @ `584adf3`, `app/robots.ts:15`), although `/clipper` and `/motion` are. They stay out of the index via metadata noindex only. `/monitoring` is disallowed but no such route exists.

## 4. Correct 404s (not indexable, not in sitemap)

| URL | Status | Notes |
|---|---|---|
| https://www.captionit.in/motion-studio | 404 | Serves homepage title/description/OG verbatim (meta clone, noindex) [A] |
| https://www.captionit.in/teleprompter | 404 | Same meta clone (real teleprompter is `/prompter`) [A] |
| https://www.captionit.in/not-found | 404 | Same meta clone [A] |
| https://www.captionit.in/subscribe-pill | 404 | Bare path; real page is `/motion/subscribe-pill` |
| https://www.captionit.in/profile-card | 404 | Bare path; real page is `/motion/profile-card` |
| https://www.captionit.in/search-bar | 404 | Bare path; real page is `/motion/search-bar` |
| https://www.captionit.in/projects | 404 | Dynamic route needs an id — expected |
| https://www.captionit.in/ads.txt | 404 | By design: no AdSense publisher ID set |

## 5. Infrastructure URLs

| URL | Status | Notes |
|---|---|---|
| https://www.captionit.in/sitemap.xml | 200 | 11 URLs (see §1); apex host in all `<loc>`s; no `<lastmod>` |
| https://www.captionit.in/robots.txt | 200 | `Host: https://captionit.in` (full URL incl. scheme — conventionally a bare hostname); `Sitemap: https://captionit.in/sitemap.xml` |
| https://captionit.in/ | 308 → https://www.captionit.in/ | Apex redirects to www (note N1) |

## 6. Flags summary
- **N1 — Canonical host mismatch (sitewide):** all canonicals, `og:url`s, sitemap `<loc>`s and robots `Host:` use apex `https://captionit.in`, which 308-redirects to `www`. Canonicals point at redirecting URLs.
- **F1 — `/onboarding` is the only indexable page missing from the sitemap, and it is a homepage near-duplicate.** Fix: noindex it; do not add it to the sitemap.
- **F2 — `/subprocessors` is the only sitemap URL with zero homepage links (orphan).** Fix: add a footer link.
- **F3 — Highest-value tool pages (`/transcribe`, `/motion`, `/ai-clipper`) are live 200, linked from the homepage, but noindex and absent from the sitemap.** Strategic decision required; do not add to the sitemap while noindex remains.
- **F4 — `/motion/*` template pages share one title ("Motion Studio · Captionit"); 404 pages clone the homepage's meta.** Low impact while noindex; fix if ever indexed.
- **F5 — `/login` is indexable + in sitemap** (low search value; noindex is a candidate, not a defect).
- No sitemap URL returns non-200. No indexable page lacks a title/description. No canonical points to `open-caption-ten.vercel.app`.
