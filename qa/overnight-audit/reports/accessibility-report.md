# Accessibility report — Captionit overnight QA

Tool: axe-core 4.12.1, injected into local dev pages via CDP.
Pages: `/`, `/transcribe`, `/pricing`, `/projects/[id]` (Studio, captioned project).
Evidence: `evidence/viewports-axe.json`, `evidence/axe-home-detail.json`,
`evidence/axe-studio-detail.json`, `evidence/axe-verify.json`.

## Results after fixes
| Page | Before | After |
| --- | --- | --- |
| Home `/` | aria-allowed-attr critical ×5, aria-prohibited-attr serious ×1, color-contrast serious ×10 | **color-contrast serious ×9 only** |
| Transcribe | 0 violations | 0 violations |
| Pricing | 0 violations | 0 violations |
| Studio | landmark-one-main, page-has-heading-one, region ×2, skip-link (moderate) + aria-prohibited-attr serious ×52, aria-required-attr critical ×2, aria-required-children critical ×1 | **region moderate ×1 only** |

## Fixed (BUG-010, BUG-011)
- **Home chips**: inert AI Edit demo style chips carried `aria-pressed` — removed.
  (Chips stay inert; the owner's live-vs-inert call is untouched.)
- **Home claim**: `<p data-hero="claim" aria-label="...">` — added `role="group"`
  so the label is permitted. The `hinglishClaim` test passes unchanged.
- **Studio landmarks**: all Studio return sites (editor, no-video, mobile) +
  loading skeleton + fullscreen fallback now render `<main id="main-content">`;
  the global skip link has a target. Screen-reader-only `<h1>` (project title)
  added next to the rename button.
- **Timeline handles**: 52 word/overlay edge handles changed `aria-label` → `title`.
- **Trim sliders**: `aria-valuenow/min/max/valuetext` added.
- **Tablist**: the "Collapse right panel" button moved out of the `tablist`
  (tabs only inside it now); no visual change.

## Remaining open items
- **color-contrast (serious, 9 nodes, home)**: muted look-tag pills (`#B4B4AA` on
  `#232320`, 11px) in the homepage looks gallery + a caption-preview span over a
  poster image. RECOMMENDATION, not fixed: brightening the muted tone changes
  the site's chosen palette. Owner's call.
- **region (moderate, 1 node, Studio)**: the skip link itself sits outside any
  landmark. Conventional skip-link position; accepted, not a defect.
- **Keyboard (M48, partial)**: skip link present; rail/panel controls are real
  buttons. Timeline drag handles are pointer-only — there is no keyboard
  retime flow by design. A full tab-through was not run.

## Method note
The first Studio axe re-run after the BUG-011 fix caught the loading skeleton
(expired guest session + stale dev-server proxy credential) and showed the
pre-fix set. The fixes were verified on a rebuilt project under a fresh guest
after restarting the dev server with a fresh proxy credential.
