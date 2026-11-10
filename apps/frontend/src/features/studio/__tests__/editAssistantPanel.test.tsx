import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, ProjectSettingsSchema, type Word } from "@capseasy/shared";
import { applyLook, getLook } from "@capseasy/templates";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition } from "../compositionDoc";
import type { PolishProjectState } from "../polish";
import type { ModelRunner } from "../../create/service";
import { ASSISTANT_INTENTS } from "../editAssistant";
import { EditAssistantPanel } from "../panels/EditAssistantPanel";

/**
 * A8 panel: the "What I can do" list renders from the SAME intent-set
 * module the parser validates against (single-source pin, behavioural);
 * a routed instruction becomes a previewed plan (AI-suggested + badge)
 * that commits exactly once on Apply; a refusal changes nothing and
 * names the manual path; with no AI route the panel disables honestly.
 */

const word = (id: string, text: string, startMs: number, endMs: number, extra: Partial<Word> = {}): Word => ({
  id, text, startMs, endMs, ...extra,
});
const words: Word[] = [
  word("w1", "hello", 0, 500),
  word("w2", "um", 600, 900),
  word("w3", "world", 5000, 5500),
];
const doc = CaptionDocSchema.parse({ version: 2, language: "en", words });
const settings = ProjectSettingsSchema.parse({});

function makeState(): PolishProjectState {
  const input: CompositionInput = {
    media: { videoId: "vid-1", filename: "clip.mp4", size: 1, width: 1080, height: 1920, fps: 30, durationMs: 20_000 },
    doc: null, pages: [], settings, durationMs: 20_000,
  };
  const comp = buildEditorComposition({ view: toComposition(input), settings, sourceDurationMs: 20_000 });
  return { doc, comp, settings, style: applyLook(getLook("hormozi_box")!).style, lookId: "hormozi_box" };
}

const cloudRunner = (raw: string): ModelRunner => async () => raw;

describe("EditAssistantPanel", () => {
  it("(5) the capability list renders every intent from the intent-set module", () => {
    const { container } = render(
      <EditAssistantPanel state={makeState()} hopMs={20} onCommit={vi.fn()} deps={{ runCloud: cloudRunner("{}"), modelEnabled: false }} />,
    );
    expect(screen.getByText("What I can do")).toBeTruthy();
    for (const def of ASSISTANT_INTENTS) {
      expect(screen.getByText(def.label), def.id).toBeTruthy();
      expect(container.textContent, def.id).toContain(def.example);
      expect(container.textContent, def.id).toContain(def.description);
    }
  });

  it("with no AI route the input disables with the reason shown — no fake fallback", () => {
    render(<EditAssistantPanel state={makeState()} hopMs={20} onCommit={vi.fn()} deps={{ modelEnabled: false }} />);
    const box = screen.getByPlaceholderText("Assistant unavailable") as HTMLTextAreaElement;
    expect(box.disabled).toBe(true);
    expect(screen.getByText(/No AI route is available for the Edit Assistant/)).toBeTruthy();
    expect(screen.getByText(/never pretends to understand/)).toBeTruthy();
  });

  it("an instruction becomes a previewed, badged plan; Apply commits exactly once", async () => {
    const onCommit = vi.fn();
    render(
      <EditAssistantPanel state={makeState()} hopMs={20} onCommit={onCommit}
        deps={{ runCloud: cloudRunner('{"intent":"trim-fillers","params":{}}'), modelEnabled: false }} />,
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. Remove the ums and uhs"), { target: { value: "Remove the ums and uhs" } });
    fireEvent.click(screen.getByRole("button", { name: "Show me the plan" }));
    await waitFor(() => expect(screen.getByText("Remove filler words")).toBeTruthy());
    expect(screen.getByText("AI-suggested")).toBeTruthy();
    expect(screen.getByText(/Free AI · GPT-OSS 120B \(Groq\)/)).toBeTruthy();
    expect(screen.getByText(/Remove 1 filler/)).toBeTruthy();
    // preview only — nothing committed yet
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Apply plan — one undo step" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0]![0] as PolishProjectState;
    expect(committed.doc.words.map((w) => w.text)).not.toContain("um");
    await waitFor(() => expect(screen.getByText(/Applied — that's one undo step/)).toBeTruthy());
  });

  it("a refused instruction answers honestly with the manual path and commits nothing", async () => {
    const onCommit = vi.fn();
    render(
      <EditAssistantPanel state={makeState()} hopMs={20} onCommit={onCommit}
        deps={{ runCloud: cloudRunner('{"intent":"unsupported"}'), modelEnabled: false }} />,
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. Remove the ums and uhs"), { target: { value: "Generate a B-roll about duck soaps" } });
    fireEvent.click(screen.getByRole("button", { name: "Show me the plan" }));
    await waitFor(() => expect(screen.getByText(/I can't do that one yet/)).toBeTruthy());
    expect(screen.getByText(/By hand: the left-rail panels do every edit by hand/)).toBeTruthy();
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Apply plan — one undo step" })).toBeNull();
  });

  it("an understood-but-empty outcome explains itself and offers no apply", async () => {
    const onCommit = vi.fn();
    render(
      <EditAssistantPanel state={makeState()} hopMs={20} onCommit={onCommit}
        deps={{ runCloud: cloudRunner('{"intent":"bleep-profanity","params":{}}'), modelEnabled: false }} />,
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. Remove the ums and uhs"), { target: { value: "Bleep the swearing" } });
    fireEvent.click(screen.getByRole("button", { name: "Show me the plan" }));
    await waitFor(() => expect(screen.getByText(/No words from the profanity list were found/)).toBeTruthy());
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Apply plan — one undo step" })).toBeNull();
  });
});
