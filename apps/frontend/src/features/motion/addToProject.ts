import { ProjectSettingsSchema, newId, type OverlayItem, type ProjectSettings } from "@capseasy/shared";
import type { MotionConfig } from "@capseasy/motion";
import { studioService } from "@/services/studio";
import { buildStageCWritePatch, readCompositionSettings, STAGE_C_ENABLED } from "@/features/studio/stageC";
import { makeSocialOverlay } from "@/features/studio/panels/overlayItems";
import { listAllAssets, saveAsset } from "@/features/studio/mediaStore";

/**
 * "Add to project" for Motion Studio — the real insertion path, not a navigation shortcut.
 *
 * A configured graphic becomes a normal social OverlayItem in the target project's settings,
 * written through the exact save path the Studio itself uses: the project's current settings
 * are loaded via studioService.getStudio, resolved through readCompositionSettings (the
 * Stage-C column copy wins, exactly as useStudio resolves it on open), the item is appended
 * to settings.overlays, and the full settings are written back with studioService.savePatch
 * alongside the Stage-C dual-write fragment — byte-for-byte the shape of useStudio's persist.
 * When the Studio next opens that project it loads the item like any other overlay.
 *
 * Placement follows overlayItems.ts conventions (a social overlay's own window, anchored
 * low-centre by makeSocialOverlay): at 0 when the project has no overlays yet, otherwise
 * right after the last existing overlay when that still fits inside the video; if it would
 * run past the end of a known-length video, it starts at 0 instead of being clamped short.
 *
 * Assets: media-bin records are scoped per project (mediaStore), and the customize page's
 * uploads are staged under MOTION_STAGING_PROJECT_ID. Adding to a project COPIES the staged
 * record into the target project's bin under a fresh id (the staged record stays put, so the
 * same graphic can be added to another project too) and the item references the copy.
 */

export const MOTION_STAGING_PROJECT_ID = "motion-studio";

export interface MotionAssetRef {
  id: string;
  name: string;
}

/** The overlay item for a validated motion config at a given start (pure). */
export function buildMotionOverlayItem(config: MotionConfig, startMs: number, asset?: MotionAssetRef | null): OverlayItem {
  const base = makeSocialOverlay(config.variant, startMs, 0);
  return {
    ...base,
    text: config.text,
    color: config.color,
    endMs: startMs + config.durationMs,
    ...(asset ? { assetId: asset.id, assetName: asset.name } : {}),
  };
}

/** Where a new motion overlay starts in a project (pure; see the header note). */
export function chooseMotionStartMs(overlays: readonly OverlayItem[], videoDurationMs: number, durationMs: number): number {
  if (overlays.length === 0) return 0;
  const lastEnd = Math.max(...overlays.map((o) => o.endMs));
  if (videoDurationMs > 0 && lastEnd + durationMs > videoDurationMs) return 0;
  return lastEnd;
}

/**
 * Copy a staged (or any on-device) media-bin record into the target project's bin.
 * Returns the reference the overlay item should carry, or null when the record is not on
 * this device (the caller then inserts without an image rather than pointing at nothing).
 */
export async function copyAssetToProject(assetId: string, projectId: string): Promise<MotionAssetRef | null> {
  const rec = (await listAllAssets()).find((a) => a.id === assetId);
  if (!rec) return null;
  if (rec.projectId === projectId) return { id: rec.id, name: rec.name };
  const copy = { ...rec, id: newId(), projectId, createdAt: Date.now() };
  await saveAsset(copy);
  return { id: copy.id, name: copy.name };
}

/** Insert the configured graphic into a project's overlays and persist it. Returns the item. */
export async function addMotionToProject(
  projectId: string,
  input: { config: MotionConfig; assetId?: string | null },
): Promise<OverlayItem> {
  const data = await studioService.getStudio(projectId);
  const parsed = ProjectSettingsSchema.parse(data.project.settings_json ?? {});
  // resolve the effective composition exactly like useStudio does on open (Stage C)
  const resolved = readCompositionSettings({
    settingsComposition: parsed.composition,
    compositionJson: data.project.composition_json,
  });
  const settings: ProjectSettings =
    resolved.source === "column" ? ProjectSettingsSchema.parse({ ...parsed, composition: resolved.settings }) : parsed;

  let asset: MotionAssetRef | null = null;
  if (input.assetId) asset = await copyAssetToProject(input.assetId, projectId);

  const startMs = chooseMotionStartMs(settings.overlays, data.video?.durationMs ?? 0, input.config.durationMs);
  const item = buildMotionOverlayItem(input.config, startMs, asset);
  const next: ProjectSettings = { ...settings, overlays: [...settings.overlays, item] };
  await studioService.savePatch(projectId, {
    settings_json: next,
    ...(STAGE_C_ENABLED ? buildStageCWritePatch(next.composition) : {}),
  });
  return item;
}
