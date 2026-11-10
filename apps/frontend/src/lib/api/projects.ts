import "server-only";

export const PROJECT_COLUMNS = "id, title, description, status, style, look_id, template_id, thumbnail_url, language, aspect_ratio, platform, created_at, updated_at, archived_at, composition_json";

/** Collapse legacy + v2 status strings into the five states the UI knows. */
export function normalizeStatus(s: string | null | undefined): "CREATED" | "UPLOADED" | "PROCESSING" | "COMPLETED" | "FAILED" {
  switch ((s ?? "").toUpperCase()) {
    case "UPLOADED":
    case "UPLOADING":
      return "UPLOADED";
    case "PROCESSING":
    case "RENDERING":
      return "PROCESSING";
    case "READY":
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
      return "FAILED";
    default:
      return "CREATED";
  }
}

/** The row is spread, so every selected column — including `composition_json` (Stage C) — passes through untouched; only the status is normalised. */
export const toApiProject = <T extends { status?: string | null }>(p: T) => ({ ...p, status: normalizeStatus(p.status) });
