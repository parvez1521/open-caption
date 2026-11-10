import { describe, it, expect } from "vitest";
import { filterProjects, countByView, distinctFolders, distinctTags, matchesOrgFilter } from "../projects-filter";
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

describe("filterProjects — A15 folder/tag filter", () => {
  const org = (id: string, title: string, folder?: string | null, tags?: string[]): Project => ({
    ...p(id, title),
    folder: folder ?? null,
    tags: tags ?? [],
  });
  const orgList = [
    org("1", "Ep 1", "Podcast", ["hook", "client"]),
    org("2", "Ep 2", "Podcast", ["client"]),
    org("3", "Loose", null, ["Hook"]),
    org("4", "Bare"),
  ];

  it("filters by folder label", () => {
    expect(filterProjects(orgList, "", "all", { folder: "Podcast" }).map((x) => x.id)).toEqual(["1", "2"]);
  });
  it("the unfiled sentinel matches folder null AND folder absent", () => {
    expect(filterProjects(orgList, "", "all", { folder: "unfiled" }).map((x) => x.id)).toEqual(["3", "4"]);
  });
  it("filters by tag case-insensitively", () => {
    expect(filterProjects(orgList, "", "all", { tag: "hook" }).map((x) => x.id)).toEqual(["1", "3"]);
  });
  it("combines folder + tag + search + view", () => {
    expect(filterProjects(orgList, "ep", "all", { folder: "Podcast", tag: "hook" }).map((x) => x.id)).toEqual(["1"]);
    expect(filterProjects(orgList, "", "all", {}).map((x) => x.id)).toEqual(["1", "2", "3", "4"]);
    expect(matchesOrgFilter(orgList[3]!)).toBe(true);
  });
  it("distinct folders/tags come from the data, sorted, deduped", () => {
    expect(distinctFolders(orgList)).toEqual(["Podcast"]);
    expect(distinctTags(orgList)).toEqual(["client", "hook"]);
  });
});
