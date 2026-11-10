/**
 * Motion presets storage (Wave 2 §3): versioned localStorage key, per-template lists,
 * overwrite-by-name, delete, and tolerance of broken/full storage.
 */
import { describe, expect, it } from "vitest";
import { MOTION_PRESETS_KEY, deleteMotionPreset, listMotionPresets, saveMotionPreset } from "../presets";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    map,
  } as Storage & { map: Map<string, string> };
}

const preset = { name: "Main", text: "A\nB", color: "#FF4D2E", durationMs: 4000 };

describe("motion presets", () => {
  it("round-trips save → list → delete under the versioned key", () => {
    const s = fakeStorage();
    expect(saveMotionPreset("counter", preset, s, 1000)).toBe(true);
    expect(s.map.has(MOTION_PRESETS_KEY)).toBe(true);
    expect(listMotionPresets("counter", s)).toEqual([{ ...preset, savedAt: 1000 }]);
    expect(listMotionPresets("other-template", s)).toEqual([]);
    expect(deleteMotionPreset("counter", "Main", s)).toBe(true);
    expect(listMotionPresets("counter", s)).toEqual([]);
    expect(deleteMotionPreset("counter", "Main", s)).toBe(false);
  });

  it("saving the same name overwrites instead of duplicating", () => {
    const s = fakeStorage();
    saveMotionPreset("counter", preset, s, 1000);
    saveMotionPreset("counter", { ...preset, text: "Changed" }, s, 2000);
    const list = listMotionPresets("counter", s);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ text: "Changed", savedAt: 2000 });
  });

  it("keeps templates' presets separate", () => {
    const s = fakeStorage();
    saveMotionPreset("counter", preset, s, 1);
    saveMotionPreset("qr-frame", { ...preset, name: "QR one" }, s, 2);
    expect(listMotionPresets("counter", s).map((p) => p.name)).toEqual(["Main"]);
    expect(listMotionPresets("qr-frame", s).map((p) => p.name)).toEqual(["QR one"]);
  });

  it("reads corrupt or throwing storage as empty, and a throwing setItem reports failure", () => {
    const corrupt = fakeStorage({ [MOTION_PRESETS_KEY]: "{not json" });
    expect(listMotionPresets("counter", corrupt)).toEqual([]);
    const throwing = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("full"); },
    } as unknown as Storage;
    expect(listMotionPresets("counter", throwing)).toEqual([]);
    expect(saveMotionPreset("counter", preset, throwing)).toBe(false);
  });

  it("rejects an empty preset name", () => {
    const s = fakeStorage();
    expect(saveMotionPreset("counter", { ...preset, name: "   " }, s)).toBe(false);
    expect(listMotionPresets("counter", s)).toEqual([]);
  });
});
