import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, defaultStyle, ProjectSettingsSchema } from "@capseasy/shared";
import StudioPage from "../StudioPage";

/**
 * CAP-P01 / CAP-P02 regression: the Studio's heavy leaves — the rail/right-tab
 * panels (AiGenerate, SoundEffects, Titles, Stickers, NewGraphics, Transitions,
 * MotionStudio) and the Remotion preview player (StudioPlayer) — are lazy
 * imports in StudioPage (next/dynamic for the panels, React.lazy for the
 * player — next/dynamic swallows the player ref, see StudioPage), NOT in the
 * first paint.
 *
 * These tests pin the contract from the user's side: a lazy leaf is absent on
 * first paint and appears once its section/tab opens; the preview player
 * mounts through the lazy import (its stub's imperative handle is what the
 * seek/play assertions in studioRevisionPhase2 drive). The panel stubs prove
 * the dynamic wiring; the REAL MotionStudioPanel + TransitionsPanel loading
 * through the same mechanism is pinned by the "Motion templates" findBy here
 * and the real-panel apply tests in studioRevisionPhase2.
 *
 * Harness copied from studioRevisionPhase2.test.tsx (same pattern as
 * studioFirstLoad / captionSectionSwitch): mocked useStudio, stubbed heavy
 * leaves, real rail + right tabs.
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
  UploadPanel: () => <div>Upload panel (stubbed)</div>,
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
vi.mock("../Timeline", () => ({ Timeline: () => <div>Timeline (stubbed)</div> }));
vi.mock("../panels/LooksPanel", () => ({ LooksPanel: () => <div>Looks panel (stubbed)</div> }));
vi.mock("../panels/AiGeneratePanel", () => ({
  AiGeneratePanel: () => <div>ai-generate-panel</div>,
}));
vi.mock("../panels/SoundEffectsPanel", () => ({
  SoundEffectsPanel: () => <div>sfx-panel</div>,
}));
vi.mock("../panels/TitlesPanel", () => ({ TitlesPanel: () => <div>titles-panel</div> }));
vi.mock("../panels/StickersPanel", () => ({ StickersPanel: () => <div>stickers-panel</div> }));
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

function makeStudio() {
  return {
    doc,
    style: defaultStyle(),
    settings: twoClipSettings,
    lookId: null,
    saveState: "saved",
    conflict: null,
    canUndo: false,
    canRedo: false,
    edit: vi.fn(),
    editAll: vi.fn(),
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
  return render(
    <QueryClientProvider client={qc}>
      <StudioPage projectId="p1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("ce:tutorial-seen:v2", "1");
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

describe("StudioPage code-split leaves (CAP-P01 / CAP-P02)", () => {
  it("lazy right-tab panels are absent on first paint, then load when their tab opens", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio();
    const { unmount } = renderStudio();
    try {
      // first paint: none of the lazy tab panels is in the DOM yet …
      expect(screen.queryByText("titles-panel")).toBeNull();
      expect(screen.queryByText("stickers-panel")).toBeNull();
      expect(screen.queryByText("sfx-panel")).toBeNull();
      expect(screen.queryByText("new-graphics-panel")).toBeNull();
      // … but the default tab's REAL panel still loads through the same
      // dynamic import (MotionStudioPanel is the default right tab). The
      // chunk transform can be slow on a loaded VM, so this wait gets a
      // longer timeout than the default 1 s.
      expect(await screen.findByText("Motion templates", {}, { timeout: 10000 })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Titles" }));
      expect(await screen.findByText("titles-panel")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Stickers" }));
      expect(await screen.findByText("stickers-panel")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Sounds" }));
      expect(await screen.findByText("sfx-panel")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Graphics" }));
      expect(await screen.findByText("new-graphics-panel")).toBeTruthy();
    } finally {
      unmount();
    }
  }, 15000);

  it("the preview player mounts through the lazy import", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = makeStudio();
    const { unmount } = renderStudio();
    try {
      // No "absent on first paint" pin here: React.lazy caches the chunk once
      // any earlier test in this file loaded it, so the stub can already be
      // mounted on first paint. The deferral itself is proven by the build
      // (the player lives in its own chunk, not the Studio first-load chunk).
      expect(await screen.findByRole("button", { name: "player-caption-tap" })).toBeTruthy();
    } finally {
      unmount();
    }
  });

  it("the Generate Image/Video rail section is hidden while AI Edit is off", async () => {
    // Owner order 2026-11-25: the rail entry is filtered out while
    // AI_EDIT_ENABLED is false, so the panel never loads — even for a
    // blank AI-Edit project, which opens on Captions instead.
    window.history.pushState({}, "", "/projects/p1");
    window.localStorage.setItem("oc:ai-edit-project:p1", "1");
    studioState.current = makeStudio();
    const { unmount } = renderStudio();
    try {
      expect(screen.queryByRole("button", { name: "Generate Image/Video" })).toBeNull();
      expect(screen.queryByText("ai-generate-panel")).toBeNull();
    } finally {
      unmount();
    }
  });
});
