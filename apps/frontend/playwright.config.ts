import { defineConfig } from "@playwright/test";

/**
 * Playwright smoke tests (Wave-4 audit) — deliberately OUTSIDE the default
 * test path: `pnpm test` runs vitest only; these run via `pnpm test:e2e`
 * against the production build served locally. One-time browser install:
 * `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: "npx next start -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
