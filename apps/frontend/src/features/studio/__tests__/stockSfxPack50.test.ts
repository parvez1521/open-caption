import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { licenceRecordForStockItem, stockSfxItems, validateStockManifest, type StockSfxItem } from "../stockCatalogue";

const PUBLIC_SFX = path.resolve(__dirname, "../../../../public/stock-sfx");

/** The 29 everyday SFX synthesized in code 2026-11-18 (see scripts/synthesize-sfx-2026-11-18.py). */
const EXPECTED_SFX_IDS = [
  "sfx-whoosh-soft", "sfx-whoosh-fast", "sfx-whoosh-heavy", "sfx-whoosh-swish", "sfx-whoosh-whip-pan",
  "sfx-pop-bright", "sfx-pop-soft", "sfx-pop-deep", "sfx-pop-bubble",
  "sfx-click-soft", "sfx-click-mechanical", "sfx-click-tick",
  "sfx-ding-high", "sfx-ding-soft", "sfx-ding-triple", "sfx-ding-chime",
  "sfx-riser-short", "sfx-riser-long", "sfx-riser-air",
  "sfx-downlifter-short", "sfx-downlifter-long",
  "sfx-impact-deep", "sfx-impact-punch", "sfx-impact-thud",
  "sfx-tick-fast", "sfx-tick-clock",
  "sfx-glitch-digital", "sfx-glitch-stutter",
  "sfx-boing",
];

describe("bundled SFX pack — 50 items (2026-11-18)", () => {
  const items = stockSfxItems();
  const onDisk = JSON.parse(readFileSync(path.join(PUBLIC_SFX, "manifest.json"), "utf8")) as {
    items: StockSfxItem[];
    pack: { note: string };
  };

  it("the pack is 50 items: 12 starter + 9 meme + 29 everyday SFX", () => {
    expect(items).toHaveLength(50);
    expect(items).toEqual(onDisk.items);
    expect(items.filter((i) => i.group === "starter")).toHaveLength(12);
    expect(items.filter((i) => i.group === "meme")).toHaveLength(9);
    expect(items.filter((i) => i.group === "sfx")).toHaveLength(29);
  });

  it("ids are unique and the 29 new ids are exactly the synthesized set", () => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(items.filter((i) => i.group === "sfx").map((i) => i.id).sort()).toEqual([...EXPECTED_SFX_IDS].sort());
  });

  it("every file exists under public/stock-sfx, is a real OGG, and every duration is positive", () => {
    for (const it of items) {
      const p = path.join(PUBLIC_SFX, it.file);
      expect(existsSync(p), `${it.file} missing`).toBe(true);
      expect(readFileSync(p).subarray(0, 4).toString("ascii")).toBe("OggS");
      expect(it.durationMs).toBeGreaterThan(0);
      expect(it.durationMs).toBeLessThanOrEqual(30_000);
    }
    for (const it of items.filter((i) => i.group === "sfx")) {
      expect(statSync(path.join(PUBLIC_SFX, it.file)).size).toBeLessThan(150 * 1024);
    }
  });

  it("every synth item is labelled original synthesis, CC0 by Captionit — never a found recording", () => {
    const synth = items.filter((i) => i.licenceSource === "synth");
    expect(synth).toHaveLength(38); // 9 meme + 29 everyday SFX
    for (const it of synth) {
      expect(it.author).toBe("Captionit");
      expect(it.licence).toBe("CC0 1.0");
      expect(it.title).toMatch(/original synthesis/i);
      expect(it.format).toMatch(/synthesis/i);
      expect(it.originalFile).toMatch(/synthesized in code/i);
      expect(it.sourceUrl).toBe("/credits#stock-sfx");
      expect(it.sourceUrl).not.toMatch(/myinstants|freesound\.org\/people|cdn\./);
      expect(licenceRecordForStockItem(it).source).toBe("synth");
    }
    // no item anywhere in the pack claims to be a found recording of a meme/classic sound
    for (const it of items) {
      expect(it.title).not.toMatch(/famous recording|original recording|from Freesound|from myinstants/i);
    }
  });

  it("the manifest gate passes for the whole 50-item pack, and the pack note records the 2026-11-18 batch", () => {
    expect(validateStockManifest(items)).toEqual([]);
    expect(onDisk.pack.note).toMatch(/2026-11-18/);
    expect(onDisk.pack.note).toMatch(/29.*ORIGINAL SYNTHESIZED/i);
  });

  it("the gate refuses an sfx item that drops its synthesis label", () => {
    const sfx = items.find((i) => i.group === "sfx")!;
    const unlabelled = [{ ...sfx, title: "Everyday sound effects — Whoosh (soft)" }];
    expect(validateStockManifest(unlabelled).join(" ")).toMatch(/synthesis/);
  });
});
