# Competitor SEO Report — AutoCaption: Homepage

- **Target URL:** https://autocaption.io
- **Fetch date:** 2026-11-13
- **Method:** curl via sandbox egress proxy (raw HTML saved, 71,223 bytes, HTTP 200) + local HTML parsing of title/meta/headings/links/images. No headless browser, no screenshots. No rankings, traffic, search-volume or difficulty figures are stated anywhere in this report — none were measured.
- **Note on scope:** this is the closest direct competitor of the three to Captionit — a caption-first homepage (not a sub-tool page), so its structure is the most directly comparable.

## A. On-page SEO

- **Page title:** "AutoCaption — Add Captions to Your Videos in Seconds" (raw HTML, curl, 2026-11-13).
- **Meta description:** "AutoCaption is the AI caption generator for TikTok, Instagram & YouTube. Animated subtitles, emojis & translations in 100+ languages. Try free." (raw HTML, curl).
- **OG tags:** og:title and og:description mirror title/description; og:type `website`; og:image `https://autocaption.io/og-default.png`; twitter:card `summary_large_image`. Same source/method.
- **Canonical:** `https://autocaption.io/` — self-referential, present in raw HTML.
- **Language / hreflang:** `<html lang="en">`; hreflang alternates present in raw HTML: en → `https://autocaption.io`, fr → `https://autocaption.io/fr`, x-default → `https://autocaption.io`. A French version of the site exists (`/fr/` + translated sub-pages).
- **No meta robots tag present.**
- **H1 (1):** "Create viral captions for your videos in seconds".
- **H2s (5):** "Everything you need to create better captioned videos."; "Create captioned videos in 3 simple steps"; "Frequently asked questions"; "Every caption tool you need"; "Ready to create captioned videos that stand out?".
- **H3s (12):** feature H3s — "Caption styles that keep people watching", "One video, every platform", "Edit subtitles and timing", "Export and publish faster", "Save your best templates", "Made for creators and teams"; how-it-works H3s (each appearing twice in the HTML — once in the desktop layout, once in a mobile/duplicate block) — "Upload your video", "Customize your captions", "Export & publish".
- **Content sections (summarised, not copied):**
  1. Hero — H1 + supporting line on automatic stylish captions, animated emojis and ready-to-post videos for TikTok/Reels/Shorts; "Try it free" CTA; a before/after visual (15-second captioned clip).
  2. Trust strip — star rating and review counts (see §D), plus a "Trusted by" logo row.
  3. Features — six feature blocks (caption styles, multi-platform resize, subtitle/timing editor, export/publish, templates, creators/teams).
  4. How it works — 3 steps (upload → customise → export/publish), with images per step.
  5. FAQ — 7 questions (see below).
  6. "More tools" — a hub of six purpose-built pages (AI Caption Generator, TikTok Caption Generator, Subtitle Generator, Add Captions to Video, vs Submagic, vs Kapwing).
  7. Closing CTA — "Ready to create captioned videos that stand out?" with "Try it free" and three benefit bullets.
- **Primary keyword themes:** "add captions to videos", "AI caption generator", "captions for videos", "animated captions / animated subtitles".
- **Secondary themes:** TikTok / Instagram Reels / YouTube Shorts captions, caption styles/templates, 100+ languages & translation, emoji captions, auto-resize/repurpose for platforms, subtitle editor & timing, team/API access.
- **Search intent:** primarily transactional (homepage for a caption tool — "try it free", no credit card), with informational support via the FAQ and the linked tool/blog pages. Comparison intent is explicitly served by the linked vs-pages.
- **Image alt attributes (sample, from raw HTML):** 18 `<img>` tags, 18/18 carry an `alt` attribute (two CTA images have empty `alt=""`). Descriptive alts include "Before" / "After" (hero comparison), "Caption styles", "Platform repurpose", "Subtitle editor", "Export", "Templates", "Teams", "Upload your video", "Customize your captions", "Export & publish". Alts are short and functional rather than keyword-stuffed; the two empty alts are on duplicated CTA imagery.
- **Internal links (32 `<a>` total, all internal or own-subdomain, from raw HTML):** nav — Features, Resources, Pricing, Affiliate, API Docs, Log in, Try it free; tool pages — `/ai-caption-generator`, `/tiktok-caption-generator`, `/subtitle-generator`, `/add-captions-to-video`; comparison — `/vs-kapwing`, `/vs-submagic`; `/blog`, `/pricing`, `/affiliate`, `/privacy`, `/terms`; app subdomain — `https://app.autocaption.io` and `/auth/login`; developer docs — `https://developers.autocaption.io/introduction`; language switch — `/fr`. External links in the HTML are effectively zero in the parsed `<a href>` set except a Trustpilot review link (`https://www.trustpilot.com/review/autocaption.io`, counted as internal-ish by the parser because it matched a substring rule — it is in fact external; no other external links were found).
- **External references:** only the Trustpilot review link above; no editorial external citations, no social-profile links found in the homepage HTML.
- **CTA placement:** top nav ("Try it free", "Log in"), hero ("Try it free"), after how-it-works ("Start for free — No credit card required"), closing section ("Try it free"). Every CTA points to the same free-trial/app entry point.
- **FAQs (summarised, 7 questions — visible text only; no FAQ schema, see Schema):**
  1. What AutoCaption is (AI tool that auto-generates stylish captions; upload → style → export).
  2. Which video formats are supported (MP4, MOV, AVI, MKV, WebM; up to 4K).
  3. How many languages are supported (100+; named examples include English, Spanish, French, Portuguese, Arabic, Hindi, Japanese).
  4. Whether caption style can be customised (fonts, colours, animations, size, position, word emphasis; reusable templates).
  5. How long processing takes (most videos under 10 seconds; longer content a few minutes).
  6. Whether there is a free plan (yes, free tier, no credit card; paid unlocks export quality, templates, teams/API).
  7. Whether one video can serve multiple platforms at once (one-click resize for TikTok/Reels/Shorts 9:16 and LinkedIn 1:1 or 16:9).
- **Schema types found:** none. Zero `application/ld+json` blocks in the raw HTML fetched 2026-11-13 — no FAQPage (despite a 7-question FAQ), no Organization, no SoftwareApplication, no BreadcrumbList. This is a notable gap versus both other competitors.
- **Approximate word count:** ~763 visible words by stripping `<script>`/`<style>` and tags from the raw HTML and counting tokens (local parse, 2026-11-13). That count includes navigation, footer and repeated how-it-works copy (the 3 steps appear twice in the HTML), so true unique body copy is less — roughly 500–600 words. Thin for a homepage, but the page is conversion-led rather than editorial.
- **Indexability signals:** HTTP 200, self-canonical, listed in sitemap (see §B), robots.txt allows all, no noindex meta observed. Nothing observed that would block indexing.

## B. Technical SEO

- **robots.txt** (fetched 2026-11-13, curl, HTTP 200, 74 bytes): `User-agent: * / Allow: /`; sitemap declared: `https://autocaption.io/sitemap-index.xml`.
- **Sitemap structure:** sitemap index (`sitemap-index.xml`) pointing to a single child, `sitemap-0.xml`, which contains 25 URLs (counted 2026-11-13): homepage, `/add-captions-to-video/`, `/affiliate/`, `/ai-caption-generator/`, `/ai-videos/`, `/blog/` + 6 blog posts (`captions-vs-subtitles`, `how-to-add-subtitles-to-video`, `open-captions-vs-closed-captions`, `tiktok-caption-generator`, `what-are-closed-captions`, `what-is-b-roll`), `/pricing/`, `/privacy/`, `/terms/`, `/subtitle-generator/`, `/tiktok-caption-generator/`, `/vs-kapwing/`, `/vs-submagic/`, plus `/fr/` and 5 French sub-pages. No `<lastmod>` values are present in the sitemap entries observed. Note: `https://autocaption.io/sitemap.xml` itself returns **404** (checked 2026-11-13) — the correct sitemap is only reachable via the index declared in robots.txt.
- **Canonical implementation:** self-referential canonical on the homepage; hreflang set (en/fr/x-default) is consistent with the canonical.
- **Redirects observed (curl -I, 2026-11-13):** `http://autocaption.io` → 301 → `https://autocaption.io/` (single hop, clean). No redirect chain issues observed on the target URL.
- **HTTP status codes:** homepage 200; supporting pages checked all 200 (see §E). `/sitemap.xml` 404 (see above).
- **Rendering method:** SSR/static HTML — key content (title, H1, features, FAQ, tool hub) is present in the raw HTML fetched by curl; the page does not depend on client-side JS for its indexable content. HTML is compact (71 KB) with no large inline payload observed.
- **Mobile usability signals:** viewport meta `width=device-width` present. The how-it-works steps are duplicated in the HTML (desktop + mobile blocks), which suggests responsive variants rather than a single fluid layout. No mobile errors observed in the fetch. Real-device rendering and Core Web Vitals were **not measurable** from this sandbox (no browser, no Lighthouse/PageSpeed run) — not claimed here.
- **Structured data:** absent (see §A).
- **Internal link depth:** homepage is depth 0; tool pages (`/ai-caption-generator`, `/tiktok-caption-generator`, `/subtitle-generator`, `/add-captions-to-video`) and comparison pages are depth 1 and linked directly from the homepage "More tools" hub. Blog is depth 1 with only 6 posts in the sitemap — a small content footprint.
- **Duplicate/overlapping pages found:** the homepage's how-it-works copy is duplicated verbatim in the HTML (two render blocks); topically, `/ai-caption-generator` vs `/add-captions-to-video` vs `/subtitle-generator` vs the homepage itself all target closely related "add captions" queries, and the blog post `/blog/tiktok-caption-generator/` overlaps the tool page `/tiktok-caption-generator/`. No duplicate-content penalty is claimed — only the overlap pattern observed in the sitemap + homepage links.
- **Breadcrumb structure:** none observed — no breadcrumb markup, no BreadcrumbList schema, no visible breadcrumb trail.
- **URL naming conventions:** lowercase kebab-case, short and keyword-led: `/ai-caption-generator`, `/tiktok-caption-generator`, `/subtitle-generator`, `/add-captions-to-video`, `/vs-submagic`, `/vs-kapwing`, `/blog/what-is-b-roll`, `/fr/*` for French. Trailing slashes used in sitemap URLs.

## C. Content intelligence

- **Primary keyword opportunities visible:** "add captions to videos", "AI caption generator", "TikTok caption generator", "subtitle generator", "auto caption".
- **Secondary clusters:** animated captions / animated subtitles / emojis in captions; caption styles & templates; 100+ languages / translation; platform repurposing (TikTok, Reels, Shorts, LinkedIn); subtitle editing & timing; export quality / direct publishing; teams & API.
- **Long-tail queries the page targets (inferred from headings/FAQ/tool hub, not from any keyword tool):** "how to add captions to a video", "what video formats does [tool] support", "how many languages does [tool] support", "can I customize caption style/fonts/colors", "how long does auto captioning take", "is there a free caption generator", "captions for TikTok/Reels/Shorts in one click".
- **Semantic entities:** captions, subtitles, animated emojis, transcription, translation, caption templates, aspect ratios (9:16, 1:1, 16:9), platforms (TikTok, Instagram Reels, YouTube Shorts, LinkedIn), 4K export, teams/API.
- **Questions users ask (from the on-page FAQ):** the 7 questions listed in §A. No People Also Ask data was accessible from this sandbox (no SERP fetch performed for PAA); none is claimed.
- **Intent mix:** transactional dominant (free-trial homepage); informational via FAQ + blog (definitions: captions vs subtitles, open vs closed captions, what is B-roll); comparison intent served head-on by two dedicated vs-pages linked from the homepage itself (`vs Submagic`, `vs Kapwing`) — the most explicit comparison play of the three competitors.

## D. Design intelligence (text description only — no screenshots were taken; layout inferred from HTML structure and copy order, 2026-11-13)

- **Hero section layout:** compact hero — eyebrow label ("AI captions for creators"), H1, one supporting sentence, "Try it free" CTA, and a before/after visual (a 15-second clip shown uncaptioned vs captioned). Trust signals sit directly under the hero.
- **Above-the-fold CTA:** "Try it free" in the hero and in the persistent top nav; "Log in" beside it.
- **Product screenshots/demos described:** before/after hero visual; six feature images (caption styles, platform repurpose, subtitle editor, export, templates, teams); three how-it-works images (upload, customise, export). The visuals are product-UI-led rather than lifestyle-led.
- **Trust signals:** strongest of the three competitors on-page — a star rating with two review figures displayed in the hero area (4.7/5 with 14,000+ reviews, and a Trustpilot 4.2/5 with a link to read reviews), plus a "Trusted by 300,000+ creators" line and a logo row naming well-known SaaS/product brands (the row repeats in the HTML). No pricing or guarantee claims in the hero.
- **Testimonials:** no quoted customer testimonials observed on the homepage — trust is carried by aggregate ratings and the logo row, not by individual quotes.
- **Comparison tables:** none on the homepage itself; comparison is handled by the two linked vs-pages (which describe themselves as side-by-side comparisons).
- **FAQ section:** present mid-page, 7 questions, the longest FAQ of the three competitors — but with no FAQPage schema to match.
- **Footer/navigation structure:** top nav — Features, Resources, Pricing, Affiliate, API Docs, Log in, Try it free. Footer — Product (Pricing, Blog, API Docs, Affiliate Program), Caption Tools (AI Caption Generator, TikTok Captions, Subtitle Generator, Add Captions to Video, vs Submagic, vs Kapwing), Legal (Privacy Policy, Terms of Service), language switcher (English / Français), copyright line. The footer is compact compared with Captions AI's link farm.

## E. Supporting pages checked (directly linked from the homepage, HTTP status + title only, curl, 2026-11-13)

| Page | Status | Title (as fetched) |
|---|---|---|
| /ai-caption-generator | 200 | AI Caption Generator: Add Styled Captions to Any Video |
| /tiktok-caption-generator | 200 | TikTok Caption Generator: Viral Captions in 10 Seconds |
| /vs-submagic | 200 | AutoCaption vs Submagic: Which Caption Tool Is Right for You? |
| /vs-kapwing | 200 | AutoCaption vs Kapwing: Better for Captions in 2025? |
| /subtitle-generator | 200 | Free Subtitle Generator: Add Subtitles to Any Video Online |

## F. Strengths / weaknesses (assessment from the observations above)

- **Strongest:** the most focused caption-intent match of the three (title, H1, FAQ and tool hub all target "add captions" queries); strongest on-page trust signals (dual review scores + creator count + logo row); explicit comparison pages linked from the homepage; clean hreflang (EN/FR) and a tidy, small sitemap; fast-looking static HTML (71 KB).
- **Weakest:** no structured data at all — a 7-question FAQ with no FAQPage schema and no Organization/SoftwareApplication schema is the clearest missed opportunity; thin unique copy (~500–600 words) with duplicated how-it-works blocks in the HTML; a very small blog footprint (6 posts in the sitemap); `/sitemap.xml` 404s (only the index URL works); no breadcrumbs; no quoted testimonials despite displaying review scores.

## G. Limitations / not obtained

- No rankings, traffic, backlinks, search volume or keyword-difficulty data (no SEO tool access in this task; none invented).
- No Core Web Vitals / PageSpeed numbers and no rendered-mobile check (no browser/Lighthouse in this sandbox).
- No SERP features or People Also Ask data (no SERP fetch performed).
- No visual-design verification beyond HTML structure/copy order (no screenshots possible from this sandbox).
- Word count is an approximation from raw-HTML text extraction, including nav/footer chrome and duplicated blocks.
- The Trustpilot link was counted as internal-ish by the link parser's substring rule; it is in fact external — corrected in §A.
