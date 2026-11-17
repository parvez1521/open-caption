# Studio panels restructure — progress

Branch `feat/studio-panels-restructure-2026-11-18`, worktree `~/workspace/oc-studio-panels-restructure`, base 2edce31 (AI Edit panel).

## Done
- 2026-11-18 ~01:40 IST: worktree created, `pnpm install --prefer-offline` rc=0.
- Explored StudioPage (RAIL_SECTIONS, renderPanel, right column `rightTab: "motion" | "inspector"`), overlay system (`OverlayItem` kind text/shape/image/social; `enterAnim`/`exitAnim` box-applicable lists in compositions), TextPanel/ElementsPanel/MotionStudioPanel/SoundEffectsPanel (SFX already exists, CC0 starter + Pixabay).
- Foundation commit 16df792: 12 house-drawn sticker shapes added to OVERLAY_SHAPES (burst, bolt, crown, flame, thumbs-up, curved-arrow, sun, explosion, ribbon, tag, pin, target) + SVG in OverlayShapeSvg + meta; `font` optional field on OverlayItem (sans/serif/mono/hand, system stacks only) + renderer mapping in OverlayView + Font select in OverlayEditor; tests updated (shapes 21 -> 33, font parse + render tests).

## In flight (subagents, parallel, disjoint files)
- Titles (A): `features/studio/titleStyles.ts` (50-title registry) + `panels/TitlesPanel.tsx` + tests.
- Stickers (B): `features/studio/stickers.ts` + `panels/StickersPanel.tsx` + tests.

## Still to do (parent/coordinator)
- Left rail: remove text / trim / polish / assistant sections + render branches + imports in StudioPage.tsx (TextPanel.tsx file STAYS — it exports OverlayPanelProps used by Elements/MotionStudio panels; Trim/Polish/Assistant panel files + their tests stay on disk, unlinked, like titleCard.ts precedent). Relabel aiedit "AI Edit" -> "Generate Image/Video".
- Right side: extend rightTab to "motion" | "inspector" | "titles" | "stickers" | "sfx"; tabs Motion | Titles | Stickers | Sound FX; render TitlesPanel / StickersPanel / SoundEffectsPanel (reuse, projectId) with overlayPanelProps; Motion + Inspector untouched.
- Check orphaned helpers after rail removal (applyTrim, polishCommitSettings, PEAKS_PER_SECOND, wave) — remove only if truly unused and typecheck demands it.
- Gates SERIAL when no other vitest/next build is running (AI Edit gates in oc-ai-edit-panel were still running at ~01:45 IST): full frontend suite + typecheck + build, rcs to gates.log. Known flakes: favouriteLooksPanel timeouts, one-off Turbopack font build error (retry once).
- Report back: branch + commit, removals, right-side options, titles/stickers/sounds counts + sources/licences, gates, unverified items. NO deploy.
