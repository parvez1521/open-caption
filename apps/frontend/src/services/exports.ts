import { apiClient } from "./api-client";
import type { GlobalExport } from "@/lib/workspace/exports";

export type { GlobalExport };

export const exportsService = {
  /** GET /exports — the signed-in user's exports across all projects, newest first. */
  async listExports(): Promise<GlobalExport[]> {
    return (await this.listExportsPage({ limit: 100, offset: 0 })).exports;
  },
  /**
   * MA-A4-001: one page of the exports history with the server's total, so
   * the page can offer Load more instead of silently capping at 100 rows.
   */
  async listExportsPage(opts?: { limit?: number; offset?: number }): Promise<{ exports: GlobalExport[]; total: number }> {
    const params = new URLSearchParams();
    params.set("limit", String(opts?.limit ?? 100));
    params.set("offset", String(opts?.offset ?? 0));
    const { data, meta } = await apiClient.getWithMeta<GlobalExport[]>(`/exports?${params.toString()}`);
    return { exports: data, total: (meta.total as number) ?? data.length };
  },
  /** Fresh short-lived download URL for a ready export (server enforces ownership + expiry). */
  async downloadUrl(exportId: string): Promise<string> {
    return (await apiClient.get<{ url: string }>(`/exports/${exportId}/download`)).url;
  },
};
