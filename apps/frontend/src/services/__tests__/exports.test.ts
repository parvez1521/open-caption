import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

vi.mock("../auth", () => ({ authService: { getToken: async () => "test-token" } }));

import { exportsService } from "../exports";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("exportsService", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("lists global exports via GET /exports", async () => {
    (fetch as unknown as Mock).mockResolvedValueOnce(jsonResponse({
      success: true,
      data: [{ id: "e1", project_id: "p1", project_title: "Hook cut", kind: "mp4", status: "ready", file_size: 10, resolution: "1080x1920", created_at: "2026-01-01T00:00:00Z", expires_at: null }],
    }));
    const rows = await exportsService.listExports();
    expect(rows[0]?.project_title).toBe("Hook cut");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/exports"), expect.anything());
  });

  it("fetches a download URL for one export", async () => {
    (fetch as unknown as Mock).mockResolvedValueOnce(jsonResponse({ success: true, data: { url: "https://example.test/file.mp4" } }));
    await expect(exportsService.downloadUrl("e1")).resolves.toContain("file.mp4");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/exports/e1/download"), expect.anything());
  });
});
