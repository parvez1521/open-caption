# Competitor SEO Report — OpusClip (Opus.pro): Captions landing page

- **Target URL:** https://www.opus.pro/captions
- **Fetch date:** 2026-11-13
- **Method:** curl via sandbox egress proxy (raw HTML saved, 319,240 bytes, HTTP 200) + local HTML parsing of title/meta/headings/links/images/JSON-LD. No headless browser, no screenshots. No rankings, traffic, search-volume or difficulty figures are stated anywhere in this report — none were measured.
- **Note on scope:** this is a dedicated captions landing page inside a much larger all-in-one clipping platform (OpusClip). Captions are positioned as one feature of a suite (clipping, B-roll, dubbing, scheduling, analytics), not as the whole product — the opposite positioning to AutoCaption.

## A. On-page SEO

- **Page title:** "Best Captions AI - Animated Captions in 1 Click - OpusClip" (raw HTML, curl, 2026-11-13).
- **Meta description:** "Add eye-catching animated captions with our free captions app. 99% accuracy, 20+ languages. Perfect for TikTok, YouTube Shorts & Reels." (raw HTML, curl).
- **OG tags:** og:title mirrors the page title; og:description mirrors the meta description; og:type `website`; og:image is a Webflow-CDN image (animated-captions thumbnail, `.avif`); twitter:card `summary_large_image`, twitter:title/description mirror the OG values. Same source/method.
- **Canonical:** `<link href="https://www.opus.pro/captions" rel="canonical">` — self-referential, present in raw HTML. (Note: a naive parser initially mis-read a `<link rel="preconnect">` header value as the canonical; the correct canonical was verified by direct grep of the raw HTML on 2026-11-13.)
- **Language / hreflang:** page is English (US); full hreflang set present in raw HTML: x-default → `https://www.opus.pro/captions`, en-US → same, es → `https://www.opus.pro/es-es/captions`, pt-BR → `https://www.opus.pro/pt-br/captions`, de-DE → `https://www.opus.pro/de-de/captions`, fr-FR → `https://www.opus.pro/fr-fr/captions`. Localised captions pages exist for Spanish, Portuguese, German and French.
- **Meta robots:** no robots meta tag in the static HTML. However, the page carries an inline script (observed in raw HTML) that injects `noindex` via JavaScript when the URL contains a query string or a hash — i.e. parameterised/hashed variants self-noindex at render time. The clean canonical URL itself is not noindexed by this script.
- **H1 (1):** "Eye-catching animated AI captions added in 1 click".
- **H2s (14):** "5min", "99%", "20+" (stat callouts marked up as H2s); "Used by 20M+ creators and businesses"; "The fastest & most accurate AI auto captioning"; "Animated caption templates optimized for all platforms"; "Drop your video & auto captioning in < 10 minutes"; "Stand out with custom fonts and colors"; "Intuitive text-based editing"; "Adding captions to your videos has never been easier"; "Clip, edit, post, analyze. All-in-one platform"; "Also available via API and MCP"; "Got questions?"; "Post one clip every day for free".
- **H3s (30):** benefit H3s — "Get accurate captions automatically", "Make your videos more dynamic and engaging", "Easy customization with smart features", "Generate captions in multiple languages"; platform-feature H3s — "AI clipping", "AI captioning", "Social media calendar", "AI B-Roll", "AI voiceover", "Analytics", "Audio cleaning", "AI reframe", "OpusClip API", "OpusClip MCP"; FAQ H3s (11 questions, see below); footer H3s — "Company", "Product", "Resources", "Best Practices", "Trust and Legal".
- **Content sections (summarised, not copied):**
  1. Hero — badge ("#1 AI captioning tool"), H1, supporting line, an interactive caption tool widget (paste a video link or upload a file; lists accepted sources for Pro — YouTube, Google Drive, Vimeo, Zoom, Rumble, Twitch, Facebook, LinkedIn, Twitter, Loom, Riverside, StreamYard and more), "Add captions now" CTA.
  2. Stats strip — wait time, transcription accuracy, languages supported (see H2 stat callouts).
  3. Social proof — creator/business names with follower counts (see §D).
  4. Feature blocks — fastest/most accurate auto captioning; animated templates for all platforms; drop-video auto-captioning in under 10 minutes; custom fonts/colours; text-based editing.
  5. Benefits — four blocks (accuracy, dynamism/engagement, smart customisation/templates, multi-language).
  6. All-in-one platform — eight sibling features (clipping, captioning, calendar, B-roll, voiceover, analytics, audio cleaning, reframe).
  7. API + MCP — programmatic access (API key, docs; MCP connector for AI agents, 25 tools).
  8. FAQ — 11 questions (see below).
  9. Closing CTA — free daily clip / free credits, no credit card.
- **Primary keyword themes:** "captions AI", "animated captions", "auto caption / auto captioning", "free captions app", "add captions to video".
- **Secondary themes:** 99% transcription accuracy, 20+ languages, TikTok / YouTube Shorts / Reels, text-based editing, custom fonts/colours/templates, AI clipping + B-roll + voiceover + reframe (suite cross-sell), API/MCP for developers and AI agents.
- **Search intent:** transactional/tool-seeking dominant (free captions app, upload-and-go widget in the hero); informational via the FAQ and the blog cluster; comparison intent is served off-page (blog roundups such as "best auto caption generators" — see §E).
- **Image alt attributes (sample, from raw HTML):** 76 `<img>` tags, 76/76 carry an `alt` attribute. Quality is uneven: many alts are descriptive (audience images — "Media & entertainment", "Podcasters"; blog cards — "How OpusClip helps marketing agencies boost revenue by 148%", "How creators are earning 10M+ views in 1 month using video clipping"; stat icons — "5min wait time", "99% Transcription accuracy", "20+ Languages supported"); but creator headshot images carry empty `alt=""`, and some images are duplicated in the HTML (same image twice, e.g. audience and product images appearing in two layout variants). Alt text is generally topical, not keyword-stuffed.
- **Internal links (100 `<a>` total; 82 internal-ish, from raw HTML):** nav — Features (AI Producer, Animated captions, AI Reframe, ClipAnything, Social scheduler, Brand template, AI B-Roll, Export to XML, Team workspace, AI Editor, Thumbnail generator, Enhance speech, AI video dubbing, Agentic workflows/API, MCP, Inspiration gallery), Solutions by audience (Creators, Media & entertainment, Marketers, Podcasters, Agencies, Livestreamers, Advertisers, Church, E-commerce, Real estate), Resources (Customer stories, Blog, Learning center, Help center, Product change log), Pricing, For business, Opus Labs; in-page — `/ai-b-roll`, `/ai-video-editor`, `/ai-dubbing`, `/ai-reframe`, `/clipanything`, `/calendar`, `/brand-templates`, `/enhance-audio`, `/api`, `/mcp`, `/tools`, `/pricing`, `/about`, `/affiliate`, `/agent`, `/customer-stories`, `/learning-center`, `/how-does-opus-clip-work`; blog links (several guides + case studies); app subdomains — `clip.opus.pro/captions`, `clip.opus.pro/dashboard` (including a UTM-tagged caption dashboard link `?utm_page=captionpage`), `help.opus.pro`, `labs.opus.pro`, `media.opus.pro`, `producer.opus.pro`, `trust.opus.pro`, `opus.pro/thumbnail`.
- **External references:** 10 external links — social profiles (Discord invite, X/Twitter, Instagram, LinkedIn, TikTok, YouTube) and product feedback pages (changelog, feature requests). No external editorial citations in body copy.
- **CTA placement:** hero widget ("Add captions now" + upload), repeated "Upload files / Auto-edit" controls, mid-page feature CTAs, API/MCP CTAs ("Get an API key", "Connect MCP"), closing free-plan CTA, plus a persistent "Get 90 Credits for Free — No credit card required" banner and top-nav "Sign Up — It's Free". The most CTA-dense of the three pages.
- **FAQs (summarised, 11 questions — also present as FAQPage JSON-LD, see Schema):**
  1. How OpusClip works (long-video analysis → highlight moments → viral short with captions/relayout/transitions/CTA).
  2. What makes it the best captions AI tool (99% accuracy, animated templates, rhythm sync, 20+ languages, fonts/colours).
  3. How the free auto caption app saves time (audio analysis → captions in minutes vs manual typing/timing).
  4. Whether beginners can use it effectively (yes — upload and get captions, no experience needed).
  5. What video types work (podcasts, vlogs, gaming streams, tutorials, interviews, talking-head, action).
  6. Whether it supports multiple platforms (TikTok, Shorts, Reels, LinkedIn, Facebook; auto-formatting).
  7. What video types can be uploaded (any video type via the ClipAnything model, including low-dialogue video; natural-language prompts).
  8. Which languages are supported (20+ named: English, German, Spanish, French, Portuguese, Italian, Dutch, Russian, Polish, Indonesian, Ukrainian, Swedish, Turkish, Norwegian, Croatian, Romanian, Slovak, Greek, Danish, Finnish).
  9. Whether captions can be added/edited (yes — automatic, 99%+ accuracy, free text editing).
  10. Whether OpusClip is free (free plan + 7-day Pro trial with 90 minutes processing; free-forever plan with 60 minutes/month; paid monthly/yearly plans).
  11. "I have more questions!" (points to Discord and a contact email).
- **Schema types found (raw HTML, 1 JSON-LD block):** FAQPage only, with the 11 questions above. No Organization, SoftwareApplication, Product, WebPage or BreadcrumbList JSON-LD on this page. (The strings "Product" occur elsewhere in the page — nav/footer labels and inline scripts — but not as a JSON-LD type.)
- **Approximate word count:** ~1,855 visible words by stripping `<script>`/`<style>` and tags from the raw HTML and counting tokens (local parse, 2026-11-13). That count includes navigation, footer, the full feature/API/MCP sections and the FAQ, so true editorial body copy is less, but this is still by far the longest of the three target pages (roughly 2.4× AutoCaption's count, 2.7× Captions AI's). The length comes from breadth (suite cross-sell + API/MCP + long FAQ), not from a single deep article.
- **Indexability signals:** HTTP 200, self-canonical, listed in sitemap.xml (see §B), robots.txt allows the page (only query strings, `/cdn-cgi/` and two ads-library paths disallowed), no static noindex meta. The JS-injected noindex for `?`/`#` URLs is a deliberate duplicate-control measure. A geofencing script was also observed in the HTML (it hides CTAs / redirects to `/not-available` for blocked countries unless the visitor is a known bot, on an exempt path, or otherwise allowed) — relevant because it means the page's CTAs may not render for some human visitors, though search-engine user-agents are explicitly exempted in that script.

## B. Technical SEO

- **robots.txt** (fetched 2026-11-13, curl, HTTP 200, 166 bytes): `User-agent: * / Allow: / / Disallow: /*?* / Disallow: /cdn-cgi/ / Disallow: /agent/ads-library/_hub_ / Disallow: /agent/ads-library$`; sitemap declared: `https://www.opus.pro/sitemap.xml`. The `Disallow: /*?*` rule matches the JS noindex approach — parameterised URLs are kept out of the index by both mechanisms.
- **Sitemap structure:** single `sitemap.xml` (not an index), **5,564 `<url>` entries** counted 2026-11-13 — the largest sitemap of the three by two orders of magnitude. Structure: every core page repeated across 5 locales (en-US default + es-es, pt-br, de-de, fr-fr) with `xhtml:link` hreflang alternates on each entry; blog is the bulk (hundreds of posts, including a dedicated caption cluster — see §C); tool/feature/solutions/pricing/legal pages; `/captions` appears 5 times (one per locale) with `<lastmod>2026-10-27T15:57:39.399Z</lastmod>` on the entries checked. Sitemap `<lastmod>` values vary per page (unlike Captions AI's uniform timestamp).
- **Canonical implementation:** self-referential canonical + matching hreflang alternates. No conflicting canonical observed.
- **Redirects observed (curl -I, 2026-11-13):** `http://www.opus.pro/captions` → 301 → `https://www.opus.pro/captions` (single hop). `https://opus.pro/captions` (bare domain) → 302 → `https://www.opus.pro/captions` (note: 302, not 301, for the apex→www hop — observed once; the www canonical is what the sitemap and canonical tag use).
- **HTTP status codes:** target page 200 (Cloudflare cache HIT, `CF-Cache-Status: HIT`, `Age: 80980` at fetch time); supporting pages checked all 200 (see §E).
- **Rendering method:** Webflow-hosted (Webflow CDN assets, `website-files.com` CSS/JS, `x-wf-region: us-east-1`). Key content — title, H1, H2s, FAQ text, feature copy — is present in the raw HTML fetched by curl, so the page does not depend on client-side JS for its indexable content. The page is heavy with third-party scripts in the HTML (GTM, Mixpanel, Statsig, jQuery, geofencing, language-consistency scripts) — the HTML payload is 319 KB, the largest of the three.
- **Mobile usability signals:** viewport meta `width=device-width, initial-scale=1` present. No mobile errors observed in the fetch. Real-device rendering and Core Web Vitals were **not measurable** from this sandbox (no browser, no Lighthouse/PageSpeed run) — not claimed here.
- **Structured data:** present but minimal (FAQPage only — see §A).
- **Internal link depth:** target page is depth 1 (`/captions`) and linked from the Features nav, the tools hub (`/tools`), the app subdomain (`clip.opus.pro/captions`) and the blog cluster. The site's scale (5,564 sitemap URLs) means most blog posts sit several clicks from the homepage, but the captions page itself is prominently linked.
- **Duplicate/overlapping pages found:** the 5-locale duplication is handled via hreflang (correct pattern). Topical overlap: `/captions` vs `/ai-b-roll` vs `/ai-video-editor` vs `/clipanything` (all link to each other and share feature copy); blog posts `/blog/best-auto-caption-generators-for-videos`, `/blog/best-auto-caption-tools-for-accuracy`, `/blog/caption-vs-subtitle`, `/blog/how-to-add-captions-on-tiktok` and others all target caption queries adjacent to the landing page — a deliberate cluster, but it creates several near-intent pages. No duplicate-content penalty is claimed — only the overlap pattern observed in the sitemap + nav.
- **Breadcrumb structure:** none observed — no breadcrumb markup, no BreadcrumbList schema, no visible breadcrumb trail in the HTML.
- **URL naming conventions:** lowercase kebab-case, short and keyword-led: `/captions`, `/ai-b-roll`, `/ai-video-editor`, `/clipanything`, `/tools`, `/pricing`; locale prefixes `/es-es/`, `/pt-br/`, `/de-de/`, `/fr-fr/`; blog under `/blog/<slug>`. Clean, no parameters on canonical URLs (parameters are disallowed in robots.txt).

## C. Content intelligence

- **Primary keyword opportunities visible:** "captions AI", "animated captions", "best captions AI", "auto caption generator", "free captions app", "add captions to video".
- **Secondary clusters:** AI clipping / ClipAnything (long video → viral shorts); AI B-roll; AI voiceover/dubbing; AI reframe (9:16/16:9/1:1); social media calendar/scheduling; analytics; audio cleaning; text-based editing; API + MCP (developer/agent audience); brand templates; team workspace.
- **Long-tail queries the page targets (inferred from headings/FAQ, not from any keyword tool):** "how does OpusClip work", "what is the best captions AI tool", "how does a free auto caption app save time", "can beginners use a caption app", "what video types work with captions app", "which languages are supported for captions", "is OpusClip free", "add captions to TikTok/Shorts/Reels".
- **Semantic entities:** animated captions, transcription accuracy, languages, aspect ratios, platforms (TikTok, YouTube Shorts, Instagram Reels, LinkedIn, Facebook), video types (podcast, vlog, gaming, tutorial, interview, talking-head), ClipAnything, AI B-roll, voiceover, reframe, API, MCP (Model Context Protocol), Claude/Cursor/ChatGPT (as MCP consumers), brand vocabulary.
- **Questions users ask (from the on-page FAQ):** the 11 questions listed in §A — the longest FAQ of the three. No People Also Ask data was accessible from this sandbox (no SERP fetch performed for PAA); none is claimed.
- **Intent mix:** transactional dominant (free app + upload widget in hero); informational strong via FAQ + a large blog cluster (roundups, how-tos, caption-vs-subtitle explainers); comparison intent served by blog roundups rather than a dedicated vs-page; developer/agent intent is a distinct extra (API + MCP sections target a technical audience the other two competitors do not address on their caption pages).

## D. Design intelligence (text description only — no screenshots were taken; layout inferred from HTML structure and copy order, 2026-11-13)

- **Hero section layout:** announcement banner ("OpusClip 4.0 is here") above the nav; hero with a "#1 AI captioning tool" badge, H1, supporting sentence, and an embedded interactive tool widget (paste link or upload file, with a source list and "Add captions now" CTA) — the tool *is* the hero, rather than a screenshot of the tool. Stat callouts (wait time, accuracy, languages) sit below the widget.
- **Above-the-fold CTA:** the upload/link widget itself plus "Add captions now"; top nav carries "Sign Up — It's Free" and "My dashboard".
- **Product screenshots/demos described:** no static product screenshots dominate the page; the interactive widget is the demo. Supporting visuals are audience/feature images, blog-card thumbnails, and stat icons. The API/MCP sections are text + CTA-led.
- **Trust signals:** strongest social-proof *scale* of the three — "Used by 20M+ creators and businesses" plus a strip of named creators/businesses with follower counts; a "How OpusClip helps marketing agencies boost revenue by 148%" case-study link; a Trust Center link in the footer. No star-rating/review-aggregator score was observed on this page (unlike AutoCaption).
- **Testimonials:** no quoted customer testimonials observed on this page — social proof is via named creators + follower counts and case-study links, not quotes.
- **Comparison tables:** none on this page. Comparison is delegated to blog roundups (e.g. best auto caption generators).
- **FAQ section:** present near the bottom, 11 questions ("Got questions?"), backed by FAQPage schema — the most complete FAQ of the three.
- **Footer/navigation structure:** very large top nav with two dropdown systems (Features — 16 items; Solutions — 10 audiences; Resources — 5 items) plus Pricing, For business, Opus Labs, Join waitlist, My dashboard, Sign in, Sign Up. Footer — Company (About, Careers, Contact), Product (Tools, Product changelog, Feature Request, OpusClip Captions, Free, How does OpusClip work), Resources (Customer stories, Blogs, Become an affiliate, Media assets, Help center, Learning center, Research), Best Practices (4 featured guides), Trust and Legal (Terms, Privacy, Cookies, Accessibility, Trust Center), plus social links and a cookie-consent notice. The footer also surfaces a "Get 90 Credits for Free" banner.

## E. Supporting pages checked (directly linked from the target page, HTTP status + title only, curl, 2026-11-13)

| Page | Status | Title (as fetched) |
|---|---|---|
| /ai-b-roll | 200 | AI B-Roll generator \| Professional B-Roll in 1 minute - OpusClip |
| /blog/best-auto-caption-generators-for-videos | 200 | 9 Best Auto Caption Generators for Videos in 2026 - OpusClip Blog |
| /pricing | 200 | Pricing - OpusClip |
| /tools | 200 | All Tools - OpusClip |
| /clipanything | 200 | ClipAnything - Clip any moment from any video with prompts |

## F. Strengths / weaknesses (assessment from the observations above)

- **Strongest:** by far the most content on the target page (~1,855 visible words, 11-question FAQ with schema, interactive hero widget); the largest supporting ecosystem (5,564-URL sitemap, 5 locales with correct hreflang, a dedicated caption blog cluster, API/MCP developer angle); strong scale-based social proof (20M+ creators); disciplined duplicate control (robots `/*?*` + JS noindex for parameterised URLs).
- **Weakest:** schema is FAQ-only — no Organization/SoftwareApplication/Product JSON-LD despite the page's scale; 76 images with several empty alts and duplicated image blocks; a 319 KB HTML payload with many third-party scripts; the apex domain redirects with a 302 rather than a 301 to www; the geofencing script can hide CTAs for some human visitors (bots exempted); captions are one feature among many, so the page's topical focus is diluted by suite cross-sell (8 sibling features + API/MCP) compared with AutoCaption's caption-only focus.

## G. Limitations / not obtained

- No rankings, traffic, backlinks, search volume or keyword-difficulty data (no SEO tool access in this task; none invented).
- No Core Web Vitals / PageSpeed numbers and no rendered-mobile check (no browser/Lighthouse in this sandbox).
- No SERP features or People Also Ask data (no SERP fetch performed).
- No visual-design verification beyond HTML structure/copy order (no screenshots possible from this sandbox).
- Word count is an approximation from raw-HTML text extraction, including nav/footer chrome.
- The canonical value was verified by direct grep after the first parser mis-read a preconnect link; the corrected value is the one reported in §A.
- The geofencing behaviour is described from the inline script text observed in the HTML; its live effect on real visitors was not tested (no browser in this sandbox).
