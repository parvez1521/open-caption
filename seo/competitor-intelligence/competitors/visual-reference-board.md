# Visual Reference Board — Competitor Landing Pages (text only)

Date: 2026-11-13. Sources: the HTML-structure descriptions in
`competitors/captions-ai.md` (§D), `competitors/autocaption.md` (§D) and
`competitors/opusclip.md` (§D), each derived from raw-HTML fetches on
2026-11-13. Nothing here is copied copy or copied design: it is a structural
summary of what those pages do, for Captionit to learn from as strategy.

## Screenshot status

**No screenshots were obtainable from the sandbox.** The research used
`curl` raw-HTML fetches plus local HTML parsing; there was no headless
browser and no screenshot tooling. Every layout claim below is inferred from
HTML structure and copy order, as the source reports state. Cloud-browser
captures of the three pages below still need to be arranged by the parent
before any visual-design decision is made from this board. Do not treat any
description here as a verified visual fact.

Pages to capture when a cloud browser is available:

1. https://captions.ai/tools/ai-b-roll-generator (Captions AI tool page)
2. https://autocaption.io/ (AutoCaption homepage)
3. https://opus.pro/ (OpusClip captions landing page — confirm exact URL from
   `competitors/opusclip.md` before capturing)

## Board 1 — Captions AI, AI B-roll tool page

- Hero: compact. H1 plus one supporting paragraph plus two CTAs (sign-up,
  get the app), with a hero visual showing B-roll options. The interactive
  demo follows almost immediately: the tool is the hero's second half, not a
  separate below-fold block.
- Demo: the central element. Upload or drag a video, pick a style, generate.
  A gallery of named video styles is shown as thumbnails (e.g. Tour,
  Strategist, Cozy, Vox-Style). The demo, not prose, is the page's main
  trust and engagement device.
- Body: a short "why you need it" section with three benefit blocks, then a
  short section on prompt-based / automatic B-roll, then a closing CTA.
- FAQ: 3 questions near the bottom, accordion-style in markup, backed by
  FAQPage schema.
- Trust signals: minimal on the page itself. No customer logos, no review
  scores, no testimonial quotes in the raw HTML. Trust is carried by the
  demo and by the wider site.
- Navigation / footer: top nav with Features, Solutions, Use cases, Pricing,
  Resources, Sign up. Footer is a large multi-column link farm (Product,
  Company, Solutions, Use Cases, Features, Get Started, Resources,
  Businesses, Creators, Professional Services, Formats, Platforms, Tools)
  plus social and legal links. The footer is the page's main internal-linking
  engine. Tool hub: 20 `/tools/*` pages, each one click from the footer.
- What to borrow: tool-first hero (demo above the fold), a named-style
  gallery as the visual core, FAQPage schema on every tool page, the
  footer-as-link-hub pattern.
- What not to copy: the thin prose (roughly 400-450 words of editorial copy)
  is a weakness Captionit should beat on depth, not match.

## Board 2 — AutoCaption homepage

- Hero: compact. Eyebrow label ("AI captions for creators"), H1, one
  supporting sentence, "Try it free" CTA, and a before/after visual (a
  15-second clip shown uncaptioned vs captioned). Trust signals sit directly
  under the hero.
- Trust signals: the strongest of the three on-page. A star rating with two
  review figures in the hero area (4.7/5 with 14,000+ reviews, Trustpilot
  4.2/5 with a link to read reviews), a "Trusted by 300,000+ creators" line,
  and a logo row naming well-known SaaS/product brands (the row repeats in
  the HTML). No pricing or guarantee claims in the hero.
- Visuals: product-UI-led, not lifestyle-led. Six feature images (caption
  styles, platform repurpose, subtitle editor, export, templates, teams) and
  three how-it-works images (upload, customise, export).
- FAQ: 7 questions mid-page, the longest FAQ of the three competitors, but
  with no FAQPage schema to match. That is a gap Captionit beats by pairing
  every FAQ with schema.
- Comparison: none on the homepage. Comparison is handled by two linked
  vs-pages that describe themselves as side-by-side comparisons.
- Navigation / footer: top nav with Features, Resources, Pricing, Affiliate,
  API Docs, Log in, Try it free. Footer is compact: Product (Pricing, Blog,
  API Docs, Affiliate Program), Caption Tools (AI Caption Generator, TikTok
  Captions, Subtitle Generator, Add Captions to Video, vs Submagic,
  vs Kapwing), Legal, language switcher (English / Francais), copyright.
- What to borrow: before/after hero visual, trust signals directly under the
  hero, a compact footer that still surfaces the tool pages, comparison pages
  as a separate format (not crammed onto the tool page).
- What not to copy: Captionit has no review scores, no creator count and no
  brand logos to show, so it must not invent equivalents. No fake
  testimonials, no invented ratings. Trust on Captionit pages comes from the
  working free tool, honest limits and real product facts (150 looks,
  14 languages, in-browser).

## Board 3 — OpusClip captions landing page

- Hero: announcement banner ("OpusClip 4.0 is here") above the nav, then a
  "#1 AI captioning tool" badge, H1, supporting sentence, and an embedded
  interactive tool widget (paste a link or upload a file, with a source list
  and an "Add captions now" CTA). The tool is the hero, rather than a
  screenshot of the tool. Stat callouts (wait time, accuracy, languages) sit
  below the widget.
- Trust signals: the strongest social-proof scale of the three. "Used by 20M+
  creators and businesses" plus a strip of named creators/businesses with
  follower counts, a case-study link ("How OpusClip helps marketing agencies
  boost revenue by 148%"), and a Trust Center link in the footer. No
  star-rating / review-aggregator score was observed (unlike AutoCaption).
- Visuals: no static product screenshots dominate. The interactive widget is
  the demo. Supporting visuals are audience/feature images, blog-card
  thumbnails and stat icons. The API/MCP sections are text- and CTA-led.
- FAQ: 11 questions near the bottom ("Got questions?"), backed by FAQPage
  schema. The most complete FAQ of the three, and the model for Captionit
  FAQ depth on tool pages.
- Blog cluster: a caption blog cluster is linked from the page, feeding the
  tool page with topical internal links.
- Navigation / footer: very large top nav with two dropdown systems
  (Features, 16 items; Solutions, 10 audiences; Resources, 5 items) plus
  Pricing, For business, Opus Labs, Join waitlist, My dashboard, Sign in,
  Sign Up. Footer: Company, Product, Resources, Best Practices (4 featured
  guides), Trust and Legal, plus social links and a cookie-consent notice.
  A "Get 90 Credits for Free" banner is also surfaced in the footer.
- What to borrow: the tool-in-the-hero pattern, stat callouts under the
  widget, a deep FAQ with schema, a blog cluster feeding tool pages,
  disciplined duplicate control (one page per intent; comparisons delegated
  to blog roundups, not duplicated on the tool page).
- What not to copy: the "#1" badge style claim (unverifiable), the 20M+
  scale claim (Captionit has no such number), and the giant nav (Captionit
  has far fewer pages; a link farm with nothing behind it is worse than a
  small honest nav).

## Cross-cutting patterns (all three)

- One H1, keyword-led, matching the URL slug.
- Tool or demo above the fold; prose supports the tool, it does not replace
  it.
- FAQ near the bottom on every tool page. Two of three back it with FAQPage
  schema; the one that does not is the gap to beat.
- Comparison content lives on separate pages or in blog posts, never as a
  table crammed onto the tool page.
- No breadcrumbs on any of the three pages. Captionit adding BreadcrumbList
  schema is a small, uncontested edge (not built in this branch).
- None of the three shows a fake testimonial. AutoCaption and OpusClip show
  aggregate, verifiable social proof; Captions AI shows none on the page.
  Captionit must stay in the honest lane: no invented ratings, counts or
  quotes.
