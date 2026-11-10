/**
 * CompositionDoc Stage C — the flagged switch (STUDIO-ARCHITECTURE.md §1.2).
 *
 * Stage B stores the timeline slice of the composition (video segments,
 * markers, per-track state) inside the settings blob:
 * `settings.composition`, riding `settings_json` through the project PATCH
 * route. Stage C promotes that slice to a PRIMARY database column,
 * `projects.composition_json`, so the timeline can outgrow the settings
 * shape (multiple clips, multiple tracks, transforms, keyframes…).
 *
 * STATUS (Phase 4 Run 2): activation steps 3–4 below are now IMPLEMENTED —
 * this module IS imported by useStudio, the PATCH route accepts
 * `composition_json`, PROJECT_COLUMNS/toApiProject carry it, the studio
 * route selects it, and useStudio resolves loads through
 * `readCompositionSettings` and dual-writes through
 * `buildStageCWritePatch` (gated on the flag). The flag below stays OFF —
 * so nothing in here can change today's live behaviour.
 * `readCompositionSettings` is written so that, with the flag off, it is a
 * pure pass-through of the settings slice, and the dual-write is omitted
 * entirely: the switch is provably inert until activation.
 *
 * ACTIVATION CHECKLIST (Gate G4 — all steps, in this order):
 *   1. Owner go-ahead (Gate G4). Nothing below happens before it.
 *   2. Paste supabase/APPLY-COMPOSITION-PRIMARY.sql into the Supabase SQL
 *      Editor and run it; verify every STEP 3 check holds (column exists
 *      as jsonb, promoted count == settings-key count, settings_json
 *      untouched).
 *   3. Add `composition_json` to the app plumbing, exactly:
 *        - the PATCH route allow-list in
 *          apps/frontend/src/app/api/v1/projects/[id]/route.ts
 *          (accept the key alongside settings_json),
 *        - PROJECT_COLUMNS and toApiProject in
 *          apps/frontend/src/lib/api/projects.ts
 *          (select the column and map it onto the API project).
 *      [DONE — Phase 4 Run 2]
 *   4. Wire this module into useStudio: adopt the composition via
 *      readCompositionSettings on project load, and include
 *      buildStageCWritePatch in the persist path so saves DUAL-WRITE —
 *      settings_json keeps its embedded copy AND composition_json gets
 *      the column copy — for the whole transition cycle.
 *      [DONE — Phase 4 Run 2; the dual-write is gated on STAGE_C_ENABLED,
 *      so it only starts once step 5 flips the flag.]
 *   5. Flip STAGE_C_ENABLED to true (separate commit, after 1–4 are live).
 *      [REMAINS — the only step left.]
 *   6. After one full release cycle of dual-writing, a follow-up migration
 *      may drop the settings-embedded copy (settings_json -> 'composition')
 *      and the settings slice leaves ProjectSettingsSchema.
 *
 * Rollback at any point: flip STAGE_C_ENABLED back to false — the app
 * reads the settings copy again, which dual-writing kept current. Even
 * dropping the column is a clean revert during the transition cycle.
 */
import {
  CompositionSettingsSchema,
  EMPTY_COMPOSITION_SETTINGS,
  type CompositionSettings,
} from "@capseasy/shared";

/**
 * The Stage-C gate. MUST stay false until activation steps 1–4 of the
 * checklist above are done. Pinned by stageC.test.ts.
 */
export const STAGE_C_ENABLED = false;

/**
 * The normalised standalone form of a composition slice — exactly what the
 * `projects.composition_json` column stores. Parsing through the schema
 * fills every default and strips anything the column must not carry, so
 * the column form is canonical and JSON-stable.
 */
export function compositionColumnForm(comp: CompositionSettings): CompositionSettings {
  return CompositionSettingsSchema.parse(comp);
}

/**
 * Resolve the effective composition slice from the two possible homes.
 *
 * `source: "column"` is returned ONLY when STAGE_C_ENABLED is true AND
 * `compositionJson` parses cleanly through CompositionSettingsSchema.
 * In every other case — flag off, column NULL (project not yet promoted),
 * column value malformed — the settings slice wins, falling back to
 * EMPTY_COMPOSITION_SETTINGS when the project has no settings slice
 * either (a pre-Stage-B project; its composition is derived from parts by
 * the caller, exactly as today). Never throws.
 */
export function readCompositionSettings(src: {
  settingsComposition?: CompositionSettings | null;
  compositionJson?: unknown;
}): { settings: CompositionSettings; source: "column" | "settings" } {
  if (STAGE_C_ENABLED && src.compositionJson != null) {
    const parsed = CompositionSettingsSchema.safeParse(src.compositionJson);
    if (parsed.success) {
      return { settings: parsed.data, source: "column" };
    }
  }
  return { settings: src.settingsComposition ?? EMPTY_COMPOSITION_SETTINGS, source: "settings" };
}

/**
 * The PATCH body fragment the save path sends ALONGSIDE settings_json
 * once STAGE_C_ENABLED is true (activation step 4, wired in useStudio):
 * the dual-write that keeps
 * the column copy and the settings copy identical for the whole transition
 * cycle, so they can never drift and rollback stays a flag flip.
 */
export function buildStageCWritePatch(comp: CompositionSettings): { composition_json: CompositionSettings } {
  return { composition_json: compositionColumnForm(comp) };
}
