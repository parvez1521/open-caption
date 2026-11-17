"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPuter, puterErrorMessage } from "./puter";

/**
 * Shared Puter.js SDK state: script load, sign-in, retry. Same pattern as
 * /ai-generator (AiGenerator.tsx) — the SDK global is shared across pages in
 * the tab, so the visitor's Puter sign-in carries over; this hook only reads
 * it, it never builds a second auth flow. Generation itself stays in the
 * calling component (txt2img / txt2vid), because each surface has its own
 * result handling.
 */

export type PuterSdkStatus = "loading" | "ready" | "failed";

export function usePuterSdk() {
  const [sdkStatus, setSdkStatus] = useState<PuterSdkStatus>("loading");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [signInError, setSignInError] = useState("");
  const sdkTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // The Script onLoad/onError callbacks are the primary signal, but the SDK
  // can already be present (back/forward navigation, cached script), so also
  // poll for window.puter briefly after mount. After 10 s with no SDK, say so
  // honestly instead of spinning forever — and offer a retry.
  const startSdkWait = useCallback(() => {
    if (sdkTimer.current) clearInterval(sdkTimer.current);
    setSdkStatus("loading");
    if (getPuter()) {
      setSdkStatus("ready");
      return;
    }
    const started = Date.now();
    sdkTimer.current = setInterval(() => {
      if (getPuter()) {
        if (sdkTimer.current) clearInterval(sdkTimer.current);
        setSdkStatus("ready");
      } else if (Date.now() - started > 10000) {
        if (sdkTimer.current) clearInterval(sdkTimer.current);
        setSdkStatus((s) => (s === "ready" ? s : "failed"));
      }
    }, 500);
  }, []);

  useEffect(() => {
    startSdkWait();
    return () => {
      if (sdkTimer.current) clearInterval(sdkTimer.current);
    };
  }, [startSdkWait]);

  const refreshSignedIn = useCallback(() => {
    const puter = getPuter();
    if (!puter) return;
    try {
      setSignedIn(puter.auth.isSignedIn());
    } catch {
      setSignedIn(null);
    }
  }, []);

  useEffect(() => {
    if (sdkStatus === "ready") refreshSignedIn();
  }, [sdkStatus, refreshSignedIn]);

  const handleScriptLoad = useCallback(() => {
    if (getPuter()) {
      setSdkStatus("ready");
    } else {
      setSdkStatus("failed");
    }
  }, []);

  const handleScriptError = useCallback(() => {
    setSdkStatus("failed");
  }, []);

  // Retry after a failed load: remount the script tag (new key) and wait again from scratch.
  const retryLoad = useCallback(() => {
    setLoadAttempt((a) => a + 1);
    startSdkWait();
  }, [startSdkWait]);

  const signIn = useCallback(async () => {
    const puter = getPuter();
    if (!puter) return;
    setSignInError("");
    try {
      await puter.auth.signIn();
    } catch (err) {
      // Sign-in cancelled / popup blocked: the real reason, not a generic line.
      setSignInError(puterErrorMessage(err));
      return;
    }
    refreshSignedIn();
  }, [refreshSignedIn]);

  return {
    sdkStatus,
    signedIn,
    loadAttempt,
    signInError,
    setSignInError,
    retryLoad,
    signIn,
    refreshSignedIn,
    handleScriptLoad,
    handleScriptError,
  };
}
