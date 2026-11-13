# Implementation Report — Competitor SEO Programme, Phase 1

Date: 2026-11-13. Branch: `feature/seo-competitor-intelligence-2026-11-13`.
Base: main @ `584adf3`. No merge, no deploy (owner review only).

## What this branch changed

### Code (5 modified files + 1 new route)

| File | Change |
|---|---|
| `apps/frontend/src/app/auto-caption-generator/page.tsx` (NEW) | Tool landing page: one H1, 5-step how-it-works, benefits, languages, formats, limits, pricing note, FAQ (6), closing CTA. Original copy from verified product facts only; no images (see known gap below). |
| `apps/frontend/src/app/auto-caption-generator/layout.tsx` (NEW) | Unique title/meta via `pageMetadata`; SoftwareApplication + FAQPage JSON-LD (FAQ built from the same array as the visible FAQ section). |
| `apps/frontend/src/app/auto-caption-generator/faqs.ts` (NEW) | 6 FAQs, shared by page + schema. Every answer states verified product facts only. |
| `apps/frontend/src/lib/seo.ts` | `/auto-caption-generator` added to `INDEXABLE_PATHS`; new `productJsonLd()` building Product/Offer from the same `PLAN_PRICING` config the pricing page renders (7 offers: Free ₹0 + 3 paid plans × INR/USD; one currency per Offer; no ratings/reviews). |
| `apps/frontend/src/app/pricing/page.tsx` | Embeds `productJsonLd()` as `application/ld+json` (escaped `<`). No visible change. |
| `apps/frontend/src/app/sitemap.ts` | New page at priority 0.8, monthly. Sitemap grows 11 → 12 URLs. No hidden/unlinked tools added. |
| `apps/frontend/src/components/home/Sections.tsx` | One Tool Door + one footer Product link to `/auto-caption-generator`. No other homepage change. |
| `apps/frontend/src/lib/__tests__/seo.test.ts` | 4 new tests (sitemap/robots indexability, page metadata, FAQ/schema mirror, product JSON-LD prices). No test weakened. |

### Docs (new, under `seo/competitor-intelligence/`)

`README.md`; `audit/` (baseline, technical, indexability — moved in from
the research folder); `competitors/` (captions-ai, autocaption, opusclip,
competitor-comparison, visual-reference-board); `keywords/`
(keyword-research.csv, serp-analysis, keyword-gap-analysis,
keyword-mapping.csv); `strategy/` (roadmap, site-architecture,
internal-linking-plan); `content/` (landing-page briefs for the built page
+ `/animated-captions` + `/subtitle-generator`; 2 guide briefs;
comparisons README recording the deferral); `reports/` (tooling-and-skills,
this file, quality-assurance).

### Deliberately NOT changed

- No `robots.ts` change (the new page was already allowed; no app route
  was flipped). No auth, payment, DB or billing code touched. No new
  dependency. No comparison page built (targets need re-deciding — see
  `content/comparisons/README.md`). No `/transcribe`, `/motion`,
  `/ai-clipper` indexability flip. No `login` sitemap change. No GA4/GSC/
  AdSense credentials touched (parallel branch owns the GA4 env gate).

## Correction to the baseline audit (verified, with evidence)

The baseline audit claimed live `/pricing` shows plan names but **no prices
in server-rendered HTML** (its check searched the fetched HTML for `₹`,
`299`, `499`, `799` and found zero). **That finding was wrong — a grep
artifact, not a rendering fact.** Verified 2026-11-13 by the recovery
coordinator:

- Live `https://www.captionit.in/pricing` HTML (HTTP 200, fetched by curl)
  contains `$0`, `$4`, `$6`, `$10` — the exact USD price set from
  `PLAN_PRICING` — alongside the plan names. The fetch came from a
  non-Indian IP, so the server rendered the USD set; the baseline's grep
  only looked for the INR set, which cannot appear on a non-Indian fetch.
- Code confirms it: `/pricing` is an async server component
  (`page.tsx:26`) that reads the visitor's country header and renders
  `priceLabel(entry, currency)` server-side. Prices were never
  client-rendered; they are geo-rendered server-side (INR for Indian
  visitors, USD elsewhere — the owner's never-₹-and-$-together rule).
- Implication: crawlers DID see prices (in their own geo currency). The
  real gap was only the missing Product/Offer schema — which this branch
  fixes with `productJsonLd()`. The baseline audit file is NOT silently
  rewritten here; this correction stands in this report, and the parent
  can decide whether to amend the baseline doc.
- The `seo-roadmap.md` Phase 1 §3 already states this correction in
  short form; this section is the evidence behind it.

## Merge reconciliation (parallel SEO branch)

The parallel branch `feature/seo-ga-gsc-adsense-2026-11-13` (commit
`d9e62e4`: www canonicals, noindex app routes, GA4 env gate, cache
headers, dead-asset deletion) touches shared files. **Exact overlap with
this branch (verified by `git status`/`git diff`):**

| Shared file | This branch | Parallel branch (d9e62e4) | Reconciliation note |
|---|---|---|---|
| `lib/seo.ts` | INDEXABLE_PATHS + `productJsonLd()` | www canonicals (PRODUCTION_URL → www), OG constants, GA4 helper | Both edits are additive in different regions; expect a clean or trivial merge. The new page's canonical follows whichever PRODUCTION_URL wins — after d9e62e4 merges, it is www. |
| `app/sitemap.ts` | New page, priority 0.8 | lastmod = build date | Additive; no conflict expected beyond context lines. |
| `components/home/Sections.tsx` | One door + one footer link | (touched — verify at merge time) | Check at merge time; this branch's edits are 2 added lines. |
| `app/robots.ts` | NOT touched by this branch | Touched by parallel branch | No overlap. (The roadmap §"What needs owner approval" lists robots.ts as shared — that is overstated; this table is the verified list.) |

Merge order is the owner's/parent's call. Do NOT merge both branches at
once without resolving `lib/seo.ts` by hand and re-running the full gates
on the merged tree.

## Known gaps left open (not fixed here)

- **OG share image is stale:** the site's only share image still carries
  the old "CaptionsEasy" name and "20+ looks". The new page therefore
  uses no image at all rather than showing the wrong brand/count.
  Replacing that asset is a separate fix.
- **No comparison pages** (targets need re-deciding).
- **No styles gallery yet** (Phase 2, with `/animated-captions`).
- **No breadcrumbs** (UI + BreadcrumbList — uncontested edge, Phase 3).
- **`/login` still in the sitemap** (low search value; removal needs a
  decision).
- **No GA4/GSC/AdSense setup in this branch** (parallel branch + owner).

## Expected benefit (qualitative — no ranking is guaranteed)

- `/auto-caption-generator` targets the highest-density opportunity found:
  exact product match, transactional intent, no dominant brand on the
  SERP, small tools ranking proves entry is possible.
- Pricing becomes crawler-visible in structured data (Product/Offer from
  the real config), so price queries can surface the page even when the
  crawler's geo currency differs from the searcher's.
- The page is discoverable: sitemap + homepage doors + footer + internal
  links from the new page itself.
- Research + strategy are now in the repo, so Phase 2 pages can be built
  from the briefs in `content/` without re-doing the research.
