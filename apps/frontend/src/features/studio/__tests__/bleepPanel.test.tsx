import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProjectSettingsSchema, type Page, type Word } from "@capseasy/shared";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition, type EditorComposition } from "../compositionDoc";
import { AudioPanel, type AudioPanelProps } from "../panels/AudioPanel";

/**
 * A6 review-UI tests: matches are listed with timestamps, NOTHING is approved
 * by default, "Bleep selected" stays disabled until a box is ticked, and
 * applying sends only the approved ranges up.
 */

const word = (id: string, text: string, startMs: number, endMs: number): Word => ({ id, text, startMs, endMs });
const page = (id: string, words: Word[]): Page => ({
  id, startMs: words[0]?.startMs ?? 0, endMs: words[words.length - 1]?.endMs ?? 0,
  words, lines: [words], heroIndex: -1, emotion: "neutral", position: null, styleOverride: null,
});
const pages = [page("p1", [word("w1", "hello", 0, 400)])];

function emptyComp(): EditorComposition {
  const settings = ProjectSettingsSchema.parse({});
  const input: CompositionInput = {
    media: { videoId: "vid-1", filename: "clip.mp4", size: 1, width: 1080, height: 1920, fps: 30, durationMs: 10_000 },
    doc: null, pages, settings, durationMs: 10_000,
  };
  return buildEditorComposition({ view: toComposition(input), settings, sourceDurationMs: 10_000 });
}

const words = [
  word("w1", "hello", 0, 400),
  word("w2", "fuck", 1000, 1500),
  word("w3", "there", 1600, 2000),
  word("w4", "चूतिया", 61_000, 61_600),
];

function renderPanel(overrides: Partial<AudioPanelProps> = {}) {
  const props: AudioPanelProps = {
    comp: emptyComp(),
    assets: [],
    selectedClipId: null,
    playheadMs: 0,
    onSelectClip: vi.fn(), onAddTrack: vi.fn(), onUpdateTrack: vi.fn(), onSetDucking: vi.fn(),
    onRemoveTrack: vi.fn(), onPlaceClip: vi.fn(), onMoveClip: vi.fn(), onSplitClip: vi.fn(),
    onDuplicateClip: vi.fn(), onRemoveClip: vi.fn(), onUpdateClip: vi.fn(), onUpdateProcessors: vi.fn(),
    onUpdateMaster: vi.fn(),
    words,
    onApplyBleeps: vi.fn(),
    onRemoveBleep: vi.fn(),
    onUpdateBleep: vi.fn(),
    ...overrides,
  };
  render(<AudioPanel {...props} />);
  return props;
}

describe("AudioPanel — Bleep profanity review", () => {
  it("lists matches with word + timestamp, states the limits, and approves nothing by default", () => {
    const props = renderPanel();
    expect(screen.getByText(/can miss slang or mis-transcribed words/i)).toBeTruthy();
    expect(screen.getByText("fuck")).toBeTruthy();
    expect(screen.getByText("चूतिया")).toBeTruthy();
    expect(screen.getByText("0:01.0")).toBeTruthy();
    expect(screen.getByText("1:01.0")).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    expect(boxes.every((b) => !b.checked)).toBe(true);
    const selectedBtn = screen.getByRole("button", { name: /Bleep selected \(0\)/ }) as HTMLButtonElement;
    expect(selectedBtn.disabled).toBe(true);
    expect(props.onApplyBleeps).not.toHaveBeenCalled();
  });

  it("ticking one word and applying sends ONLY that word's range", () => {
    const props = renderPanel();
    fireEvent.click(screen.getByLabelText("Approve bleep for fuck"));
    fireEvent.click(screen.getByRole("button", { name: /Bleep selected \(1\)/ }));
    expect(props.onApplyBleeps).toHaveBeenCalledTimes(1);
    expect(props.onApplyBleeps).toHaveBeenCalledWith([{ startMs: 1000, endMs: 1500, wordText: "fuck" }]);
  });

  it("Bleep all sends every pending match", () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Bleep all" }));
    expect(props.onApplyBleeps).toHaveBeenCalledWith([
      { startMs: 1000, endMs: 1500, wordText: "fuck" },
      { startMs: 61_000, endMs: 61_600, wordText: "चूतिया" },
    ]);
  });

  it("a clean transcript shows the honest empty state", () => {
    renderPanel({ words: [word("w1", "hello", 0, 400)] });
    expect(screen.getByText(/No listed words found/i)).toBeTruthy();
  });
});
