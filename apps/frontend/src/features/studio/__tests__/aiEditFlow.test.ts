import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_EDIT_BLANK_TITLE,
  aiEditTimelineUrl,
  clearAiEditProject,
  createBlankAiEditProject,
  filterAiEditProjects,
  filterCaptionProjects,
  isAiEditProject,
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

describe("project separation", () => {
  const projects = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
  const isAiEdit = (id: string) => id === "p2";

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
});
