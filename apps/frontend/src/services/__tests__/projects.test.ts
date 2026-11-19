import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

function mockFetch(): Mock {
  return fetch as unknown as Mock;
}

vi.mock("../auth", () => ({
  authService: { getToken: async () => "test-token" },
}));

import { projectsService } from "../projects";
import { NetworkUnavailableError } from "../api-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("projectsService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a project via POST /projects and maps the response", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          id: "p1",
          title: "My Project",
          description: null,
          status: null,
          thumbnail_url: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          deleted_at: null,
        },
      }, 201)
    );

    const project = await projectsService.createProject("My Project");

    expect(project.id).toBe("p1");
    expect(project.title).toBe("My Project");
    expect(project.status).toBe("CREATED"); // null status defaults to CREATED
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/projects"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns null from getProjectById on a 404 NOT_FOUND response", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({ success: false, data: null, error: { code: "NOT_FOUND", message: "Project not found." } }, 404)
    );

    const project = await projectsService.getProjectById("missing");
    expect(project).toBeNull();
  });

  it("surfaces a backend-unavailable network error distinctly", async () => {
    mockFetch().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(projectsService.getProjects()).rejects.toBeInstanceOf(NetworkUnavailableError);
  });

  it("getAllProjects pages past the 100-row cap until the server total is reached (MA-A4-001)", async () => {
    const page = (n: number, total: number) => ({
      success: true,
      data: Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        title: `Project ${i}`,
        description: null,
        status: null,
        thumbnail_url: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        deleted_at: null,
      })),
      meta: { total, limit: 100, offset: 0, org_ready: true },
    });
    mockFetch()
      .mockResolvedValueOnce(jsonResponse(page(100, 150)))
      .mockResolvedValueOnce(jsonResponse(page(50, 150)));

    const all = await projectsService.getAllProjects({ includeArchived: true });
    expect(all.projects).toHaveLength(150);
    expect(all.total).toBe(150);
    expect(mockFetch().mock.calls[1]?.[0]).toContain("offset=100");
  });
});
