import { test, expect } from "@playwright/test";
import fs from "node:fs";

/**
 * Regression: a FRESH guest project's Studio must load first time, every door.
 * Four independent persona walks (2026-11-11) hit the projects/[id] error
 * boundary ("The editor hit a snag") on the first mount of a brand-new
 * project, recovering via the boundary's reset. Root cause was NOT pinned
 * from code (single-query data assembly leaves no partial-data window; the
 * tutorial fires only after captions land) — this spec is the standing
 * regression check: run it wherever the browser can reach Supabase (the
 * authoring sandbox's egress proxy refuses that tunnel, so it could not be
 * executed there; do not read that as a pass or a fail).
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
