import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { describeAssetLicence } from "../mediaAssets";
import type { MediaAssetRecord } from "../mediaStore";
import { licenceRecordForStockItem, stockSfxItems, validateStockManifest, type StockSfxItem } from "../stockCatalogue";
import { importAudioToBin, importPixabayTrackToBin, importStockItemToBin, type StockImportDeps } from "../stockImport";
import {
  PIXABAY_API_BASE,
  PIXABAY_CONTENT_ID_NOTE,
  buildPixabaySearchUrl,
  clearPixabayKey,
  contentIdWarningFor,
  isPixabayApiUrl,
  parsePixabaySearchResponse,
  parsePixabayTrack,
  pixabayLicenceRecord,
  savePixabayKey,
  savedPixabayKey,
  searchPixabayAudio,
  type KeyValueStorage,
  type PixabayFetch,
} from "../pixabay";

const PUBLIC_SFX = path.resolve(__dirname, "../../../../public/stock-sfx");

/* ------------------------------------------------------------------ */
/* (a) bundled starter pack — manifest completeness                    */
/* ------------------------------------------------------------------ */

describe("bundled starter SFX pack manifest", () => {
  const items = stockSfxItems();
  const onDisk = JSON.parse(readFileSync(path.join(PUBLIC_SFX, "manifest.json"), "utf8")) as { items: StockSfxItem[] };

  it("the module's manifest is the manifest committed next to the assets", () => {
    expect(items).toEqual(onDisk.items);
  });

  it("every item carries a complete licence record and passes the CC0-only gate", () => {
    expect(validateStockManifest(items)).toEqual([]);
    for (const it of items) {
      expect(it.title).toBeTruthy();
      expect(it.licence).toBe("CC0 1.0");
      expect(it.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // starter group: Kenney recordings, verified against the pack pages at ingestion
    for (const it of items.filter((i) => i.group === "starter")) {
      expect(it.author).toBe("Kenney");
      expect(it.licenceSource).toBe("kenney");
      expect(it.sourceUrl).toMatch(/^https:\/\/kenney\.nl\/assets\//);
    }
  });

  it("the meme group ships ONLY labelled original syntheses (2026-11-11) — never a found recording", () => {
    const meme = items.filter((i) => i.group === "meme");
    expect(meme.map((i) => i.id).sort()).toEqual(
      ["meme-airhorn", "meme-boom", "meme-buzzer", "meme-censor-beep", "meme-cha-ching", "meme-dramatic-sting", "meme-record-scratch", "meme-rimshot", "meme-sad-trombone"].sort(),
    );
    for (const it of meme) {
      expect(it.licenceSource).toBe("synth");
      expect(it.author).toBe("Captionit");
      expect(it.title).toMatch(/original synthesis/i);
      expect(it.format).toMatch(/synthesis/i);
      expect(it.sourceUrl).toBe("/credits#stock-sfx");
      expect(it.sourceUrl).not.toMatch(/myinstants|freesound\.org\/people/);
      expect(licenceRecordForStockItem(it).source).toBe("synth");
    }
    // and the gate refuses a synth item that drops its label
    const unlabelled = [{ ...meme[0]!, title: "Meme sounds — Meme boom" }];
    expect(validateStockManifest(unlabelled).join(" ")).toMatch(/synthesis/);
  });

  it("every manifest file exists in public/stock-sfx with a sane SFX size, and the pack stays small", () => {
    let total = 0;
    for (const it of items) {
      const p = path.join(PUBLIC_SFX, it.file);
      expect(existsSync(p), `${it.file} missing`).toBe(true);
      const size = statSync(p).size;
      expect(size).toBeGreaterThan(1_000);
      expect(size).toBeLessThan(500_000);
      total += size;
    }
    expect(total).toBeLessThan(2 * 1024 * 1024); // the whole pack is ~99 KB today; a few MB is the ceiling
  });

  it("the gate rejects a non-CC0 or unrecorded item (nothing unverified can slip into the pack)", () => {
    const bad = [{ ...items[0]!, licence: "CC BY 4.0" }];
    expect(validateStockManifest(bad).join(" ")).toMatch(/not CC0/);
    const noAuthor = [{ ...items[0]!, author: "" }];
    expect(validateStockManifest(noAuthor).join(" ")).toMatch(/no author/);
  });

  it("a pack item's bin licence record carries the full per-file record", () => {
    const item = items.find((i) => i.id === "riser")!;
    expect(licenceRecordForStockItem(item)).toEqual({
      source: "kenney",
      title: "Digital Audio — phaserUp1",
      author: "Kenney",
      sourceUrl: "https://kenney.nl/assets/digital-audio",
      licence: "CC0 1.0",
      retrievedAt: item.retrievedAt,
      formatNote: item.format,
    });
    expect(describeAssetLicence(licenceRecordForStockItem(item))).toBe("Kenney · CC0 1.0");
  });
});

/* ------------------------------------------------------------------ */
/* bin-import handoff                                                  */
/* ------------------------------------------------------------------ */

function fakeDeps(saved: MediaAssetRecord[]): StockImportDeps {
  return {
    probe: async () => ({ durationMs: 500, width: null, height: null, thumb: null, peaks: [0.1, 0.9] }),
    save: async (rec) => { saved.push(rec); },
    newId: () => "asset-1",
    now: () => 1_700_000_000_000,
  };
}

describe("stock → media bin handoff", () => {
  it("a pack item lands as a normal audio asset carrying its licence record", async () => {
    const saved: MediaAssetRecord[] = [];
    const item = stockSfxItems()[0]!;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/ogg" });
    const rec = await importStockItemToBin("proj-9", item, fakeDeps(saved), async (url) => {
      expect(url).toBe(`/stock-sfx/${item.file}`);
      return { ok: true, status: 200, blob: async () => blob } as unknown as Response;
    });
    expect(saved).toHaveLength(1);
    expect(rec).toBe(saved[0]);
    expect(rec.kind).toBe("audio");
    expect(rec.projectId).toBe("proj-9");
    expect(rec.name).toBe(item.file);
    expect(rec.durationMs).toBe(500);
    expect(rec.peaks).toEqual([0.1, 0.9]);
    expect(rec.licence?.source).toBe("kenney");
    expect(rec.licence?.licence).toBe("CC0 1.0");
    expect(rec.licence?.sourceUrl).toBe(item.sourceUrl);
  });

  it("importAudioToBin refuses a non-audio file instead of binning it as stock audio", async () => {
    const saved: MediaAssetRecord[] = [];
    const licence = licenceRecordForStockItem(stockSfxItems()[0]!);
    await expect(
      importAudioToBin(fakeDeps(saved), { projectId: "p", blob: new Blob(["x"], { type: "image/png" }), name: "x.png", licence }),
    ).rejects.toThrow(/not an audio file/);
    expect(saved).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* (b) Pixabay — parsing, licence record, Content-ID                   */
/* ------------------------------------------------------------------ */

/** Fixture in the documented audio-API shape (no Content-ID field — the documented case). */
const DOCUMENTED_HIT = {
  id: 12345,
  title: "Corporate Upbeat",
  user: "SomeComposer",
  duration: 95,
  tags: "corporate, upbeat, business",
  pageURL: "https://pixabay.com/music/modern-corporate-corporate-upbeat-12345/",
  url: "https://cdn.pixabay.com/audio/2024/01/01/audio_12345.mp3",
};

describe("Pixabay response parsing", () => {
  it("parses a documented-shape hit: title, author, duration, tags, page + audio URLs", () => {
    const t = parsePixabayTrack(DOCUMENTED_HIT)!;
    expect(t.id).toBe("12345");
    expect(t.title).toBe("Corporate Upbeat");
    expect(t.author).toBe("SomeComposer");
    expect(t.durationSec).toBe(95);
    expect(t.tags).toEqual(["corporate", "upbeat", "business"]);
    expect(t.pageUrl).toContain("pixabay.com/music/");
    expect(t.audioUrl).toContain("cdn.pixabay.com/audio/");
    expect(t.previewUrl).toBe(t.audioUrl);
  });

  it("the documented shape carries NO Content-ID marker → unknown (null), never 'clear'", () => {
    const t = parsePixabayTrack(DOCUMENTED_HIT)!;
    expect(t.contentIdRegistered).toBeNull();
    // unknown gets the standing note, not a clean bill
    expect(contentIdWarningFor(t)).toBe(PIXABAY_CONTENT_ID_NOTE);
  });

  it("a hit that DOES carry a registered marker gets the per-track warning", () => {
    const t = parsePixabayTrack({ ...DOCUMENTED_HIT, contentIdRegistered: true })!;
    expect(t.contentIdRegistered).toBe(true);
    expect(contentIdWarningFor(t)).toMatch(/marked Content-ID registered/);
    const f = parsePixabayTrack({ ...DOCUMENTED_HIT, content_id: "not_registered" })!;
    expect(f.contentIdRegistered).toBe(false);
    expect(contentIdWarningFor(f)).toBe(PIXABAY_CONTENT_ID_NOTE);
  });

  it("parsePixabaySearchResponse reads totals and drops unusable hits", () => {
    const r = parsePixabaySearchResponse({ total: 2, totalHits: 2, hits: [DOCUMENTED_HIT, { nope: true }, null] });
    expect(r.total).toBe(2);
    expect(r.tracks).toHaveLength(1);
    expect(() => parsePixabaySearchResponse("garbage")).toThrow(/couldn't read/);
  });

  it("builds the per-track licence record stored with the asset", () => {
    const t = parsePixabayTrack(DOCUMENTED_HIT)!;
    expect(pixabayLicenceRecord(t, "2026-11-10")).toEqual({
      source: "pixabay",
      title: "Corporate Upbeat",
      author: "SomeComposer",
      sourceUrl: DOCUMENTED_HIT.pageURL,
      licence: "Pixabay Content License",
      retrievedAt: "2026-11-10",
      contentIdRegistered: null,
    });
  });

  it("a Pixabay import downloads the track file and bins it with the licence record", async () => {
    const saved: MediaAssetRecord[] = [];
    const t = parsePixabayTrack(DOCUMENTED_HIT)!;
    const fetched: string[] = [];
    const rec = await importPixabayTrackToBin("proj-1", t, "2026-11-10", fakeDeps(saved), async (url) => {
      fetched.push(url);
      return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array([9])], { type: "audio/mpeg" }) } as unknown as Response;
    });
    expect(fetched).toEqual([DOCUMENTED_HIT.url]); // the API's own file URL is the only download target
    expect(rec.name).toBe("Corporate Upbeat.mp3");
    expect(rec.licence?.licence).toBe("Pixabay Content License");
    expect(rec.licence?.sourceUrl).toBe(DOCUMENTED_HIT.pageURL);
  });
});

/* ------------------------------------------------------------------ */
/* (b) Pixabay — key storage + key destination                         */
/* ------------------------------------------------------------------ */

function fakeStorage(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

describe("Pixabay API key — device-only", () => {
  it("round-trips through the injected storage and nowhere else", () => {
    const s = fakeStorage();
    expect(savedPixabayKey(s)).toBeNull();
    savePixabayKey("  my-key-123 ", s);
    expect([...s.map.keys()]).toEqual(["ce:pixabay-api-key"]);
    expect(savedPixabayKey(s)).toBe("my-key-123");
    clearPixabayKey(s);
    expect(savedPixabayKey(s)).toBeNull();
  });

  it("every search URL targets api.pixabay.com — the only host the key is ever sent to", () => {
    const url = buildPixabaySearchUrl({ key: "my-key-123", query: "whoosh", type: "sound_effects" });
    expect(url.startsWith(PIXABAY_API_BASE)).toBe(true);
    expect(isPixabayApiUrl(url)).toBe(true);
    const u = new URL(url);
    expect(u.host).toBe("api.pixabay.com");
    expect(u.searchParams.get("key")).toBe("my-key-123");
    expect(u.searchParams.get("audio_type")).toBe("sound_effects");
    expect(isPixabayApiUrl("https://example.com/api/audio/?key=my-key-123")).toBe(false);
  });

  it("searchPixabayAudio sends the key only in the api.pixabay.com request, and maps a 401 to a key error", async () => {
    const seen: string[] = [];
    const okFetch: PixabayFetch = async (url) => {
      seen.push(url);
      return { ok: true, status: 200, json: async () => ({ totalHits: 1, hits: [DOCUMENTED_HIT] }) };
    };
    const r = await searchPixabayAudio({ key: "k", query: "corporate", type: "music" }, okFetch);
    expect(r.tracks).toHaveLength(1);
    expect(seen).toHaveLength(1);
    expect(seen.every(isPixabayApiUrl)).toBe(true);

    const badFetch: PixabayFetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await expect(searchPixabayAudio({ key: "wrong", query: "x", type: "music" }, badFetch)).rejects.toThrow(/rejected that API key/);
  });
});
