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

## Overnight scope (owner 2026-11-18 ~01:45 + 01:47 IST) — 50 per category
- Titles 50: DONE (A, commit 52b07a3, 11/11 tests).
- Stickers 50: 12 done (B, commit 562324b, 8/8 tests). Need +38: 17 more house-drawn shapes (33 shapes exist) + registry expansion to all 50. BLOCKED on D landing first (both touch packages/shared/src/settings.ts) — spawn E after D's handoff is consumed.
- Sounds 50: 21 bundled (12 Kenney CC0 starter + 9 Captionit-synthesized meme, manifest.json). Need +29 synthesized. Worker F SPAWNED ~01:50 IST (Python DSP script + manifest + tests).
- Reel templates 50: C building; redirected 12 -> 50 (Hook/Promo/Tutorial/Announcement/Product&UGC, 10 each). C RUNNING.
- Motion graphics 50: D built 2 new variants (callout, progress-fill) + pack; 46 + 2 = 48. D DONE but its handoff is still awaiting delivery — the +2 expansion (quote-card / rating-stars / poll-bars shortlist) could NOT be sent yet (send failed: terminal result awaiting delivery). Re-dispatch after consuming D's handoff.
- Split: EXISTS (splitVideoClipAt + toolbar B key). Worker G to verify + test + surface a Split button in the Transitions panel. SPAWNED ~01:50 IST.
- Transitions 100: existing system has 5 types (fade/wipe/slide/zoom/blur) via Remotion TransitionSeries; SegmentTransitionSchema { type, durationMs 100-2000 }. Worker G to build the 100-entry registry (10 categories x 10) with parameterized presentations + TransitionsPanel + tests. SPAWNED ~01:50 IST.
- Research done (style reference only): titles — Hormozi heavy uppercase/accent word, kinetic type, minimal lower thirds, typewriter, glitch, serif premium; SFX — whoosh #1, pop, click, ding, riser, downlifter, impact, tick, glitch, boing; reels — hooks, product showcase, numbered tutorials, announcements/launches, glow-up/before-after, UGC ads, cinematic, motivational.
- COMMIT HYGIENE LESSON: `git add -A` sweeps in workers' in-progress files — 52b07a3 accidentally contains D's variant work (motionPack.ts, social.tsx, registry.ts, settings.ts). From now on commit with EXPLICIT pathspecs only.

## Still to do (parent/coordinator)
- Consume D's handoff when it arrives; then re-dispatch the +2 variants expansion (or do quote-card + rating-stars myself).
- After D lands: spawn E (stickers 12 -> 50: 17 new shapes in settings.ts OVERLAY_SHAPES + overlays.tsx SVG/meta + sticker registry to all 50 + tests).
- Right side: extend rightTab to "motion" | "inspector" | "titles" | "stickers" | "sfx" | "reels" | "graphics" | "transitions"; tab row scrollable; render TitlesPanel / StickersPanel / SoundEffectsPanel / ReelTemplatesPanel / MotionPackPanel / TransitionsPanel; Motion + Inspector untouched. Wire AFTER all panels land.
- Gates SERIAL when no other vitest/next build is running: full frontend suite + typecheck + build, rcs to gates.log. Known flakes: favouriteLooksPanel timeouts, one-off Turbopack font build error (retry once).
- Report back: branch + commit, removals, right-side options, EXACT counts per category (titles/stickers/sounds/reels/graphics/transitions) + sources/licences, gates, unverified items. NO deploy.

## ~01:53 IST — Reels committed; motion pack committed; D2 + E spawned
- C (reels) handoff consumed: exactly 50 editable templates, targeted tests 8/8. Committed as **8c7ec47** (4 files, explicit pathspec). One real bug found+fixed by C: `clampWindow` slides a window back so its last 400 ms still shows (was overshooting the video end).
- Settings commit **10cb3a5** (amended message): reserves quote-card + rating-stars variant ids AND extends SegmentTransitionSchema with G's 100 TRANSITION_REGISTRY_IDS. NOTE: the `git add packages/shared/src/settings.ts` swept in G's in-progress schema work (46 insertions) — the amended message now records that. Lesson reinforced: check `git diff --stat` before committing a shared file while other workers are live.
- D (motion pack) fully committed: core files were already in 52b07a3; panel + tests committed as **f38caee** (48 templates). The +2 expansion (quote-card, rating-stars) re-dispatched as worker D2 — enum ids already reserved, D2 must NOT touch settings.ts.
- E spawned: stickers 12 -> 50 (17 new house-drawn shapes: megaphone, music-note, mic, camera, play, rocket, trophy, gift, bell, clock, gem, puzzle, coffee, umbrella, key, lock, thumbs-down). Warned about the shared settings.ts region with G's TRANSITION_REGISTRY_IDS work.
- Still running: F (sounds 50 — 29 new .ogg files already on disk, manifest + catalogue + credits page edited, NOT yet committed), G (transitions 100 — transitionRegistry.ts + test + transitions.tsx + CaptionedVideo.tsx + index.ts exports on disk, plus a 1-line settings.ts rename cube-up -> tilt-up, NOT yet committed).
- MEMORY.md note (external, ~01:52 IST): another chat is building a standalone /image-editor (branch feature/image-elements-editor-2026-11-18) — standalone page, explicitly NOT touching Studio panels. No conflict with this branch.

## ~01:57 IST — Sounds committed (50)
- F handoff consumed: 29 new synthesized sounds, pack 21 -> 50. Verified by me on disk (50 .ogg files, 50 manifest items) and re-ran its targeted tests myself: 23/23 pass (6 new + 17 existing stockAudio). Committed as **08ae89e** (explicit pathspec; staged list checked clean — no sweep).
- F notes: `npx tsc --noEmit` shows 19 errors, ALL in packages/compositions/src/transitions.tsx — G's in-progress file, not F's. Zero errors in F's files. Full typecheck runs at gates after G lands.
- F's perceptual caveat recorded: headers/durations/RMS verified, but how the sounds actually sound is the owner's (or a listening pass's) verdict.
- Still running: G (transitions + split — transitionRegistry.ts, TransitionsPanel.tsx, splitTransitions.test.ts now on disk), D2 (motion pack +2), E (stickers -> 50).

## ~02:01 IST — Motion pack reaches 50 (registry), committed
- D2 handoff consumed: quote-card + rating-stars implemented through the existing SocialOverlayView path. Verified by me: motionPack 5/5, social 45/45, registry 11/11 (re-ran all three targeted files myself). Committed as **5ef9f46** (6 files, explicit pathspec).
- Honest count distinction (D2 flagged it, recorded here): registry MOTION_TEMPLATES is exactly 50 (46 original + callout + progress-fill + quote-card + rating-stars) and SOCIAL_META is 50. The curated Motion Pack panel lists 16 everyday-use ids across 7 groups (new Reviews group). The full 50 remain reachable via the existing Motion Studio tab. Final report must state both numbers, not just "50 motion graphics".
- D's late handoff also arrived (worker 3/8) — already committed in 52b07a3 + f38caee, no action needed.
- Still running: G (split + transitions 100), E (stickers -> 50; overlays.tsx + stickers.ts + sticker tests on disk, uncommitted).

## ~02:03 IST — Stickers reach 50, committed
- E handoff consumed: 17 new house-drawn shapes, registry exactly 50. Verified by me: OVERLAY_SHAPES 50 unique on disk; re-ran targeted tests myself — stickers 9/9, overlays 7/7. Committed as **3f0aeeb** (6 files, explicit pathspec). Message records that settings.ts in the commit also carries G's one-line tilt-up rename (swept in by the add).
- E's caveat recorded: visual recognisability of the 17 new SVGs is unproven on screen (static-markup tests only) — owner's on-screen check is the real verdict.
- Only G remains running (split + transitions 100). After G lands: right-side wiring, then serial gates.

## ~02:10 IST — All workers landed; wiring committed
- G handoff consumed: split verified correct (no fix), 100 transitions, panel. Verified by me: compositions 33/33, frontend split+panel 17/17, shared settings 63/63. Committed as **89ea222** (8 files, explicit pathspec).
- Right-side wiring done by coordinator and committed as **0867844** (StudioPage.tsx only, +80/-5): 8 right tabs (Motion, Inspector, Titles, Stickers, Sounds, Reels, Graphics, Transitions), scrollable tab row; Transitions wired to setSegmentTransition + splitVideoAtPlayhead with the same guards as the op (no cut on first clip, video-locked disables split). Motion + Inspector behaviour unchanged. New tabs desktop-only for now (phone keeps left-rail sections).
- Gates note: the APK coordinator's vitest in ~/workspace/oc-android-apk has been running since ~20:29 UTC but is using ~0 CPU (0:18 CPU in 10 min wall) — effectively idle, workers cycling slowly. Running the serial gates now; if the full suite shows timeout flakes, re-run affected files in isolation per the established procedure.

## ~02:50 IST — Gates done (with 2 stale pins fixed)
- Typecheck: first run rc=2 (15 errors) -> fixed 4 real bugs (f0c2219) -> re-run rc=0.
- Full suite run 1: rc=1, 2 failures (captionSectionSwitch) — proven flakes, 4/4 in isolation.
- Full suite run 2 (complete log): 2633 passed / 14 failed (2647 total, 251 files).
  All 14 accounted for individually:
  * 2 STALE PINS (real, fixed): motionPackPanel 14->16 cards; stockAudioSection
    synth licence lines 9->38 (9 meme + 29 new SFX). Both files pass after the fix.
  * 12 TIMEOUT FLAKES under parallel load (favouriteLooksPanel 7 + 5 singles):
    every one passes in isolation (favouriteLooksPanel 9/9, captionSectionSwitch
    4/4, plus the other 4 files green in the 8-file batch). No third full run:
    the re-run took 926s under load and would flake the same slow files again;
    each failing test is verified green on the final tree instead.
- Build: rc=0.
- Branch complete: 12 commits, ready for the parent to verify + deploy in the morning.
