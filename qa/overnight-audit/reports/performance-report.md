# Performance report — Captionit overnight QA

Tool: Lighthouse 13.6.0, local dev server, headless Chromium, default throttling.
Evidence: `evidence/lighthouse-home.json`, `evidence/lighthouse-pricing.json`,
`evidence/lighthouse-transcribe.json`.

**Read these as dev-mode numbers, not production.** The dev server compiles on
demand, the VM has 1.5 CPUs / 6 GB, and the browser is chrome-headless-shell.
Absolute times are inflated; the comparisons between pages and the audit
findings are the signal.

## Scores
| Page | Perf | A11y | Best practices | SEO | LCP | CLS | TBT | Transfer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Home `/` | 60 | 90 | 96 | 92 | 1.1s | 0.011 | 12,670 ms | 2,974 KB / 98 req |
| Pricing | 70 | 100 | 96 | 100 | 0.8s | 0 | 3,030 ms | 1,909 KB / 49 req |
| Transcribe | 44 | 100 | 96 | 66 | 12.3s | 0 | 2,800 ms | 1,624 KB / 59 req |

## Findings
- **LCP is good on home (1.1s) and pricing (0.8s); CLS is good everywhere
  (0–0.011).** No layout-shift problem.
- **TBT is the perf score driver** (12.7s home, 3.0s pricing, 2.8s transcribe)
  — heavy client JS on a throttled CPU. In production (minified, CDN) this will
  read much lower; re-measure on the live site before optimising.
- **Transcribe LCP 12.3s stands out** against home 1.1s. The LCP element renders
  late — likely the page waiting on auth/session resolution + the model preload
  attempt before the dropzone paints. Worth one production Lighthouse run to
  confirm; if it reproduces live, the dropzone should paint before the session
  and preload settle.
- **Transcribe SEO 66**: the page is noindex by design (it is an app route) —
  the low SEO score is expected, not a defect. Home SEO 92 / pricing 100.
- No render-blocking-resource or unused-CSS opportunities were flagged by
  Lighthouse on any of the three pages.
- INP was not measured (no interaction in the Lighthouse run).

## Recommendation
Run Lighthouse once on production (captionit.in) for home + /pricing +
/transcribe and compare with these dev numbers. If transcribe LCP stays above
~4s live, investigate the session/preload gating on first paint.
