import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, type Word } from "@capseasy/shared";
import { TrimPanel } from "../panels/TrimPanel";

const word = (id: string, text: string, startMs: number, endMs: number): Word => ({ id, text, startMs, endMs });

// hello [0,1000] · um [1100,1400] · world [2900,3900] — a 1500 ms silent gap before "world"
const doc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [word("w1", "hello", 0, 1000), word("w2", "um", 1100, 1400), word("w3", "world", 2900, 3900)],
});

const HOP = 20;
function peaks(): Float32Array {
  const out = new Float32Array(Math.ceil(3900 / HOP)).fill(0.8);
  for (let i = Math.floor(1400 / HOP); i < Math.ceil(2900 / HOP); i++) out[i] = 0.02;
  return out;
}

describe("TrimPanel", () => {
  it("lists filler + pause proposals with the honest detection label (never AI)", () => {
    const { container } = render(<TrimPanel doc={doc} peaks={peaks()} durationMs={3900} onApply={vi.fn()} />);
    expect(container.textContent).toContain("From your transcript and audio levels");
    expect(container.textContent).toContain("not AI");
    // (Package 3 H: the 150 ms breath-margin sentence was descriptive copy and
    // was purged; the margin itself is still applied by the trim engine.)
    expect(screen.getByText(/Filler word "um"/)).toBeTruthy();
    expect(screen.getByText(/Pause 1\.5s/)).toBeTruthy();
  });

  it("raising the pause threshold recomputes: the 1.5 s pause proposal disappears, the filler stays", () => {
    render(<TrimPanel doc={doc} peaks={peaks()} durationMs={3900} onApply={vi.fn()} />);
    expect(screen.getByText(/Pause 1\.5s/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Minimum pause length"), { target: { value: "2000" } });
    expect(screen.queryByText(/Pause 1\.5s/)).toBeNull();
    expect(screen.getByText(/Filler word "um"/)).toBeTruthy();
  });

  it("unchecking a proposal excludes it from Apply; Apply fires once with the checked ranges only", () => {
    const onApply = vi.fn();
    render(<TrimPanel doc={doc} peaks={peaks()} durationMs={3900} onApply={onApply} />);
    fireEvent.click(screen.getByLabelText(/Include cut: Filler word "um"/));
    fireEvent.click(screen.getByRole("button", { name: /Apply 1 cut/ }));
    expect(onApply).toHaveBeenCalledTimes(1);
    // only the pause cut (silence [1400,2900] trimmed by the 150 ms margins)
    expect(onApply).toHaveBeenCalledWith([{ startMs: 1550, endMs: 2750 }]);
  });

  it("with everything checked, Apply passes both ranges in one call", () => {
    const onApply = vi.fn();
    render(<TrimPanel doc={doc} peaks={peaks()} durationMs={3900} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Apply 2 cuts/ }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith([
      { startMs: 1100, endMs: 1400 },
      { startMs: 1550, endMs: 2750 },
    ]);
  });

  it("the seek affordance reports the proposal's start", () => {
    const onSeek = vi.fn();
    render(<TrimPanel doc={doc} peaks={peaks()} durationMs={3900} onApply={vi.fn()} onSeek={onSeek} />);
    fireEvent.click(screen.getByLabelText(/Play from 0:01\.1/));
    expect(onSeek).toHaveBeenCalledWith(1100);
  });
});
