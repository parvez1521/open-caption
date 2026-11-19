// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  replayIntegration: () => ({}),
}));

import * as Sentry from "@sentry/nextjs";
import "./instrumentation-client";

/**
 * MA-A1-008: an unhandled promise rejection must reach Sentry instead of
 * vanishing silently. The handler reads event.reason — dispatched here by
 * hand (a real unhandled rejection would also trip vitest's own handler).
 */
describe("instrumentation-client unhandledrejection (MA-A1-008)", () => {
  it("reports the rejection reason to Sentry with the unhandledrejection tag", () => {
    vi.mocked(Sentry.captureException).mockClear();
    const err = new Error("boom");
    const event = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(event, "reason", { value: err });
    window.dispatchEvent(event);
    expect(Sentry.captureException).toHaveBeenCalledWith(err, { tags: { area: "unhandledrejection" } });
  });
});
