# Competitor SEO Report — Captions AI: AI B-Roll Generator

- **Target URL:** https://captions.ai/tools/ai-b-roll-generator
- **Fetch date:** 2026-11-13
- **Method:** curl via sandbox egress proxy (raw HTML saved, 183,778 bytes, HTTP 200) + local HTML parsing of title/meta/headings/links/images/JSON-LD. No headless browser, no screenshots. No rankings, traffic, search-volume or difficulty figures are stated anywhere in this report — none were measured.
- **Note on scope:** this page is a *tool* landing page for AI B-roll, not a captions page. It is relevant to Captionit as a sibling-tool / topical-authority pattern (a caption tool that also owns adjacent tool pages), not as a direct captions-page match.

## A. On-page SEO

- **Page title:** "AI B-Roll Generator: Add B-Roll to Videos With Captions | Captions" (observed in raw HTML, 2026-11-13, curl).
- **Meta description:** "Use Captions' AI B-roll generator to give your posts an edge. B-roll makes your content more compelling, inspiring deeper engagement." (raw HTML, curl).
- **OG tags:** og:title and og:description mirror title/description; og:type `website`; og:image `https://captions.ai/mrkt-static/captions-og-image.png`; twitter:card `summary_large_image`. Same source/method.
- **Canonical:** `https://captions.ai/tools/ai-b-roll-generator` — self-referential, present in raw HTML (curl).
- **Language:** `<html lang="en">`. No hreflang alternates found on this page. No meta robots tag present.
- **H1 (1):** "AI B-roll generator".
- **H2s (9):** "Why you need a B-roll generator"; "Try it now"; "Get better B-roll with Captions"; "Start your next video"; "Frequently asked questions"; plus footer-column labels counted as H2s by the parser — "Product", "Company", "Solutions", "Use Cases" (i.e. only 5 are body-content H2s; the rest are footer navigation headings).
- **H3s (13):** body H3s — "Tell more immersive stories", "Make any video stronger", "Save time on production", "B-roll for any video"; footer H3s — "Features", "Get Started", "Resources", "Businesses", "Creators", "Professional Services", "Formats", "Platforms", "Tools".
- **Content sections (summarised, not copied):**
  1. Hero — short intro framing B-roll as making good content great, with sign-up / app-download CTAs.
  2. "Why you need a B-roll generator" — three benefit blocks (more immersive stories, stronger videos, faster production).
  3. Interactive product demo ("Try it now") — upload/drag a video, pick a style, generate; includes a style gallery (named styles such as Tour, Strategist, Cozy, Vox-Style, Sequence, Open House, Aura, Bulletin, Tiles, Prism Pro, Paper II, Prime, Elevate, Impact II, Sketch, Lens, Vista, Pop, Orbit, Y2K, Form, Bloom, Chalk, Linen, Evo, Focus, Lift, Stack, Align).
  4. "Get better B-roll with Captions" — short section on prompt-based and automatic B-roll matched to content/vibe.
  5. Closing CTA ("Start your next video") — sign-up / get-the-app.
  6. FAQ — 3 questions (see below).
- **Primary keyword themes:** "AI B-roll generator", "B-roll generator", "add B-roll to videos", "AI B-roll".
- **Secondary themes:** AI video editing / AI edit, text-prompt video generation, stock-footage alternative, talking-head video enhancement, social-media video / reels.
- **Search intent:** primarily transactional / tool-seeking ("AI B-roll generator" — user wants a tool), with an informational layer (what B-roll is, why use it, AI vs stock footage).
- **Image alt attributes (sample, from raw HTML):** 35 `<img>` tags, 35/35 carry an `alt` attribute. Hero image alt describes three B-roll options with a cursor over a generate control; a value-prop image alt describes stacked B-roll options with a beach-sunset image and overlay text; style thumbnails use the style name as alt (e.g. "Tour", "Strategist", "Cozy", "Vox-Style"). Alt quality is mixed: hero/value-prop alts are descriptive sentences, style thumbnails are single-word labels.
- **Internal links (88 `<a>` total; 72 internal-ish, from raw HTML):** nav — Features, Solutions, Use cases, Pricing, Resources, Sign up, Download; tool hub — 20 `/tools/*` pages (including ai-ad-generator, ai-instagram-reel-generator, ai-video-editor, ai-video-generator, facebook-video-ad-creator, linkedin-video-maker, prompt-to-video, script-to-video-generator, social-media-video-creator, text-based-video-editor, tiktok-video-generator, transition-video-editor, youtube-shorts-maker, youtube-video-editor); feature pages — add-captions-to-videos, correct-your-eye-contact, create-clips, edit-with-ai, generate-ai-avatars, translate-videos-with-ai; solutions by audience (beauty, church, ecommerce, enterprise, entrepreneurs, fashion, financial advisors, fitness, food, healthcare, home/DIY, legal, life coaches, marketers/agencies, nonprofits, podcasters, real-estate, small businesses, teachers); use-cases; blog links (including `/blog/practical-guide-b-roll-video` and `/blog/editing-videos-is-now-as-easy-as-typing`); `/styles`, `/pricing`, `/signup`. In-body editorial link: one blog link (practical B-roll guide) inside/near the FAQ area.
- **External references:** 15 external links — social profiles (Instagram, LinkedIn, TikTok, YouTube, X), jobs board, and legal/brand pages on mirage.app (about, terms, privacy, safety). No external editorial citations in body copy.
- **CTA placement:** hero (Sign up / Get the app), mid-page "Try it now" interactive demo, repeated "Sign up" after the benefits section, closing "Start your next video" (Sign up / Get the app). CTAs are conversion-first and repeated at every section boundary.
- **FAQs (summarised, 3 questions — also present as FAQPage JSON-LD, see Schema):**
  1. What an AI B-roll generator is (definition + role alongside talking-head/voiceover content).
  2. Whether generated B-roll can be customised (yes — new prompt or chat-based editor suggestions).
  3. Why generate B-roll with AI instead of using stock footage (cost/subscription, fit/customisation, time).
- **Schema types found (raw HTML, 2 JSON-LD blocks):** (1) `@graph` with Organization (legal name NOCAP, Inc., brand "Mirage", alternate names "Captions", "Captions AI", founded 2021, New York), WebSite, SoftwareApplication (category VideoApplication, OS iOS/Android/Web, App Store download URL, offers including a "Max Plan" at $24.99 USD — as listed in the schema on 2026-11-13); (2) FAQPage with the 3 questions above. No BreadcrumbList, no VideoObject, no HowTo schema on this page.
- **Approximate word count:** ~678 visible words by stripping `<script>`/`<style>` and tags from the raw HTML and counting tokens (method: local parse, 2026-11-13). That count *includes* navigation, footer and demo labels, so true body copy is materially less — roughly 400–450 words of editorial prose. This is a thin, tool/demo-led page, not a long-form guide.
- **Indexability signals:** HTTP 200, self-canonical, listed in sitemap.xml (see §B), robots.txt allows all (only `/signup` disallowed), no noindex meta observed. Nothing observed that would block indexing.

## B. Technical SEO

- **robots.txt** (fetched 2026-11-13, curl, HTTP 200, 83 bytes): `User-agent: * / Allow: / / Disallow: /signup`; sitemap declared: `https://captions.ai/sitemap.xml`.
- **Sitemap structure:** single `sitemap.xml` (not an index), 192 `<url>` entries counted 2026-11-13. Composition: homepage, `/blog` + ~70 blog posts, `/tools/*` (20 pages), `/features/*` (14), `/solutions/*` (~25 audience pages), `/styles` + ~45 individual style pages, `/use-cases/*` (~14), `/vs/capcut`, `/vs/descript`, pricing, download, cookie-notice. All entries carried the same `<lastmod>` value `2026-11-13T16:52:42.481Z` — i.e. the timestamp appears to be a sitemap-generation time, not a per-page update time, so it cannot be used to judge freshness of individual pages.
- **Canonical implementation:** self-referential canonical in `<head>`; no conflicting canonical observed.
- **Redirects observed (curl -I, 2026-11-13):** `http://captions.ai/tools/ai-b-roll-generator` → 301 → `https://captions.ai/tools/ai-b-roll-generator` (single hop, clean). Trailing-slash variant `https://captions.ai/tools/ai-b-roll-generator/` returned HTTP 200 directly (no redirect observed in that check — both slash and non-slash versions return 200; canonical points to the non-slash version, which is what prevents a duplicate-URL issue, but the dual-200 behaviour was observed and is worth noting).
- **HTTP status codes:** target page 200; supporting pages checked all 200 (see §E).
- **Rendering method:** SSR / static. Built with Astro (HTML class `astro-…`, `/_astro/` asset paths). Key content — title, H1, H2s, FAQ text, demo labels — is present in the raw HTML fetched by curl, so the page does not depend on client-side JS for its indexable content.
- **Mobile usability signals:** viewport meta `width=device-width, initial-scale=1.0` present. No mobile-specific errors observed in the fetch. Real-device rendering and Core Web Vitals were **not measurable** from this sandbox (no browser, no Lighthouse/PageSpeed run) — not claimed here.
- **Structured data:** present (see §A — Organization/WebSite/SoftwareApplication + FAQPage).
- **Internal link depth:** target page is 2 levels deep (`/tools/ai-b-roll-generator`) and linked from the site-wide footer/nav tool hub and from the blog guide; the tool hub itself is one click from the homepage. Internal linking is broad but template-driven (same footer on every page).
- **Duplicate/overlapping pages found:** near-duplicate risk is structural, not confirmed as indexed duplication: 20 near-identical `/tools/*` pages share the same layout/demo/FAQ pattern with swapped keywords; `/features/add-captions-to-videos` vs `/tools/ai-video-editor` vs `/features/edit-with-ai` overlap topically; `/vs/capcut` and blog post `/blog/captions-vs-capcut` both target comparison intent. No duplicate-content penalty is claimed — only the overlap pattern observed in sitemap + nav.
- **Breadcrumb structure:** none observed — no breadcrumb markup, no BreadcrumbList schema, no visible breadcrumb trail in the HTML.
- **URL naming conventions:** lowercase kebab-case, descriptive, keyword-led: `/tools/ai-b-roll-generator`, `/features/add-captions-to-videos`, `/blog/practical-guide-b-roll-video`, `/solutions/real-estate-agents`, `/styles/<style-name>`. Clean, no parameters, no IDs.

## C. Content intelligence

- **Primary keyword opportunities visible:** "AI B-roll generator" (title, H1, URL, FAQ), "B-roll generator", "add B-roll to videos".
- **Secondary clusters:** AI video editing / AI edit; text-to-video / prompt-to-video; B-roll for talking-head videos; B-roll vs stock footage; social video creation (Reels/Shorts/TikTok); caption-adjacent editing (the page sits inside a captions product but the page itself barely targets caption keywords — its caption angle is limited to the title suffix and one feature link).
- **Long-tail queries the page targets (inferred from headings/FAQ, not from any keyword tool):** "what is an AI B-roll generator", "can I customize AI B-roll", "AI B-roll vs stock footage", "how to add B-roll to talking head videos", "generate B-roll from text prompt".
- **Semantic entities:** B-roll, stock footage, talking-head video, AI edit / conversational editor, video styles/templates, social platforms (TikTok, Reels, Shorts), captions (brand context), Mirage / Captions (brand entity).
- **Questions users ask (from the on-page FAQ):** the 3 questions listed in §A. No People Also Ask data was accessible from this sandbox (no SERP fetch performed for PAA); none is claimed.
- **Intent mix:** transactional/tool-seeking dominant (the page is a tool landing page with an interactive demo and sign-up CTAs); informational secondary (definition + benefits + AI-vs-stock comparison); comparison intent is handled off-page (dedicated `/vs/*` pages + comparison blog posts) rather than on this page.

## D. Design intelligence (text description only — no screenshots were taken; layout inferred from HTML structure and copy order, 2026-11-13)

- **Hero section layout:** headline (H1 "AI B-roll generator") + short supporting paragraph + two CTAs (sign-up, get the app), with a hero visual showing B-roll options. The hero is compact — the interactive demo follows almost immediately, so the "tool" is the hero's second half rather than a separate below-fold block.
- **Above-the-fold CTA:** sign-up / get-the-app buttons in the hero and in the top navigation (persistent "Sign up").
- **Product screenshots/demos described:** the central element is a working in-page demo (upload/drag video → add style → generate), with a gallery of named video styles shown as thumbnails; the HTML also carries a "Video gradient" frame image. The demo is the page's main trust/engagement device.
- **Trust signals:** minimal on this page — no customer logos, no review scores, no testimonial quotes observed in the raw HTML. Trust is carried by the brand/product demo itself and by the wider site (blog, solutions pages). The footer links to legal/safety pages on mirage.app.
- **Testimonials:** none present on this page (no testimonial section found in the HTML).
- **Comparison tables:** none on this page. Comparison is delegated to `/vs/capcut`, `/vs/descript` and comparison blog posts.
- **FAQ section:** present near the bottom, 3 questions, accordion-style in markup, backed by FAQPage schema.
- **Footer/navigation structure:** top nav — Homepage, Features, Solutions, Use cases, Pricing, Resources, Sign up. Footer — large multi-column link farm: Product, Company, Solutions, Use Cases, Features, Get Started, Resources, Businesses, Creators, Professional Services, Formats, Platforms, Tools; plus social links and legal links (hosted on mirage.app). The footer is the page's main internal-linking engine.

## E. Supporting pages checked (directly linked from the target page, HTTP status + title only, curl, 2026-11-13)

| Page | Status | Title (as fetched) |
|---|---|---|
| /features/add-captions-to-videos | 200 | AI Video Caption Generator: Stylized & Accurate \| Captions |
| /blog/practical-guide-b-roll-video | 200 | How to Use B-Roll: A Practical Guide \| Captions |
| /blog/captions-vs-subtitles-how-to-choose-the-best-option | 200 | What Are Captions? Captions vs. Subtitles Explained \| Captions |
| /tools/ai-video-generator | 200 | Free AI Video Generator: Create Videos from Text \| Captions |

## F. Strengths / weaknesses (assessment from the observations above)

- **Strongest:** clean technical base (SSR Astro, self-canonical, single sitemap, permissive robots.txt, FAQ + Organization/SoftwareApplication schema); a genuine interactive demo as the conversion device; a very large, well-organised internal-linking system (tools × features × solutions × styles × use-cases) that gives every tool page topical neighbours.
- **Weakest:** thin editorial copy (~400–450 words of body prose) for a competitive tool keyword; only 3 FAQs; no testimonials, review signals or comparison content on the page itself; no breadcrumbs; trailing-slash URL returns 200 alongside the canonical non-slash version; the page barely targets caption keywords despite the brand being a caption product — its value to Captionit is the *tool-hub pattern*, not this page's caption relevance.

## G. Limitations / not obtained

- No rankings, traffic, backlinks, search volume or keyword-difficulty data (no SEO tool access in this task; none invented).
- No Core Web Vitals / PageSpeed numbers and no rendered-mobile check (no browser/Lighthouse in this sandbox).
- No SERP features or People Also Ask data (no SERP fetch performed).
- No visual-design verification beyond HTML structure/copy order (no screenshots possible from this sandbox).
- Word count is an approximation from raw-HTML text extraction, including nav/footer chrome.
