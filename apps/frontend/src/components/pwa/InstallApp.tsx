"use client";

import { useEffect, useState } from "react";
import {
  createInstallPromptStore,
  isIosDevice,
  isStandaloneMode,
  type InstallPromptEvent,
} from "@/features/pwa/installPrompt";

type InstallState = "hidden" | "install" | "ios" | "installed";

/**
 * Install Captionit on the visitor's phone — honest and small.
 *
 * - Android / desktop Chrome: the browser fires beforeinstallprompt when
 *   the app is installable; the button below shows the real prompt.
 * - iOS Safari: there is no install-prompt event, so short Share → "Add to
 *   Home Screen" instructions are shown instead.
 * - Already installed (standalone mode): nothing renders.
 * - Anything else: nothing renders — no fake install button.
 *
 * The copy says what is actually true offline: the app shell loads once
 * cached, but transcription downloads its model the first time and needs
 * a connection.
 */
export function InstallApp() {
  const [state, setState] = useState<InstallState>("hidden");
  const [store] = useState(() => createInstallPromptStore());

  useEffect(() => {
    if (isStandaloneMode(window)) {
      setState("installed");
      return;
    }
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      store.capture(event as InstallPromptEvent);
      setState("install");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    if (isIosDevice(window.navigator.userAgent, window.navigator.maxTouchPoints)) {
      setState("ios");
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, [store]);

  if (state === "install") {
    return (
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={async () => {
            const deferred = store.take();
            if (!deferred) {
              setState("hidden");
              return;
            }
            await deferred.prompt();
            const choice = await deferred.userChoice;
            setState(choice.outcome === "accepted" ? "installed" : "hidden");
          }}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#FFFFEB]/20 px-6 py-3 text-base font-bold text-[#FFFFEB]"
        >
          Install app
        </button>
        <p className="max-w-md text-sm leading-relaxed text-[#FFFFEB]/60">
          Opens full-screen like an app. Works offline once loaded; transcription downloads its
          model the first time, so that needs a connection.
        </p>
      </div>
    );
  }

  if (state === "ios") {
    return (
      <div className="max-w-md rounded-2xl border border-[#FFFFEB]/10 bg-[#141412]/60 px-5 py-4 text-left">
        <p className="text-base font-bold text-[#FFFFEB]">Install on iPhone</p>
        <p className="mt-1 text-sm leading-relaxed text-[#FFFFEB]/70">
          Tap Share, then “Add to Home Screen”. Captionit opens full-screen like an app. It works
          offline once loaded; transcription downloads its model the first time, so that needs a
          connection.
        </p>
      </div>
    );
  }

  return null;
}
