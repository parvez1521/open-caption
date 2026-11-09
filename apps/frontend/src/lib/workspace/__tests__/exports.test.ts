import { describe, it, expect } from "vitest";
import { canDownloadExport, exportStatusLabel, isExportExpired, type GlobalExport } from "../exports";

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
