import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSettingsSchema } from "@capseasy/shared";
import StudioPage from "../StudioPage";

/**
 * OC-001 regression: React error #310 ("Rendered more hooks than during the
 * previous render") on the fresh-project first load.
 *
 * Root cause: StudioPage called two hooks — the `genCapNote` useState and the
 * `generateCaptions` useCallback — AFTER the `if (s.query.isLoading) return
 * <StudioSkeleton />` early return. A fresh project renders once with
 * isLoading=true (those two hooks never run) and again once the query resolves
 * (two MORE hooks than the previous render) — React throws #310 and the
 * projects/[id] error boundary shows "The editor hit a snag". Recovery via the
 * boundary's reset worked only because the query cache was warm by then.
 *
 * These tests drive that exact transition with a controllable mocked useStudio:
 * render loading, then rerender loaded. They must pass in jsdom (no Supabase
 * needed); the live-browser proof is the e2e spec in e2e/studio-first-load.spec.ts.
 */

const studioState = vi.hoisted(() => ({ current: null as unknown }));

// STABLE mock returns (same object identity on every render): StudioPage has
// effects keyed on e.g. mediaBin.assets, so a mock that builds a fresh
// `{ assets: [] }` literal per render re-runs those effects forever
// (setState → render → new identity → effect → …) and the worker OOMs.
const stable = vi.hoisted(() => ({
  deviceVideo: { video: null, status: "none", attach: () => {} },
  compat: { state: "none", progress: 0, url: null },
  waveform: { peaks: null, state: "idle" },
  mediaAssets: { assets: [], importing: false, importFiles: () => {}, remove: () => {}, refresh: () => {} },
  brandNav: { go: () => {}, busy: () => () => undefined },
  router: { replace: () => {}, push: () => {} },
}));

vi.mock("../useStudio", () => ({ useStudio: () => studioState.current }));
// Heavy leaves, stubbed so this test's import graph stays light (the real
// UploadPanel pulls browserWhisper/transformers+onnxruntime, the real
// StudioPlayer/Timeline pull the Remotion player — importing them in jsdom
// here takes minutes; the hook-order fault lives in StudioPage itself, and
// the stub keeps the exact contract this test drives: the door radiogroup,
// the "Choose a video" button, and the onModeChange callback).
vi.mock("../UploadPanel", () => ({
  UploadPanel: ({ mode = "captions", onModeChange }: { mode?: string; onModeChange?: (m: string) => void }) => (
    <div>
      <div role="radiogroup" aria-label="How this project starts">
        {[
          ["captions", "Captions"],
          ["editor", "Normal Editor"],
          ["ai-edit", "AI Edit"],
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
  // never rendered in these tests (hasEditor is false throughout); the stub
  // only needs to exist so StudioPage's import graph stays light.
  StudioPlayer: () => null,
}));
vi.mock("../Timeline", () => ({ Timeline: () => null }));
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

const baseStudio = {
  doc: null,
  style: null,
  settings: ProjectSettingsSchema.parse({}),
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
};

const loadingStudio = { ...baseStudio, query: { isLoading: true, error: null }, data: undefined };
const loadedStudio = { ...baseStudio, query: { isLoading: false, error: null }, data: loadedData };

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
  // jsdom has no matchMedia; useIsDesktop reads it in an effect.
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
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("StudioPage first load — OC-001 (React #310)", () => {
  it.each([
    ["captions door (default)", ""],
    ["normal-editor door", "?mode=editor"],
    ["ai-edit door", "?mode=ai-edit"],
  ])("%s: loading → loaded renders the upload screen, no hook-order crash", (_label, search) => {
    window.history.pushState({}, "", `/projects/p1${search}`);
    studioState.current = loadingStudio;
    const { rerender, unmount, qc } = renderStudio();
    try {
      // the loading gate's skeleton shows first …
      studioState.current = loadedStudio;
      // … then the query resolves: pre-fix this rerender threw
      // "Rendered more hooks than during the previous render" (#310)
      expect(() => rerender(
        <QueryClientProvider client={qc}>
          <StudioPage projectId="p1" />
        </QueryClientProvider>,
      )).not.toThrow();
      expect(screen.getByRole("button", { name: /Choose a video/ })).toBeTruthy();
      expect(screen.queryByText("The editor hit a snag")).toBeNull();
    } finally {
      unmount();
    }
  });

  it("resume: first render already loaded (warm query cache) renders the upload screen", () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = loadedStudio;
    const { unmount } = renderStudio();
    try {
      expect(screen.getByRole("button", { name: /Choose a video/ })).toBeTruthy();
    } finally {
      unmount();
    }
  });

  it("mode switch after load: the upload panel's door toggle changes door without crashing", () => {
    window.history.pushState({}, "", "/projects/p1");
    studioState.current = loadedStudio;
    const { unmount } = renderStudio();
    try {
      const normalEditor = screen.getByRole("radio", { name: /Normal Editor/ });
      expect(normalEditor.getAttribute("aria-checked")).toBe("false");
      fireEvent.click(normalEditor);
      expect(screen.getByRole("radio", { name: /Normal Editor/ }).getAttribute("aria-checked")).toBe("true");
      expect(screen.getByRole("button", { name: /Choose a video/ })).toBeTruthy();
      expect(screen.queryByText("The editor hit a snag")).toBeNull();
    } finally {
      unmount();
    }
  });
});
