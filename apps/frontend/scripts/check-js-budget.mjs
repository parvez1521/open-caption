#!/usr/bin/env node
/**
 * MA-A8-006 — homepage JS budget gate.
 *
 * The audit measured the live homepage at 657 KB compressed / 2.14 MB
 * uncompressed across 24 chunks (2026-11-19) with nothing to compare it
 * against. This script applies the SAME measurement to the local
 * production build — every <script src> the prerendered homepage HTML
 * emits — and fails the build when the homepage ships more JS than the
 * budget allows, so a regression fails CI instead of shipping silently.
 *
 * Method: parse .next/server/app/index.html (the prerendered `/`), take
 * the local /_next/static/chunks/*.js scripts, sum their gzip sizes
 * (level 9; Vercel serves gzip/brotli, gzip is the conservative proxy)
 * and find the largest chunk. Third-party scripts (GA4, …) are listed
 * but NOT budgeted — they are not this repo's bundle.
 *
 * Budget (interim ceilings, 2026-11-19):
 *   total gzip    <= 700 KB   (measured: 615 KB local build, 657 KB live)
 *   largest gzip  <= 150 KB   (measured: 115 KB)
 *   largest raw   <= 500 KB   (measured: 429 KB)
 * The audit's target is 500 KB total / 250 KB largest chunk. These
 * ceilings sit just above today's measurements so the gate catches
 * regressions without going red on day one; tighten them to the audit
 * target once CAP-P09 (dynamic-import GSAP) lands — the actual JS
 * reduction is a separate, larger effort and is NOT this script.
 *
 * Thresholds can be overridden for testing/tuning via env:
 *   JS_BUDGET_TOTAL_GZIP_KB, JS_BUDGET_LARGEST_GZIP_KB,
 *   JS_BUDGET_LARGEST_RAW_KB.
 *
 * Run: `pnpm check:js-budget` (after `pnpm build`). Exit 0 = within
 * budget, exit 1 = over budget (or the homepage HTML is missing, so the
 * budget cannot be measured — fail closed, never silently pass).
 */
import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_DIR = join(FRONTEND_DIR, ".next");
const HOMEPAGE_HTML = join(NEXT_DIR, "server", "app", "index.html");

const BUDGET = {
  totalGzipKb: Number(process.env.JS_BUDGET_TOTAL_GZIP_KB ?? 700),
  largestGzipKb: Number(process.env.JS_BUDGET_LARGEST_GZIP_KB ?? 150),
  largestRawKb: Number(process.env.JS_BUDGET_LARGEST_RAW_KB ?? 500),
};

const kb = (bytes) => bytes / 1024;

function fail(message) {
  console.error(`\nJS budget: FAIL — ${message}\n`);
  process.exit(1);
}

if (!existsSync(HOMEPAGE_HTML)) {
  fail(
    `prerendered homepage not found at ${HOMEPAGE_HTML} — run \`pnpm build\` first. ` +
      `If / is no longer statically prerendered, this gate needs a new measurement source; do not skip it.`,
  );
}

const html = readFileSync(HOMEPAGE_HTML, "utf8");
const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]);

const chunkPaths = new Set();
const external = [];
for (const src of scriptSrcs) {
  const local = src.match(/^\/_next\/(static\/chunks\/[A-Za-z0-9_.-]+\.js)(?:[?#].*)?$/);
  if (local) chunkPaths.add(local[1]);
  else external.push(src);
}

if (chunkPaths.size === 0) {
  fail(`no local JS chunks found in ${HOMEPAGE_HTML} — the homepage emitted no measurable bundle.`);
}

let totalRaw = 0;
let totalGzip = 0;
let largest = { file: "", raw: 0, gzip: 0 };
const rows = [];
for (const rel of [...chunkPaths].sort()) {
  const abs = join(NEXT_DIR, rel);
  if (!existsSync(abs)) fail(`chunk listed in the homepage HTML is missing from the build: ${rel}`);
  const buf = readFileSync(abs);
  const gz = gzipSync(buf, { level: 9 }).length;
  totalRaw += buf.length;
  totalGzip += gz;
  if (buf.length > largest.raw) largest = { file: rel, raw: buf.length, gzip: gz };
  rows.push({ file: rel, raw: buf.length, gzip: gz });
}

console.log(`Homepage JS budget (MA-A8-006): ${chunkPaths.size} local chunks`);
for (const r of rows.sort((a, b) => b.raw - a.raw).slice(0, 5)) {
  console.log(`  ${kb(r.raw).toFixed(1).padStart(7)} KB raw / ${kb(r.gzip).toFixed(1).padStart(6)} KB gzip  ${r.file}`);
}
console.log(
  `  TOTAL ${kb(totalRaw).toFixed(1)} KB raw / ${kb(totalGzip).toFixed(1)} KB gzip ` +
    `(budget: total gzip <= ${BUDGET.totalGzipKb} KB)`,
);
console.log(
  `  LARGEST ${largest.file}: ${kb(largest.raw).toFixed(1)} KB raw / ${kb(largest.gzip).toFixed(1)} KB gzip ` +
    `(budget: largest gzip <= ${BUDGET.largestGzipKb} KB, largest raw <= ${BUDGET.largestRawKb} KB)`,
);
if (external.length > 0) console.log(`  Third-party scripts (not budgeted): ${external.join(", ")}`);

const breaches = [];
if (kb(totalGzip) > BUDGET.totalGzipKb) {
  breaches.push(`total gzip ${kb(totalGzip).toFixed(1)} KB exceeds ${BUDGET.totalGzipKb} KB`);
}
if (kb(largest.gzip) > BUDGET.largestGzipKb) {
  breaches.push(`largest chunk gzip ${kb(largest.gzip).toFixed(1)} KB (${largest.file}) exceeds ${BUDGET.largestGzipKb} KB`);
}
if (kb(largest.raw) > BUDGET.largestRawKb) {
  breaches.push(`largest chunk raw ${kb(largest.raw).toFixed(1)} KB (${largest.file}) exceeds ${BUDGET.largestRawKb} KB`);
}
if (breaches.length > 0) fail(breaches.join("; "));

console.log("JS budget: PASS");
