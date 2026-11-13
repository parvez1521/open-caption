# Captionit — Technical SEO Audit

**Audited:** 2026-11-13, ~22:40–23:00 IST. Read-only; no code changed, no deploys.
**Repo:** `~/workspace/autocap-clone-2026-11-09/app`, main @ `584adf3` (verified via `git show`; working tree is on another branch — see baseline §0).
**Live:** https://www.captionit.in (Vercel; apex `captionit.in` 308 → `www`).

Attribution: **[A]** = reused from prior live-site SEO audit (agent `4fdf916d-8195-449b-9e8e-c227004438a5`, 2026-11-13 ~20:13–20:30 IST); **[B]** = reused from prior performance pass (agent `2815591c-7a3c-4af6-9437-5fc5e55cdada`, same window); **[C]** = reused from prior repo SEO audit (agent `23a846df-1895-40bf-8543-51f5bd615a99`, same window — run against branch `feature/ai-clipper-section-2026-11-12` @ `77e3971`, so repo findings were re-checked at main where marked); **[NEW]** = found/verified by this baseline audit, 2026-11-13 ~22:40–23:00 IST.

## 1. Indexability
| Check | Result | Source |
|---|---|---|
| Indexable public pages | 11 in sitemap, all live 200: `/`, `/login`, `/pricing`, `/about`, `/terms`, `/privacy`, `/cookies`, `/acceptable-use`, `/copyright`, `/subprocessors`, `/credits` | [A], re-verified [NEW] |
| App/tool pages noindex | `/transcribe`, `/motion`, `/ai-clipper`, `/clipper`, `/analyzer`, `/prompter`, `/create`, `/analytics`, `/brand`, `/library`, `/dashboard`, `/editor`, `/captions`, `/growth`, `/settings`, `/planner`, `/exports`, `/start`, `/forgot-password`, `/reset-password`, `/pair` — all 200 with `<meta name="robots" content="noindex, nofollow"/>` via `pageMetadata({index:false})` (`lib/seo.ts:105`) | [A] [C] |
| Accidental indexable page | **`/onboarding` — 200, no robots meta, no canonical, title/description byte-identical to homepage.** Cause: `apps/frontend/src/app/onboarding/page.tsx` is a client component with no `metadata` export (verified 0 at main @ `584adf3`); `/onboarding` absent from `APP_PATHS` (`lib/seo.ts:33-51`) and from robots disallow (`app/robots.ts:15`) | [A] [C], confirmed at main + live [NEW] |
| `/login` indexable + in sitemap | By design (`INDEXABLE_PATHS` includes `/login`); low search value, consider noindex | [A] |
| 404 handling | `/motion-studio`, `/teleprompter`, `/not-found` return true 404 + noindex; bare `/subscribe-pill`, `/profile-card`, `/search-bar` also 404 (templates live under `/motion/<id>`); bare `/projects` 404 (dynamic route needs an id — expected) | [A], re-verified [NEW] |

## 2. SSR / prerendering / JS rendering
- Homepage is server-rendered and statically prerendered: 86,852 bytes HTML raw / 16,613 Brotli, `X-Nextjs-Prerender: 1`, `X-Vercel-Cache: HIT`, small RSC payload (~18.5 KB, 10 `self.__next_f` pushes) **[B]**.
- All 25 homepage JS `<script>` tags are `async` — zero render-blocking JS; CSS 2 files, 119,003 bytes raw (main sheet 109,639 B raw / 18,387 B br), render-blocking as normal **[B]**.
- Meta tags, canonicals, OG tags and JSON-LD are present in the **server-rendered HTML** (verified by `curl`, not JS execution) for all indexable pages **[A] [NEW]** — content visibility does not depend on JS for the public pages.
- **Exception — pricing numbers are client-rendered [NEW]:** live `/pricing` HTML contains zero occurrences of `₹`, `299`, `499`, `799`. Plan names (Starter/Plus/Pro) are in SSR HTML; prices are injected by client JS (geo currency). Crawlers see no prices, and there is no `Product`/`Offer` schema.
- No `next/image` anywhere in `src` (0 matches); 27 raw `<img>` in 19 files **[B]** — no `srcset`/responsive variants; posters are plain `.webp` with `loading="lazy" decoding="async"` **[B]**.

## 3. Metadata per page
- **Homepage:** full set — title, description, canonical, OG (title/desc/url/site_name/locale/image 1200×630), twitter card + image, JSON-LD `[SoftwareApplication, FAQPage]` (parses) **[A]**, re-verified live [NEW]. Google site-verification meta present live **[NEW]**.
- **Other 10 indexable pages:** unique title + description + canonical each; OG title/description + `twitter:card=summary_large_image` + twitter title/description; **no `og:image`, no `twitter:image`, no `og:locale`/`og:site_name`** except homepage **[A]**.
- **Homepage has no title/description of its own [C]:** `(home)/layout.tsx:6-8` sets only `alternates: { canonical: "/" }`; title/description fall back to root `BRAND_TITLE`/`BRAND_DESCRIPTION`. OG title is `BRAND_TAGLINE` while `<title>` uses the `%s · Captionit` template — inconsistent but not broken.
- **No canonical / `og:url` on any tool or app page [A]:** 20 fetched pages have neither. Harmless while noindex.
- **Duplicate titles:** `/motion`, `/motion/counter`, `/motion/subscribe-pill`, `/motion/profile-card`, `/motion/search-bar` all share "Motion Studio · Captionit" (all noindex) **[A]**; 404 pages serve the homepage's title/description/OG verbatim **[A]**. At main, `(dashboard)/motion/[templateId]/page.tsx` has no `generateMetadata` and `(dashboard)/settings/billing/page.tsx` has no `metadata` export (inherits "Settings" title) — confirmed at main [NEW, building on C].
- **No duplicate titles/descriptions among the 11 indexable pages [A].**

## 4. Canonicals
- **Sitewide host mismatch [A, re-verified NEW]:** every canonical, `og:url`, sitemap `<loc>` and robots `Host:`/`Sitemap:` use apex `https://captionit.in`, but apex returns `308 Permanent Redirect` to `https://www.captionit.in/` (verified live). Canonicals point at redirecting URLs. Fix: canonicalise to `www` everywhere, or flip the redirect; pick one host and make everything agree.
- **Code root cause [C, confirmed at main NEW]:** `lib/seo.ts:19` — `PRODUCTION_URL = "https://open-caption-ten.vercel.app"`; `SITE_URL` falls back to it when `NEXT_PUBLIC_APP_URL` is unset. Live correctness depends on the Vercel env var. `metadataBase` is set (`app/layout.tsx:42`, `new URL(SITE_URL)`) and `pageMetadata` canonicals are relative paths resolved against it **[C]**.
- No canonical points to `open-caption-ten.vercel.app` in live HTML **[A]**.

## 5. Sitemap
- `https://www.captionit.in/sitemap.xml` → 200, exactly 11 URLs (`/`, `/login`, `/pricing`, `/about`, `/terms`, `/privacy`, `/cookies`, `/acceptable-use`, `/copyright`, `/subprocessors`, `/credits`), all live 200, no duplicates, no dead entries **[A]**, re-verified [NEW].
- **Missing:** `/onboarding` is indexable but not in the sitemap (correct outcome is noindex, not adding it) **[A]**; `/transcribe`, `/motion`, `/ai-clipper` are live 200 but not in the sitemap — deliberate, because they are noindex **[A] [C]**.
- **No `<lastmod>` on any entry** (`changefreq` weekly for `/`, yearly otherwise; priority 1 / 0.5 `/login` / 0.3) **[A] [C]**.
- Sitemap URLs all use the apex host (same mismatch as §4) **[A]**.

## 6. Robots
- Live `https://www.captionit.in/robots.txt` → 200 **[A]**, re-fetched [NEW]: `Allow: /`; disallows `/api/`, `/dashboard`, `/projects/`, `/captions`, `/editor`, `/motion`, `/growth`, `/planner`, `/analytics`, `/library`, `/clipper`, `/analyzer`, `/prompter`, `/exports`, `/brand`, `/create`, `/settings`, `/start`, `/pair`, `/forgot-password`, `/reset-password`, `/monitoring`; `Host: https://captionit.in`; `Sitemap: https://captionit.in/sitemap.xml`.
- **Gaps [C, confirmed at main + live NEW]:** `/transcribe`, `/ai-clipper` and `/onboarding` are **not** disallowed (they are noindex via metadata, so no live indexation — defence-in-depth only). `/monitoring` is disallowed but no such route exists (dead entry). `host: SITE_URL` in `app/robots.ts:19` emits the full URL including scheme (`Host: https://captionit.in`) — the `Host:` directive conventionally takes a bare hostname **[C]**.
- No public page is accidentally disallowed **[A]**.

## 7. Status codes and redirects
- Apex → www: `308 Permanent Redirect` **[A]**, re-verified [NEW].
- All 11 sitemap URLs: 200. All 20+ app/tool pages checked: 200. `/motion-studio`, `/teleprompter`, `/not-found`, bare `/subscribe-pill`/`/profile-card`/`/search-bar`, bare `/projects`: 404 (correct) **[A] [NEW]**.
- `/ads.txt`: 404 (no publisher ID set — by design; route 404s unless `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` matches `/^pub-\d+$/`) **[A] [C]**.
- No redirect chains observed beyond the single apex→www hop **[A]**.

## 8. Broken links
- **Homepage internal links: none broken [A, re-verified NEW].** All 20 distinct page hrefs in live homepage HTML return 200 (checked 2026-11-13 ~22:45 IST).
- **Only old-domain references found: 9 hrefs in live `/credits` HTML** pointing to `https://open-caption-ten.vercel.app/credits#stock-sfx` **[A]**. Fix: rewrite to relative `/credits#stock-sfx`. `LEGAL.site` (`lib/legal.ts:24`) still holds the old domain at main, but has zero usages in `src` — dead config, not a live leak **[NEW]**.
- No broken links found among sitemap URLs (all 200) **[A]**.

## 9. Duplicates and orphans
- **Near-duplicate:** `/onboarding` duplicates the homepage title/description exactly and has no canonical — the only indexable near-duplicate **[A] [NEW]**.
- **Orphans (indexable pages with zero homepage links):** `/subprocessors` is the only sitemap URL with no homepage link **[A, re-verified NEW]** — homepage HTML contains 0 `href="/subprocessors"`. Fix: add a footer link. (`/editor`, `/growth`, `/planner`, `/captions` etc. also have no homepage links, but they are app pages — expected, not orphans.)
- **Tool pages are linked but noindex:** homepage links to `/transcribe` (×3), `/motion` (×1 + all 4 featured `/motion/*` templates), `/ai-clipper` (×2), `/clipper` (×2) **[A]** — crawlable-but-noindex, so link equity flows to pages that can never rank.

## 10. Structured data
- Homepage only: one `<script type="application/ld+json">` with `[SoftwareApplication, FAQPage]`; parses; `SoftwareApplication` has name/url/description/applicationCategory/operatingSystem/browserRequirements/offers (price "0", currency INR)/featureList/image; no invented ratings/reviews; FAQ built from the same `FAQS` array the page renders **[A] [C]**, re-verified parses live [NEW].
- No JSON-LD on any other page **[A]**.
- **Missing [NEW/C]:** no `Product`/`Offer` schema on `/pricing`; no `BreadcrumbList` anywhere (no breadcrumb UI exists at all — only a Sentry `addBreadcrumb` call in `features/upload/prepareVideo.ts:134`); JSON-LD script renders in the layout body fragment, not `<head>` (valid for crawlers, non-idiomatic) **[C]**.
- `hreflang`: absent (0 hits) — fine for a single-language site (`<html lang="en">`, `og:locale en_US`) **[C]**.

## 11. Breadcrumbs
- None. No breadcrumb UI component, no breadcrumb markup, no `BreadcrumbList` JSON-LD **[NEW]** (only false positive is Sentry's `addBreadcrumb`).

## 12. Image optimisation (summary of [B])
- Zero `next/image` usage; 27 raw `<img>` in 19 files; posters plain `.webp`, no `srcset`/sizes; several raw `<img>`s lack width/height.
- `auth-hero.jpg` 736 KB JPEG (login side panel) with no responsive variant; duplicate copy `public/images/auth-hero.jpg` 754 KB.
- OG/Twitter images are the same 1200×630 JPEG, 112 KB — fine. `apple-icon.png` 1,059 B.
- `public/*` assets served `Cache-Control: public, max-age=0, must-revalidate` (verified live on `/hero/sam.mp4` 549 KB, `/looks/beast_bounce.mp4` 38 KB, `/auth-hero.jpg`, `/brand/opencaption-icon-light.svg`) — repeat visitors revalidate all hero/looks media. `_next/static/*` correctly `public,max-age=31536000,immutable`.

## 13. Performance summary (reused from [B], not re-measured)
- Homepage first-load wire total ≈ 820 KB: HTML Brotli 16.6 KB + JS Brotli 675 KB (25 files, 2,193,148 bytes raw) + CSS Brotli ~21 KB + fonts 58 KB + hero video 38 KB + poster ~9 KB + logo 0.4 KB.
- Largest chunks: 150-look registry 440 KB raw / 121 KB br; Sentry client 284 KB raw / 95 KB br (+ second Sentry chunk 49 KB raw); Supabase client 230 KB raw / 61 KB br; React DOM 204 KB raw; Remotion Player 170 KB raw / 54 KB br; GSAP + ScrollTrigger 114 KB raw / 46 KB br.
- Biggest perceived delay: 2.3 s intro curtain on first desktop visit (`INTRO_A_MS = 2300`, `src/components/home/intro.ts`); skipped on coarse pointers and repeat visits.
- ~7.5 MB dead weight in `public/` (not downloaded, but shipped in every deploy): 3.0 MB unreferenced fonts (25 TTFs), ~2.86 MB non-raw hero videos, ~169 KB non-raw hero webps, duplicated `auth-hero.jpg`.
- Hovering the main CTA starts a Whisper model download (`Sections.tsx:45` → `warmModel` → HuggingFace `onnx-community/whisper-base_timestamped`); gated only by Save-Data/2G.
- Healthy: Brotli compression; immutable hashed static assets; prerendered HTML; no third-party scripts in served HTML; heavy libs (Transformers.js, `onnxruntime-web`, `mediabunny`, `wavesurfer`, `three`) dynamic-imported/worker-loaded, not on first load; UI fonts self-hosted via `next/font/google` (3 woff2 preloaded, 58 KB, no runtime Google Fonts fetch on homepage). Caption fonts load at runtime from Google Fonts (`display=block`, up-to-3 s FOIT) / Fontsource jsDelivr, but only in studio/showcase paths.
- No HeroCylinder exists in the repo — hero is `HeroLookVideo` (one `<video>` cycling 4 pre-rendered clips, ~38 KB each) **[B]**.

## 14. Mobile and Core Web Vitals
- Viewport meta present on every fetched page: `<meta name="viewport" content="width=device-width, initial-scale=1"/>` **[A]**.
- No obvious mobile issue visible in markup **[A]**.
- **Core Web Vitals: NOT measurable.** No Lighthouse, WebPageTest, real-browser trace, or field data was available in any audit (MCP trace tools unavailable; no browser tasks). No LCP/CLS/INP/FCP figures exist — none are claimed here. TTFB single `curl` samples from [B]: 0.61 s and 0.93 s (VM → Vercel `icn1` Singapore) — single observations, not benchmarks.

## 15. OG / social
- Homepage: full set incl. `og:image` + `twitter:image` (1200×630) **[A]**.
- All other indexable pages: OG title/description + `twitter:card=summary_large_image` + twitter title/description, but **no `og:image`, no `twitter:image`**; `og:locale`/`og:site_name` homepage-only **[A]**.
- No `twitter:site`/`creator` handle anywhere **[C]**; `og:image`/`twitter:image` rely on file convention (`app/opengraph-image.jpg`, `app/twitter-image.jpg`) with no explicit `images` field in `pageMetadata` **[C]**.

## 16. Ranked fix list (highest impact first)
1. **Decide the fate of `/transcribe`, `/motion`, `/ai-clipper`** (indexable landing pages vs app-only). If indexable: unique copy, canonical, `og:image`, remove noindex, add to sitemap, remove `/motion` from robots disallow. If app-only: no change; close as intentional. **[A] [C]**
2. **Fix the canonical host mismatch** — canonicalise to `www` (or flip the redirect); update `PRODUCTION_URL` fallback in `lib/seo.ts:19` to `https://www.captionit.in` so a missing env var cannot resurrect the old domain. **[A] [C]**
3. **Noindex `/onboarding`** (`pageMetadata index:false` + `APP_PATHS` + robots disallow) — it currently duplicates the homepage in the indexable set. **[A] [C]**
4. **Add sitewide default `og:image` / `twitter:image`** to all indexable pages. **[A]**
5. **Add `/transcribe`, `/ai-clipper`, `/onboarding` to `APP_PATHS` + robots disallow** (defence-in-depth); remove dead `/monitoring` entry. **[C]**
6. **Fix the 9 old-domain hrefs in `/credits`** → relative links. **[A]**
7. **Add `<lastmod>` to sitemap entries; add footer link to `/subprocessors`; give 404 pages their own title; add `generateMetadata` per `/motion/[templateId]` and metadata to `/settings/billing`.** **[A] [C]**
8. **Performance:** shorten/remove the 2.3 s intro curtain; split/lazy-load the 150-look registry (only 4 hero looks needed at first paint); drop Sentry session replay on the marketing homepage; defer Supabase client; gate Remotion demos behind near-viewport observer; long `max-age` headers for `/looks/*`, `/hero/*`, `/brand/*`, `/images/*`; adopt `next/image` starting with `auth-hero.jpg`; delete ~7.5 MB dead `public/` weight; trigger Whisper prefetch on click/intent, not hover. **[B]**
9. **Before ads for EEA/UK visitors:** add a Google-certified CMP (promised in privacy/cookies, no code exists). Set `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` in Vercel + redeploy once the publisher ID is confirmed (no code change needed; `.env.example` documents only `ADSENSE_PUBLISHER_ID` — add the `NEXT_PUBLIC_` var). No ad-slot/unit code exists yet — the loader alone shows no ads. **[C]**
10. **Consider:** noindex `/login`; explicit homepage title/description in `(home)/layout.tsx`; `Product`/`Offer` schema on `/pricing` (with server-rendered prices); `BreadcrumbList` if breadcrumb UI is ever added. **[A] [C] [NEW]**

## 17. Not verified in this audit
- Real-device layout, tap targets, Core Web Vitals, Lighthouse scores (not measurable here).
- GSC indexation/coverage state; whether the verification meta in live HTML matches the GSC property.
- Behaviour behind sign-in; API routes beyond robots disallow.
- AdSense account/publisher approval state.
