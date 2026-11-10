import { describe, expect, it } from "vitest";
import type { WeeklyPlanBody } from "@/features/growth/plan";
import {
  PLANNER_CATEGORIES,
  PLANNER_PLATFORMS,
  PLANNER_STATUSES,
  buildCopyPack,
  buildPostPreview,
  computeReminders,
  emptyCardBody,
  importWeeklyPlan,
  moveCardToDate,
  planDrop,
  readPlannerCard,
  type PlannerCardBody,
} from "../model";

const body = (over: Partial<PlannerCardBody> = {}): PlannerCardBody => ({
  version: 1,
  date: "2026-11-12",
  time: "18:00",
  status: "planned",
  category: "Reel",
  platform: "instagram",
  caption: "My caption",
  hashtags: ["#tech"],
  ...over,
});

describe("constants", () => {
  it("lists the five platforms and three statuses with labels", () => {
    expect(PLANNER_PLATFORMS.map((p) => p.id)).toEqual(["instagram", "youtube", "linkedin", "x", "facebook"]);
    expect(PLANNER_PLATFORMS.map((p) => p.label)).toEqual(["Instagram", "YouTube", "LinkedIn", "X", "Facebook"]);
    expect(PLANNER_STATUSES.map((s) => s.id)).toEqual(["draft", "planned", "published"]);
    expect(PLANNER_CATEGORIES).toContain("Reel");
  });
});

describe("readPlannerCard", () => {
  it("round-trips a well-formed body", () => {
    const original = body({ scriptItemId: "s1", projectId: "p1", sourcePlanId: "plan-1", timeBasis: "basis" });
    expect(readPlannerCard(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });
  it("rejects structural garbage", () => {
    expect(readPlannerCard(null)).toBeNull();
    expect(readPlannerCard("card")).toBeNull();
    expect(readPlannerCard([])).toBeNull();
    expect(readPlannerCard({})).toBeNull();
    expect(readPlannerCard({ ...body(), version: 2 })).toBeNull();
    expect(readPlannerCard({ ...body(), date: "2026-02-30" })).toBeNull();
    expect(readPlannerCard({ ...body(), date: "12 Nov 2026" })).toBeNull();
    expect(readPlannerCard({ ...body(), caption: 42 })).toBeNull();
    expect(readPlannerCard({ ...body(), hashtags: "#tech" })).toBeNull();
  });
  it("rejects an unknown status or platform", () => {
    expect(readPlannerCard({ ...body(), status: "scheduled" })).toBeNull();
    expect(readPlannerCard({ ...body(), platform: "tiktok" })).toBeNull();
  });
  it("normalises hashtags: strings only, trimmed, empties dropped", () => {
    const read = readPlannerCard({ ...body(), hashtags: ["  #a ", "", "   ", 42, null, "#b"] });
    expect(read?.hashtags).toEqual(["#a", "#b"]);
  });
  it("drops non-string optional fields instead of failing", () => {
    const read = readPlannerCard({ ...body(), time: 18, projectId: 7 });
    expect(read).not.toBeNull();
    expect(read?.time).toBeUndefined();
    expect(read?.projectId).toBeUndefined();
  });
});

describe("emptyCardBody", () => {
  it("creates a draft Instagram card for the given date", () => {
    expect(emptyCardBody("2026-11-15")).toEqual({
      version: 1,
      date: "2026-11-15",
      status: "draft",
      category: "",
      platform: "instagram",
      caption: "",
      hashtags: [],
    });
  });
});

describe("moveCardToDate", () => {
  it("changes only the date and does not mutate the input", () => {
    const original = body();
    const moved = moveCardToDate(original, "2026-11-20");
    expect(moved.date).toBe("2026-11-20");
    expect({ ...moved, date: original.date }).toEqual(original);
    expect(original.date).toBe("2026-11-12");
  });
});

describe("planDrop", () => {
  const cards = [
    { id: "a", body: body({ date: "2026-11-12" }) },
    { id: "b", body: body({ date: "2026-11-13", caption: "Other" }) },
  ];
  it("returns null for an unknown card", () => {
    expect(planDrop(cards, "missing", "2026-11-14")).toBeNull();
  });
  it("returns null when the card is already on the target date", () => {
    expect(planDrop(cards, "a", "2026-11-12")).toBeNull();
  });
  it("returns the single patch for a real move", () => {
    const drop = planDrop(cards, "b", "2026-11-14");
    expect(drop?.itemId).toBe("b");
    expect(drop?.body.date).toBe("2026-11-14");
    expect(drop?.body.caption).toBe("Other");
    expect(cards[1]!.body.date).toBe("2026-11-13"); // inputs untouched
  });
});

describe("computeReminders", () => {
  const today = "2026-11-10";
  const card = (id: string, over: Partial<PlannerCardBody>) => ({ id, title: `Card ${id}`, body: body(over) });
  it("flags overdue and today's draft/planned cards, overdue first by date, and never published cards", () => {
    const reminders = computeReminders(
      [
        card("today-1", { date: "2026-11-10", status: "planned" }),
        card("late-newer", { date: "2026-11-09", status: "draft" }),
        card("published-late", { date: "2026-11-01", status: "published" }),
        card("late-older", { date: "2026-11-05", status: "planned" }),
        card("future", { date: "2026-11-11", status: "draft" }),
        card("today-2", { date: "2026-11-10", status: "draft" }),
      ],
      today,
    );
    expect(reminders.map((r) => r.itemId)).toEqual(["late-older", "late-newer", "today-1", "today-2"]);
    expect(reminders.map((r) => r.kind)).toEqual(["overdue", "overdue", "today", "today"]);
    expect(reminders[0]).toEqual({
      itemId: "late-older",
      title: "Card late-older",
      date: "2026-11-05",
      status: "planned",
      kind: "overdue",
    });
  });
  it("returns [] when nothing is due", () => {
    expect(computeReminders([card("f", { date: "2026-12-01", status: "draft" })], today)).toEqual([]);
    expect(computeReminders([], today)).toEqual([]);
  });
});

const weeklyPlanFixture: WeeklyPlanBody = {
  version: 1,
  weekStart: "2026-11-16",
  generatedAt: "2026-11-10T10:00:00.000Z",
  source: "template",
  fellBack: false,
  recommendations: [],
  days: [
    {
      date: "2026-11-16",
      items: [
        { title: "Launch reel", detail: "Caption for the launch reel", suggestedTime: "18:00", timeBasis: "Your posts at 18:00 averaged 80 engagement across 2 posts" },
      ],
    },
    { date: "2026-11-17", items: [] },
    {
      date: "2026-11-18",
      items: [{ title: "Teaser short" }, { title: "Carousel post", detail: "Carousel caption" }],
    },
    { date: "2026-11-19", items: [] },
    { date: "2026-11-20", items: [] },
    { date: "2026-11-21", items: [] },
    { date: "2026-11-22", items: [] },
  ],
  reportSnapshot: { postsAnalysed: 3, sourceMix: { manual: 3, csv: 0 }, bestHours: [] },
};

describe("importWeeklyPlan", () => {
  it("creates one planned draft per (day, item) on the exact day dates, carrying suggested time + basis", () => {
    const drafts = importWeeklyPlan("plan-item-1", weeklyPlanFixture);
    expect(drafts.map((d) => d.title)).toEqual(["Launch reel", "Teaser short", "Carousel post"]);
    expect(drafts.map((d) => d.body.date)).toEqual(["2026-11-16", "2026-11-18", "2026-11-18"]);
    expect(drafts[0]!.body).toEqual({
      version: 1,
      date: "2026-11-16",
      time: "18:00",
      timeBasis: "Your posts at 18:00 averaged 80 engagement across 2 posts",
      status: "planned",
      category: "",
      platform: "instagram",
      caption: "Caption for the launch reel",
      hashtags: [],
      sourcePlanId: "plan-item-1",
    });
  });
  it("produces no drafts for empty days and defaults caption/time when the item has none", () => {
    const drafts = importWeeklyPlan("plan-item-1", weeklyPlanFixture);
    expect(drafts).toHaveLength(3); // 4 of the 7 days are empty and yield nothing
    const teaser = drafts[1]!;
    expect(teaser.body.caption).toBe("");
    expect(teaser.body.time).toBeUndefined();
    expect(teaser.body.timeBasis).toBeUndefined();
    expect(teaser.body.sourcePlanId).toBe("plan-item-1");
  });
  it("imports an all-empty plan as zero drafts (never invents cards)", () => {
    const empty: WeeklyPlanBody = {
      ...weeklyPlanFixture,
      days: weeklyPlanFixture.days.map((d) => ({ date: d.date, items: [] })),
    };
    expect(importWeeklyPlan("plan-item-1", empty)).toEqual([]);
  });
});

describe("buildPostPreview", () => {
  it("previews an Instagram card with its own caption", () => {
    const preview = buildPostPreview({ title: "Launch", body: body() }, { projectTitle: "Launch Project" });
    expect(preview).toEqual({
      platform: "instagram",
      platformLabel: "Instagram",
      heading: "Launch",
      text: "My caption",
      hashtagsLine: "#tech",
      charCount: ("My caption" + "#tech").length,
      charLimit: null,
      overLimit: false,
      mediaNote: "Video: Launch Project",
    });
  });
  it("falls back to the attached caption text when the card caption is empty", () => {
    const preview = buildPostPreview(
      { title: "Launch", body: body({ caption: "" }) },
      { attachedCaptionText: "Attached caption" },
    );
    expect(preview.text).toBe("Attached caption");
    const noFallback = buildPostPreview({ title: "Launch", body: body({ caption: "" }) });
    expect(noFallback.text).toBe("");
    expect(noFallback.mediaNote).toBe("No video project attached");
  });
  it("enforces the 280-character limit on X, counting text + hashtags", () => {
    const long = buildPostPreview({ title: "Post", body: body({ platform: "x", caption: "a".repeat(300), hashtags: [] }) });
    expect(long.charLimit).toBe(280);
    expect(long.charCount).toBe(300);
    expect(long.overLimit).toBe(true);

    const exact = buildPostPreview({
      title: "Post",
      body: body({ platform: "x", caption: "a".repeat(270), hashtags: ["#one", "#two"] }),
    });
    expect(exact.hashtagsLine).toBe("#one #two");
    expect(exact.charCount).toBe(270 + "#one #two".length);
    expect(exact.overLimit).toBe(false);
  });
  it("uses the title as the heading on YouTube too", () => {
    const preview = buildPostPreview({ title: "My Video", body: body({ platform: "youtube" }) });
    expect(preview.heading).toBe("My Video");
    expect(preview.platformLabel).toBe("YouTube");
    expect(preview.charLimit).toBeNull();
  });
});

describe("buildCopyPack", () => {
  it("composes caption + blank line + hashtags, with the project video note", () => {
    const pack = buildCopyPack(
      { title: "Launch", body: body({ hashtags: ["#tech", "#ai"] }) },
      { projectTitle: "Launch Project" },
    );
    expect(pack.copyText).toBe("My caption\n\n#tech #ai");
    expect(pack.videoNote).toBe('Attach the exported video from the project "Launch Project" when you post.');
  });
  it("omits the hashtag block when there are no hashtags and notes a missing project", () => {
    const pack = buildCopyPack({ title: "Launch", body: body({ hashtags: [] }) });
    expect(pack.copyText).toBe("My caption");
    expect(pack.videoNote).toBe("No video project is attached to this card.");
  });
  it("falls back to the attached caption text", () => {
    const pack = buildCopyPack(
      { title: "Launch", body: body({ caption: "", hashtags: [] }) },
      { attachedCaptionText: "Attached caption" },
    );
    expect(pack.copyText).toBe("Attached caption");
  });
});
