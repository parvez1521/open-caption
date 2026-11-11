import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, type CaptionDoc } from "@capseasy/shared";

/**
 * AI Clipping Studio panel tests: the setup renders, a run through the REAL
 * engine (mocked only at the model-runner boundary) produces a results card
 * carrying the honesty furniture — Editorial score + the estimate label, the
 * verbatim hook, model/measured breakdown rows, the source badge — and with
 * no AI available the same surface badges itself "Signals only".
 */

const cloud = vi.hoisted(() => ({ configured: true }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/studio/useWaveform", () => ({ PEAKS_PER_SECOND: 50, useWaveform: () => ({ peaks: null, state: "ready" }) }));
vi.mock("@/features/clipper/useSceneAnalysis", () => ({
  useSceneAnalysis: () => ({ state: "ready", cuts: [] }),
}));
vi.mock("@/features/clipper/highlightAi", () => ({
  fetchClipAiStatus: async () =>
    cloud.configured
      ? { configured: true, provider: "groq", model: "openai/gpt-oss-120b", modelName: "GPT-OSS 120B" }
      : { configured: false, provider: "none", model: "", modelName: "" },
  runClipCloudModel: async () =>
    JSON.stringify({
      clips: [
        {
          start_word_index: 5,
          end_word_index: 33,
          title: "The pricing mistake",
          summary: "A founder answers the pricing question.",
          reason: "It opens on a question and lands on a clear answer.",
          score: 88,
          score_breakdown: { hook: 90, value: 86, story_completeness: 92, engagement: 80 },
        },
      ],
    }),
}));
vi.mock("@/features/create/cloudAi", () => ({
  fetchCloudAiStatus: async () => null,
  runCloudModel: async () => "",
}));
vi.mock("@/features/create/localModel", () => ({
  onModelState: () => () => undefined,
  runLocalModel: async () => "",
  getModelState: () => ({ status: "off" }),
  canRunLocalModel: () => false,
  enableLocalModel: async () => undefined,
  disableLocalModel: () => undefined,
  LOCAL_MODEL: { name: "SmolLM2" },
}));
vi.mock("@/features/clipper/useFaceTrack", () => ({
  useFaceTrack: () => ({ state: { kind: "idle" }, sampleRange: async () => [], cancel: () => undefined }),
  faceAssistConsented: () => true,
  grantFaceAssistConsent: () => undefined,
}));
vi.mock("@/features/clipper/clipThumbnails", () => ({
  captureClipThumbnails: async () => ({}),
}));

import { ClipperPanel } from "./ClipperPanel";

/** Words at 400 ms spacing from sentence strings (the engine test builder's shape). */
function makeDoc(): CaptionDoc {
  const sentences = [
    "Welcome back to the show everyone.",
    "What is the one mistake every new founder makes?",
    "They price too low because they fear nobody will pay.",
    "And the fix is simple once you see it clearly.",
    "Filler talk about ordinary things that happened today.",
    "More filler talk about nothing in particular at all.",
  ];
  const words: { id: string; text: string; startMs: number; endMs: number }[] = [];
  let t = 0;
  sentences.forEach((s, si) => {
    for (const token of s.split(/\s+/)) {
      words.push({ id: `w${words.length}`, text: token, startMs: t, endMs: t + 320 });
      t += 400;
    }
    t += 500;
    void si;
  });
  return CaptionDocSchema.parse({ version: 2, language: "en", words });
}

const renderPanel = () =>
  render(
    <ClipperPanel
      projectId="p1"
      sourceTitle="The Show"
      sourceVideoId="v1"
      mediaDurationMs={31_000}
      doc={makeDoc()}
      peaks={new Float32Array(1600).fill(0.3)}
      videoUrl={null}
      sourceWidth={1920}
      sourceHeight={1080}
      sourceUrl="blob:source"
    />,
  );

const runStudio = async (engine: "cloud" | "signals") => {
  // wait for the status probe to land first — clicking earlier would race it
  // and the run would (correctly) take whichever engine was ready
  if (engine === "cloud") await waitFor(() => expect(screen.getAllByText(/GPT-OSS 120B/).length).toBeGreaterThan(0));
  else await waitFor(() => expect(screen.getAllByText(/Signals only — free AI unavailable/).length).toBeGreaterThanOrEqual(1));
  fireEvent.change(screen.getByLabelText(/Clip length/), { target: { value: "15-30" } });
  fireEvent.click(screen.getByRole("button", { name: "Find clips" }));
};

describe("AI Clipping Studio panel", () => {
  it("renders the setup with the engine badge and honest framing", async () => {
    cloud.configured = true;
    renderPanel();
    expect(screen.getByText("AI Clipping Studio")).toBeTruthy();
    expect(screen.getByText(/Only transcript text is sent to the free AI/)).toBeTruthy();
    expect(screen.getByText("Measured suggestions")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Free AI/)).toBeTruthy());
  });

  it("a cloud run produces a card with the Editorial score, verbatim hook and labelled breakdown", async () => {
    cloud.configured = true;
    renderPanel();
    await runStudio("cloud");
    await waitFor(() => expect(screen.getByText("AI clips")).toBeTruthy());
    expect(screen.getByText("Editorial score")).toBeTruthy();
    expect(screen.getByText(/estimate — not a performance prediction/)).toBeTruthy();
    expect(screen.getByText(/What is the one mistake every new founder makes\?/)).toBeTruthy();
    expect(screen.getByText("Story completeness")).toBeTruthy();
    expect(screen.getAllByText("model-judged").length).toBeGreaterThan(0);
    expect(screen.getAllByText("measured").length).toBeGreaterThan(0);
    // the model's title seeds the (editable) title control — proof this card
    // came from the model run, not the signals path (whose titles are openings)
    expect(screen.getByDisplayValue("The pricing mistake")).toBeTruthy();
    // and the signals badge appears NOWHERE when the model answered
    expect(screen.queryAllByText(/Signals only — free AI unavailable/)).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Regenerate clip" })).toBeTruthy();
    // the analysis stages are the pipeline's own, all shown done
    expect(screen.getByText("Understanding the content")).toBeTruthy();
    expect(screen.getByText("Analysing speakers & crops")).toBeTruthy();
  });

  it("with no AI available the run badges itself Signals only — never dressed as AI", async () => {
    cloud.configured = false;
    renderPanel();
    await runStudio("signals");
    await waitFor(() => expect(screen.getByText("AI clips")).toBeTruthy());
    // once in the setup header, once on the results card
    expect(screen.getAllByText(/Signals only — free AI unavailable/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Editorial score")).toBeTruthy();
    expect(screen.getAllByText("Not judged").length).toBeGreaterThan(0);
  });
});
