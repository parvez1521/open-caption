import type { MediaAssetKind } from "./mediaAssets";

/**
 * Media Library helpers (pure): search / filter / display formatting for the cross-project view
 * of the device media bin. Kept free of DOM, IndexedDB and React so the behaviour is unit-tested;
 * the page does the loading (mediaStore.listAllAssets) and the rendering.
 */

export type LibraryKindFilter = "all" | MediaAssetKind;

export const LIBRARY_FILTERS: { id: LibraryKindFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "image", label: "Image" },
];

/** The minimal asset shape the library helpers need (a MediaAssetRecord satisfies it). */
export interface LibraryAssetLike {
  name: string;
  kind: MediaAssetKind;
}

export function filterLibraryAssets<T extends LibraryAssetLike>(assets: T[], query: string, filter: LibraryKindFilter): T[] {
  const q = query.trim().toLowerCase();
  return assets.filter((a) => {
    if (filter !== "all" && a.kind !== filter) return false;
    if (q && !a.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function countByKind(assets: LibraryAssetLike[]): Record<LibraryKindFilter, number> {
  const counts: Record<LibraryKindFilter, number> = { all: assets.length, video: 0, audio: 0, image: 0 };
  for (const a of assets) counts[a.kind] += 1;
  return counts;
}

/** "1:05" / "12:00:07" for a known duration; "—" when unknown (audio/video only — images pass null). */
export function formatDurationMs(durationMs: number | null | undefined): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return "—";
  const s = Math.round(durationMs / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "1080 × 1920" when both dimensions are known, "—" otherwise. */
export function formatDimensions(width: number | null | undefined, height: number | null | undefined): string {
  return width && height ? `${width} × ${height}` : "—";
}

/** Resolve an asset's project title; a graceful, honest fallback when the project can't be found. */
export function projectTitleFor(projectId: string, titles: Map<string, string>): string {
  return titles.get(projectId) ?? "Unknown project";
}
