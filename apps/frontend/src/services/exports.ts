import { apiClient } from "./api-client";
import type { GlobalExport } from "@/lib/workspace/exports";

export type { GlobalExport };

export const exportsService = {
  /** GET /exports — the signed-in user's exports across all projects, newest first. */
  async listExports(): Promise<GlobalExport[]> {
    return apiClient.get<GlobalExport[]>("/exports");
  },
  /** Fresh short-lived download URL for a ready export (server enforces ownership + expiry). */
  async downloadUrl(exportId: string): Promise<string> {
    return (await apiClient.get<{ url: string }>(`/exports/${exportId}/download`)).url;
  },
};
