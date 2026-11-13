# SEO repos & skills — install report

Date: 2026-11-13. Installer: SEO repos & skills subagent.
Environment: Linux VM, Node v24.22.1, Python 3.12.3, git 2.43.0. No Chromium/Playwright, no Docker. No money spent, no subscription started, no API key entered anywhere.
All five repos cloned shallow (`--depth 1`) into `~/workspace/seo-tools/<repo-name>`. All five are **MIT licensed** (free to copy/use with attribution; license text in each repo root).

## Verdicts at a glance

| Repo | Verdict | One line |
|---|---|---|
| SEO Agent Toolkit (`datacas/seo-agent-toolkit`) | INSTALLED — 18 skills | Pure playbooks + stdlib Node evidence scripts; no keys, validated 59/59 tests |
| SEO operator (`marketingskills/seo`) | INSTALLED — 16 skills (7 skipped as duplicates) | Playbooks; 2 skills need external accounts/CLI that are not set up here |
| Open SEO Crawler (`puneetindersingh/open-seo-crawler`) | INSTALLED + VERIFIED live | Python CLI + Flask UI + MCP; real 10-page crawl of captionit.in run and passed |
| OpenSEO (`every-app/open-seo`) | NOT installed as an app; skills NOT installed | Needs DataForSEO paid key ($50 min top-up) + self-hosted app/DB; its skills only work through its MCP server |
| CrawlSEO (`crawlseo/crawlseo`) | NOT installed | Full Next.js app needing PostgreSQL + Google OAuth (+ optional DataForSEO); no Docker on this VM |

## 1. SEO Agent Toolkit — INSTALLED (18 skills)

- Repo: https://github.com/datacas/seo-agent-toolkit — commit `a874717` (2026-09-05). License: MIT.
- What it is: 18 Agent Skills (agentskills.io format) for code-repo SEO work, with deterministic evidence scripts. Explicitly no API keys, no accounts, no vendor in the core. It has no data of its own — no keyword volumes, rankings, backlinks or traffic; it analyses crawl exports / HTML / GSC data you supply and refuses to invent numbers (evidence states: measured / observed / inferred / not_available).
- What was installed: all 18 skill dirs copied whole (SKILL.md + references/ + scripts/) to `~/workspace/custom-skills/<skill-name>/`, each with a `skill.yaml` recording source repo + MIT:
  `seo-ai-visibility`, `seo-cannibalization`, `seo-change-review`, `seo-content-brief`, `seo-content-optimizer`, `seo-indexation-analysis`, `seo-internal-linking`, `seo-keyword-research`, `seo-migration`, `seo-orchestrator`, `seo-page-audit`, `seo-performance-analysis`, `seo-prioritization`, `seo-programmatic`, `seo-schema`, `seo-serp-analysis`, `seo-strategy`, `seo-technical-audit`.
- The 10 named in the brief are all included: strategy, keyword research, SERP analysis, technical audit, page audit, content briefs, content optimization, internal linking, schema, programmatic SEO.
- Verification (all in `~/workspace/seo-tools/seo-agent-toolkit`):
  - `npm install` (10 dev packages, free) then `npm run validate` → `{"ok": true, "errors": [], "skills": 18, "bundledScripts": 31}`.
  - `npm test` → **59 pass, 0 fail**.
  - Live script run, no install needed (scripts are self-contained Node stdlib): `node skills/seo-technical-audit/scripts/robots.mjs --url https://captionit.in` → real JSON, exit 0 (captionit.in answers 308 to www; the tool reported the 308 source and empty findings rather than following it — noted, not a failure).
- Exact invocation (from an installed skill dir, e.g. `~/workspace/custom-skills/seo-technical-audit/`):
  - `node scripts/robots.mjs --url <site-url> | --file <robots.txt>`
  - `node scripts/sitemap.mjs --url <sitemap-url> | --file <sitemap.xml>`
  - `node scripts/http-trace.mjs --url <url> [--max-redirects 10]`
  - `node scripts/page-signals.mjs --url <url> | --file <page.html>`
  - `node scripts/schema-check.mjs --url <url> | --file <page.html|data.jsonld>`
  - `node scripts/link-graph.mjs --file <edges.csv>`, `node scripts/crawl-normalize.mjs --file <crawl.csv>`, `node scripts/duplicate-metadata.mjs --file <crawl.csv>`, `node scripts/hreflang-check.mjs --file <pages.json>`, `node scripts/sitemap-diff.mjs --before <a> --after <b>`, `node scripts/migration-compare.mjs --before <b.csv> --after <a.csv> --mapping <m.csv>`, `node scripts/redirect-map-validate.mjs --file <mapping.csv>`
- Limitations here: not a crawler (bring a crawl export — use Open SEO Crawler below); no JS rendering (headless browser absent); no live SERP unless the agent fetches results itself; no keyword volumes / rankings / backlinks without a supplied data source; read-only analysis, proposes edits, does not deploy them.

## 2. SEO operator — INSTALLED (16 skills; 7 skipped as duplicates)

- Repo: https://github.com/marketingskills/seo — commit `6f45586` (2026-09-23). License: MIT.
- What it is: 23 marketing-operator skills (diagnose / act / strategize). Pure markdown playbooks; 3 ship helper scripts.
- What was installed (16) in `~/workspace/custom-skills/<skill-name>/` with `skill.yaml` (source + MIT):
  `authority-mark-keyword-difficulty`, `client-report-writer`, `competitor-serp-monitor`, `content-decay-monitor-setup`, `content-moat-planner`, `content-refresh-brief`, `exceed-quality-threshold`, `keyword-opportunity-finder`, `keyword-planner`, `live-search-console-data`, `proposal-builder`, `refresh-vs-new-content`, `seo-growth-loop`, `seo-offer-architect`, `title-meta-rewriter`, `traffic-decay-detector`.
- Skipped as duplicates of toolkit skills (installed once, from the toolkit — see §1): `seo-strategy`, `seo-content-brief`, `cannibalization-check` (= seo-cannibalization), `internal-link-builder` (= seo-internal-linking), `schema-fix-writer` (= seo-schema), `technical-seo-triage` (= seo-technical-audit), `seo-priority-score` (= seo-prioritization).
- Fix applied on install: two upstream SKILL.md files contained hardcoded author-machine paths (`/home/dunc/.codex/skills/...`); rewritten to relative `scripts/...` paths in the installed copies (`authority-mark-keyword-difficulty/SKILL.md`, `live-search-console-data/SKILL.md`). No `/home/dunc` strings remain in `~/workspace/custom-skills/`.
- Verification: `python3 custom-skills/authority-mark-keyword-difficulty/scripts/authority_mark.py --help` → usage prints, exit 0. It calls Ahrefs' free public DR endpoint (`api.ahrefs.com/v3/public/domain-rating-free`) with no token/header — keyless, but rate-limits / availability of that free endpoint were not tested. `python3 custom-skills/seo-growth-loop/scripts/probe_project.py` runs (stdlib only; no `--help` flag, it treats args as paths). `refreshagent_api.py` is stdlib-only (urllib + local HTTP callback server).
- Limitations / blockers (skills installed as playbooks; their live-data paths are NOT working here):
  - `keyword-planner`: needs a local `keyword-planner` CLI binary (not present on this VM, `which keyword-planner` → nothing; the skill gives no install source for it) **plus** a Google Ads manager account, Google Ads API developer token and service-account JSON (`GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN`). No Google Ads credentials exist here and none were created.
  - `live-search-console-data`: routes GSC/GA4 through RefreshAgent (third-party authenticated proxy, refreshagent.com). First use opens a browser Google sign-in at `https://refreshagent.com/auth/cli` and saves a key to `~/.config/refreshagent/.env`. No sign-in was done (browser sign-in is out of scope for this subagent; owner decision needed). Until then, GSC-dependent skills (`traffic-decay-detector`, `keyword-opportunity-finder`, `competitor-serp-monitor`) work only from pasted/exported GSC data, not live.
  - `competitor-serp-monitor` / `keyword-opportunity-finder` otherwise need SERP or GSC data supplied; they have no built-in free data source.

## 3. Open SEO Crawler — INSTALLED + VERIFIED live

- Repo: https://github.com/puneetindersingh/open-seo-crawler — commit `2dc7cef` (2026-11-10). License: MIT.
- What it is: self-hosted Python SEO crawler + site audit (Screaming-Frog-style, unlimited URLs, no accounts/keys/cloud). Crawl, URL extraction, metadata, headings, internal links, technical inspection, AI-crawler readability check (Googlebot/Bingbot/Applebot/GPTBot/PerplexityBot/CCBot etc. via user-agent), robots/sitemap cross-checks, CMS detection, .xlsx export, MCP server + CLI (`osc.py`). No skills shipped (no SKILL.md in repo) — it is a tool, not a skill pack, so nothing was copied to `~/workspace/custom-skills/`.
- Install performed: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` (flask, requests, beautifulsoup4, lxml, openpyxl — all free). Venv lives at `~/workspace/seo-tools/open-seo-crawler/.venv`.
- Verification (live, 2026-11-13 ~17:10 IST):
  - `python3 osc.py --help` → usage prints, exit 0 (stdlib only; works without the server for help).
  - Started server: `.venv/bin/python app.py` → HTTP 200 on `http://127.0.0.1:5002/`.
  - `python3 osc.py crawl https://captionit.in --max-pages 10 --json` → **done, 10 pages crawled, 0 fetch errors, 36 s**; saved crawl `1794589853_www.captionit.in_-_2026-11-13_17_10.json`. Summary: 10 pages, 8 indexable 200s, 0 errors, warnings: www-normalization redirect, 1 title too long, 1 meta description too long; info: 7 canonicalised, 2 noindex, 1 no-analytics. Bot readability: 0 of 1 sampled pages flagged.
  - `python3 osc.py robots captionit.in` → real robots.txt returned (22 Disallow rules, sitemap listed). Server stopped afterwards (no longer running).
- Exact invocation:
  - Start server: `cd ~/workspace/seo-tools/open-seo-crawler && .venv/bin/python app.py` → UI at `http://127.0.0.1:5002/` (stop with Ctrl-C when done).
  - CLI (requires the server running; set `OSC_URL` if on another host/port): `python3 osc.py crawl <url> --max-pages <n>`; `python3 osc.py summary latest`; `python3 osc.py pages latest --issue "Missing H1"`; `python3 osc.py page latest <url>`; `python3 osc.py brief latest --out brief.md`; `python3 osc.py compare <older> <newer>`; `python3 osc.py bots <url>...`; `python3 osc.py robots <domain>`; `python3 osc.py cms <url>`; `python3 osc.py export latest crawl.xlsx`; `python3 osc.py list`; `python3 osc.py mcp` (MCP server on stdin/stdout); append `--json` to any command for machine-readable output.
- Limitations here: Flask UI + `osc.py` both need the local server running (all CLI commands except `--help` fail with "Connection refused" when it is not). JS rendering is **unavailable** — Playwright is not installed and the VM has no Chromium; the "Render JS" / "Compare with non-JS HTML" mode will not work (raw-HTML crawl works fine, as verified). Auto-update/auto-start on boot not configured (deliberate: this VM is not a server). No API key or account needed for any of this.

## 4. OpenSEO — NOT installed (app + skills)

- Repo: https://github.com/every-app/open-seo — commit `2df84ff` (2026-11-13). License: MIT. Size on disk 61 MB (pnpm workspace, Vite + Cloudflare Workers/D1 or Docker/Postgres).
- What it is: open-source Semrush/Ahrefs alternative — domain insights, keyword research/difficulty, SERP, backlinks, rank tracking, site audits, AI visibility — with an MCP server and agent skills. Hosted version is $10/month at openseo.so; self-hosting is free of subscription but **every SEO data call goes through DataForSEO, a paid API** (see cost box below).
- Why not installed: (a) it is a full web app, not a skill pack — self-hosting needs Docker Compose or a Cloudflare deploy plus a database, and an account/API key for its own MCP; (b) without a DataForSEO key it returns no keyword/SERP/backlink data at all — the data layer is the product, and the key is paid; (c) installing it here would have meant a deployment + a purchase decision, both out of scope for this task.
- Why its skills were NOT copied to `~/workspace/custom-skills/`: the 12 plugin skills in `open-seo/plugins/openseo/skills/` (`seo-audit`, `keyword-research`, `competitor-analysis`, `competitive-landscape`, `keyword-clustering`, `link-prospecting`, `local-seo`, `ai-visibility-audit`, `ai-prompt-research`, `seo-coach`, `seo-project-setup`, `seo-report`) are written against OpenSEO MCP tools (`list_projects`, `create_project`, `run_site_audit`, `get_audit_status`, `get_ranked_keywords`, `get_serp_results`, `get_backlinks_overview`, `whoami`, …). With no OpenSEO server running, every one of those calls fails; installing them would present tools that do not exist. Their subject matter is also already covered by the installed toolkit/operator skills (§1–§2). If OpenSEO is ever self-hosted + keyed, these skills can be installed then from `open-seo/plugins/openseo/skills/`.
- What is usable without installing: its docs (notably `docs/DATAFORSEO_API_KEY.md`, `docs/SELF_HOSTING_DOCKER.md`, `docs/SELF_HOSTING_CLOUDFLARE.md`) were read for the cost/configuration findings below.
- Self-host path if the owner later approves: Docker (`docs/SELF_HOSTING_DOCKER.md`, compose in `deploy/standalone/`) or Cloudflare (`pnpm deploy:selfhost`, `.env.selfhost`), then set `DATAFORSEO_API_KEY` (base64 `email:password` from app.dataforseo.com/api-access). No step of that was run.

### DataForSEO — cost & configuration (checked 2026-11-13)

- Source: OpenSEO `docs/DATAFORSEO_API_KEY.md` + DataForSEO pricing as reported by third-party pricing reviews checked 2026-10-24 – 2026-11-11 (gologin.com, rankite.com, cloro.dev, serpex.dev, apiserpent.com). Figures agree across sources; the vendor pricing page itself was not re-fetched in this task.
- Model: **pay-as-you-go, no subscription.** New accounts get **$1 free credit**; after that the **minimum top-up is $50** and the balance never expires. OpenSEO's hosted service adds a 28% markup on DataForSEO costs; self-hosting pays DataForSEO directly with no markup.
- Indicative rates (Google Organic SERP, per 1,000 pages of 10 results): **Standard queue $0.60** (~5 min turnaround), **Priority $1.20** (~1 min), **Live $2.00** (~6 s). Each extra 10 results costs another base price (a top-100 check = 10× base, e.g. $6.00/1,000 on Standard). Backlinks ~$0.024/request + $0.000036/row. Failed tasks can still cost money.
- Configuration: single credential, `DATAFORSEO_API_KEY` = base64(`email:password`), set in `deploy/standalone/.env` (Docker), `.env.selfhost` (Cloudflare), or `.env.local` (local dev). **No key was created, bought or entered.** The $1 trial credit alone would cover roughly 1,600 Standard SERPs, but creating the account + key is an owner decision (it is a paid top-up path: $50 minimum once the $1 is gone, and the owner's standing rule is no paid anything right now).
- Same key is also the optional BYOK data source for CrawlSEO (§5).

## 5. CrawlSEO — NOT installed

- Repo: https://github.com/crawlseo/crawlseo — commit `25e3c31` (2026-11-02). License: MIT.
- What it is: self-hosted Next.js SEO monitoring dashboard — Google Search Console integration, site crawler (up to 2,000 pages/crawl by default), Core Web Vitals, keyword research, backlinks, domain overview, read-only MCP server. No SKILL.md shipped — app only.
- Why not installed: it is a full-stack app, not a skill/CLI. Running it needs PostgreSQL (`DATABASE_URL` in `docker-compose.yml` / `.env.example`), Google OAuth client ID + secret (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) for GSC sign-in, and `npm install` + `next dev/build`. **Docker is not installed on this VM** (`docker: command not found`), so the documented Compose path is unavailable; a manual install would still be blocked on Postgres + Google OAuth setup, which needs owner credentials/portal steps. Nothing was installed or configured.
- Its MCP server (`packages/mcp/src/cli.ts`, `npm run mcp`) is only a client of a running CrawlSEO app (`CRAWLSEO_URL`, default `http://localhost:3000`, plus API key) — it cannot run standalone, so it was not installed either.
- What works without the key/app: the crawler + GSC sync + PageSpeed vitals are the free core; keyword research and backlinks are BYOK DataForSEO (optional, same $50-minimum key as §4), with free Google Autocomplete suggestions as the fallback for keyword ideas. No data was pulled.

## Skills installed — full list (34)

Location: `~/workspace/custom-skills/<skill-name>/` (each: SKILL.md + skill.yaml with source repo + MIT; toolkit skills also carry references/ + scripts/).

From SEO Agent Toolkit (18): `seo-ai-visibility`, `seo-cannibalization`, `seo-change-review`, `seo-content-brief`, `seo-content-optimizer`, `seo-indexation-analysis`, `seo-internal-linking`, `seo-keyword-research`, `seo-migration`, `seo-orchestrator`, `seo-page-audit`, `seo-performance-analysis`, `seo-prioritization`, `seo-programmatic`, `seo-schema`, `seo-serp-analysis`, `seo-strategy`, `seo-technical-audit`.

From SEO operator (16): `authority-mark-keyword-difficulty`, `client-report-writer`, `competitor-serp-monitor`, `content-decay-monitor-setup`, `content-moat-planner`, `content-refresh-brief`, `exceed-quality-threshold`, `keyword-opportunity-finder`, `keyword-planner`, `live-search-console-data`, `proposal-builder`, `refresh-vs-new-content`, `seo-growth-loop`, `seo-offer-architect`, `title-meta-rewriter`, `traffic-decay-detector`.

Skipped as duplicates (7, toolkit version kept): `seo-strategy`, `seo-content-brief`, `cannibalization-check`, `internal-link-builder`, `schema-fix-writer`, `technical-seo-triage`, `seo-priority-score`.

OpenSEO plugin skills NOT installed (12, MCP-dependent — see §4): `seo-audit`, `keyword-research`, `competitor-analysis`, `competitive-landscape`, `keyword-clustering`, `link-prospecting`, `local-seo`, `ai-visibility-audit`, `ai-prompt-research`, `seo-coach`, `seo-project-setup`, `seo-report`.

## Cost / credential blockers (summary)

1. **DataForSEO — BLOCKER for OpenSEO and for CrawlSEO keyword/backlink data.** $1 free trial credit, then $50 minimum top-up (pay-as-you-go, no subscription, balance never expires). No account created, no key entered. Owner decision required; conflicts with the standing no-paid rule.
2. **Google Ads API — BLOCKER for `keyword-planner` skill's live data.** Needs a Google Ads manager account + approved developer token + service-account JSON, plus the `keyword-planner` CLI binary (absent here, no install source in the skill). No credentials exist here.
3. **RefreshAgent Google sign-in — BLOCKER for live GSC/GA4 via `live-search-console-data`.** One browser Google sign-in at refreshagent.com needed on first use (owner's hands, browser step). Until then, GSC skills run on pasted/exported data only.
4. **Google OAuth (GSC) + PostgreSQL — BLOCKER for CrawlSEO.** Needs a Google Cloud OAuth client and a Postgres database; Docker unavailable on this VM.
5. **No Chromium/Playwright — LIMITS Open SEO Crawler JS rendering.** Raw-HTML crawling verified working; "Render JS" / JS-vs-no-JS compare modes will not work here.

## What is ready to use right now (no keys, no money)

- All 34 installed skills as agent playbooks (toolkit skills work fully off supplied data).
- Toolkit deterministic scripts (Node stdlib): robots/sitemap/redirect/schema/link-graph/crawl-diff evidence as JSON.
- Open SEO Crawler: start the server and crawl any site with `osc.py` (see §3); MCP via `python3 osc.py mcp`.
- Installer script (re-runnable): `~/workspace/seo-tools/install-seo-skills.py`.
