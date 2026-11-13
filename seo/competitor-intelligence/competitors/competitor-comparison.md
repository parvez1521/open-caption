# Competitor Comparison — Captions AI vs AutoCaption vs OpusClip (and Captionit)

Date: 2026-11-13. Sources: the three reports in this folder (all fetched
2026-11-13 via curl, raw HTML parsed locally) plus `keywords/serp-analysis.md`
and `keywords/keyword-gap-analysis.md`. No rankings, traffic, search-volume
or difficulty figures are stated anywhere here — none were measured. Word
counts are approximations from raw-HTML text extraction (nav/footer chrome
included), stated as such in the source reports.

## Headline finding — read this first

**None of the three named competitors ranks on any of the 12 seed keywords
in the observed top ~5** (27 searches, desktop, 2026-11-13). There are
therefore no keywords shared by multiple named competitors in this data,
and no "beat X on keyword Y" plan can be built from the named three alone.
The real ranking rivals on caption terms are different tools: CapsAI,
CutXflow, EditCap, Captiq, EasyCap (India) and Filmora, CapCut, VEED,
Kapwing, Sonix, HeyGen, quso.ai, Wave (global). See
`keywords/keyword-gap-analysis.md` §1–§2 for the full matrix.

What the three named competitors ARE useful for: each one demonstrates a
different SEO pattern worth stealing (tool hub, comparison pages, FAQ depth
+ blog cluster). That is the comparison below.

## Side-by-side

| | Captions AI — AI B-roll generator | AutoCaption — homepage | OpusClip — /captions | Captionit (this branch) |
|---|---|---|---|---|
| Target URL | https://captions.ai/tools/ai-b-roll-generator | https://autocaption.io | https://www.opus.pro/captions | https://www.captionit.in + /auto-caption-generator |
| Page type | Tool landing page (sibling tool, not a captions page) | Caption-first homepage | Dedicated captions landing page inside a suite | Caption-first homepage + one tool landing page |
| Title (as fetched) | "AI B-Roll Generator: Add B-Roll to Videos With Captions \| Captions" | "AutoCaption — Add Captions to Your Videos in Seconds" | "Best Captions AI - Animated Captions in 1 Click - OpusClip" | Homepage: "Word-timed captions for Reels, Shorts and TikTok, made in your browser \| Captionit". New page: "Automatic Video Caption Generator — Free, In Your Browser" |
| H1 | "AI B-roll generator" | "Create viral captions for your videos in seconds" | "Eye-catching animated AI captions added in 1 click" | Homepage H1 is the hero line; new page H1 "Automatic video caption generator" |
| Body copy (approx.) | ~400–450 words (thin, demo-led) | ~500–600 words unique (thin, conversion-led) | ~1,855 words (longest by 2.4× — breadth: suite + API/MCP + FAQ) | New page ~1,300 words of original copy (steps, benefits, limits, FAQ) |
| FAQ | 3 questions, WITH FAQPage schema | 7 questions, NO schema | 11 questions, WITH FAQPage schema | Homepage FAQ + new-page FAQ (6), both WITH FAQPage schema |
| Schema | Organization + WebSite + SoftwareApplication + FAQPage | NONE (zero JSON-LD blocks) | FAQPage only | SoftwareApplication + FAQPage (homepage + new page); Product/Offer added on /pricing by this branch |
| Rendering | SSR (Astro) — content in raw HTML | SSR/static — content in raw HTML | Webflow — content in raw HTML | Next.js SSR/prerender — content in raw HTML |
| Sitemap | Single sitemap.xml, 192 URLs; uniform lastmod (generation time, not per-page) | Sitemap index → 25 URLs; no lastmod; /sitemap.xml itself 404s | Single sitemap.xml, 5,564 URLs; 5 locales with hreflang; per-page lastmod | Single sitemap.ts, 12 URLs after this branch (11 + new page); lastmod = build date |
| robots.txt | Allows all except /signup | Allows all | Allows all except /*?*, /cdn-cgi/, ads-library paths | App routes disallowed; new page allowed |
| Internal linking | Largest template system: 20 /tools/*, 14 /features/*, ~25 /solutions/*, ~45 /styles/*, ~14 /use-cases/*, blog, /vs/* | Small and focused: 4 tool pages + 2 vs-pages + blog (6 posts), all depth 1 from homepage | 100 links; features nav (16), solutions (10), tools hub, blog cluster, app subdomain | Homepage tool-doors + footer link to the new page; new page links up/across/to /pricing and /start |
| Trust signals | Minimal on-page: none (no logos, scores, testimonials) | Strongest: 4.7/5 with 14,000+ reviews, Trustpilot 4.2/5, "Trusted by 300,000+ creators", logo row | Scale-based: "Used by 20M+ creators", named creators + follower counts, case-study link | NONE claimed — no review scores, no creator counts, no testimonials. Trust is carried by the working free tool and honest limits (deliberate; see below) |
| Comparison content | Off-page: /vs/capcut, /vs/descript + comparison blog posts | On the homepage: /vs-submagic, /vs-kapwing linked directly | Off-page: blog roundups ("best auto caption generators") | NONE in this branch (deferred — see below) |
| Demo / conversion device | Interactive in-page demo (upload → style → generate) + style gallery | Before/after hero visual (15 s clip) | Interactive hero widget (paste link / upload) | No in-page demo on the new page; CTAs go to /start (the real tool) |
| Locales / hreflang | None | en + fr (+ x-default) | en-US + es, pt-BR, de-DE, fr-FR (full hreflang) | None (English only; Hinglish/Hindi are product languages, not site locales) |
| Breadcrumbs | None | None | None | None (noted as an uncontested edge for later) |
| Notable weaknesses | Thin copy; 3 FAQs; no testimonials; trailing-slash URL returns 200 alongside canonical; barely targets caption keywords | No structured data at all; duplicated how-it-works blocks; tiny blog (6 posts); /sitemap.xml 404 | FAQ-only schema despite scale; 319 KB HTML + many third-party scripts; apex redirects 302 not 301; geofencing script can hide CTAs; captions diluted by suite cross-sell | One tool page only (Phase 1); no comparison pages; no styles gallery yet; no breadcrumbs; OG share image still carries the old "CaptionsEasy" name and "20+ looks" (separate fix, not this branch) |

## What Captionit takes from each (patterns, not copy)

- **From Captions AI — the tool-hub pattern.** One product, many
  keyword-led tool pages (`/tools/*`) plus feature, solution and style
  pages, all interlinked from a site-wide footer/nav. Captionit's version
  is the architecture in `strategy/site-architecture.md`: one page per
  intent, tool pages as parents, guides and language pages as children.
  Warning taken from the same source: 20 near-identical tool pages with
  swapped keywords is a duplicate-risk pattern — Captionit builds one page
  per distinct intent, with distinct copy, and does not do it.
- **From AutoCaption — comparison pages + trust signals, done honestly.**
  AutoCaption links `/vs-submagic` and `/vs-kapwing` from its homepage and
  shows review scores + creator counts. Captionit will build comparison
  pages only against tools that actually rank (CapsAI, CapCut, VEED,
  Clipchamp) and only after the owner re-decides targets — the named three
  do not rank on the seeds, so comparisons against them would chase rivals
  nobody searches for. And Captionit will NOT invent review scores,
  creator counts or testimonials to match AutoCaption's trust strip: it
  has none to show, and fake social proof is a ban-list item.
- **From OpusClip — FAQ depth + a real content cluster, and duplicate
  control.** 11 questions with schema, a caption blog cluster, and
  disciplined parameterised-URL control (robots `/*?*` + JS noindex).
  Captionit's new page has 6 FAQs with matching FAQPage schema; the blog
  cluster and the `/transcribe`–`/motion`–`/ai-clipper` indexability
  decisions are owner calls, not taken here.
- **From all three — schema everywhere it is earned.** Captions AI has
  the fullest schema of the three; AutoCaption has none at all (a 7-question
  FAQ with no FAQPage schema is the clearest missed opportunity in this
  set); OpusClip has FAQ only. Captionit already ships SoftwareApplication
  + FAQPage on the homepage; this branch adds the same to the new tool page
  and Product/Offer (from the real pricing config, no ratings) to /pricing.

## What Captionit does NOT copy

- No logos, screenshots, proprietary text, HTML or exact designs were
  taken from any competitor. All copy in this programme is original,
  written from Captionit's verified product facts
  (`audit/captionit-baseline.md`).
- No fake ratings, reviews, creator counts or testimonials.
- No invented stats. The "150 looks" count is Captionit's own verified
  registry size; the "largest style count observed" framing in the new page
  is qualified as "we verified among rival tools in this research" because
  one rival (StoryCut) claims 1,000+ styles without verification.
- No near-duplicate tool pages with swapped keywords (the Captions AI
  pattern is the warning, not the model).

## Verdict

On the evidence in this folder, Captionit's Phase 1 position is: the
strongest schema coverage of the four (after this branch), the most honest
copy (limits stated on the page), and the thinnest footprint (one tool page
vs AutoCaption's 4 + 2 vs-pages, Captions AI's 20 tools, OpusClip's
5,564-URL site). The gap to close is footprint, in the build order in
`keywords/keyword-gap-analysis.md` §8 and `strategy/seo-roadmap.md` Phase 2
— not trust signals it cannot honestly claim, and not comparisons against
rivals nobody searches for.
