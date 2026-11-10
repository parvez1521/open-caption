export interface GlobalExport {
  id: string;
  project_id: string;
  project_title: string | null;
  kind: string | null;
  status: string;
  file_size: number | null;
  resolution: string | null;
  created_at: string;
  expires_at: string | null;
}

/** An export is expired when the server marked it expired, or its retention window has passed. */
export function isExportExpired(exp: Pick<GlobalExport, "status" | "expires_at">, now: Date = new Date()): boolean {
  if (exp.status === "expired") return true;
  return !!exp.expires_at && new Date(exp.expires_at).getTime() <= now.getTime();
}

/** Download is only offered for ready exports that have not expired (mirrors /api/v1/exports/[id]/download). */
export function canDownloadExport(exp: Pick<GlobalExport, "status" | "expires_at">, now: Date = new Date()): boolean {
  return exp.status === "ready" && !isExportExpired(exp, now);
}

export function exportStatusLabel(exp: Pick<GlobalExport, "status" | "expires_at">, now: Date = new Date()): string {
  if (isExportExpired(exp, now)) return "expired";
  switch (exp.status) {
    case "ready": return "ready";
    case "queued": return "queued";
    case "rendering": return "rendering";
    case "failed": return "failed";
    case "cancelled": return "cancelled";
    default: return exp.status;
  }
}

// ---------------------------------------------------------------------------
// History filters + honest re-download state (Phase 8 slice 8.3).
//
// How downloads actually work today (app/api/v1/exports/[id]/download):
// export rows do NOT store a signed URL. The row stores `storage_path` +
// `expires_at` (the retention deadline); each Download click asks the
// server for a FRESH 600-second signed URL, and the server refuses once
// the export is expired or not ready. So "re-download" is honest exactly
// while canDownloadExport holds; past expiry there is no file to fetch
// and the only truthful action is to export again from the project.
// ---------------------------------------------------------------------------

export type ExportDownloadState = "downloadable" | "expired" | "not-ready";

/** The one decision the history row renders from: fresh link, plainly expired, or still/finally not ready. */
export function exportDownloadState(exp: Pick<GlobalExport, "status" | "expires_at">, now: Date = new Date()): ExportDownloadState {
  if (canDownloadExport(exp, now)) return "downloadable";
  if (isExportExpired(exp, now)) return "expired";
  return "not-ready";
}

export interface ExportFilters {
  /** Export kind (mp4, srt, …), case-insensitive; null/"" = any. */
  kind?: string | null;
  /** Effective status label (ready | expired | queued | rendering | failed | cancelled); null/"" = any. */
  status?: string | null;
  /** Inclusive created_at range bounds (ISO dates or datetimes); null = open-ended. */
  from?: string | null;
  to?: string | null;
}

/** Pure filter for the exports history: kind, effective status, and created-date range, as the stored data supports. */
export function filterExports(exports: GlobalExport[], filters: ExportFilters, now: Date = new Date()): GlobalExport[] {
  const kind = filters.kind?.trim().toLowerCase() || null;
  const status = filters.status?.trim().toLowerCase() || null;
  const fromMs = filters.from ? new Date(filters.from).getTime() : null;
  // A date-only `to` bound means "through that whole day", not midnight at its start.
  const toMs = filters.to ? new Date(filters.to).getTime() + (/^\d{4}-\d{2}-\d{2}$/.test(filters.to.trim()) ? 86_399_999 : 0) : null;
  return exports.filter((exp) => {
    if (kind && (exp.kind ?? "").toLowerCase() !== kind) return false;
    if (status && exportStatusLabel(exp, now) !== status) return false;
    const created = new Date(exp.created_at).getTime();
    if (fromMs !== null && Number.isFinite(fromMs) && created < fromMs) return false;
    if (toMs !== null && Number.isFinite(toMs) && created > toMs) return false;
    return true;
  });
}

/** Distinct export kinds present in the history, sorted — the kind filter's options come from the data itself. */
export function distinctExportKinds(exports: GlobalExport[]): string[] {
  return [...new Set(exports.map((e) => e.kind).filter((k): k is string => !!k))].sort((a, b) => a.localeCompare(b));
}
