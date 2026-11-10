import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Render-level harness for CaptionedVideo's video layer. The real Remotion primitives need a
// composition context (absent in a static-markup render), so the context-bound pieces are stood
// in with plain elements that expose exactly what this test asserts: Sequence windows as data
// attributes, and the video elements as <video> tags carrying their trim / mute props. Font
// loading is stood in as ready so caption pages compute; PageView is a marker — page CONTENT is
// the templates package's own test surface, what matters here is whether pages render at all.
vi.mock("remotion", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    Img: (props: Record<string, unknown>) => React.createElement("img", props),
    useVideoConfig: () => ({ fps: 30, width: 1080, height: 1920, durationInFrames: 300 }),
    useCurrentFrame: () => 0,
    useRemotionEnvironment: () => ({ isClientSideRendering: true, isRendering: false, isStudio: false, isPlayer: false }),
    Sequence: (props: { from?: number; durationInFrames?: number; children?: React.ReactNode }) =>
      React.createElement("div", { "data-sequence-from": props.from, "data-sequence-duration": props.durationInFrames }, props.children),
    OffthreadVideo: (props: Record<string, unknown>) =>
      React.createElement("video", {
        src: props.src as string,
        "data-engine": "offthread",
        ...(props.trimBefore !== undefined ? { "data-trim-before": props.trimBefore } : {}),
        ...(props.trimAfter !== undefined ? { "data-trim-after": props.trimAfter } : {}),
        ...(props.muted ? { "data-muted": "true" } : {}),
        ...(props.playbackRate !== undefined ? { "data-playback-rate": props.playbackRate } : {}),
        ...((props.style as { filter?: string } | undefined)?.filter ? { "data-style-filter": (props.style as { filter?: string }).filter } : {}),
        ...((props.style as { transform?: string } | undefined)?.transform ? { "data-style-transform": (props.style as { transform?: string }).transform } : {}),
      }),
  };
});
vi.mock("@remotion/media", () => ({
  Video: (props: Record<string, unknown>) =>
    React.createElement("video", {
      src: props.src as string,
      "data-engine": "media",
      "data-on-video-frame": typeof props.onVideoFrame === "function" ? "fn" : "none",
      ...(props.trimBefore !== undefined ? { "data-trim-before": props.trimBefore } : {}),
      ...(props.trimAfter !== undefined ? { "data-trim-after": props.trimAfter } : {}),
      ...(props.muted ? { "data-muted": "true" } : {}),
      ...(props.playbackRate !== undefined ? { "data-playback-rate": props.playbackRate } : {}),
      ...(props.objectFit ? { "data-object-fit": props.objectFit } : {}),
      ...((props.style as { filter?: string } | undefined)?.filter ? { "data-style-filter": (props.style as { filter?: string }).filter } : {}),
      ...((props.style as { transform?: string } | undefined)?.transform ? { "data-style-transform": (props.style as { transform?: string }).transform } : {}),
    }),
}));
// TransitionSeries stand-ins: Sequences expose their duration/offset, Transitions expose the
// timing's frame count (via the mocked linearTiming) and the presentation kind, so the chain
// STRUCTURE is assertable without a composition context.
vi.mock("@remotion/transitions", () => {
  const Series = (props: { children?: React.ReactNode }) => React.createElement("div", { "data-transition-series": "true" }, props.children);
  const SequenceMock = (props: { durationInFrames?: number; offset?: number; children?: React.ReactNode }) =>
    React.createElement("div", { "data-ts-duration": props.durationInFrames, "data-ts-offset": props.offset ?? 0 }, props.children);
  const TransitionMock = (props: { timing: { getDurationInFrames: (o: { fps: number }) => number }; presentation?: { props?: Record<string, unknown> } }) =>
    React.createElement("div", {
      "data-ts-transition-duration": props.timing.getDurationInFrames({ fps: 30 }),
      "data-ts-presentation": (props.presentation?.props?.kind as string) ?? "custom",
    });
  return {
    TransitionSeries: Object.assign(Series, { Sequence: SequenceMock, Transition: TransitionMock, Overlay: () => null }),
    linearTiming: ({ durationInFrames }: { durationInFrames: number }) => ({
      getDurationInFrames: () => durationInFrames,
      getProgress: () => 0,
    }),
  };
});
vi.mock("@remotion/transitions/fade", () => ({ fade: () => ({ component: () => null, props: { kind: "fade" } }) }));
vi.mock("@remotion/transitions/slide", () => ({
  slide: (props: Record<string, unknown> = {}) => ({ component: () => null, props: { kind: "slide", ...props } }),
}));
vi.mock("@remotion/transitions/wipe", () => ({ wipe: () => ({ component: () => null, props: { kind: "wipe" } }) }));
vi.mock("@capseasy/templates", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    useFontsReady: () => ({ ready: true, epoch: 0 }),
    PageView: () => React.createElement("div", { "data-caption-page": "true" }),
  };
});

import { CaptionDocSchema, ProjectSettingsSchema } from "@capseasy/shared";
import { CaptionedVideo, secondaryTextForPage } from "./CaptionedVideo";
import { derivePages } from "@motion-ai/caption-engine/core";

const DOC = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    { id: "w1", text: "Hello", startMs: 0, endMs: 300 },
    { id: "w2", text: "brave", startMs: 320, endMs: 620 },
    { id: "w3", text: "world", startMs: 640, endMs: 1000 },
  ],
});

const ES_DOC = CaptionDocSchema.parse({
  version: 2,
  language: "es",
  words: [
    { id: "mt-0-0", text: "Hola", startMs: 0, endMs: 250 },
    { id: "mt-0-1", text: "mundo", startMs: 250, endMs: 600 },
    { id: "mt-0-2", text: "valiente", startMs: 600, endMs: 1000 },
  ],
  meta: {
    translatedFrom: { sourceLanguage: "en", modelId: "Xenova/opus-mt-en-es", modelRevision: "4b002a4c7edd54a7ced58877258b87f7efd3f892", derivedWordTimings: true },
  },
});

const settings = (extra: Record<string, unknown> = {}) => ProjectSettingsSchema.parse({ maxWordsPerCard: 3, ...extra });

describe("CaptionedVideo bilingual secondary line (slice 5.1)", () => {
  it("renders the translated line as a secondary line when bilingual is on", () => {
    const html = renderToStaticMarkup(
      <CaptionedVideo src={null} doc={DOC} translatedDoc={ES_DOC} settings={settings({ translateTo: "es", bilingual: true })} />,
    );
    expect(html).toContain('data-bilingual-secondary="true"');
    expect(html).toContain("Hola mundo valiente");
    // the primary page still renders through PageView exactly once
    expect(html.match(/data-caption-page/g)).toHaveLength(1);
  });

  it("bilingual off: markup is byte-identical with and without a translated doc", () => {
    const withDoc = renderToStaticMarkup(
      <CaptionedVideo src={null} doc={DOC} translatedDoc={ES_DOC} settings={settings({ translateTo: "es", bilingual: false })} />,
    );
    const withoutDoc = renderToStaticMarkup(<CaptionedVideo src={null} doc={DOC} settings={settings({ translateTo: "es", bilingual: false })} />);
    expect(withDoc).toBe(withoutDoc);
    expect(withDoc).not.toContain("data-bilingual-secondary");
  });

  it("no target chosen or language mismatch: no secondary line", () => {
    const noTarget = renderToStaticMarkup(
      <CaptionedVideo src={null} doc={DOC} translatedDoc={ES_DOC} settings={settings({ bilingual: true })} />,
    );
    expect(noTarget).not.toContain("data-bilingual-secondary");
    const mismatch = renderToStaticMarkup(
      <CaptionedVideo src={null} doc={DOC} translatedDoc={ES_DOC} settings={settings({ translateTo: "de", bilingual: true })} />,
    );
    expect(mismatch).not.toContain("data-bilingual-secondary");
  });
});

describe("secondaryTextForPage", () => {
  const s = settings();
  it("matches by time overlap and joins the card's text", () => {
    const primary = derivePages(DOC, s);
    const secondary = derivePages(ES_DOC, s);
    expect(primary).toHaveLength(1);
    expect(secondaryTextForPage(primary[0]!, secondary)).toBe("Hola mundo valiente");
  });

  it("returns null when nothing overlaps", () => {
    const primary = derivePages(DOC, s);
    const late = derivePages(
      CaptionDocSchema.parse({ version: 2, language: "es", words: [{ id: "x", text: "Tarde", startMs: 9000, endMs: 9500 }] }),
      s,
    );
    expect(secondaryTextForPage(primary[0]!, late)).toBeNull();
    expect(secondaryTextForPage(primary[0]!, [])).toBeNull();
  });
});
