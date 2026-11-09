import { describe, it, expect } from "vitest";
import { filterProjects, countByView } from "../projects-filter";
import type { Project } from "@/services/types";

const p = (id: string, title: string, archived_at?: string): Project => ({
  id, title, status: "CREATED", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", archived_at,
});

const list = [p("1", "Podcast Hook"), p("2", "podcast outtakes", "2026-01-02T00:00:00Z"), p("3", "Reel Draft")];

describe("filterProjects", () => {
  it("filters by title case-insensitively", () => {
    expect(filterProjects(list, "PODCAST", "all").map((x) => x.id)).toEqual(["1", "2"]);
  });
  it("active view hides archived, archived view shows only archived", () => {
    expect(filterProjects(list, "", "active").map((x) => x.id)).toEqual(["1", "3"]);
    expect(filterProjects(list, "", "archived").map((x) => x.id)).toEqual(["2"]);
  });
  it("combines search and view, trims the query", () => {
    expect(filterProjects(list, "  podcast ", "archived").map((x) => x.id)).toEqual(["2"]);
    expect(filterProjects(list, "zzz", "all")).toEqual([]);
  });
  it("counts by view", () => {
    expect(countByView(list)).toEqual({ active: 2, archived: 1, all: 3 });
  });
});
