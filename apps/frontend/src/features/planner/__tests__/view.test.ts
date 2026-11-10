import { describe, expect, it } from "vitest";
import type { PlannerCardBody } from "../model";
import {
  cardsByDate,
  countImportedFrom,
  formatHashtagsInput,
  parseHashtagsInput,
  sortCardsForDay,
  type PlannerCard,
} from "../view";

const body = (patch: Partial<PlannerCardBody> = {}): PlannerCardBody => ({
  version: 1,
  date: "2026-11-10",
  status: "planned",
  category: "Reel",
  platform: "instagram",
  caption: "",
  hashtags: [],
  ...patch,
});

const card = (id: string, title: string, patch: Partial<PlannerCardBody> = {}): PlannerCard => ({
  id,
  title,
  body: body(patch),
});

describe("parseHashtagsInput", () => {
  it("splits on commas and whitespace", () => {
    expect(parseHashtagsInput("tech, tools free")).toEqual(["#tech", "#tools", "#free"]);
    expect(parseHashtagsInput("tech,tools, free")).toEqual(["#tech", "#tools", "#free"]);
    expect(parseHashtagsInput("a\tb\nc")).toEqual(["#a", "#b", "#c"]);
  });

  it("normalises each token to the canonical stored form (one leading '#')", () => {
    expect(parseHashtagsInput("#tech #tools")).toEqual(["#tech", "#tools"]);
    expect(parseHashtagsInput("#tech,tools")).toEqual(["#tech", "#tools"]);
    expect(parseHashtagsInput("##tech")).toEqual(["#tech"]);
  });

  it("trims tokens and drops empties", () => {
    expect(parseHashtagsInput("  tech , , tools  ")).toEqual(["#tech", "#tools"]);
    expect(parseHashtagsInput("#")).toEqual([]);
  });

  it("returns [] for an empty or separator-only string", () => {
    expect(parseHashtagsInput("")).toEqual([]);
    expect(parseHashtagsInput("   ")).toEqual([]);
    expect(parseHashtagsInput(",,,")).toEqual([]);
  });

  it("dedupes preserving first-seen order, including '#' variants", () => {
    expect(parseHashtagsInput("tools tech tools")).toEqual(["#tools", "#tech"]);
    expect(parseHashtagsInput("#tech tech #tech")).toEqual(["#tech"]);
  });
});

describe("formatHashtagsInput", () => {
  it("joins stored tags with ', '", () => {
    expect(formatHashtagsInput(["#tech", "#tools"])).toBe("#tech, #tools");
    expect(formatHashtagsInput(["#solo"])).toBe("#solo");
    expect(formatHashtagsInput([])).toBe("");
  });

  it("round-trips through parseHashtagsInput", () => {
    const tags = ["#tech", "#free-tools", "#ai"];
    expect(parseHashtagsInput(formatHashtagsInput(tags))).toEqual(tags);
  });
});

describe("sortCardsForDay", () => {
  it("orders untimed cards first, then by time, then by title", () => {
    const cards = [
      card("1", "Evening post", { time: "18:30" }),
      card("2", "Zulu untimed"),
      card("3", "Morning post", { time: "09:00" }),
      card("4", "Alpha untimed"),
      card("5", "Also nine", { time: "09:00" }),
    ];
    expect(sortCardsForDay(cards).map((c) => c.id)).toEqual(["4", "2", "5", "3", "1"]);
  });

  it("does not mutate the input array", () => {
    const cards = [card("1", "B", { time: "10:00" }), card("2", "A")];
    const before = [...cards];
    sortCardsForDay(cards);
    expect(cards).toEqual(before);
  });

  it("returns [] for no cards", () => {
    expect(sortCardsForDay([])).toEqual([]);
  });
});

describe("cardsByDate", () => {
  it("groups cards under their date with chronologically ordered keys", () => {
    const grouped = cardsByDate([
      card("1", "Later", { date: "2026-11-12" }),
      card("2", "Earlier", { date: "2026-11-09" }),
      card("3", "Same day", { date: "2026-11-12", time: "08:00" }),
    ]);
    expect([...grouped.keys()]).toEqual(["2026-11-09", "2026-11-12"]);
    expect(grouped.get("2026-11-09")!.map((c) => c.id)).toEqual(["2"]);
    // Within the day: untimed ("Later") before the 08:00 card.
    expect(grouped.get("2026-11-12")!.map((c) => c.id)).toEqual(["1", "3"]);
  });

  it("returns an empty map for no cards", () => {
    expect(cardsByDate([]).size).toBe(0);
  });
});

describe("countImportedFrom", () => {
  it("counts only cards whose sourcePlanId matches", () => {
    const cards = [
      card("1", "A", { sourcePlanId: "plan-1" }),
      card("2", "B", { sourcePlanId: "plan-1" }),
      card("3", "C", { sourcePlanId: "plan-2" }),
      card("4", "D"),
    ];
    expect(countImportedFrom(cards, "plan-1")).toBe(2);
    expect(countImportedFrom(cards, "plan-2")).toBe(1);
    expect(countImportedFrom(cards, "plan-unknown")).toBe(0);
    expect(countImportedFrom([], "plan-1")).toBe(0);
  });
});
