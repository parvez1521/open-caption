import type { MediaAssetKind } from "./mediaAssets";
import { isReversedAssetName } from "./segmentView";

/**
 * Derived-cache lifecycle for the device media bin (Phase 8, slice 8.2).
 *
 * THE STORAGE MAP this module is built on (verified in the code, 2026-11-10):
 * everything media-shaped lives in ONE place — the IndexedDB database
 * `captionseasy-videos` (v3), object store `assets`, keyed by asset id and
 * carrying `projectId` (mediaStore.ts). There is NO OPFS and NO server copy.
 * Two kinds of records share that store:
 *
 *   SOURCE media — files the user imported (useMediaAssets.importFiles).
 *   The project video itself is NOT here: it lives in the sibling `videos`
 *   store (features/upload/localVideos.ts), and its filmstrip / waveform
 *   (useFilmstrip / useWaveform) are in-memory Maps only — nothing persisted,
 *   nothing to clear.
 *
 *   DERIVED artifacts — produced on-device from a source, in the same store:
 *   - reversed conforms (segmentAssets.storeSegmentAsset): a whole new video
 *     record named `Reversed — <source>` (REVERSED_ASSET_PREFIX);
 *   - freeze-frame stills (segmentAssets via extractFramePng): an image
 *     record named `<base> — freeze at <ms>ms.png` (freezeAssetName);
 *   - noise-suppressed copies (audio/denoise.noiseSuppressedAssetRecord):
 *     an audio record named exactly `Noise-suppressed audio.wav`;
 *   - embedded previews INSIDE a record: the video `thumb` Blob and the
 *     audio `peaks` array written by mediaProbe at import. These are pure
 *     preview data — the bin/library tiles draw them, nothing in the mix,
 *     trim or export paths reads them — so they can be stripped without
 *     touching the record's own bytes.
 *
 * THE REFERENCED-ASSET RULE (evidence: compositionDoc.ts / settings.ts):
 * a derived record is NOT a disposable cache while a project's stored
 * composition references it — video segments carry `assetId` (a reversed
 * conform or a freeze still REPLACES the main source for that segment),
 * `composition.audio.noiseSuppressionAssetId` points the ONE mix plan at
 * the suppressed WAV, audio clips and image overlays carry `assetId` too.
 * Deleting a referenced record would silently orphan those segments.
 * So cleanup EXCLUDES every referenced derived record and names the kept
 * ones; it only deletes derived records nothing references (e.g. a reversed
 * copy whose segment was later removed, a suppressed WAV after suppression
 * was switched off — StudioPage clears the reference, not the asset).
 * When the caller cannot load a project's references at all, cleanup must
 * FAIL CLOSED (see the library page) rather than guess.
 *
 * This module is pure apart from the executor's injected store seam, so the
 * accounting / planning / execution rules are unit-tested without IndexedDB
 * (the repo has no IDB test double; mediaStore itself is the thin adapter).
 */

/** The exact name noiseSuppressedAssetRecord (audio/denoise.ts) stores under. */
export const NOISE_SUPPRESSED_ASSET_NAME = "Noise-suppressed audio.wav";

/** The freezeAssetName (segmentAssets.ts) shape: `<base> — freeze at <ms>ms.png`. */
const FREEZE_ASSET_NAME = / — freeze at \d+ms\.png$/;

export type DerivedKind = "reversed" | "freeze" | "noise-suppressed" | "previews";

export const DERIVED_KIND_LABELS: Record<DerivedKind, string> = {
  reversed: "Reversed copies",
  freeze: "Freeze-frame stills",
  "noise-suppressed": "Noise-suppressed copies",
  previews: "Previews (thumbnails & waveforms)",
};

/** The minimal record shape the lifecycle helpers need (a MediaAssetRecord satisfies it). */
export interface DerivedAssetLike {
  id: string;
  projectId: string;
  kind: MediaAssetKind;
  name: string;
  size: number;
  thumb?: Blob | null;
  peaks?: number[] | null;
}

/**
 * Classify a standalone derived RECORD by the producers' naming (the same
 * signal the timeline itself uses for reversed conforms — segmentView.ts
 * documents the name prefix as "the timeline's only signal"). The media
 * kind must also match the producer's kind, so a user's own imported file
 * that merely shares a name pattern is not misclassified. Null = source.
 */
export function classifyDerivedAsset(a: Pick<DerivedAssetLike, "kind" | "name">): Exclude<DerivedKind, "previews"> | null {
  if (a.kind === "video" && isReversedAssetName(a.name)) return "reversed";
  if (a.kind === "image" && FREEZE_ASSET_NAME.test(a.name)) return "freeze";
  if (a.kind === "audio" && a.name === NOISE_SUPPRESSED_ASSET_NAME) return "noise-suppressed";
  return null;
}

/**
 * Bytes of embedded preview data inside one record: the thumbnail Blob's
 * exact size plus the peaks array at its serialised size. (Structured-clone
 * storage overhead differs slightly; this is the honest, reproducible
 * accounting the UI quotes, not a filesystem measurement.)
 */
export function previewBytesOf(a: Pick<DerivedAssetLike, "thumb" | "peaks">): number {
  const thumb = a.thumb ? a.thumb.size : 0;
  const peaks = a.peaks && a.peaks.length > 0 ? JSON.stringify(a.peaks).length : 0;
  return thumb + peaks;
}

/** All derived bytes attributable to one record: a derived record's own bytes, plus any previews it carries. */
export function derivedBytesOf(a: DerivedAssetLike): number {
  return (classifyDerivedAsset(a) ? a.size : 0) + previewBytesOf(a);
}

export interface ProjectDerivedSummary {
  projectId: string;
  totalBytes: number;
  byKind: Record<DerivedKind, number>;
  /** standalone derived records (reversed / freeze / noise-suppressed) */
  derivedAssetCount: number;
  /** records carrying embedded previews (source or derived) */
  previewRecordCount: number;
}

export interface DerivedCacheSummary {
  totalBytes: number;
  byKind: Record<DerivedKind, number>;
  projects: ProjectDerivedSummary[];
}

const emptyByKind = (): Record<DerivedKind, number> => ({ reversed: 0, freeze: 0, "noise-suppressed": 0, previews: 0 });

/** Per-project derived-cache sizes plus the library-wide total. Projects sorted largest first. */
export function summarizeDerivedCache(assets: readonly DerivedAssetLike[]): DerivedCacheSummary {
  const byProject = new Map<string, ProjectDerivedSummary>();
  const byKind = emptyByKind();
  let totalBytes = 0;
  for (const a of assets) {
    const kind = classifyDerivedAsset(a);
    const previews = previewBytesOf(a);
    if (!kind && previews === 0) continue;
    let p = byProject.get(a.projectId);
    if (!p) {
      p = { projectId: a.projectId, totalBytes: 0, byKind: emptyByKind(), derivedAssetCount: 0, previewRecordCount: 0 };
      byProject.set(a.projectId, p);
    }
    if (kind) {
      p.byKind[kind] += a.size;
      byKind[kind] += a.size;
      p.totalBytes += a.size;
      totalBytes += a.size;
      p.derivedAssetCount += 1;
    }
    if (previews > 0) {
      p.byKind.previews += previews;
      byKind.previews += previews;
      p.totalBytes += previews;
      totalBytes += previews;
      p.previewRecordCount += 1;
    }
  }
  const projects = [...byProject.values()].sort((x, y) => y.totalBytes - x.totalBytes);
  return { totalBytes, byKind, projects };
}

/* ------------------------------------------------------------------ */
/* references                                                          */
/* ------------------------------------------------------------------ */

/** Structural view of the parts of a project's stored settings that can reference media-bin assets. */
export interface ProjectReferenceSource {
  composition?: {
    videoSegments?: readonly { assetId?: string | null }[] | null;
    audio?: {
      clips?: readonly { assetId?: string | null }[] | null;
      noiseSuppressionAssetId?: string | null;
    } | null;
  } | null;
  overlays?: readonly { assetId?: string | null }[] | null;
}

/**
 * Every media-bin asset id a project's stored composition / overlays reference:
 * segment assets (reversed conforms, freeze stills, placed segment media),
 * placed audio clips, the noise-suppression WAV, and image overlays.
 * Defensive about partial/legacy shapes — anything non-string is ignored.
 */
export function collectReferencedAssetIds(src: ProjectReferenceSource): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => { if (typeof v === "string" && v.length > 0) out.add(v); };
  for (const seg of src.composition?.videoSegments ?? []) add(seg?.assetId);
  for (const clip of src.composition?.audio?.clips ?? []) add(clip?.assetId);
  add(src.composition?.audio?.noiseSuppressionAssetId);
  for (const o of src.overlays ?? []) add(o?.assetId);
  return out;
}

/* ------------------------------------------------------------------ */
/* cleanup plan + executor                                             */
/* ------------------------------------------------------------------ */

export interface DerivedCleanupEntry {
  id: string;
  name: string;
  kind: Exclude<DerivedKind, "previews">;
  bytes: number;
}

export interface DerivedCleanupPlan {
  projectId: string;
  /** unreferenced derived records to DELETE (their preview bytes go with them) */
  deleteAssets: DerivedCleanupEntry[];
  /** derived records KEPT because the project's composition still references them — named, never silently skipped */
  keptReferenced: DerivedCleanupEntry[];
  /** records whose embedded previews are stripped in place (source records + kept referenced records); the records and their own bytes stay */
  stripPreviewAssetIds: string[];
  stripPreviewBytes: number;
  /** bytes the plan expects to free: deleted records (+ their previews) + stripped previews */
  expectedFreedBytes: number;
}

export function planDerivedCleanup(
  assets: readonly DerivedAssetLike[],
  projectId: string,
  referencedIds: ReadonlySet<string>,
): DerivedCleanupPlan {
  const plan: DerivedCleanupPlan = {
    projectId,
    deleteAssets: [],
    keptReferenced: [],
    stripPreviewAssetIds: [],
    stripPreviewBytes: 0,
    expectedFreedBytes: 0,
  };
  for (const a of assets) {
    if (a.projectId !== projectId) continue;
    const kind = classifyDerivedAsset(a);
    const previews = previewBytesOf(a);
    if (kind && !referencedIds.has(a.id)) {
      plan.deleteAssets.push({ id: a.id, name: a.name, kind, bytes: a.size });
      plan.expectedFreedBytes += a.size + previews;
      continue; // the record goes entirely — its previews are not also "stripped"
    }
    if (kind) plan.keptReferenced.push({ id: a.id, name: a.name, kind, bytes: a.size });
    if (previews > 0) {
      plan.stripPreviewAssetIds.push(a.id);
      plan.stripPreviewBytes += previews;
      plan.expectedFreedBytes += previews;
    }
  }
  return plan;
}

/** The store seam the executor runs against; mediaStore is the production adapter. */
export interface DerivedCacheStore<T extends DerivedAssetLike> {
  listAll(): Promise<T[]>;
  deleteAsset(id: string): Promise<void>;
  clearPreviews(id: string): Promise<void>;
}

export interface DerivedCleanupResult<T extends DerivedAssetLike> {
  plan: DerivedCleanupPlan;
  /** the project's derived bytes measured BEFORE the cleanup */
  beforeBytes: number;
  /** the project's derived bytes measured AFTER, from a fresh listing — the proof the storage was freed */
  afterBytes: number;
  /** before − after, as measured (never just the plan's expectation) */
  freedBytes: number;
  /** the fresh full listing after cleanup, for the caller to re-render from */
  remaining: T[];
}

/**
 * Clear ONE project's derived cache: delete its unreferenced derived records,
 * strip embedded previews from the records that stay, touch nothing else —
 * never a source record's own bytes, never another project. Re-lists and
 * re-measures afterwards so the reported freed bytes are measured, not hoped.
 */
export async function clearProjectDerivedCache<T extends DerivedAssetLike>(
  store: DerivedCacheStore<T>,
  projectId: string,
  referencedIds: ReadonlySet<string>,
): Promise<DerivedCleanupResult<T>> {
  const before = await store.listAll();
  const beforeBytes = summarizeDerivedCache(before).projects.find((p) => p.projectId === projectId)?.totalBytes ?? 0;
  const plan = planDerivedCleanup(before, projectId, referencedIds);
  for (const entry of plan.deleteAssets) await store.deleteAsset(entry.id);
  for (const id of plan.stripPreviewAssetIds) await store.clearPreviews(id);
  const remaining = await store.listAll();
  const afterBytes = summarizeDerivedCache(remaining).projects.find((p) => p.projectId === projectId)?.totalBytes ?? 0;
  return { plan, beforeBytes, afterBytes, freedBytes: Math.max(0, beforeBytes - afterBytes), remaining };
}
