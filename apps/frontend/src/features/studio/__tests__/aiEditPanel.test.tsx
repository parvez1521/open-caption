import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, ProjectSettingsSchema, type Word } from "@capseasy/shared";
import { applyLook, getLook } from "@capseasy/templates";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition } from "../compositionDoc";
import type { PolishProjectState } from "../polish";
import type { GenerationDeps } from "../../create/service";
import { AiEditPanel } from "../panels/AiEditPanel";

/**
 * AI Edit panel: style pick + optional instruction → a reviewable grounded
 * plan (the preview is the approval gate) → apply commits through ONE
 * onCommit. Honesty pins: with no AI route the surface is badged
 * "Template engine" and every step reads Automatic; with a cloud answer the
 * badge is the real route badge, intent steps read AI-suggested, and every
 * grounded-out item appears under "Not included".
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

const noImport = async () => {};

describe("AiEditPanel — fallback (no AI route)", () => {
  it("controls render; the plan is badged Template engine with Automatic steps; apply commits once", async () => {
    const onCommit = vi.fn();
    render(
      <AiEditPanel state={makeState()} sourceTitle="My video" peaks={peaks()} hopMs={HOP}
        onCommit={onCommit} onImportBroll={noImport} deps={{ modelEnabled: false }} />,
    );
    // the style pick, the intensity control and the instruction field are the controls
    expect(screen.getByLabelText(/Style/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Edit intensity" })).toBeTruthy();
    expect(screen.getByLabelText(/Instruction/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Create my edit plan" }));
    await waitFor(() => expect(screen.getByText("Template engine")).toBeTruthy());
    expect(screen.getByText(/follows the style's set defaults/)).toBeTruthy();
    expect(screen.getByText("Remove filler words")).toBeTruthy();
    expect(screen.queryByText("Free AI · GPT-OSS 120B (Groq)")).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Apply \d+ steps? — one undo step/ }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(/AI Edit applied/)).toBeTruthy());
    expect(screen.getAllByRole("button", { name: "Revert" }).length).toBeGreaterThan(0);
  });
});

describe("AiEditPanel — with a cloud answer", () => {
  it("the real badge shows, intent steps read AI-suggested, drops land under Not included", async () => {
    const deps: GenerationDeps = {
      modelEnabled: false,
      runCloud: async () => JSON.stringify({
        emphasisWords: ["world"],
        cuts: [{ startSec: 25, endSec: 40, reason: "past the end" }],
        notes: "Tighten it up",
      }),
    };
    const onCommit = vi.fn();
    render(
      <AiEditPanel state={makeState()} sourceTitle="My video" peaks={peaks()} hopMs={HOP}
        onCommit={onCommit} onImportBroll={noImport} deps={deps} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Create my edit plan" }));
    await waitFor(() => expect(screen.getByText("Emphasise key words")).toBeTruthy());
    expect(screen.getAllByText("Free AI · GPT-OSS 120B (Groq)").length).toBeGreaterThan(0);
    expect(screen.getByText("Tighten it up")).toBeTruthy();
    expect(screen.getByText("Not included")).toBeTruthy();
    expect(screen.getByText(/outside the video or backwards/)).toBeTruthy();
    // B-roll stays default-OFF: the search is offered, nothing searched yet
    expect(screen.getByText("B-roll ideas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search Pixabay" })).toBeTruthy();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
