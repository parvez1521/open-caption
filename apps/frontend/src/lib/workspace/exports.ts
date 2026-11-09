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
