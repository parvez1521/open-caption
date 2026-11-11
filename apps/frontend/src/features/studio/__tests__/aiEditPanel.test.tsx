import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("AiEditPanel — stage preview (W1)", () => {
  it("preview pushes a throwaway applied state, follows the ticks, never commits, and restores on stop", async () => {
    const onCommit = vi.fn();
    const onPreviewChange = vi.fn();
    const state = makeState();
    const untouched = JSON.parse(JSON.stringify(state)) as unknown;
    render(
      <AiEditPanel state={state} sourceTitle="My video" peaks={peaks()} hopMs={HOP}
        onCommit={onCommit} onImportBroll={noImport} deps={{ modelEnabled: false }} onPreviewChange={onPreviewChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Create my edit plan" }));
    await waitFor(() => expect(screen.getByText("Template engine")).toBeTruthy());

    const lastPreview = () => onPreviewChange.mock.calls.at(-1)?.[0] as PolishProjectState | null | undefined;
    fireEvent.click(screen.getByRole("button", { name: "Preview on stage" }));
    await waitFor(() => expect(lastPreview()).not.toBeNull());
    const first = lastPreview()!;
    // the preview is the plan applied to a copy: a different object on an edited
    // timeline — and the committed state object is byte-identical afterwards
    expect(first).not.toBe(state);
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(state));
    expect(onCommit).not.toHaveBeenCalled();
    expect(JSON.parse(JSON.stringify(state))).toEqual(untouched);
    expect(screen.getByText(/nothing is applied until you press Apply/)).toBeTruthy();

    // unticking a step re-renders the preview from the current ticks
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    await waitFor(() => expect(lastPreview()).not.toBeNull());
    expect(JSON.stringify(lastPreview())).not.toBe(JSON.stringify(first));
    expect(onCommit).not.toHaveBeenCalled();

    // stopping the preview restores the stage (null), still nothing committed
    fireEvent.click(screen.getByRole("button", { name: "Stop preview" }));
    await waitFor(() => expect(lastPreview()).toBeNull());
    expect(onCommit).not.toHaveBeenCalled();
    expect(JSON.parse(JSON.stringify(state))).toEqual(untouched);
  });

  it("with zero steps ticked the preview is disabled and says why", async () => {
    render(
      <AiEditPanel state={makeState()} sourceTitle="My video" peaks={peaks()} hopMs={HOP}
        onCommit={vi.fn()} onImportBroll={noImport} deps={{ modelEnabled: false }} onPreviewChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Create my edit plan" }));
    await waitFor(() => expect(screen.getByText("Template engine")).toBeTruthy());
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    const btn = screen.getByRole("button", { name: "Preview on stage" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText("Tick at least one step to preview it on the stage.")).toBeTruthy();
  });
});

describe("StudioPage — the stage preview can never reach an export (source pins)", () => {
  const src = readFileSync(join(process.cwd(), "src/features/studio/StudioPage.tsx"), "utf8");
  it("the stage takes the preview override; the ExportModal takes only the committed render input", () => {
    expect(src).toContain("input={previewInput ?? playerInput ?? input}");
    expect(src).toContain("renderInput={exportRenderInput}");
    expect(src).toContain("Preview — not applied");
  });
  it("the export input derivation never reads the preview state", () => {
    const region = src.slice(src.indexOf("const exportInput"), src.indexOf("const previewSettings"));
    expect(region.length).toBeGreaterThan(0);
    expect(region).not.toContain("aiEditPreview");
    expect(region).not.toContain("previewInput");
  });
  it("the AI Edit panel receives the preview callback and the first-run activation is mode-gated", () => {
    expect(src).toContain("onPreviewChange={handleAiEditPreview}");
    expect(src).toContain('startMode === "ai-edit"');
    expect(src).toContain("aiEditIntroSeen(projectId)");
    expect(src).toContain("markAiEditIntroSeen(projectId)");
  });
});
