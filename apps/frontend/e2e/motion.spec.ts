import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { MOTION_TEMPLATES } from "@capseasy/motion";

/**
 * Motion Studio smoke (Wave-4): the three surfaces Waves 1–3 shipped, exercised
 * in a real Chromium against the production build.
 *
 * Auth: (dashboard) routes gate on a stored Supabase session. In this sandbox
 * Chromium cannot reach supabase.co (the proxy refuses the tunnel:
 * ERR_TUNNEL_CONNECTION_FAILED — verified by probe; the app's guest bootstrap
 * then correctly falls back to /login). So the session is created NODE-side
 * instead — a real anonymous sign-up through the Auth API using the public
 * anon key from .env.local — and seeded into localStorage before navigation,
 * which is exactly the state a returning guest's browser would present. If
 * the API is unreachable from Node too, a placeholder token is seeded: the
 * layout gate only checks token presence, and the pages under test render
 * their data locally (the customize page's projects query then shows its
 * handled error state, which these specs do not assert on).
 */
function envLocal(): Record<string, string> {
  try {
    const raw = readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]!] = m[2]!;
    }
    return out;
  } catch {
    return {};
  }
}

async function seedSession(page: Page) {
  const env = envLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const ref = url ? new URL(url).hostname.split(".")[0] : "placeholder";
  let session: Record<string, unknown> = {
    access_token: "e2e-smoke-token",
    refresh_token: "e2e-smoke-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "e2e-smoke-user", aud: "authenticated", is_anonymous: true },
  };
  if (url && anon) {
    try {
      const res = await fetch(`${url}/auth/v1/signup`, {
        method: "POST",
        headers: { apikey: anon, "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        if (data.access_token) session = data;
      }
    } catch {
      /* placeholder session above stands */
    }
  }
  const key = `sb-${ref}-auth-token`;
  const value = JSON.stringify(session);
  await page.addInitScript(
    ([k, v]) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* storage blocked: the page will take its normal sign-in path */
      }
    },
    [key, value] as const,
  );
}

test("home loads and the Motion Studio section is visible", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("section#motion");
  await expect(section).toBeAttached();
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("heading", { name: /Motion Studio/ })).toBeVisible();
  await expect(section.getByRole("link", { name: /Open Motion Studio/ })).toHaveAttribute("href", "/motion");
  await expect(section.locator('a[aria-label^="Customise "]')).toHaveCount(4);
});

test(`/motion renders one card per registry template (${MOTION_TEMPLATES.length})`, async ({ page }) => {
  await seedSession(page);
  await page.goto("/motion");
  await expect(page.getByRole("heading", { name: /Motion/ }).first()).toBeVisible();
  await expect(page.locator('a[aria-label^="Customise "]')).toHaveCount(MOTION_TEMPLATES.length);
  await expect(page.getByText(new RegExp(`Showing ${MOTION_TEMPLATES.length} of ${MOTION_TEMPLATES.length} templates`))).toBeVisible();
});

test("/motion/subscribe-pill customize page shows the live preview and controls", async ({ page }) => {
  await seedSession(page);
  await page.goto("/motion/subscribe-pill");
  await expect(page.getByRole("heading", { name: "Subscribe Pill" })).toBeVisible();
  await expect(page.locator('[data-testid="motion-preview"]')).toBeVisible();
  await expect(page.getByLabel(/Text lines/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Export/ }).first()).toBeVisible();
});
