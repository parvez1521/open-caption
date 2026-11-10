-- CompositionDoc Stage C (2026-11-10, Phase 4 of the Creator Studio
-- transformation; STUDIO-ARCHITECTURE.md §1.2, Stage C): promote the
-- composition slice to a PRIMARY column, public.projects.composition_json.
--
-- BEFORE: the timeline slice of the composition — the video segmentation,
-- the timeline markers, and the per-track state — lives ONLY inside the
-- settings blob, at settings_json -> 'composition' (Stage B,
-- 20261110000000…-era app schema:
-- packages/shared/src/settings.ts → CompositionSettingsSchema:
-- { version: 1, videoSegments: [{id, sourceInMs, sourceOutMs}],
--   markers: [{id, atMs, label}],
--   tracks: {video|captions|text|graphics: {locked, visible, muted}} }).
-- It rides settings_json through the project PATCH route, whose allow-list
-- is ProjectSettingsSchema.partial().
--
-- AFTER (this migration): public.projects gains ONE nullable column,
--
--   composition_json jsonb
--
-- with NO default. NULL means "not yet promoted": the project was created
-- before Stage B (a Stage-A project, whose composition is fully derivable
-- from its parts) or simply has not been opened since activation, and the
-- app synthesises the slice lazily on its first Stage-C read. The backfill
-- below promotes the Stage-B slice into the column wherever one already
-- exists inside settings_json.
--
-- ROLLBACK: this change is purely ADDITIVE. settings_json and every other
-- column are untouched, the settings copy of the slice stays in place, and
-- no other object (table, index, policy, function) depends on the new
-- column during the transition cycle. Reverting is therefore complete and
-- trivial: drop the column —
--   alter table public.projects drop column if exists composition_json;
-- — or simply never activate the app-side switch (see below), in which case
-- the column sits unused forever and harms nothing.
--
-- WARNING: app code must NOT read or write composition_json until the
-- Stage-C activation patch lands together with the STAGE_C_ENABLED flag
-- flip (apps/frontend/src/features/studio/stageC.ts carries the checklist:
-- PATCH-route allow-list + PROJECT_COLUMNS + toApiProject, then wiring
-- readCompositionSettings / buildStageCWritePatch into useStudio). Applying
-- this migration alone changes NO live behaviour: today's code selects an
-- explicit column list that does not include composition_json and its
-- PATCH allow-list rejects the key, so the column is invisible to the app
-- until activation.
--
-- No RLS changes: composition_json is a column on public.projects, which
-- already has row-level security and owner policies; a new column is
-- covered by the existing table-level policies and grants automatically.
--
-- Everything here is idempotent: the file can be re-run safely. The
-- backfill only touches rows whose column is still NULL, so a re-run after
-- activation never overwrites a value the Stage-C app has since written.

alter table public.projects add column if not exists composition_json jsonb;

-- Backfill: promote the Stage-B slice out of settings_json wherever one is
-- stored. Projects whose settings carry no 'composition' key keep NULL —
-- the app derives their composition from parts on first Stage-C read.
update public.projects
   set composition_json = settings_json -> 'composition'
 where composition_json is null
   and settings_json ? 'composition';
