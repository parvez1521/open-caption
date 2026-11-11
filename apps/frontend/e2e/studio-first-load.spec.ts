import { test, expect } from "@playwright/test";
import fs from "node:fs";

/**
 * Regression: a FRESH guest project's Studio must load first time, every door.
 * Four independent persona walks (2026-11-11) hit the projects/[id] error
 * boundary ("The editor hit a snag") on the first mount of a brand-new
 * project, recovering via the boundary's reset. Root cause, pinned 2026-11-12
 * (OC-001): StudioPage called the `genCapNote` useState and the
 * `generateCaptions` useCallback AFTER the `if (s.query.isLoading)` early
 * return, so the loading render ran two fewer hooks than the loaded render —
 * React error #310. Fixed by hoisting both hooks above the gate; the unit
 * regression is src/features/studio/__tests__/studioFirstLoad.test.tsx.
 * This spec is the standing live check: run it wherever the browser can reach
 * Supabase (the authoring sandbox's egress proxy refuses that tunnel, so it
 * could not be executed there; do not read that as a pass or a fail).
 * This spec drives the real guest flow (fresh browser profile = fresh guest)
 * and fails if the boundary appears.
 */
test("fresh guest project: Studio first load shows the upload screen, no error boundary", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 600)}`);
  });

  await page.goto("/start?choose=1");
  // the chooser's three doors
  await expect(page.getByRole("button", { name: /Captions/ }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Captions/ }).first().click();
  await page.waitForURL(/\/projects\//, { timeout: 30_000 });
  // the studio's first screen for a fresh captions project is the upload panel
  await expect(page.getByRole("button", { name: /Choose a video/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("The editor hit a snag")).toHaveCount(0);
  fs.writeFileSync("/tmp/first-load-problems.txt", problems.join("\n") || "(no console/page errors)");
});

test("fresh guest project via the Normal Editor door: Studio first load shows the upload screen, no error boundary", async ({ page }) => {
  // OC-001: both doors render the same StudioPage (and the same loading gate),
  // so the hook-order crash hit this door too. Same fresh-profile flow, other door.
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 600)}`);
  });

  await page.goto("/start?choose=1");
  await expect(page.getByRole("button", { name: /Normal Editor/ }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Normal Editor/ }).first().click();
  await page.waitForURL(/\/projects\//, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Choose a video/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("The editor hit a snag")).toHaveCount(0);
  fs.writeFileSync("/tmp/first-load-normal-editor-problems.txt", problems.join("\n") || "(no console/page errors)");
});
