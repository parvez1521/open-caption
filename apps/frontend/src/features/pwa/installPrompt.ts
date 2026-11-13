/**
 * Install-prompt + service-worker helpers for the Captionit PWA.
 *
 * Kept free of DOM access at module scope so the pure parts are unit
 * testable; the functions that touch window/navigator take their inputs
 * as arguments (or an injectable navigator) for the same reason.
 */

/** The browser's install prompt event (beforeinstallprompt). */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** iOS Safari / iPadOS detection. iPadOS 13+ reports a Macintosh UA, so a
 *  Mac UA with touch points counts as iOS too. */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/** True when the page is already running as an installed standalone app. */
export function isStandaloneMode(win: Window): boolean {
  if (typeof win.matchMedia === "function") {
    try {
      if (win.matchMedia("(display-mode: standalone)").matches) return true;
    } catch {
      // A matchMedia that throws is treated as "not standalone".
    }
  }
  return (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Tiny holder for a captured beforeinstallprompt event: the browser fires
 *  it once, and the prompt can only be shown from a user gesture, so the
 *  component keeps it until the user taps Install (or it is consumed). */
export function createInstallPromptStore() {
  let deferred: InstallPromptEvent | null = null;
  return {
    capture(event: InstallPromptEvent) {
      if (!deferred) deferred = event;
    },
    take(): InstallPromptEvent | null {
      const event = deferred;
      deferred = null;
      return event;
    },
    has(): boolean {
      return deferred !== null;
    },
  };
}

export type ServiceWorkerNavigator = {
  /** Optional: a navigator without serviceWorker is the "no support" case. */
  serviceWorker?: Navigator["serviceWorker"];
};

type RegisterOptions = {
  /** Test seam: pass a fake navigator. Defaults to the global one. */
  navigatorRef?: ServiceWorkerNavigator | undefined;
  /** Test seam: allow registration outside production. Defaults to false. */
  allowNonProduction?: boolean;
};

/**
 * Register the app service worker (/sw.js). Returns the registration, or
 * null when the browser has no service-worker support, when not running
 * in production (dev stays SW-free so a stale cache never confuses a
 * developer), or when registration itself fails. Never throws.
 */
export async function registerServiceWorker(
  options: RegisterOptions = {},
): Promise<ServiceWorkerRegistration | null> {
  const allowNonProduction = options.allowNonProduction ?? false;
  if (process.env.NODE_ENV === "production" || allowNonProduction) {
    const nav =
      options.navigatorRef ??
      (typeof navigator !== "undefined" ? navigator : undefined);
    const sw = nav?.serviceWorker;
    if (!sw || typeof sw.register !== "function") return null;
    try {
      return await sw.register("/sw.js", { scope: "/" });
    } catch {
      return null;
    }
  }
  return null;
}
