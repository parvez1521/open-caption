// @vitest-environment node
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * MA-A8-006: the JS budget gate is the deliverable, so its pass/fail
 * logic is pinned here against a fixture build output (a copied script +
 * a fake .next), not against the real build — the real build is exercised
 * by `pnpm check:js-budget` itself and by CI.
 */

const SCRIPT_SRC = new URL("../check-js-budget.mjs", import.meta.url);

let root: string;
let script: string;

function fixture(html: string, chunks: Record<string, string>) {
  root = mkdtempSync(join(tmpdir(), "js-budget-"));
  const frontend = join(root, "frontend");
  mkdirSync(join(frontend, "scripts"), { recursive: true });
  mkdirSync(join(frontend, ".next", "server", "app"), { recursive: true });
  mkdirSync(join(frontend, ".next", "static", "chunks"), { recursive: true });
  script = join(frontend, "scripts", "check-js-budget.mjs");
  cpSync(SCRIPT_SRC, script);
  writeFileSync(join(frontend, ".next", "server", "app", "index.html"), html);
  for (const [name, body] of Object.entries(chunks)) {
    writeFileSync(join(frontend, ".next", "static", "chunks", name), body);
  }
}

function run(env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

/** Near-incompressible text — a periodic pattern would gzip to ~nothing and never breach a budget. */
import { randomBytes } from "node:crypto";
const incompressible = (n: number) => randomBytes(n).toString("base64").slice(0, n);

beforeEach(() => {
  fixture(
    `<html><head>` +
      `<script src="/_next/static/chunks/a-1.js"></script>` +
      `<script src="/_next/static/chunks/b-2.js"></script>` +
      `<script src="https://www.googletagmanager.com/gtag/js?id=G-X"></script>` +
      `</head></html>`,
    { "a-1.js": incompressible(10_000), "b-2.js": incompressible(5_000) },
  );
});

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("MA-A8-006 — check-js-budget", () => {
  it("passes when the fixture bundle is within the (generous) budget", () => {
    const res = run();
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("JS budget: PASS");
    expect(res.stdout).toContain("2 local chunks");
    expect(res.stdout).toContain("not budgeted"); // third-party script listed, not counted
  });

  it("fails when the total gzip budget is exceeded", () => {
    const res = run({ JS_BUDGET_TOTAL_GZIP_KB: "1" });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("total gzip");
    expect(res.stderr).toContain("exceeds 1 KB");
  });

  it("fails when the largest-chunk budget is exceeded", () => {
    const res = run({ JS_BUDGET_LARGEST_RAW_KB: "1" });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("largest chunk raw");
  });

  it("fails closed when the prerendered homepage is missing", () => {
    rmSync(join(root, "frontend", ".next", "server", "app", "index.html"));
    const res = run();
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("prerendered homepage not found");
  });
});
