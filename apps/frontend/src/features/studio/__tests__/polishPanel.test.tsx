import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, ProjectSettingsSchema, type Word } from "@capseasy/shared";
import { applyLook, getLook } from "@capseasy/templates";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition } from "../compositionDoc";
import type { PolishProjectState } from "../polish";
import { PolishPanel } from "../panels/PolishPanel";

/**
 * A2 panel: the plan is reviewed BEFORE applying (labels + badges + detail
 * lines + checkboxes), apply commits the checked steps through ONE
 * onCommit call, and the post-apply summary offers per-step revert.
 * Deps are template-only here (no runners), so every choice step must read
 * "Automatic" and the title must carry the Template engine badge.
 */

const word = (id: string, text: string, startMs: number, endMs: number, extra: Partial<Word> = {}): Word => ({
  id, text, startMs, endMs, ...extra,
});
const words: Word[] = [
  word("w1", "hello", 0, 500),
  word("w2", "um", 600, 900),
  word("w3", "amazing", 2000, 2400, { emphasis: "hero" }),
  word("w4", "world", 5000, 5500),
];
const doc = CaptionDocSchema.parse({ version: 2, language: "en", words });

const HOP = 20;
function peaks(): Float32Array {
  const out = new Float32Array(Math.ceil(20_000 / HOP)).fill(0.8);
  for (let i = Math.floor(2400 / HOP); i < Math.ceil(5000 / HOP); i++) out[i] = 0.02;
  return out;
}

const settings = ProjectSettingsSchema.parse({
  composition: {
    version: 1, videoSegments: [], markers: [],
    audio: { tracks: [{ id: "music-1", name: "Music", role: "music", ducking: { enabled: false, amountDb: 12, thresholdDb: -42 } }], clips: [] },
  },
});

function makeState(): PolishProjectState {
  const input: CompositionInput = {
    media: { videoId: "vid-1", filename: "clip.mp4", size: 1, width: 1080, height: 1920, fps: 30, durationMs: 20_000 },
    doc: null, pages: [], settings, durationMs: 20_000,
  };
  const comp = buildEditorComposition({ view: toComposition(input), settings, sourceDurationMs: 20_000 });
  return { doc, comp, settings, style: applyLook(getLook("hormozi_box")!).style, lookId: "hormozi_box" };
}

const templateDeps = { modelEnabled: false };

describe("PolishPanel", () => {
  it("builds a reviewable plan first: steps, honest labels, template badge on the title — nothing committed yet", async () => {
    const onCommit = vi.fn();
    render(<PolishPanel state={makeState()} sourceTitle="My video" peaks={peaks()} hopMs={HOP} onCommit={onCommit} deps={templateDeps} />);
    fireEvent.click(screen.getByRole("button", { name: "Build my polish plan" }));
    await waitFor(() => expect(screen.getByText("Remove filler words")).toBeTruthy());
    expect(screen.getByText(/Remove 1 filler/)).toBeTruthy();
    expect(screen.getByText("Remove pauses longer than 1.2s")).toBeTruthy();
    expect(screen.getByText("Caption look")).toBeTruthy();
    expect(screen.getByText("Music ducking")).toBeTruthy();
    // no AI route answered, so NOTHING may claim to be AI-suggested
    expect(screen.queryByText("AI-suggested")).toBeNull();
    expect(screen.getAllByText("Automatic").length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText("Template engine")).toBeTruthy();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("apply commits the checked steps in ONE call; unchecking the ducking step leaves it out", async () => {
    const onCommit = vi.fn();
    render(<PolishPanel state={makeState()} sourceTitle="My video" peaks={peaks()} hopMs={HOP} onCommit={onCommit} deps={templateDeps} />);
    fireEvent.click(screen.getByRole("button", { name: "Build my polish plan" }));
    await waitFor(() => expect(screen.getByText("Music ducking")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Include step: Music ducking"));
    fireEvent.click(screen.getByRole("button", { name: /Apply \d+ steps/ }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0]![0] as PolishProjectState;
    // ducking was unchecked: the music track is untouched in the committed state
    expect(committed.comp.audioTracks.find((t) => t.id === "music-1")!.ducking.enabled).toBe(false);
    // …while a checked step (the filler cut) did land
    expect(committed.doc.words.map((w) => w.text)).not.toContain("um");
  });

  it("after applying, the summary offers per-step revert and each revert commits once", async () => {
    const onCommit = vi.fn();
    render(<PolishPanel state={makeState()} sourceTitle="My video" peaks={peaks()} hopMs={HOP} onCommit={onCommit} deps={templateDeps} />);
    fireEvent.click(screen.getByRole("button", { name: "Build my polish plan" }));
    await waitFor(() => expect(screen.getByText("Music ducking")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Apply \d+ steps/ }));
    await waitFor(() => expect(screen.getByText(/Polish applied/)).toBeTruthy());
    expect(onCommit).toHaveBeenCalledTimes(1);
    const appliedState = onCommit.mock.calls[0]![0] as PolishProjectState;
    expect(appliedState.comp.audioTracks.find((t) => t.id === "music-1")!.ducking.enabled).toBe(true);

    const revertButtons = screen.getAllByRole("button", { name: "Revert" });
    fireEvent.click(revertButtons[revertButtons.length - 1]!); // ducking is last in apply order
    expect(onCommit).toHaveBeenCalledTimes(2);
    const reverted = onCommit.mock.calls[1]![0] as PolishProjectState;
    expect(reverted.comp.audioTracks.find((t) => t.id === "music-1")!.ducking.enabled).toBe(false);
    expect(screen.getByText("Reverted")).toBeTruthy();
  });
});
