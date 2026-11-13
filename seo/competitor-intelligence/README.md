# Competitor Intelligence — Captionit SEO Programme

Branch: `feature/seo-competitor-intelligence-2026-11-13` (base main @ `584adf3`).
Date: 2026-11-13. No deploy from this branch; review only.

## What this folder is

The research behind the Captionit SEO programme, moved into the repo so the
strategy and the code it justifies live together. Nothing in this folder is
shipped in the frontend bundle (it sits at the monorepo root, not inside
`apps/frontend`).

## Contents

- `audit/` — baseline audit (product truth + current SEO condition),
  technical SEO audit, per-route indexability report. All verified against
  main @ `584adf3` and the live site on 2026-11-13.
- `competitors/` — one report each for Captions AI, AutoCaption and
  OpusClip, a side-by-side `competitor-comparison.md`, plus
  `visual-reference-board.md` (text-only structural board; screenshots
  were not obtainable from the sandbox and still need cloud-browser
  captures).
- `keywords/` — keyword research CSV (12 seed keywords, global + India),
  SERP analysis (24 SERPs + 3 brand checks), keyword gap analysis, and
  `keyword-mapping.csv` (every keyword → target page + status).
- `content/` — briefs for the built landing page and the next two tool
  pages, two guide briefs, and a comparisons README recording why
  comparison pages are deferred.
- `strategy/` — the phased roadmap, the parent/child site architecture,
  and the internal linking plan.
- `reports/` — tooling/skills install report, implementation report and
  quality-assurance report for this branch.

## Honesty rules for everything in here

- Volumes, difficulty, traffic and rankings are UNMEASURED everywhere (no
  paid provider was used). Never present an estimate as a measurement.
- Product facts (150 looks, 14 languages, 46 motion templates, formats,
  prices) were counted in code at main @ `584adf3`; use only those numbers.
- Competitor claims are observations from raw-HTML fetches on 2026-11-13,
  not measurements and not endorsements.
- The three named competitors rank on none of the 12 seed keywords. The
  real rivals are the tools that actually rank (CapsAI, CutXflow, EditCap,
  Captiq, EasyCap in India; CapCut/VEED/Kapwing/Filmora/Sonix/HeyGen and
  small browser tools globally).

## What this branch built

One new landing page (`/auto-caption-generator`), Product/Offer JSON-LD on
`/pricing`, sitemap + homepage/footer links for the new page. See
`strategy/seo-roadmap.md` for the phases and `reports/implementation-report.md`
for the exact change list.
