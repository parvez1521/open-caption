import { describe, expect, it } from "vitest";
import { ALPHA_EXPORT_KINDS, CREATABLE_EXPORT_KINDS, CreateExportBody, TEXT_EXPORT_KINDS } from "@capseasy/shared";
import { EXPORT_OPTIONS } from "../exportOptions";

describe("Export modal options — pinned to the API's creatable kinds", () => {
  it("offers exactly the API-creatable kinds, in the shared list's order, with nothing extra", () => {
    // Both sides of this assertion come from the shared constant: the modal options are built by
    // mapping CREATABLE_EXPORT_KINDS, and CreateExportBody (the API) validates against it too.
    expect(EXPORT_OPTIONS.map((o) => o.kind)).toEqual([...CREATABLE_EXPORT_KINDS]);
  });

  it("every offered kind is one the create-export API accepts, and png is never offered", () => {
    for (const o of EXPORT_OPTIONS) {
      expect(CreateExportBody.safeParse({ kind: o.kind }).success).toBe(true);
    }
    expect(EXPORT_OPTIONS.map((o) => o.kind)).not.toContain("png");
    expect(CreateExportBody.safeParse({ kind: "png" }).success).toBe(false);
  });

  it("surfaces every real kind beyond the old mp4 + srt pair", () => {
    expect(EXPORT_OPTIONS.map((o) => o.kind)).toEqual(
      expect.arrayContaining(["mp4", "srt", "vtt", "ass", "txt", "json", "mov_alpha", "webm_alpha"]),
    );
  });

  it("usesRange matches what the API honours: trim applies to video renders, never to text files", () => {
    const byKind = new Map(EXPORT_OPTIONS.map((o) => [o.kind, o.usesRange]));
    // browser MP4 + the companion render kinds carry range/dims/fps into the render
    expect(byKind.get("mp4")).toBe(true);
    for (const k of ALPHA_EXPORT_KINDS) expect(byKind.get(k)).toBe(true);
    // text exports are generated from the whole document; the API ignores range/dims/fps for them
    for (const k of TEXT_EXPORT_KINDS) expect(byKind.get(k)).toBe(false);
  });

  it("every option has an honest title and description", () => {
    for (const o of EXPORT_OPTIONS) {
      expect(o.title.length).toBeGreaterThan(0);
      expect(o.desc.length).toBeGreaterThan(0);
    }
  });

  it("alpha options say they are transparent overlays and that the paired desktop app renders them", () => {
    for (const k of ALPHA_EXPORT_KINDS) {
      const o = EXPORT_OPTIONS.find((x) => x.kind === k)!;
      expect(o.desc).toContain("transparent");
      expect(o.desc).toContain("paired desktop app");
      // …and they must not promise an instant result when no companion is online
      expect(o.desc).toContain("stays queued");
    }
  });

  it("keeps mp4 as the one popular option, on the browser path wording it already had", () => {
    const popular = EXPORT_OPTIONS.filter((o) => o.popular);
    expect(popular.map((o) => o.kind)).toEqual(["mp4"]);
    expect(popular[0]!.desc).toContain("in your browser");
  });
});
