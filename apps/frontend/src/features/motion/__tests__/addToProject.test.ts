/**
 * Add-to-project insertion (Wave 2 §3a): the pure placement/item builders, and the real
 * persistence path — getStudio → append overlay → savePatch with the full settings and the
 * Stage-C dual-write fragment — plus the staged-asset copy into the target project's bin.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSettingsSchema, type OverlayItem } from "@capseasy/shared";

const h = vi.hoisted(() => ({
  getStudio: vi.fn(),
  savePatch: vi.fn(async () => ({})),
  listAllAssets: vi.fn(async () => [] as unknown[]),
  saveAsset: vi.fn(async () => undefined),
}));

vi.mock("@/services/studio", () => ({
  studioService: { getStudio: h.getStudio, savePatch: h.savePatch },
}));
vi.mock("@/features/studio/mediaStore", () => ({
  listAllAssets: h.listAllAssets,
  saveAsset: h.saveAsset,
}));

import { addMotionToProject, buildMotionOverlayItem, chooseMotionStartMs } from "../addToProject";

const existing: OverlayItem = {
  id: "ov-1", kind: "text", text: "Hi", startMs: 1000, endMs: 5000, x: 0.5, y: 0.5, scale: 1, rotation: 0, color: "#FFFFFF",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.getStudio.mockResolvedValue({
    project: { id: "proj-1", settings_json: { overlays: [existing] }, composition_json: null },
    video: { durationMs: 60000 },
  });
  h.listAllAssets.mockResolvedValue([]);
});

describe("chooseMotionStartMs", () => {
  it("starts at 0 when the project has no overlays", () => {
    expect(chooseMotionStartMs([], 60000, 4000)).toBe(0);
  });
  it("starts right after the last overlay when it fits in the video", () => {
    expect(chooseMotionStartMs([existing], 60000, 4000)).toBe(5000);
  });
  it("falls back to 0 when after-the-last would run past the end of the video", () => {
    expect(chooseMotionStartMs([existing], 6000, 4000)).toBe(0);
  });
  it("places after the last overlay when the video length is unknown", () => {
    expect(chooseMotionStartMs([existing], 0, 4000)).toBe(5000);
  });
});

describe("buildMotionOverlayItem", () => {
  it("carries the config's text, colour and duration, anchored like a social overlay", () => {
    const item = buildMotionOverlayItem({ variant: "counter", text: "0\n100\nfans", color: "#FFA946", durationMs: 5000 }, 2000);
    expect(item).toMatchObject({ kind: "social", variant: "counter", text: "0\n100\nfans", color: "#FFA946", startMs: 2000, endMs: 7000, x: 0.5, y: 0.78 });
    expect(item.assetId).toBeUndefined();
  });
  it("carries the asset reference when one is given", () => {
    const item = buildMotionOverlayItem({ variant: "qr-frame", text: "Scan", color: "#34D399", durationMs: 4000 }, 0, { id: "a1", name: "qr.png" });
    expect(item).toMatchObject({ assetId: "a1", assetName: "qr.png" });
  });
});

describe("addMotionToProject", () => {
  it("appends the item to the project's overlays and saves the full settings (with the Stage-C fragment)", async () => {
    const item = await addMotionToProject("proj-1", { config: { variant: "counter", text: "0\n100\nfans", color: "#FFA946", durationMs: 5000 } });
    expect(item.startMs).toBe(5000);
    expect(item.endMs).toBe(10000);
    expect(h.savePatch).toHaveBeenCalledTimes(1);
    const [pid, patch] = h.savePatch.mock.calls[0]! as unknown as [string, { settings_json: { overlays: OverlayItem[] }; composition_json?: unknown }];
    expect(pid).toBe("proj-1");
    expect(patch.settings_json.overlays).toHaveLength(2);
    expect(patch.settings_json.overlays[0]).toEqual(existing);
    expect(patch.settings_json.overlays[1]).toEqual(item);
    // the saved settings still parse against the real schema, and the dual-write fragment rides along
    expect(() => ProjectSettingsSchema.parse(patch.settings_json)).not.toThrow();
    expect(patch.composition_json).toBeDefined();
  });

  it("copies a staged asset into the target project's bin and references the copy", async () => {
    const staged = {
      id: "staged-1", projectId: "motion-studio", kind: "image", name: "qr.png", mime: "image/png", size: 5,
      durationMs: null, width: 10, height: 10, blob: new Blob(["x"]), thumb: null, peaks: null, createdAt: 1,
    };
    h.listAllAssets.mockResolvedValue([staged]);
    const item = await addMotionToProject("proj-1", { config: { variant: "qr-frame", text: "Scan", color: "#34D399", durationMs: 4000 }, assetId: "staged-1" });
    expect(h.saveAsset).toHaveBeenCalledTimes(1);
    const copy = h.saveAsset.mock.calls[0]![0] as unknown as { id: string; projectId: string; name: string };
    expect(copy.projectId).toBe("proj-1");
    expect(copy.id).not.toBe("staged-1");
    expect(item.assetId).toBe(copy.id);
    expect(item.assetName).toBe("qr.png");
  });

  it("inserts without an image when the staged asset is not on this device", async () => {
    const item = await addMotionToProject("proj-1", { config: { variant: "qr-frame", text: "Scan", color: "#34D399", durationMs: 4000 }, assetId: "gone" });
    expect(item.assetId).toBeUndefined();
    expect(h.saveAsset).not.toHaveBeenCalled();
  });
});
