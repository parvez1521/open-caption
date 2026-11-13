# Captionit SEO Roadmap

Date: 2026-11-13. Branch: `feature/seo-competitor-intelligence-2026-11-13`.
Base: main @ `584adf3`. Sources: `audit/`, `competitors/`, `keywords/` in this
folder. All search-volume, difficulty, traffic and ranking figures in the
research are UNMEASURED (no paid provider); priorities below are qualitative
judgements from observed SERP composition, product fit and business value.
Never present an estimate as a measurement.

## What this branch does now (Phase 1, review-ready, no deploy)

1. Research moved into the repo under `seo/competitor-intelligence/`
   (audits, competitor reports, keyword research, tooling report) plus a
   text-only visual reference board. Screenshots were not obtainable from the
   sandbox; cloud-browser captures still need arranging.
2. One new landing page: `/auto-caption-generator` — the highest-density
   opportunity (exact product match, no dominant brand on the SERP, small
   tools ranking proves entry is possible). Unique title/meta, one H1,
   original copy from verified product truth only, steps, benefits and
   limitations, FAQ with FAQPage schema, SoftwareApplication JSON-LD,
   internal links, CTA to `/start`, OG tags.
3. Pricing made crawler-visible: `/pricing` prices were already
   server-rendered (the baseline's "client-rendered only" finding was wrong
   for a non-Indian fetch — see `reports/implementation-report.md` for the
   verification). This branch adds Product/Offer JSON-LD built from the same
   `PLAN_PRICING` config the page renders, so crawlers see the prices in
   structured data as well as in HTML.
4. Sitemap + discovery: `/auto-caption-generator` added to
   `INDEXABLE_PATHS` (priority 0.8, monthly), robots already allows it, and
   the page is linked from the homepage tool-doors list and the site footer.
5. Strategy docs (this folder): site architecture, internal linking plan.
6. QA: full gates run serially, route/metadata/sitemap/robots checks,
   JSON-LD parse validation, broken-link check on the new page. Results in
   `reports/quality-assurance.md`.

## What needs owner approval (not built, not decided here)

- **Deploy of this branch.** This is branch review only. Merge and deploy
  are the owner's call, after he reviews the new page on a preview.
- **Reconciling with the parallel SEO branch**
  (`feature/seo-ga-gsc-adsense-2026-11-13`, commit `d9e62e4`: www canonicals,
  noindex app routes, GA4 env gate, cache headers, dead-asset deletion).
  This branch was built on main @ `584adf3` and deliberately does NOT redo
  any of that work. The two branches touch the same shared files
  (`lib/seo.ts`, `sitemap.ts`, `robots.ts`, `components/home/Sections.tsx`);
  the merge order and conflict resolution need the parent/owner to decide.
  Every shared-file edit in this branch is listed in
  `reports/implementation-report.md` for that reconciliation.
- **Comparison pages.** Deferred (see Phase 3). The named competitors
  (Captions AI, AutoCaption, OpusClip) rank on none of the 12 seed keywords,
  so comparisons against them would target rivals nobody is searching for.
  The real rivals are CapsAI, CutXflow, EditCap, Captiq, EasyCap and the
  global tools (CapCut, VEED, Kapwing, Filmora, Sonix, HeyGen). Comparison
  targets need re-deciding with the owner before any comparison page is
  built. No comparison page is built in this branch.
- **Indexability flips for `/transcribe`, `/motion`, `/ai-clipper`.**
  NOT done in this branch and not requested here. The parallel branch
  deliberately keeps them noindex. Flipping any of them is a product
  decision (they are the natural search landing pages, and the AdSense
  inventory) that only the owner can make.
- **`/login` in the sitemap.** Indexable today, low search value. No change
  made; removal needs a decision.
- **Google Search Console / GA4 / AdSense setup.** Owned by the parallel
  branch (GA4 env gate) and by the owner (accounts, IDs, CMP for EEA/UK
  personalised ads). No credentials were touched here.

## Phase 2 (next, after Phase 1 is live and indexed)

Build in this order (from `keywords/keyword-gap-analysis.md` §8):

1. `/animated-captions` + the 150-look styles gallery. One build serves
   "animated captions generator" and "custom video captions". Captionit's
   150 looks is the largest style count observed anywhere (rivals claim
   20-106, except one 1,000+ claim that reads as inflated). Lead with the
   count, prove it with a browsable gallery with live previews.
2. `/subtitle-generator` — free SRT/VTT tool page. Small tools rank here;
   differentiate on free + Hindi/Hinglish + in-browser.
3. `/hinglish-captions` and `/hindi-subtitles` — per-language pages. The
   proven structure in India SERPs (ZapCap, CaptionMaker, NoteOwl all run
   dedicated Hindi pages). Captionit's sharpest differentiator against
   global tools.
4. How-to guides: "How to add captions to a video (free, in browser)" and
   "How to add Hindi captions to a video". The "add captions to video" SERP
   has the weakest tool competition of any seed (a Bevy help doc is the top
   global result).
5. `/ai-subtitle-generator` — hardest SERP observed (six funded tool pages);
   build after 1-4 prove the template.

## Phase 3 (later)

- Comparison pages vs the tools that actually rank (CapsAI, CapCut, VEED,
  Clipchamp) — only after the owner re-decides targets. Honest comparisons
  only: real features, real prices, no invented weaknesses.
- Per-language pages for Tamil, Telugu, Bengali (same template as the Hindi
  pages) once the Hindi pages prove out.
- Breadcrumbs (UI + BreadcrumbList JSON-LD) — none of the three named
  competitors has them; a small uncontested edge.
- `/contact` page (currently only a mailto footer link) and a Google-certified
  CMP before personalised ads in the EEA/UK.
- Roundup outreach: get Captionit listed in India "free subtitle tools"
  roundups (e.g. Gadgets Now lists VEED/Kapwing/Clipchamp/Subly; Captionit
  is absent). Outreach, not a page.
- Accessibility angle: one guide on captions for accessibility (WCAG, deaf
  viewers, YouTube indexing reviewed captions). Small but uncontested.

## Explicitly not doing

- Bare "AI caption generator" / "online caption generator" pages. Those
  SERPs are dominated by social-media text caption writers; video intent is
  a minority. Target video-qualified variants only.
- Fake testimonials, invented ratings, invented user counts, invented stats.
  Captionit has no review scores or creator counts to show; trust comes from
  the working free tool, honest limits and real product facts.
- Keyword stuffing, doorway pages, or one near-duplicate page per keyword
  variant. One page per intent, with distinct copy (the Captions AI
  duplicate-risk pattern is the warning, not the model).
- Any paid tool, API, or subscription. Free paths only, per the owner's
  standing rule.
