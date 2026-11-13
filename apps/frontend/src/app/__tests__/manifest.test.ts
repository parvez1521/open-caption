import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../manifest";

/** PNG dimensions from the IHDR chunk (bytes 16-23, big-endian). */
function pngDimensions(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function brandIcon(name: string): string {
  // import.meta.url is not a real file path under vitest's transform, so
  // resolve from the working directory instead: vitest runs with cwd set
  // to the frontend package (the documented gate command), and the upward
  // walk keeps the test honest if invoked from a parent directory.
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, "public", "brand", name);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(process.cwd(), "public", "brand", name);
}

describe("PWA manifest", () => {
  it("names Captionit, starts at /, and runs standalone on the dark theme", () => {
    const m = manifest();
    expect(m.id).toBe("/");
    expect(m.name).toBe("Captionit");
    expect(m.short_name).toBe("Captionit");
    expect(m.description).toContain("animated captions timed to every word");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.background_color).toBe("#141412");
    expect(m.theme_color).toBe("#141412");
  });

  it("declares 192 + 512 icons for any and maskable purposes", () => {
    const m = manifest();
    const icons = m.icons ?? [];
    const key = (purpose: string, size: string) =>
      icons.some((i) => i.purpose === purpose && i.sizes === size);
    expect(key("any", "192x192")).toBe(true);
    expect(key("any", "512x512")).toBe(true);
    expect(key("maskable", "192x192")).toBe(true);
    expect(key("maskable", "512x512")).toBe(true);
    for (const icon of icons) {
      expect(icon.type).toBe("image/png");
      expect(icon.src.startsWith("/brand/captionit-icon-")).toBe(true);
    }
  });

  it("points at real icon files with the declared pixel sizes", () => {
    for (const [file, width, height] of [
      ["captionit-icon-192.png", 192, 192],
      ["captionit-icon-512.png", 512, 512],
      ["captionit-icon-maskable-192.png", 192, 192],
      ["captionit-icon-maskable-512.png", 512, 512],
    ] as const) {
      expect(pngDimensions(brandIcon(file))).toEqual({ width, height });
    }
  });
});
