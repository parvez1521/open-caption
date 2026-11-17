# Studio panels restructure — progress

Branch `feat/studio-panels-restructure-2026-11-18`, worktree `~/workspace/oc-studio-panels-restructure`, base 2edce31 (AI Edit panel).

## Done
- 2026-11-18 ~01:40 IST: worktree created, `pnpm install --prefer-offline` rc=0.
- Explored StudioPage (RAIL_SECTIONS, renderPanel, right column `rightTab: "motion" | "inspector"`), overlay system (`OverlayItem` kind text/shape/image/social; `enterAnim`/`exitAnim` box-applicable lists in compositions), TextPanel/ElementsPanel/MotionStudioPanel/SoundEffectsPanel (SFX already exists, CC0 starter + Pixabay).
- Foundation commit 16df792: 12 house-drawn sticker shapes added to OVERLAY_SHAPES (burst, bolt, crown, flame, thumbs-up, curved-arrow, sun, explosion, ribbon, tag, pin, target) + SVG in OverlayShapeSvg + meta; `font` optional field on OverlayItem (sans/serif/mono/hand, system stacks only) + renderer mapping in OverlayView + Font select in OverlayEditor; tests updated (shapes 21 -> 33, font parse + render tests).
- Left rail commit 562324b: removed text/trim/polish/assistant sections + render branches + imports + applyTrim + polish/trim helper imports; aiedit relabelled "Generate Image/Video"; rail test pins the new list. (NOTE: this commit also swept in the stickers worker's 4 files — files are complete and its tests pass 8/8, but the commit message does not mention them; acceptable, report will describe it.)
- Stickers worker DONE (handoff 01:43 IST): stickers.ts + StickersPanel.tsx + 2 test files, targeted tests 8/8 pass. NOT yet wired (no StudioPage mount yet — coordinator's integration step).
- Explored for additions 7+8: 46 motion templates are ALREADY editable after placement (MotionTemplateFields "Edit template" block in OverlayEditor); segment transitions already exposed via SegmentInspector (onTransition -> setSegmentTransition) — pack does not rebuild transitions.

## In flight (subagents, parallel, disjoint files)
- Titles (A): `features/studio/titleStyles.ts` + `panels/TitlesPanel.tsx` + tests (files written, tests running at last check).
- Motion pack (D): 2 new social variants (callout, progress-fill) + `features/studio/motionPack.ts` + `panels/MotionPackPanel.tsx` + tests. SPAWNED ~01:45 IST.

## Still to do (parent/coordinator)
- Spawn C (reel templates) AFTER A lands — C needs the real titleStyles API: `features/studio/reelTemplates.ts` (12 templates: Hook/Promo/Tutorial/Announcement/etc., each a bundle of look + overlay specs + editable params) + `panels/ReelTemplatesPanel.tsx` + tests. Apply adds overlays + sets look via existing patch paths; panel params edit the placed items by id.
- Right side: extend rightTab to "motion" | "inspector" | "titles" | "stickers" | "sfx" | "reels" | "graphics"; tab row scrollable (6 tabs + Inspector); render TitlesPanel / StickersPanel / SoundEffectsPanel (reuse, projectId) / ReelTemplatesPanel / MotionPackPanel with overlayPanelProps; Motion + Inspector untouched. Wire AFTER all panels land.
- Check orphaned helpers after rail removal (applyTrim, polishCommitSettings, PEAKS_PER_SECOND, wave) — remove only if truly unused and typecheck demands it.
- Gates SERIAL when no other vitest/next build is running (AI Edit rebased gates: TESTS rc=0, TYPECHECK rc=0, build was running at ~01:42 IST; APK coordinator still running): full frontend suite + typecheck + build, rcs to gates.log. Known flakes: favouriteLooksPanel timeouts, one-off Turbopack font build error (retry once).
- Report back: branch + commit, removals, right-side options, titles/stickers/sounds/reels/graphics counts + sources/licences, gates, unverified items. NO deploy.
