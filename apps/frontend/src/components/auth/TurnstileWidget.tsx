"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget (free-trial protection, Builder 5).
 * Plain script tag — no new dependency. Shown only when the server
 * asks for a challenge (an IP that already used the free trial, or
 * suspicious signup velocity): the token it returns is verified
 * server-side against siteverify before any trial is granted. A
 * client-side render alone proves nothing.
 *
 * Turnstile is OFF until the owner creates a free site for
 * captionit.in and sets NEXT_PUBLIC_TURNSTILE_SITE_KEY (Vercel) and
 * TURNSTILE_SECRET_KEY (Vercel, server-only). With no site key this
 * renders nothing — the caller checks isTurnstileConfigured() first
 * and never shows a widget that cannot work.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      remove?: (widgetId: string) => void;
      reset?: (widgetId: string) => void;
    };
    __turnstileScriptPromise?: Promise<void>;
  }
}

/** True when the owner has set the Turnstile site key. */
export function isTurnstileConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (window.__turnstileScriptPromise) return window.__turnstileScriptPromise;
  window.__turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(script);
  });
  return window.__turnstileScriptPromise;
}

export function TurnstileWidget({
  onToken,
  onError,
}: {
  /** Called with a fresh token when the challenge passes. Tokens expire — use it right away. */
  onToken: (token: string) => void;
  onError?: () => void;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const elRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onToken, onError });
  callbacksRef.current = { onToken, onError };

  useEffect(() => {
    if (!siteKey) return;
    let alive = true;
    loadTurnstileScript()
      .then(() => {
        if (!alive || !elRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(elRef.current, {
          sitekey: siteKey,
          callback: (token: string) => callbacksRef.current.onToken(token),
          "error-callback": () => callbacksRef.current.onError?.(),
          "expired-callback": () => {
            if (widgetIdRef.current) window.turnstile?.reset?.(widgetIdRef.current);
          },
        });
      })
      .catch(() => callbacksRef.current.onError?.());
    return () => {
      alive = false;
      if (widgetIdRef.current) window.turnstile?.remove?.(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={elRef} aria-label="Human check" />;
}
