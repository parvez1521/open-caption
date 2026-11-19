import * as Sentry from "@sentry/nextjs";

// Browser errors and slow pages -> Sentry. Off when no DSN is set (local dev without the Vercel env).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // a short video of what the user did, only for sessions that hit an error (free plan friendly)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.replayIntegration({ maskAllText: false, blockAllMedia: true })],
  ignoreErrors: ["ResizeObserver loop", "AbortError", "Stopped.", "Upload cancelled"],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

// MA-A1-008: an unhandled promise rejection otherwise vanishes silently —
// no console trace the user would see, no report. Send it to Sentry the same
// way caught errors are reported (a no-op when no DSN is set). The browser
// still logs the rejection itself: this handler does not preventDefault.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    Sentry.captureException(event.reason, { tags: { area: "unhandledrejection" } });
  });
}
