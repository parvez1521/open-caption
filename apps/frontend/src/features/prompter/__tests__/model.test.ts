import { describe, expect, it } from "vitest";
import {
  COUNTDOWN_OPTIONS,
  DEFAULT_PROMPTER_SETTINGS,
  FONT,
  NUDGE_PX,
  PROMPTER_SHORTCUTS,
  SPEAKING_WPM,
  SPEED,
  advanceOffset,
  clampOffset,
  clampSettings,
  estimatedReadSeconds,
  estimatedSecondsRemaining,
  keyActionFor,
  maxScrollOffset,
  prompterTextForScriptItem,
  scrollProgress,
  wordCount,
  type PrompterSettings,
} from "../model";
import type { ContentItem } from "@/features/create/library";
import { scriptDocFromBody } from "@/features/create/libraryMigration";
import { generateScript, scriptToText } from "@/features/create/scripts";

/**
 * Teleprompter model (7.2): settings clamping, scroll maths, keyboard map
 * and the Script Studio import. The import invariant is verbatim fidelity —
 * the prompter text must be exactly scriptToText(scriptDocFromBody(body)).
 */

const settings = (patch: Partial<PrompterSettings> = {}): PrompterSettings => ({
  ...DEFAULT_PROMPTER_SETTINGS,
  ...patch,
});

const contentItem = (patch: Partial<ContentItem> = {}): ContentItem => ({
  id: "item-1",
  kind: "script",
  title: "A script",
  body: {},
  source: "template",
  folder: null,
  projectId: null,
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
  ...patch,
});

describe("defaults and ranges", () => {
  it("pins the documented defaults and ranges", () => {
    expect(DEFAULT_PROMPTER_SETTINGS).toEqual({
      speedPxPerSec: 40,
      fontSizePx: 40,
      position: "center",
      mirror: false,
      countdownSec: 3,
    });
    expect(SPEED).toEqual({ min: 5, max: 200, step: 5 });
    expect(FONT).toEqual({ min: 20, max: 96, step: 2 });
    expect(COUNTDOWN_OPTIONS).toEqual([0, 3, 5, 10]);
    expect(NUDGE_PX).toBe(120);
    expect(SPEAKING_WPM).toBe(150);
  });
});

describe("clampSettings", () => {
  it("returns the defaults for empty / missing input", () => {
    expect(clampSettings(undefined)).toEqual(DEFAULT_PROMPTER_SETTINGS);
    expect(clampSettings(null)).toEqual(DEFAULT_PROMPTER_SETTINGS);
    expect(clampSettings({})).toEqual(DEFAULT_PROMPTER_SETTINGS);
  });

  it("passes valid settings through unchanged", () => {
    const valid = settings({ speedPxPerSec: 85, fontSizePx: 64, position: "left", mirror: true, countdownSec: 5 });
    expect(clampSettings(valid)).toEqual(valid);
  });

  it("clamps out-of-range speed and font into range", () => {
    expect(clampSettings({ speedPxPerSec: 0 }).speedPxPerSec).toBe(SPEED.min);
    expect(clampSettings({ speedPxPerSec: 9999 }).speedPxPerSec).toBe(SPEED.max);
    expect(clampSettings({ fontSizePx: 4 }).fontSizePx).toBe(FONT.min);
    expect(clampSettings({ fontSizePx: 400 }).fontSizePx).toBe(FONT.max);
  });

  it("falls back to defaults for non-finite numbers", () => {
    expect(clampSettings({ speedPxPerSec: Number.NaN }).speedPxPerSec).toBe(DEFAULT_PROMPTER_SETTINGS.speedPxPerSec);
    expect(clampSettings({ fontSizePx: Number.POSITIVE_INFINITY }).fontSizePx).toBe(DEFAULT_PROMPTER_SETTINGS.fontSizePx);
  });

  it("validates position against the allowed set", () => {
    expect(clampSettings({ position: "right" }).position).toBe("right");
    expect(clampSettings({ position: "middle" as never }).position).toBe("center");
    expect(clampSettings({ position: undefined }).position).toBe("center");
  });

  it("snaps countdown to the nearest allowed option", () => {
    expect(clampSettings({ countdownSec: 0 }).countdownSec).toBe(0);
    expect(clampSettings({ countdownSec: 2 }).countdownSec).toBe(3);
    expect(clampSettings({ countdownSec: 4 }).countdownSec).toBe(3); // tie 3/5 → lower
    expect(clampSettings({ countdownSec: 6 }).countdownSec).toBe(5);
    expect(clampSettings({ countdownSec: 8 }).countdownSec).toBe(10);
    expect(clampSettings({ countdownSec: 60 }).countdownSec).toBe(10);
    expect(clampSettings({ countdownSec: -3 }).countdownSec).toBe(0);
  });

  it("coerces mirror to a strict boolean", () => {
    expect(clampSettings({ mirror: true }).mirror).toBe(true);
    expect(clampSettings({ mirror: "yes" as never }).mirror).toBe(false);
  });
});

describe("scroll maths", () => {
  it("maxScrollOffset is the overflow, floored at 0", () => {
    expect(maxScrollOffset(1000, 400)).toBe(600);
    expect(maxScrollOffset(400, 400)).toBe(0);
    expect(maxScrollOffset(300, 400)).toBe(0);
    expect(maxScrollOffset(0, 0)).toBe(0);
  });

  it("advanceOffset moves at speed * elapsed only when playing", () => {
    const s = settings({ speedPxPerSec: 40 });
    expect(advanceOffset(100, 1000, s, true)).toBe(140);
    expect(advanceOffset(100, 250, s, true)).toBe(110);
    expect(advanceOffset(100, 1000, s, false)).toBe(100);
    expect(advanceOffset(100, 0, s, true)).toBe(100);
  });

  it("advanceOffset is not clamped — overshoot is the caller's finish signal", () => {
    expect(advanceOffset(590, 1000, settings({ speedPxPerSec: 40 }), true)).toBe(630);
  });

  it("clampOffset bounds to [0, maxScrollOffset]", () => {
    expect(clampOffset(-50, 1000, 400)).toBe(0);
    expect(clampOffset(250, 1000, 400)).toBe(250);
    expect(clampOffset(9999, 1000, 400)).toBe(600);
    expect(clampOffset(100, 300, 400)).toBe(0); // nothing scrollable
  });

  it("scrollProgress runs 0 → mid → 1 and is 0 when nothing scrolls", () => {
    expect(scrollProgress(0, 1000, 400)).toBe(0);
    expect(scrollProgress(300, 1000, 400)).toBe(0.5);
    expect(scrollProgress(600, 1000, 400)).toBe(1);
    expect(scrollProgress(9999, 1000, 400)).toBe(1); // clamped
    expect(scrollProgress(0, 300, 400)).toBe(0);
    expect(scrollProgress(50, 300, 400)).toBe(0);
  });

  it("estimatedSecondsRemaining is the ceiling of remaining px / speed", () => {
    expect(estimatedSecondsRemaining(0, 1000, 400, 40)).toBe(15); // 600 / 40
    expect(estimatedSecondsRemaining(590, 1000, 400, 40)).toBe(1); // ceil(10 / 40)
    expect(estimatedSecondsRemaining(600, 1000, 400, 40)).toBe(0);
    expect(estimatedSecondsRemaining(0, 300, 400, 40)).toBe(0); // nothing scrollable
    expect(estimatedSecondsRemaining(0, 1000, 400, 0)).toBe(0);
    expect(estimatedSecondsRemaining(0, 1000, 400, -10)).toBe(0);
  });
});

describe("reading estimate", () => {
  it("wordCount counts whitespace-separated tokens", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   \n ")).toBe(0);
    expect(wordCount("one")).toBe(1);
    expect(wordCount("one two  three\nfour")).toBe(4);
  });

  it("estimatedReadSeconds uses the stated 150 wpm pace", () => {
    const words150 = Array.from({ length: 150 }, () => "word").join(" ");
    const words75 = Array.from({ length: 75 }, () => "word").join(" ");
    expect(estimatedReadSeconds(words150, settings())).toBe(60);
    expect(estimatedReadSeconds(words75, settings())).toBe(30);
    expect(estimatedReadSeconds("", settings())).toBe(0);
    expect(estimatedReadSeconds("hello", settings())).toBe(1); // ceil
  });

  it("estimatedReadSeconds does not depend on scroll settings", () => {
    const text = Array.from({ length: 150 }, () => "word").join(" ");
    expect(estimatedReadSeconds(text, settings({ speedPxPerSec: 5 }))).toBe(
      estimatedReadSeconds(text, settings({ speedPxPerSec: 200 })),
    );
  });
});

describe("keyActionFor", () => {
  it("maps every documented key", () => {
    expect(keyActionFor({ key: " " })).toBe("toggle-play");
    expect(keyActionFor({ key: "ArrowUp" })).toBe("speed-up");
    expect(keyActionFor({ key: "ArrowDown" })).toBe("speed-down");
    expect(keyActionFor({ key: "ArrowRight" })).toBe("nudge-down");
    expect(keyActionFor({ key: "PageDown" })).toBe("nudge-down");
    expect(keyActionFor({ key: "ArrowLeft" })).toBe("nudge-up");
    expect(keyActionFor({ key: "PageUp" })).toBe("nudge-up");
    expect(keyActionFor({ key: "Home" })).toBe("restart");
    expect(keyActionFor({ key: "Escape" })).toBe("exit");
  });

  it("rejects any keypress with a modifier held", () => {
    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }] as const) {
      expect(keyActionFor({ key: " ", ...mod })).toBeNull();
      expect(keyActionFor({ key: "ArrowUp", ...mod })).toBeNull();
      expect(keyActionFor({ key: "Escape", ...mod })).toBeNull();
    }
    expect(keyActionFor({ key: " ", metaKey: false, ctrlKey: false, altKey: false })).toBe("toggle-play");
  });

  it("returns null for unknown keys", () => {
    expect(keyActionFor({ key: "a" })).toBeNull();
    expect(keyActionFor({ key: "Enter" })).toBeNull();
    expect(keyActionFor({ key: "Tab" })).toBeNull();
    expect(keyActionFor({ key: "" })).toBeNull();
  });

  it("PROMPTER_SHORTCUTS documents exactly the keys keyActionFor handles", () => {
    const documented = new Set<string>();
    for (const entry of PROMPTER_SHORTCUTS) {
      expect(entry.keys.length).toBeGreaterThan(0);
      expect(entry.action.length).toBeGreaterThan(0);
      const eventKey = entry.keys === "Space" ? " " : entry.keys;
      expect(keyActionFor({ key: eventKey })).not.toBeNull();
      documented.add(eventKey);
    }
    // and every mapped key is documented — no hidden shortcuts
    for (const key of [" ", "ArrowUp", "ArrowDown", "ArrowRight", "PageDown", "ArrowLeft", "PageUp", "Home", "Escape"]) {
      expect(documented.has(key)).toBe(true);
    }
  });
});

describe("prompterTextForScriptItem", () => {
  it("returns scriptToText(scriptDocFromBody(body)) verbatim for a script body", () => {
    const doc = generateScript({ topic: "morning routines", format: "reel", durationSec: 30, tone: "friendly" });
    const body = doc as unknown as Record<string, unknown>;
    const item = contentItem({ kind: "script", title: doc.title, body });
    const expectedDoc = scriptDocFromBody(body);
    expect(expectedDoc).not.toBeNull();
    expect(prompterTextForScriptItem(item)).toBe(scriptToText(expectedDoc!));
    expect(prompterTextForScriptItem(item)).toContain(doc.title);
  });

  it("handles a hand-written ScriptDoc-shaped fixture body", () => {
    const body = {
      title: "Fixture script",
      format: "reel",
      durationSec: 12,
      tone: "bold",
      beats: [
        { index: 0, startSec: 0, endSec: 6, label: "Hook", dialogue: "Open with the claim.", onScreenText: "", broll: "" },
        { index: 1, startSec: 6, endSec: 12, label: "Payoff", dialogue: "Land the point.", onScreenText: "", broll: "" },
      ],
      cta: "Follow for more",
      caption: "A caption",
      hashtags: ["#one", "#two"],
    };
    const item = contentItem({ body });
    expect(prompterTextForScriptItem(item)).toBe(scriptToText(scriptDocFromBody(body)!));
    expect(prompterTextForScriptItem(item)).toContain("Open with the claim.");
  });

  it("returns null when the body isn't a script", () => {
    expect(prompterTextForScriptItem(contentItem({ kind: "caption", body: { item: { title: "Caption" } } }))).toBeNull();
    expect(prompterTextForScriptItem(contentItem({ body: {} }))).toBeNull();
    expect(prompterTextForScriptItem(contentItem({ body: { title: "No beats here" } }))).toBeNull();
    expect(prompterTextForScriptItem(contentItem({ body: { title: "x", beats: [] } }))).toBeNull();
  });
});
