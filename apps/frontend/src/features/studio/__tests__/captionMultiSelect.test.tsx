import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, defaultStyle, ProjectSettingsSchema } from "@capseasy/shared";
import StudioPage from "../StudioPage";

/**
 * Caption multi-select (owner 2026-11-16, second correction): the DEFAULT is
 * the old behaviour — moving a caption moves ALL of them (the global
 * style.position), so a new user is never confused by one caption moving and
 * the rest staying. Only when 2+ cards are picked on the timeline does a
 * drag write per-card overrides to just those cards. Exactly one card picked
 * still moves globally. While a selective drag moves cards the playhead card
 * is NOT in, a ghost shows the dragged spot — the playhead caption must never
 * visibly move and then snap back.
 *
 * Drives the real StudioPage with a mocked useStudio (same pattern as
 * captionSectionSwitch.test.tsx) and stubbed heavy leaves — the StudioPlayer
 * stub exposes onMovePosition as a button and renders the drag ghost, the
 * Timeline stub exposes onCardSelectionChange as buttons reading the page ids
 * off its pages prop.
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
  StudioPlayer: React.forwardRef(function StudioPlayerStub(
    props: { onMovePosition?: (p: { x: number; y: number }) => void; onPositionDragStart?: (p: { x: number; y: number }) => void; onNudgePosition?: (d: { dx: number; dy: number }) => void; onPositionDragEnd?: () => void; dragGhost?: { x: number; y: number } | null },
    ref: React.Ref<unknown>,
  ) {
    React.useImperativeHandle(ref, () => ({
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      toggle: () => undefined,
      getCurrentFrame: () => 3,
      seekTo: () => undefined,
    }));
    return (
      <div>
        {/* a real drag always starts with pointerdown at the caption's spot, then moves — the stub fires both */}
        <button type="button" onClick={() => { props.onPositionDragStart?.({ x: 0.5, y: 0.72 }); props.onMovePosition?.({ x: 0.5, y: 0.2 }); }}>player-move</button>
        {/* a drag that starts on an overridden caption (its spot is 0.8, not the global 0.72) */}
        <button type="button" onClick={() => { props.onPositionDragStart?.({ x: 0.5, y: 0.8 }); props.onMovePosition?.({ x: 0.5, y: 0.2 }); }}>player-drag-override</button>
        <button type="button" onClick={() => props.onNudgePosition?.({ dx: 0, dy: -0.01 })}>player-nudge-up</button>
        <button type="button" onClick={() => props.onPositionDragEnd?.()}>player-drag-end</button>
        <span>{props.dragGhost ? `ghost:${props.dragGhost.x},${props.dragGhost.y}` : "no-ghost"}</span>
      </div>
    );
  }),
}));
vi.mock("../Timeline", () => ({
  Timeline: (props: { pages: { id: string }[]; onCardSelectionChange: (ids: Set<string>) => void }) => (
    <div>
      <button type="button" onClick={() => props.onCardSelectionChange(new Set([props.pages[0]!.id, props.pages[1]!.id]))}>select-cards-1-2</button>
      <button type="button" onClick={() => props.onCardSelectionChange(new Set([props.pages[1]!.id, props.pages[2]!.id]))}>select-cards-2-3</button>
      <button type="button" onClick={() => props.onCardSelectionChange(new Set([props.pages[1]!.id]))}>select-card-2</button>
      <button type="button" onClick={() => props.onCardSelectionChange(new Set())}>clear-cards</button>
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

// six words, three sentence-ended cards: [w1, w2] / [w3, w4] / [w5, w6]
const doc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    { id: "w1", text: "Dulha", startMs: 0, endMs: 400 },
    { id: "w2", text: "Dulhan?", startMs: 420, endMs: 800 },
    { id: "w3", text: "hota", startMs: 820, endMs: 1200 },
    { id: "w4", text: "hai?", startMs: 1220, endMs: 1600 },
    { id: "w5", text: "aur", startMs: 1620, endMs: 2000 },
    { id: "w6", text: "kya?", startMs: 2020, endMs: 2400 },
  ],
});

// same words, but the playhead card (w1) already has a per-card override at 0.8
const overriddenDoc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    { id: "w1", text: "Dulha", startMs: 0, endMs: 400 },
    { id: "w2", text: "Dulhan?", startMs: 420, endMs: 800 },
    { id: "w3", text: "hota", startMs: 820, endMs: 1200 },
    { id: "w4", text: "hai?", startMs: 1220, endMs: 1600 },
    { id: "w5", text: "aur", startMs: 1620, endMs: 2000 },
    { id: "w6", text: "kya?", startMs: 2020, endMs: 2400 },
  ],
  cards: { w1: { position: { x: 0.5, y: 0.8 } } },
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
// like the real patchStyle, the mock invokes the updater once (StudioPage's
// global move captures the old/new global inside that updater)
const patchStyle = vi.fn((fn: (s: ReturnType<typeof defaultStyle>) => ReturnType<typeof defaultStyle>, _opts?: { coalesceKey?: string }) => fn(defaultStyle()));
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
  patchStyle,
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

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("ce:tutorial-seen:v2", "1");
  edit.mockClear();
  patchStyle.mockClear();
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

async function mountStudio(studio: typeof baseStudio = baseStudio) {
  window.history.pushState({}, "", "/projects/p1");
  studioState.current = studio;
  const utils = renderStudio();
  // pages compute once the (stubbed) fonts resolve; the word list proves it
  expect(await screen.findByRole("button", { name: "Dulha" })).toBeTruthy();
  // CAP-P02: StudioPlayer is lazy — the stub's buttons only exist once its
  // chunk loads; every test below drives the player stub, so await it here.
  expect(await screen.findByRole("button", { name: "player-move" })).toBeTruthy();
  edit.mockClear();
  patchStyle.mockClear();
  return utils;
}

describe("StudioPage — caption multi-select (owner 2026-11-16)", () => {
  it("with no card selection a drag moves the GLOBAL position (patchStyle), no override written", async () => {
    const { unmount } = await mountStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "player-move" }));
      expect(patchStyle).toHaveBeenCalledTimes(1);
      expect(edit).not.toHaveBeenCalled();
      const nextStyle = (patchStyle.mock.calls[0]![0] as (s: ReturnType<typeof defaultStyle>) => ReturnType<typeof defaultStyle>)(defaultStyle());
      expect(nextStyle.position).toEqual({ x: 0.5, y: 0.2 });
    } finally {
      unmount();
    }
  });

  it("with exactly one card selected a drag still moves globally", async () => {
    const { unmount } = await mountStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "select-card-2" }));
      fireEvent.click(screen.getByRole("button", { name: "player-move" }));
      expect(patchStyle).toHaveBeenCalledTimes(1);
      expect(edit).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  it("with 2+ cards selected a drag writes overrides to ONLY those cards", async () => {
    const { unmount } = await mountStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "select-cards-1-2" }));
      fireEvent.click(screen.getByRole("button", { name: "player-move" }));
      expect(patchStyle).not.toHaveBeenCalled();
      expect(edit).toHaveBeenCalledTimes(1);
      const fn = edit.mock.calls[0]![0] as (d: typeof doc) => typeof doc;
      const next = fn(doc);
      // page 1 starts at w1, page 2 at w3 — both moved; page 3 (w5) untouched
      expect(next.cards.w1?.position).toEqual({ x: 0.5, y: 0.2 });
      expect(next.cards.w3?.position).toEqual({ x: 0.5, y: 0.2 });
      expect(next.cards.w5?.position ?? null).toBeNull();
      expect(() => CaptionDocSchema.parse(next)).not.toThrow();
    } finally {
      unmount();
    }
  });

  it("two moves with the same selection share one undo step (stable coalesce key)", async () => {
    const { unmount } = await mountStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "select-cards-1-2" }));
      fireEvent.click(screen.getByRole("button", { name: "player-move" }));
      fireEvent.click(screen.getByRole("button", { name: "player-move" }));
      expect(edit).toHaveBeenCalledTimes(2);
      const key0 = (edit.mock.calls[0]![1] as { coalesceKey: string }).coalesceKey;
      const key1 = (edit.mock.calls[1]![1] as { coalesceKey: string }).coalesceKey;
      expect(key0).toMatch(/^card-position:multi:/);
      expect(key1).toBe(key0);
    } finally {
      unmount();
    }
  });

  it("when the playhead card is NOT in the selection, the drag shows a ghost at the dragged spot", async () => {
    const { unmount } = await mountStudio();
    try {
      // playhead sits at 100 ms: page 1. Select pages 2 + 3.
      fireEvent.click(screen.getByRole("button", { name: "select-cards-2-3" }));
      expect(screen.getByText("no-ghost")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "player-move" }));
      expect(screen.getByText("ghost:0.5,0.2")).toBeTruthy();
      // drag end clears the ghost
      fireEvent.click(screen.getByRole("button", { name: "player-drag-end" }));
      expect(screen.getByText("no-ghost")).toBeTruthy();
    } finally {
      unmount();
    }
  });

  it("when the playhead card IS in the selection, no ghost (it moves live)", async () => {
    const { unmount } = await mountStudio();
    try {
      fireEvent.click(screen.getByRole("button", { name: "select-cards-1-2" }));
      fireEvent.click(screen.getByRole("button", { name: "player-move" }));
      expect(screen.getByText("no-ghost")).toBeTruthy();
      expect(screen.queryByText(/ghost:/)).toBeNull();
    } finally {
      unmount();
    }
  });

  it("a global drag moves an overridden card by the SAME delta (delta rule)", async () => {
    const { unmount } = await mountStudio({ ...baseStudio, doc: overriddenDoc });
    try {
      // the drag starts on the overridden caption at 0.8 and moves to 0.2: delta -0.6
      fireEvent.click(screen.getByRole("button", { name: "player-drag-override" }));
      expect(patchStyle).toHaveBeenCalledTimes(1);
      expect(edit).toHaveBeenCalledTimes(1);
      // one undo step: the style change and the shifted overrides share one coalesce key
      expect((patchStyle.mock.calls[0]![1] as { coalesceKey: string }).coalesceKey).toBe("caption-position:global");
      expect((edit.mock.calls[0]![1] as { coalesceKey: string }).coalesceKey).toBe("caption-position:global");
      // global 0.72 - 0.6 = 0.12; the override keeps its offset: 0.8 - 0.6 = 0.2
      const nextStyle = (patchStyle.mock.calls[0]![0] as (s: ReturnType<typeof defaultStyle>) => ReturnType<typeof defaultStyle>)(defaultStyle());
      expect(nextStyle.position).toEqual({ x: 0.5, y: 0.12 });
      const nextDoc = (edit.mock.calls[0]![0] as (d: typeof overriddenDoc) => typeof overriddenDoc)(overriddenDoc);
      expect(nextDoc.cards.w1?.position).toEqual({ x: 0.5, y: 0.2 });
      // the other cards had no override: none is written for them
      expect(nextDoc.cards.w3?.position ?? null).toBeNull();
      expect(nextDoc.cards.w5?.position ?? null).toBeNull();
      expect(() => CaptionDocSchema.parse(nextDoc)).not.toThrow();
    } finally {
      unmount();
    }
  });

  it("a grip arrow-key nudge shifts overrides by one step (delta rule)", async () => {
    const { unmount } = await mountStudio({ ...baseStudio, doc: overriddenDoc });
    try {
      fireEvent.click(screen.getByRole("button", { name: "player-nudge-up" }));
      expect(patchStyle).toHaveBeenCalledTimes(1);
      expect(edit).toHaveBeenCalledTimes(1);
      expect((patchStyle.mock.calls[0]![1] as { coalesceKey: string }).coalesceKey).toBe("caption-position:global");
      expect((edit.mock.calls[0]![1] as { coalesceKey: string }).coalesceKey).toBe("caption-position:global");
      // global 0.72 - 0.01 = 0.71; the override keeps its offset: 0.8 - 0.01 = 0.79
      const nextStyle = (patchStyle.mock.calls[0]![0] as (s: ReturnType<typeof defaultStyle>) => ReturnType<typeof defaultStyle>)(defaultStyle());
      expect(nextStyle.position).toEqual({ x: 0.5, y: 0.71 });
      const nextDoc = (edit.mock.calls[0]![0] as (d: typeof overriddenDoc) => typeof overriddenDoc)(overriddenDoc);
      expect(nextDoc.cards.w1?.position).toEqual({ x: 0.5, y: 0.79 });
    } finally {
      unmount();
    }
  });
});
