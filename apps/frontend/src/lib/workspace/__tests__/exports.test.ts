import { describe, it, expect } from "vitest";
import { canDownloadExport, distinctExportKinds, exportDownloadState, exportStatusLabel, filterExports, isExportExpired, type GlobalExport } from "../exports";

const now = new Date("2026-06-01T00:00:00Z");
const exp = (over: Partial<GlobalExport>): Pick<GlobalExport, "status" | "expires_at"> => ({ status: "ready", expires_at: null, ...over });

describe("export expiry", () => {
  it("ready with no expiry can download", () => {
    expect(canDownloadExport(exp({}), now)).toBe(true);
    expect(exportStatusLabel(exp({}), now)).toBe("ready");
  });
  it("past expires_at is expired even if status still says ready", () => {
    const e = exp({ expires_at: "2026-05-01T00:00:00Z" });
    expect(isExportExpired(e, now)).toBe(true);
    expect(canDownloadExport(e, now)).toBe(false);
    expect(exportStatusLabel(e, now)).toBe("expired");
  });
  it("server-expired status wins, future expiry stays downloadable", () => {
    expect(isExportExpired(exp({ status: "expired" }), now)).toBe(true);
    expect(canDownloadExport(exp({ expires_at: "2027-01-01T00:00:00Z" }), now)).toBe(true);
  });
  it("non-ready exports cannot download", () => {
    expect(canDownloadExport(exp({ status: "queued" }), now)).toBe(false);
    expect(exportStatusLabel(exp({ status: "rendering" }), now)).toBe("rendering");
  });
});

describe("exportDownloadState — the honest re-download decision (slice 8.3)", () => {
  it("ready + inside retention → downloadable (server mints a fresh signed URL per click)", () => {
    expect(exportDownloadState(exp({ expires_at: "2026-06-02T00:00:00Z" }), now)).toBe("downloadable");
    expect(exportDownloadState(exp({}), now)).toBe("downloadable");
  });
  it("past retention or server-expired → expired (no file left to fetch, re-export is the path)", () => {
    expect(exportDownloadState(exp({ expires_at: "2026-05-31T23:59:59Z" }), now)).toBe("expired");
    expect(exportDownloadState(exp({ status: "expired" }), now)).toBe("expired");
  });
  it("queued/rendering/failed are not-ready, never downloadable and never mislabelled expired", () => {
    expect(exportDownloadState(exp({ status: "queued" }), now)).toBe("not-ready");
    expect(exportDownloadState(exp({ status: "rendering" }), now)).toBe("not-ready");
    expect(exportDownloadState(exp({ status: "failed" }), now)).toBe("not-ready");
  });
});

describe("filterExports — kind / status / date filters (slice 8.3)", () => {
  const full = (over: Partial<GlobalExport>): GlobalExport => ({
    id: "e0", project_id: "p1", project_title: "Proj", kind: "mp4", status: "ready",
    file_size: 100, resolution: "1080p", created_at: "2026-05-15T12:00:00Z", expires_at: null, ...over,
  });
  const rows = [
    full({ id: "e1", kind: "mp4", status: "ready", created_at: "2026-05-15T12:00:00Z" }),
    full({ id: "e2", kind: "srt", status: "ready", created_at: "2026-05-20T12:00:00Z" }),
    full({ id: "e3", kind: "mp4", status: "ready", created_at: "2026-04-01T12:00:00Z", expires_at: "2026-05-01T00:00:00Z" }),
    full({ id: "e4", kind: "mp4", status: "failed", created_at: "2026-05-25T12:00:00Z" }),
  ];

  it("filters by kind case-insensitively", () => {
    expect(filterExports(rows, { kind: "MP4" }, now).map((e) => e.id)).toEqual(["e1", "e3", "e4"]);
    expect(filterExports(rows, { kind: "srt" }, now).map((e) => e.id)).toEqual(["e2"]);
  });
  it("filters by EFFECTIVE status: a ready row past expiry matches 'expired', not 'ready'", () => {
    expect(filterExports(rows, { status: "expired" }, now).map((e) => e.id)).toEqual(["e3"]);
    expect(filterExports(rows, { status: "ready" }, now).map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(filterExports(rows, { status: "failed" }, now).map((e) => e.id)).toEqual(["e4"]);
  });
  it("date range is inclusive, and a date-only 'to' covers the whole day", () => {
    expect(filterExports(rows, { from: "2026-05-01", to: "2026-05-20" }, now).map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(filterExports(rows, { from: "2026-05-20" }, now).map((e) => e.id)).toEqual(["e2", "e4"]);
    expect(filterExports(rows, { to: "2026-04-01" }, now).map((e) => e.id)).toEqual(["e3"]);
  });
  it("combines filters; empty filters return everything", () => {
    expect(filterExports(rows, { kind: "mp4", status: "ready", from: "2026-05-01" }, now).map((e) => e.id)).toEqual(["e1"]);
    expect(filterExports(rows, {}, now)).toHaveLength(4);
  });
  it("distinctExportKinds comes from the data itself", () => {
    expect(distinctExportKinds(rows)).toEqual(["mp4", "srt"]);
  });
});
