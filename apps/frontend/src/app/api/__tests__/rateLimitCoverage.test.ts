// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CAP-S06 (r3): every API route goes through the shared DB-backed
 * rateLimit() — except the allowlisted few, where throttling would break
 * the flow itself. A new route without a limiter fails this test until
 * the author either adds rateLimit() or justifies an allowlist entry.
 */
const API_DIR = join(process.cwd(), "src/app/api");

// Deliberate skips: throttling here would break the caller, not protect it.
const ALLOWLIST: Record<string, string> = {
  "cron/cleanup/route.ts":
    "Vercel cron only; CRON_SECRET bearer-gated, once daily, not user-callable.",
  "v1/billing/webhook/route.ts":
    "Cashfree signature-verified; throttling could drop legitimate payment retries.",
  "v1/device/status/route.ts":
    "Public static capability flag; no database read or write.",
  "v1/growth/connect/[platform]/callback/route.ts":
    "Browser redirect identified by HMAC-signed OAuth state (10-min TTL).",
  "v1/worker/heartbeat/route.ts":
    "Bearer-token machine client; heartbeat is high-frequency by design.",
  "v1/worker/jobs/[id]/complete/route.ts":
    "Bearer-token machine client; revocation-aware, not user-abusable.",
  "v1/worker/jobs/[id]/fail/route.ts":
    "Bearer-token machine client; revocation-aware, not user-abusable.",
  "v1/worker/jobs/[id]/progress/route.ts":
    "Bearer-token machine client; progress posts are high-frequency by design.",
  "v1/worker/jobs/[id]/urls/route.ts":
    "Bearer-token machine client; revocation-aware, not user-abusable.",
  "v1/worker/jobs/claim/route.ts":
    "Bearer-token machine client; revocation-aware, not user-abusable.",
};

function routeFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const rel = prefix ? `${prefix}/${entry}` : entry;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full, rel));
    else if (entry === "route.ts") out.push(rel);
  }
  return out;
}

describe("CAP-S06 rate-limit coverage", () => {
  it("every API route calls rateLimit() or is an allowlisted skip", () => {
    const files = routeFiles(API_DIR);
    expect(files.length).toBeGreaterThan(0);
    const uncovered = files.filter((f) => {
      const src = readFileSync(join(API_DIR, f), "utf8");
      return !src.includes("rateLimit(") && !(f in ALLOWLIST);
    });
    expect(uncovered).toEqual([]);
  });

  it("every allowlist entry still exists and is genuinely unmetered", () => {
    for (const [rel, reason] of Object.entries(ALLOWLIST)) {
      expect(reason.length).toBeGreaterThan(0);
      const src = readFileSync(join(API_DIR, rel), "utf8");
      expect(src).not.toContain("rateLimit(");
    }
  });
});
