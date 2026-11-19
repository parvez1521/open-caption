import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, defaultStyle, ProjectSettingsSchema } from "@capseasy/shared";
import StudioPage, { RIGHT_TABS, transitionApplyBlocker } from "../StudioPage";
import { startSession } from "@/features/transcribe/session";
import type { EditorComposition } from "../compositionDoc";

/**
 * Studio revision phase 2 — StudioPage integration:
 * - the right rail drops the Reels tab and lists the seven remaining tabs;
 * - a cut click selects the join (label + apply target);
 * - dropping a transition on a cut applies it there;
 * - refused applies surface a message instead of silently doing nothing;
 * - the Graphics tab renders the new graphics panel;
 * - a blank AI-Edit project opens on the Generate Image/Video section with
 *   no caption session, and caption projects keep today's defaults.
 *
 * Drives the real StudioPage with a mocked useStudio (same pattern as
 * studioFirstLoad / captionSectionSwitch) and stubbed heavy leaves; the
 * Timeline stub exposes the join callbacks as buttons, the real
 * TransitionsPanel renders for the apply tests.
 */

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const studioState = vi.hoisted(() => ({ current: null as unknown }));

const stable = vi.hoisted(() => ({
  deviceVideo: { video: null, status: "none", attach: vi.fn() },
  compat: { state: "none", progress: 0, url: null },
  waveform: { peaks: null, state: "idle" },
  mediaAssets: { assets: [], importing: false, importFiles: vi.fn(), remove: vi.fn(), refresh: vi.fn() },
  brandNav: { go: vi.fn(), busy: () => () => undefined },
  router: { replace: vi.fn(), push: vi.fn() },
  player: {
    play: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    seekTo: vi.fn(),
    getCurrentFrame: () => 3,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
}));

vi.mock("../useStudio", () => ({ useStudio: () => studioState.current }));
vi.mock("../UploadPanel", () => ({
  UploadPanel: ({ mode = "captions", onModeChange }: { mode?: string; onModeChange?: (m: string) => void }) => (
    <div>
      <div role="radiogroup" aria-label="How this project starts">
        {[
          ["captions", "Captions"],
          ["editor", "Normal Editor"],
        ].map(([m, label]) => (
          <button key={m} role="radio" aria-checked={mode === m} onClick={() => onModeChange?.(m)}>
            {label}
          </button>
        ))}
      </div>
      <button type="button">Choose a video</button>
    </div>
  ),
}));
vi.mock("../ProcessingPanel", () => ({ ProcessingPanel: () => null }));
vi.mock("../StudioPlayer", () => ({
  StudioPlayer: React.forwardRef(function StudioPlayerStub(props: { onCaptionTap?: () => void }, ref: React.Ref<unknown>) {
    React.useImperativeHandle(ref, () => stable.player);
    return (
      <div>
        <button type="button" onClick={() => props.onCaptionTap?.()}>player-caption-tap</button>
      </div>
    );
  }),
}));
vi.mock("../Timeline", () => ({
  Timeline: (props: {
    onSelectJoin?: (clipId: string) => void;
    onDropTransition?: (clipId: string, t: { type: string; durationMs: number }) => void;
    onSelectVideoClip?: (clipId: string) => void;
    selectedJoinClipId?: string | null;
  }) => (
    <div>
      <button type="button" onClick={() => props.onSelectJoin?.("seg-2")}>timeline-cut-2</button>
      <button type="button" onClick={() => props.onDropTransition?.("seg-2", { type: "wipe-left", durationMs: 400 })}>timeline-drop-wipe</button>
      <button type="button" onClick={() => props.onSelectVideoClip?.("seg-2")}>timeline-segment-2</button>
      <button type="button" onClick={() => props.onSelectVideoClip?.("seg-1")}>timeline-segment-1</button>
      <span>join:{props.selectedJoinClipId ?? "none"}</span>
    </div>
  ),
}));
vi.mock("../panels/LooksPanel", () => ({ LooksPanel: () => <div>Looks panel (stubbed)</div> }));
vi.mock("../panels/AiGeneratePanel", () => ({
  AiGeneratePanel: (props: { transcript?: { state: string }; onTranscribe?: () => void; hasVideo: boolean }) => (
    <div>
      <span>ai-generate-panel</span>
      <span>transcript:{props.transcript?.state ?? "none"}</span>
      <span>hasVideo:{String(props.hasVideo)}</span>
      <button type="button" onClick={() => props.onTranscribe?.()}>ai-transcribe</button>
    </div>
  ),
}));
vi.mock("../panels/NewGraphicsPanel", () => ({
  NewGraphicsPanel: () => <div>new-graphics-panel</div>,
}));
vi.mock("@capseasy/templates", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return { ...mod, loadFontFamily: () => Promise.resolve() };
});
vi.mock("@/features/transcribe/session", () => ({
  useSessionView: () => null,
  getSession: () => undefined,
  startSession: vi.fn(),
}));
vi.mock("@/features/upload/useDeviceVideo", () => ({
  useDeviceVideo: () => stable.deviceVideo,
}));
vi.mock("@/features/upload/useCompatCopy", () => ({
  useCompatCopy: () => stable.compat,
}));
vi.mock("../useWaveform", () => ({
  useWaveform: () => stable.waveform,
  PEAKS_PER_SECOND: 10,
}));
vi.mock("../useMediaAssets", () => ({
  useMediaAssets: () => stable.mediaAssets,
}));
vi.mock("../useAudioPreview", () => ({ useAudioPreview: vi.fn() }));
vi.mock("@/components/brand/BrandNav", () => ({
  useBrandNav: () => stable.brandNav,
}));
vi.mock("@/services/auth", () => ({ authService: { isAuthenticated: () => true } }));
vi.mock("@/services/studio", () => ({
  studioService: { getTranslations: () => Promise.resolve({ translations: [] }) },
  RevisionConflict: class RevisionConflict extends Error {},
}));
vi.mock("@/services/auth/guest", () => ({
  currentUserIsGuest: () => Promise.resolve(false),
  signInExistingWithGoogle: vi.fn(),
  takeIdentityExistsError: () => false,
}));
vi.mock("@/services/projects", () => ({ projectsService: { deleteProject: vi.fn() } }));
vi.mock("@/features/upload/localVideos", () => ({ getLocalVideo: () => Promise.resolve(null) }));
vi.mock("../mediaStore", () => ({ listProjectAssets: () => Promise.resolve([]), saveAsset: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => stable.router,
  useParams: () => ({ id: "p1" }),
  usePathname: () => "/projects/p1",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const doc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    { id: "w1", text: "Dulha", startMs: 0, endMs: 400 },
    { id: "w2", text: "Dulhan?", startMs: 420, endMs: 800 },
    { id: "w3", text: "hota", startMs: 820, endMs: 1200 },
    { id: "w4", text: "hai?", startMs: 1220, endMs: 1600 },
  ],
});

const loadedData = {
  project: {
    id: "p1",
    title: "Untitled 001",
    status: null,
    language: null,
    aspect_ratio: null,
    look_id: null,
    template_id: null,
    style_json: null,
    settings_json: null,
    platform: null,
  },
  video: null,
  document: { doc: null, revision: 0 },
  job: null,
  canTranscribe: true,
  limits: { maxBytes: 500 * 1024 * 1024, maxDurationSec: 300 },
};

const twoClipSettings = ProjectSettingsSchema.parse({
  overlays: [],
  composition: {
    version: 1,
    videoSegments: [
      { id: "seg-1", sourceInMs: 0, sourceOutMs: 15000 },
      { id: "seg-2", sourceInMs: 15000, sourceOutMs: 30000 },
    ],
    markers: [],
  },
});

const identicalSettings = ProjectSettingsSchema.parse({
  overlays: [],
  composition: {
    version: 1,
    videoSegments: [
      { id: "seg-1", sourceInMs: 0, sourceOutMs: 15000 },
      { id: "seg-2", sourceInMs: 15000, sourceOutMs: 30000, transitionIn: { type: "dissolve-cross", durationMs: 300 } },
    ],
    markers: [],
  },
});

const tinyNeighbourSettings = ProjectSettingsSchema.parse({
  overlays: [],
  composition: {
    version: 1,
    videoSegments: [
      { id: "seg-1", sourceInMs: 0, sourceOutMs: 15000 },
      { id: "seg-2", sourceInMs: 15000, sourceOutMs: 15050 },
    ],
    markers: [],
  },
});

/** seg-2 is 300 ms and already holds the clamped 299 ms transition (CAP-T05). */
const cappedSettings = ProjectSettingsSchema.parse({
  overlays: [],
  composition: {
    version: 1,
    videoSegments: [
      { id: "seg-1", sourceInMs: 0, sourceOutMs: 15000 },
      { id: "seg-2", sourceInMs: 15000, sourceOutMs: 15300, transitionIn: { type: "dissolve-cross", durationMs: 299 } },
    ],
    markers: [],
  },
});

const edit = vi.fn();
const editAll = vi.fn();

function makeStudio(settings: unknown, docValue: typeof doc | null = doc) {
  return {
    doc: docValue,
    style: defaultStyle(),
    settings,
    lookId: null,
    saveState: "saved",
    conflict: null,
    canUndo: false,
    canRedo: false,
    edit,
    editAll,
    undo: vi.fn(),
    redo: vi.fn(),
    resolveConflict: vi.fn(),
    chooseLook: vi.fn(),
    patchStyle: vi.fn(),
    patchSettings: vi.fn(),
    rename: vi.fn(),
    resetDoc: vi.fn(),
    refetch: vi.fn(),
    saveNow: vi.fn(),
    query: { isLoading: false, error: null },
    data: loadedData,
  };
}

function renderStudio() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <StudioPage projectId="p1" />
    </QueryClientProvider>,
  );
  return { ...utils, qc };
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("ce:tutorial-seen:v2", "1");
  edit.mockClear();
  editAll.mockClear();
  stable.player.play.mockClear();
  stable.player.seekTo.mockClear();
  (startSession as unknown as { mockClear: () => void }).mockClear?.();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("StudioPage phase 2 — right rail without Reels", () => {
  it("lists the seven tabs and no Reels tab", () => {
    expect(RIGHT_TABS.map((t) => t.id)).toEqual(["motion", "inspector", "titles", "stickers", "sfx", "graphics", "transitions"]);
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(twoClipSettings);
    const { unmount } = renderStudio();
    try {
      for (const label of ["Motion", "Titles", "Stickers", "Sounds", "Graphics", "Transitions"]) {
        expect(screen.getByRole("button", { name: label })).toBeTruthy();
      }
      expect(screen.queryByRole("button", { name: "Reels" })).toBeNull();
      expect(screen.queryByText("Reels")).toBeNull();
    } finally {
      unmount();
    }
  });

  it("clicking Graphics renders the new graphics panel", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(twoClipSettings);
    const { unmount } = renderStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "Graphics" }));
      expect(await screen.findByText("new-graphics-panel")).toBeTruthy();
      expect((screen.getByRole("button", { name: "Graphics" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
    } finally {
      unmount();
    }
  });
});

describe("StudioPage phase 2 — cut selection and transitions", () => {
  it("cut click selects the join and shows its label", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(twoClipSettings);
    const { unmount } = renderStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "timeline-cut-2" }));
      expect(await screen.findByText("Applying to Cut after Clip 1")).toBeTruthy();
      expect(screen.getByText("join:seg-2")).toBeTruthy();
      expect((screen.getByRole("button", { name: "Transitions" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
    } finally {
      unmount();
    }
  });

  it("tapping a transition applies it to the join clip and jumps the preview to the join", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(twoClipSettings);
    const { unmount } = renderStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "timeline-cut-2" }));
      expect(await screen.findByText("Applying to Cut after Clip 1")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Apply Cross Dissolve" }));
      expect(editAll).toHaveBeenCalledTimes(1);
      const arg = editAll.mock.calls[0]![0] as { settings: { composition: { videoSegments: { id: string; transitionIn: unknown }[] } } };
      const seg2 = arg.settings.composition.videoSegments.find((s) => s.id === "seg-2");
      expect(seg2?.transitionIn).toEqual({ type: "dissolve-cross", durationMs: 300 });
      // join at 15000, transition 300 → clip starts 14700; seek 500 ms before it, then play
      expect(stable.player.seekTo).toHaveBeenCalledWith(426);
      expect(stable.player.play).toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  it("dropping a transition on a cut applies it at that cut", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(twoClipSettings);
    const { unmount } = renderStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "timeline-drop-wipe" }));
      expect(await screen.findByText("Applying to Cut after Clip 1")).toBeTruthy();
      expect(editAll).toHaveBeenCalledTimes(1);
      const arg = editAll.mock.calls[0]![0] as { settings: { composition: { videoSegments: { id: string; transitionIn: unknown }[] } } };
      const seg2 = arg.settings.composition.videoSegments.find((s) => s.id === "seg-2");
      expect(seg2?.transitionIn).toEqual({ type: "wipe-left", durationMs: 400 });
    } finally {
      unmount();
    }
  });

  it("identical apply surfaces 'Already applied' instead of silence", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(identicalSettings);
    const { unmount } = renderStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "timeline-cut-2" }));
      expect(await screen.findByText("Applying to Cut after Clip 1")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Apply Cross Dissolve" }));
      expect(editAll).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent("Already applied.");
    } finally {
      unmount();
    }
  });

  it("clicking the join's own segment keeps the join; clicking another segment drops it (CAP-T02)", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(twoClipSettings);
    const { unmount } = renderStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "timeline-cut-2" }));
      expect(await screen.findByText("Applying to Cut after Clip 1")).toBeTruthy();
      // the join's own clip (the segment the transition badge sits on): join survives
      fireEvent.click(screen.getByRole("button", { name: "timeline-segment-2" }));
      expect(screen.getByText("join:seg-2")).toBeTruthy();
      expect(screen.getByText("Applying to Cut after Clip 1")).toBeTruthy();
      expect((screen.getByRole("button", { name: "Transitions" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
      // a different segment: the join is dropped, as before
      fireEvent.click(screen.getByRole("button", { name: "timeline-segment-1" }));
      expect(screen.getByText("join:none")).toBeTruthy();
    } finally {
      unmount();
    }
  });

  it("tapping a transition with no cut selected surfaces the 'Select a cut' note instead of silence (CAP-T01)", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(twoClipSettings);
    const { unmount } = renderStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "Transitions" }));
      expect(screen.getByText(/No cut selected/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Apply Cross Dissolve" }));
      expect(editAll).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent("Select a cut in the timeline first");
    } finally {
      unmount();
    }
  });

  it("duration-slider ticks share one coalesce key; a card tap does not (CAP-T06)", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(identicalSettings);
    const { unmount } = renderStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "timeline-cut-2" }));
      expect(await screen.findByText("Applying to Cut after Clip 1")).toBeTruthy();
      const slider = screen.getByLabelText("Duration") as HTMLInputElement;
      fireEvent.change(slider, { target: { value: "350" } });
      fireEvent.change(slider, { target: { value: "400" } });
      expect(editAll).toHaveBeenCalledTimes(2);
      expect(editAll.mock.calls[0]![1]).toEqual({ coalesceKey: "transition-duration:seg-2" });
      expect(editAll.mock.calls[1]![1]).toEqual({ coalesceKey: "transition-duration:seg-2" });
      // a type change is a discrete op, not part of the drag burst
      editAll.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Apply Glitch Hard" }));
      expect(editAll).toHaveBeenCalledTimes(1);
      expect(editAll.mock.calls[0]![1]).toBeUndefined();
    } finally {
      unmount();
    }
  });

  it("a past-cap apply surfaces the honest cap message, not 'Already applied' (CAP-T05)", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(cappedSettings);
    const { unmount } = renderStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "timeline-cut-2" }));
      expect(await screen.findByText("Applying to Cut after Clip 1")).toBeTruthy();
      // the card's default 300 ms is past the 299 ms cap; the stored 299 ms is
      // the clamp, not an already-applied 300 ms
      fireEvent.click(screen.getByRole("button", { name: "Apply Cross Dissolve" }));
      expect(editAll).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent("Capped at 299 ms — neighbouring clip too short for 300 ms.");
    } finally {
      unmount();
    }
  });

  it("tiny neighbouring clip surfaces a message instead of silence", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(tinyNeighbourSettings);
    const { unmount } = renderStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "timeline-cut-2" }));
      expect(await screen.findByText("Applying to Cut after Clip 1")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Apply Cross Dissolve" }));
      expect(editAll).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent("Neighbouring clip too short for a transition.");
    } finally {
      unmount();
    }
  });
});

describe("transitionApplyBlocker — no-op reasons", () => {
  const comp = (clips: { id: string; durationMs: number; transitionIn?: { type: string; durationMs: number } | null }[]): EditorComposition =>
    ({
      version: 1,
      durationMs: 30000,
      sourceDurationMs: 30000,
      rangeStartMs: 0,
      videoClips: clips.map((c, i) => ({
        id: c.id,
        kind: "video",
        startMs: clips.slice(0, i).reduce((a, p) => a + p.durationMs, 0),
        durationMs: c.durationMs,
        sourceInMs: 0,
        sourceOutMs: c.durationMs,
        playbackRate: 1,
        transitionIn: c.transitionIn ?? null,
        assetId: null,
        still: false,
      })),
      captionClips: [],
      overlayClips: [],
      markers: [],
      trackState: {},
      audioTracks: [],
      audioClips: [],
      audioMaster: {},
      audioBleeps: [],
      audioNoiseSuppressionAssetId: null,
    }) as unknown as EditorComposition;

  it("first clip, unknown clip, and a good apply", () => {
    const c = comp([
      { id: "a", durationMs: 15000 },
      { id: "b", durationMs: 15000 },
    ]);
    expect(transitionApplyBlocker(c, "a", { type: "dissolve-cross", durationMs: 300 })).toBe("Can't apply here — this is the first clip.");
    expect(transitionApplyBlocker(c, "gone", { type: "dissolve-cross", durationMs: 300 })).toMatch(/gone/);
    expect(transitionApplyBlocker(c, "b", { type: "dissolve-cross", durationMs: 300 })).toBeNull();
    expect(transitionApplyBlocker(null, "b", { type: "dissolve-cross", durationMs: 300 })).toMatch(/no timeline/);
  });

  it("a past-cap drag is reported as capped, not 'Already applied' (CAP-T05)", () => {
    const capped = comp([
      { id: "a", durationMs: 15000 },
      { id: "b", durationMs: 300, transitionIn: { type: "dissolve-cross", durationMs: 299 } },
    ]);
    // the stored 299 ms IS the clamp of a 500 ms request — dragging to 500 again
    // is a request the neighbours cannot honour, not an already-applied one
    expect(transitionApplyBlocker(capped, "b", { type: "dissolve-cross", durationMs: 500 })).toBe(
      "Capped at 299 ms — neighbouring clip too short for 500 ms.",
    );
    expect(transitionApplyBlocker(capped, "b", { type: "dissolve-cross", durationMs: 299 })).toBe("Already applied.");
  });

  it("tiny cap and identical apply", () => {
    const tiny = comp([
      { id: "a", durationMs: 15000 },
      { id: "b", durationMs: 50 },
    ]);
    expect(transitionApplyBlocker(tiny, "b", { type: "dissolve-cross", durationMs: 300 })).toBe("Neighbouring clip too short for a transition.");
    const same = comp([
      { id: "a", durationMs: 15000 },
      { id: "b", durationMs: 15000, transitionIn: { type: "dissolve-cross", durationMs: 300 } },
    ]);
    expect(transitionApplyBlocker(same, "b", { type: "dissolve-cross", durationMs: 300 })).toBe("Already applied.");
    expect(transitionApplyBlocker(same, "b", null)).toBeNull();
    const plain = comp([
      { id: "a", durationMs: 15000 },
      { id: "b", durationMs: 15000 },
    ]);
    expect(transitionApplyBlocker(plain, "b", null)).toBe("Already a plain cut.");
  });
});

describe("StudioPage phase 2 — blank AI-Edit projects", () => {
  it("blank AI-Edit project: upload opens through the editor door, no caption session", () => {
    window.history.pushState({}, "", "/projects/p1");
    window.localStorage.setItem("oc:ai-edit-project:p1", "1");
    studioState.current = makeStudio(twoClipSettings, null);
    const { unmount } = renderStudio();
    try {
      expect((screen.getByRole("radio", { name: "Normal Editor" }) as HTMLButtonElement).getAttribute("aria-checked")).toBe("true");
      expect(screen.queryByRole("radio", { name: "Captions" })?.getAttribute("aria-checked")).toBe("false");
      expect(startSession).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  it("AI-Edit project with an editor opens on Generate Image/Video, transcript idle", async () => {
    window.history.pushState({}, "", "/projects/p1");
    window.localStorage.setItem("oc:ai-edit-project:p1", "1");
    studioState.current = makeStudio(twoClipSettings);
    const { unmount } = renderStudio();
    try {
      const gen = screen.getByRole("button", { name: "Generate Image/Video" });
      expect(gen.getAttribute("aria-pressed")).toBe("true");
      expect(await screen.findByText("ai-generate-panel")).toBeTruthy();
      expect(screen.getByText("transcript:idle")).toBeTruthy();
      expect(startSession).not.toHaveBeenCalled();
      // no video on this device: transcribing reports it instead of starting anything
      fireEvent.click(screen.getByRole("button", { name: "ai-transcribe" }));
      expect(await screen.findByText("transcript:error")).toBeTruthy();
      expect(startSession).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  it("caption projects keep the Captions section and the captions door", () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(twoClipSettings);
    const { unmount } = renderStudio();
    try {
      expect((screen.getByRole("button", { name: "Captions" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
      expect((screen.getByRole("button", { name: "Generate Image/Video" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("false");
    } finally {
      unmount();
    }
  });

  it("caption blank project: upload opens through the captions door", () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(twoClipSettings, null);
    const { unmount } = renderStudio();
    try {
      expect((screen.getByRole("radio", { name: "Captions" }) as HTMLButtonElement).getAttribute("aria-checked")).toBe("true");
    } finally {
      unmount();
    }
  });
});

/**
 * MA-A3-002: on a phone the FIRST client render must already be the phone
 * layout. useIsDesktop used to initialise useState(true) and only correct
 * itself in the effect, so a phone mounted the desktop layout (and its
 * Player) and then swapped. The lazy matchMedia initializer fixes that —
 * this test proves it by committing the first render with flushSync, which
 * runs layout effects but NOT passive effects, so the effect-based
 * correction cannot have run yet.
 */
describe("StudioPage phone first render (MA-A3-002)", () => {
  it("a phone-width first commit renders the phone bottom bar, never the desktop right panel", async () => {
    const { createRoot } = await import("react-dom/client");
    const { flushSync } = await import("react-dom");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio(twoClipSettings);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      flushSync(() => {
        root.render(
          <QueryClientProvider client={qc}>
            <StudioPage projectId="p1" />
          </QueryClientProvider>,
        );
      });
      expect(host.querySelector('nav[aria-label="Editor sections"]')).not.toBeNull();
      expect(host.querySelector('aside[aria-label="Right panel"]')).toBeNull();
    } finally {
      flushSync(() => root.unmount());
      host.remove();
    }
  });
});
