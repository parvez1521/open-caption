# Captionit Site Architecture — SEO Parent/Child Structure

Date: 2026-11-13. Branch: `feature/seo-competitor-intelligence-2026-11-13`.
All volumes/difficulty are UNMEASURED (no paid provider). Page statuses are
as of main @ `584adf3` plus this branch.

## Principles

- One page per search intent. A tool page answers "give me the tool"; a guide
  answers "teach me how"; a language page answers "in my language". Never
  two pages chasing the same intent with swapped keywords.
- Tool pages are the parents. Guides and language pages are children that
  link up to their tool parent and sideways to siblings, never to each other
  in a loop that hides the parent.
- No page is built until its parent exists or is built in the same phase.
- App routes behind sign-in (`/dashboard`, `/editor`, `/motion`,
  `/transcribe`, `/ai-clipper`, `/clipper`, `/settings`, and the rest of
  `APP_PATHS`) stay noindex. They are product surfaces, not landing pages.
  Any flip is an owner decision, not an SEO default.

## Current indexable tree (live + this branch)

```
/                          homepage — "Word-timed captions for Reels, Shorts
                           and TikTok, made in your browser" (SoftwareApplication
                           + FAQPage schema). Parent of everything.
/auto-caption-generator   NEW in this branch. Tool landing page for
                           "automatic video caption generator". Child of /,
                           parent of the future tool pages below.
/pricing                  Plans. Free ₹0 / Starter ₹299 / Plus ₹499 / Pro
                           ₹799, 30-day passes, no auto-renew. Linked from
                           every tool page's pricing note (never with both
                           currencies visible at once).
/about                    Product + one-person operation.
/login                    Sign-in entry point. Indexable today; removal is an
                           open owner decision, not made here.
/terms /privacy /cookies /acceptable-use /copyright /subprocessors /credits
                           Legal cluster. No SEO targeting; kept clean, unique
                           titles/descriptions, canonicals.
```

## Approved pages (Phase 2, in build order)

| Page | Parent | Intent | Primary keyword | Status |
|---|---|---|---|---|
| `/auto-caption-generator` | `/` | Transactional tool | automatic video caption generator | BUILT in this branch |
| `/animated-captions` | `/auto-caption-generator` | Transactional tool + gallery | animated captions generator | Next |
| `/subtitle-generator` | `/auto-caption-generator` | Transactional tool (file out) | video subtitle generator | Next |
| `/add-captions-to-video` | `/auto-caption-generator` | Informational how-to | add captions to video | Next |
| `/hinglish-captions` | `/auto-caption-generator` | Transactional, language | Hinglish caption generator | Next |
| `/hindi-subtitles` | `/subtitle-generator` | Transactional, language | Hindi subtitle generator | Next |
| `/ai-subtitle-generator` | `/subtitle-generator` | Transactional tool | AI subtitle generator | After 1-5 prove the template |
| 150-look styles gallery | `/animated-captions` | Commercial investigation | custom video captions | With `/animated-captions` |
| "How to add Hindi captions" guide | `/add-captions-to-video` | Informational how-to | add Hindi captions to video | With the how-to guides |

## Deferred (do not build now)

- **Comparison pages** (`/vs/*` or `/alternatives/*`). Reason: the three
  named competitors (Captions AI, AutoCaption, OpusClip) rank on none of the
  12 seed keywords, so comparisons against them would chase rivals nobody
  searches for. The real rivals are CapsAI, CutXflow, EditCap, Captiq,
  EasyCap (India) and CapCut/VEED/Kapwing/Filmora/Sonix/HeyGen (global).
  Comparison targets need re-deciding with the owner. Format is proven
  (CapsAI and StoryCut run alternatives pages that rank), but the target
  list is wrong until re-decided.
- **Bare-term pages** for "AI caption generator" and "online caption
  generator". Both SERPs are dominated by social-media text caption writers.
  Target video-qualified variants only.
- **Per-language pages beyond Hindi/Hinglish** (Tamil, Telugu, Bengali).
  Same template as the Hindi pages, only after Hindi proves out.
- **`/transcribe`, `/motion`, `/ai-clipper` as indexable pages.** Deliberate
  noindex today (parallel branch keeps it). Owner decision required.
- **`/contact`.** Noted as missing in the baseline audit; a real page needs
  owner input on what contact details to publish (currently only
  work.techhacksai@gmail.com in the footer).

## URL conventions

- Lowercase kebab-case, keyword-led, no parameters, no IDs:
  `/auto-caption-generator`, `/animated-captions`, `/subtitle-generator`,
  `/hinglish-captions`, `/hindi-subtitles`.
- One canonical per page, self-referential, on the www host once the
  parallel branch's www-canonical work merges (this branch does not redo
  that; at base the canonical host is still the apex fallback — see
  `reports/implementation-report.md`).
- New pages enter the sitemap through `INDEXABLE_PATHS` in `lib/seo.ts`
  with a priority that reflects their role: homepage 1.0, tool landing
  pages 0.8, sign-in 0.5, legal 0.3.

## Internal-link shape (detail in `internal-linking-plan.md`)

- Homepage tool-doors list and footer Product column link down to every
  tool landing page.
- Every tool page links up to `/`, across to its siblings, down to its
  children, and to `/pricing` and `/start` as the conversion exits.
- Guides link to their tool parent in the first section and again at the
  close, and to one sibling guide at most.
- No page links to a noindex app route as an SEO link. Links to
  `/transcribe` and `/motion` from the new tool page are user-navigation
  links to the product (both are live, working tools); they do not pass
  indexation and are not presented as landing pages.
