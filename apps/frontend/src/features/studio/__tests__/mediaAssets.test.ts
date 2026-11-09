import { describe, expect, it } from "vitest";
import { MEDIA_SIZE_CAPS, describeAssetMeta, formatBytes, mediaKindFor, validateMediaFile } from "../mediaAssets";

describe("mediaKindFor", () => {
  it("classifies by MIME type first", () => {
    expect(mediaKindFor("clip", "video/mp4")).toBe("video");
    expect(mediaKindFor("song", "audio/mpeg")).toBe("audio");
    expect(mediaKindFor("logo", "image/png")).toBe("image");
  });

  it("falls back to the extension when the MIME type is missing or generic", () => {
    expect(mediaKindFor("clip.MOV", "")).toBe("video");
    expect(mediaKindFor("voice.m4a", "application/octet-stream")).toBe("audio");
    expect(mediaKindFor("photo.webp", "")).toBe("image");
    expect(mediaKindFor("notes.txt", "text/plain")).toBeNull();
    expect(mediaKindFor("archive.zip", "")).toBeNull();
  });
});

describe("validateMediaFile", () => {
  it("accepts a normal video / audio / image", () => {
    expect(validateMediaFile({ name: "a.mp4", size: 10_000, type: "video/mp4" })).toEqual({ ok: true, kind: "video" });
    expect(validateMediaFile({ name: "a.mp3", size: 10_000, type: "audio/mpeg" })).toEqual({ ok: true, kind: "audio" });
    expect(validateMediaFile({ name: "a.png", size: 10_000, type: "image/png" })).toEqual({ ok: true, kind: "image" });
  });

  it("rejects non-media and empty files with an honest message", () => {
    const bad = validateMediaFile({ name: "a.pdf", size: 100, type: "application/pdf" });
    expect(bad.ok).toBe(false);
    const empty = validateMediaFile({ name: "a.mp4", size: 0, type: "video/mp4" });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toContain("empty");
  });

  it("enforces the per-kind size caps and names the cap in the message", () => {
    const bigImage = validateMediaFile({ name: "a.png", size: MEDIA_SIZE_CAPS.image + 1, type: "image/png" });
    expect(bigImage.ok).toBe(false);
    if (!bigImage.ok) expect(bigImage.error).toContain("25 MB");
    expect(validateMediaFile({ name: "a.png", size: MEDIA_SIZE_CAPS.image, type: "image/png" }).ok).toBe(true);
    expect(validateMediaFile({ name: "a.mp4", size: MEDIA_SIZE_CAPS.video + 1, type: "video/mp4" }).ok).toBe(false);
    expect(validateMediaFile({ name: "a.mp3", size: MEDIA_SIZE_CAPS.audio + 1, type: "audio/mpeg" }).ok).toBe(false);
  });
});

describe("formatBytes / describeAssetMeta", () => {
  it("formats sizes compactly", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
  });

  it("builds the bin row's metadata line, omitting unknown parts", () => {
    expect(describeAssetMeta({ kind: "video", durationMs: 42_000, width: 1080, height: 1920, size: 12_400_000 })).toBe("0:42 · 1080 × 1920 · 11.8 MB");
    expect(describeAssetMeta({ kind: "image", width: 800, height: 600, size: 2048 })).toBe("800 × 600 · 2 KB");
    expect(describeAssetMeta({ kind: "audio", durationMs: null, size: 1024 })).toBe("1 KB");
  });
});
