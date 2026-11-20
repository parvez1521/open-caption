import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_EDIT_BLANK_TITLE,
  AI_EDIT_PROJECT_TAG,
  aiEditTimelineUrl,
  clearAiEditProject,
  createBlankAiEditProject,
  filterAiEditProjects,
  filterCaptionProjects,
  hasAiEditTag,
  isAiEditProject,
  isAiEditProjectRecord,
  markAiEditProject,
} from "../aiEditFlow";

afterEach(() => {
  for (const id of ["p1", "p2", "p3"]) clearAiEditProject(id);
});

describe("createBlankAiEditProject", () => {
  it("creates a real project, flags it AI-Edit, and opens the Studio timeline — with no caption work attached", async () => {
    const createProject = vi.fn(async (title: string) => ({ id: "p1", title }));
    const out = await createBlankAiEditProject({ createProject });
    expect(createProject).toHaveBeenCalledWith(AI_EDIT_BLANK_TITLE);
    expect(out).toEqual({ id: "p1", title: AI_EDIT_BLANK_TITLE, timelineUrl: "/projects/p1" });
    expect(isAiEditProject("p1")).toBe(true);
    expect(aiEditTimelineUrl("p1")).toBe("/projects/p1");
  });

  it("tags the project on the server so it lists under AI Edit on any device", async () => {
    const createProject = vi.fn(async (title: string) => ({ id: "p1", title }));
    const tagProject = vi.fn(async () => undefined);
    await createBlankAiEditProject({ createProject, tagProject });
    expect(tagProject).toHaveBeenCalledWith("p1", [AI_EDIT_PROJECT_TAG]);
    expect(tagProject).toHaveBeenCalledTimes(1);
  });

  it("creation still succeeds — and the local flag still holds — when the tag write fails", async () => {
    const createProject = vi.fn(async (title: string) => ({ id: "p1", title }));
    const tagProject = vi.fn(async () => { throw new Error("tags not set up yet"); });
    const out = await createBlankAiEditProject({ createProject, tagProject });
    expect(out.id).toBe("p1");
    expect(isAiEditProject("p1")).toBe(true);
  });

  it("uses the caller's title when given, falling back to the blank title for a blank one", async () => {
    const createProject = vi.fn(async (title: string) => ({ id: "p2", title }));
    await createBlankAiEditProject({ createProject }, "  My edit  ");
    expect(createProject).toHaveBeenCalledWith("My edit");
    await createBlankAiEditProject({ createProject }, "   ");
    expect(createProject).toHaveBeenLastCalledWith(AI_EDIT_BLANK_TITLE);
  });

  it("an unflagged project is not an AI-Edit project", () => {
    expect(isAiEditProject("p3")).toBe(false);
    markAiEditProject("p3");
    expect(isAiEditProject("p3")).toBe(true);
    clearAiEditProject("p3");
    expect(isAiEditProject("p3")).toBe(false);
  });
});

describe("server tag flag", () => {
  it("hasAiEditTag matches the tag, case-insensitively, and is null-safe", () => {
    expect(hasAiEditTag(["ai-edit"])).toBe(true);
    expect(hasAiEditTag(["AI-Edit", "hook"])).toBe(true);
    expect(hasAiEditTag(["hook"])).toBe(false);
    expect(hasAiEditTag([])).toBe(false);
    expect(hasAiEditTag(null)).toBe(false);
    expect(hasAiEditTag(undefined)).toBe(false);
  });

  it("a tagged project is AI Edit even with no local flag — the cross-device case", () => {
    expect(isAiEditProjectRecord({ id: "p1", tags: ["ai-edit"] })).toBe(true);
    expect(isAiEditProject("p1")).toBe(false);
  });

  it("an untagged, unflagged project is not AI Edit", () => {
    expect(isAiEditProjectRecord({ id: "p1", tags: ["hook"] })).toBe(false);
    expect(isAiEditProjectRecord({ id: "p1" })).toBe(false);
  });
});

describe("project separation", () => {
  const projects = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
  const isAiEdit = (project: { id: string }) => project.id === "p2";

  it("the AI Edit list holds ONLY AI-Edit projects — caption projects never appear in it", () => {
    expect(filterAiEditProjects(projects, isAiEdit)).toEqual([{ id: "p2" }]);
  });

  it("caption lists hold everything EXCEPT AI-Edit projects", () => {
    expect(filterCaptionProjects(projects, isAiEdit)).toEqual([{ id: "p1" }, { id: "p3" }]);
  });

  it("no project appears in both lists", () => {
    const aiEdit = new Set(filterAiEditProjects(projects, isAiEdit).map((p) => p.id));
    const captions = filterCaptionProjects(projects, isAiEdit);
    expect(captions.every((p) => !aiEdit.has(p.id))).toBe(true);
    expect(aiEdit.size + captions.length).toBe(projects.length);
  });

  it("by default the lists use the record flag — local flag OR server tag", () => {
    markAiEditProject("p1");
    const tagged = [{ id: "p1" }, { id: "p2", tags: ["ai-edit"] }, { id: "p3", tags: ["hook"] }];
    expect(filterAiEditProjects(tagged)).toEqual([{ id: "p1" }, { id: "p2", tags: ["ai-edit"] }]);
    expect(filterCaptionProjects(tagged)).toEqual([{ id: "p3", tags: ["hook"] }]);
  });
});
