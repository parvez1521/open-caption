import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, defaultStyle, ProjectSettingsSchema } from "@capseasy/shared";
import StudioPage from "../StudioPage";

// CAP-P01/CAP-P02: StudioPage's panels + preview player are lazy imports —
// the first test in this file pays the chunk transform, which on a loaded VM
// can exceed the default 5 s test timeout (same assertions, more wall clock).
vi.setConfig({ testTimeout: 15_000 });

/**
 * Caption click opens the Captions section (owner 2026-11-16): when the user
 * is in another sidebar section (Templates, Adjust, …) and clicks a caption —
 * on the preview, or a word in the timeline — the sidebar must switch to
 * Captions instead of staying put. Only USER clicks switch: programmatic
 * selection (split-at-playhead via the "S" key, adding a word) must never yank
 * the user out of Templates while the video plays.
 *
 * Drives the real StudioPage with a mocked useStudio (same pattern as
 * studioFirstLoad.test.tsx) and stubbed heavy leaves — the StudioPlayer stub
 * exposes onCaptionTap as a button, the Timeline stub exposes onSelect as a
 * button — while the rail, the Captions panel and the keyboard handler are
 * real. Google font loading is stubbed so pages compute in jsdom.
 */

// jsdom has no ResizeObserver; the right column's Motion Studio panel
// (AnimatedSocialPreview) creates one on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const studioState = vi.hoisted(() => ({ current: null as unknown }));

const stable = vi.hoisted(() => ({
  deviceVideo: { video: null, status: "none", attach: () => {} },
  compat: { state: "none", progress: 0, url: null },
  waveform: { peaks: null, state: "idle" },
  mediaAssets: { assets: [], importing: false, importFiles: () => {}, remove: () => {}, refresh: () => {} },
  brandNav: { go: () => {}, busy: () => () => undefined },
  router: { replace: () => {}, push: () => {} },
}));

vi.mock("../useStudio", () => ({ useStudio: () => studioState.current }));
vi.mock("../UploadPanel", () => ({
  UploadPanel: () => <div>Upload panel (stubbed)</div>,
}));
vi.mock("../ProcessingPanel", () => ({ ProcessingPanel: () => null }));
vi.mock("../StudioPlayer", () => ({
  StudioPlayer: React.forwardRef(function StudioPlayerStub(props: { onCaptionTap?: () => void }, ref: React.Ref<unknown>) {
    React.useImperativeHandle(ref, () => ({
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      toggle: () => undefined,
      // the playhead sits at 100 ms: "Dulhan?" ends a sentence, so derivePages
      // groups [w1, w2] / [w3, w4] — at 100 ms split-at-playhead picks w2
      getCurrentFrame: () => 3,
      seekTo: () => undefined,
    }));
    return (
      <div>
        <button type="button" onClick={() => props.onCaptionTap?.()}>player-caption-tap</button>
      </div>
    );
  }),
}));
vi.mock("../Timeline", () => ({
  Timeline: (props: { onSelect: (wordId: string | null) => void }) => (
    <div>
      <button type="button" onClick={() => props.onSelect("w1")}>timeline-word-click</button>
      <button type="button" onClick={() => props.onSelect(null)}>timeline-empty-click</button>
    </div>
  ),
}));
vi.mock("../panels/LooksPanel", () => ({ LooksPanel: () => <div>Looks panel (stubbed)</div> }));
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

const edit = vi.fn();
const baseStudio = {
  doc,
  style: defaultStyle(),
  settings: ProjectSettingsSchema.parse({}),
  lookId: null,
  saveState: "saved",
  conflict: null,
  canUndo: false,
  canRedo: false,
  edit,
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

function renderStudio() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <StudioPage projectId="p1" />
    </QueryClientProvider>,
  );
  return { ...utils, qc };
}

const sectionPressed = (label: string) =>
  (screen.getByRole("button", { name: label }) as HTMLButtonElement).getAttribute("aria-pressed") === "true";

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("ce:tutorial-seen:v2", "1");
  edit.mockClear();
  // desktop layout: the left rail carries the section buttons
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

describe("StudioPage — a caption click opens the Captions section", () => {
  it("timeline word click switches from Templates to Captions", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = baseStudio;
    const { unmount } = renderStudio();
    try {
      // pages compute once the (stubbed) fonts resolve; the word list proves it
      expect(await screen.findByRole("button", { name: "Dulha" })).toBeTruthy();
      expect(sectionPressed("Captions")).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: "Templates" }));
      expect(sectionPressed("Templates")).toBe(true);
      expect(sectionPressed("Captions")).toBe(false);

      fireEvent.click(screen.getByRole("button", { name: "timeline-word-click" }));
      expect(sectionPressed("Captions")).toBe(true);
      expect(sectionPressed("Templates")).toBe(false);
      expect(await screen.findByRole("button", { name: "Dulha" })).toBeTruthy();
    } finally {
      unmount();
    }
  });

  it("preview caption tap switches from Adjust to Captions", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = baseStudio;
    const { unmount } = renderStudio();
    try {
      expect(await screen.findByRole("button", { name: "Dulha" })).toBeTruthy();
      // CAP-P02: StudioPlayer is lazy — await the stub before tapping it.
      expect(await screen.findByRole("button", { name: "player-caption-tap" })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
      expect(sectionPressed("Adjust")).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: "player-caption-tap" }));
      expect(sectionPressed("Captions")).toBe(true);
      expect(sectionPressed("Adjust")).toBe(false);
    } finally {
      unmount();
    }
  });

  it("split-at-playhead ('S' key) selects a word WITHOUT switching the section", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = baseStudio;
    const { unmount } = renderStudio();
    try {
      expect(await screen.findByRole("button", { name: "Dulha" })).toBeTruthy();
      // CAP-P02: split-at-playhead reads the playhead through the player ref,
      // so the lazy StudioPlayer stub must be mounted before the keypress.
      expect(await screen.findByRole("button", { name: "player-caption-tap" })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Templates" }));
      expect(sectionPressed("Templates")).toBe(true);

      fireEvent.keyDown(window, { key: "s" });
      // the split ran (edit called) and selected w2 — but the section stayed put
      expect(edit).toHaveBeenCalled();
      expect(sectionPressed("Templates")).toBe(true);
      expect(sectionPressed("Captions")).toBe(false);
    } finally {
      unmount();
    }
  });

  it("deselecting on the timeline (null) does not switch the section", async () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = baseStudio;
    const { unmount } = renderStudio();
    try {
      expect(await screen.findByRole("button", { name: "Dulha" })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Templates" }));
      fireEvent.click(screen.getByRole("button", { name: "timeline-empty-click" }));
      expect(sectionPressed("Templates")).toBe(true);
      expect(sectionPressed("Captions")).toBe(false);
    } finally {
      unmount();
    }
  });
});
