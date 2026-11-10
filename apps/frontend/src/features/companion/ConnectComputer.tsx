"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/services/api-client";
import { workersService, type Worker } from "@/services/workers";

/* ── one-click "Connect this computer" ───────────────────────────
 * The site creates a pre-approved, single-use pairing code for the
 * signed-in account and bakes it into what it hands the user:
 *   Windows: a setup file. Double-click → Windows asks "Run?" → done.
 *            It installs everything (no admin), pairs itself, starts
 *            hidden in the background, and deletes itself.
 *   macOS / Linux: one line to paste into Terminal (code included).
 * Meanwhile this component watches for the new computer and turns
 * green by itself, so nobody has to come back and click anything.
 * ─────────────────────────────────────────────────────────────── */

type OS = "windows" | "mac" | "linux" | "mobile";
type Phase = "idle" | "preparing" | "waiting" | "connected" | "error";

const noSubscribe = () => () => {};

function detectOS(): OS {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) return "mobile";
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "mac";
  return "linux";
}

/** Windows setup file. CRLF line endings; deletes itself afterwards so the one-time code never lingers. */
function setupCmd(app: string, code: string) {
  return [
    "@echo off",
    "title Open Caption setup",
    "echo.",
    "echo   Setting up Open Caption on this computer. This takes a minute or two...",
    "echo.",
    `set "CAPSEASY_PAIR=${code}"`,
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm '${app}/install.ps1' | iex"`,
    "if errorlevel 1 (",
    "  echo.",
    "  echo   Something went wrong. Take a screenshot of this window and send it to support.",
    "  pause",
    "  exit /b 1",
    ")",
    '(goto) 2>nul & del "%~f0"',
    "",
  ].join("\r\n");
}

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ConnectComputer({ compact = false, onConnected }: { compact?: boolean; onConnected?: (w: Worker) => void }) {
  const qc = useQueryClient();
  const os = useSyncExternalStore(noSubscribe, detectOS, () => "windows" as OS);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [connected, setConnected] = useState<Worker | null>(null);
  const known = useRef<Set<string>>(new Set());

  // watch for the new computer while waiting
  useEffect(() => {
    if (phase !== "waiting") return;
    let alive = true;
    const tick = async () => {
      try {
        const ws = await workersService.getMyWorkers();
        const fresh = ws.find((w) => !known.current.has(w.id));
        if (alive && fresh) {
          setConnected(fresh);
          setPhase("connected");
          onConnected?.(fresh);
          void qc.invalidateQueries();
        }
      } catch {
        /* keep polling */
      }
    };
    const id = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [phase, onConnected, qc]);

  const start = async () => {
    setError(null);
    setCopied(false);
    setPhase("preparing");
    try {
      known.current = new Set((await workersService.getMyWorkers().catch(() => [])).map((w) => w.id));
      const { pairCode, appUrl } = await apiClient.post<{ pairCode: string; appUrl: string; expiresInSeconds: number }>("/device/setup");
      if (os === "windows") {
        download(setupCmd(appUrl, pairCode), "OpenCaption-Setup.cmd");
      } else {
        setCommand(`curl -fsSL ${appUrl}/install.sh | CAPSEASY_PAIR=${pairCode} bash`);
      }
      setPhase("waiting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't prepare the setup. Try again.");
      setPhase("error");
    }
  };

  const copy = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      /* the text is selectable */
    }
  };

  if (os === "mobile") {
    return <p className="text-sm text-st-muted">Use Open Caption on your laptop or desktop to connect it. Phones can still export MP4 and subtitles right here.</p>;
  }

  if (phase === "connected" && connected) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-st-em/15 px-3 py-2.5 text-sm text-st-text">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-st-em text-xs font-bold text-[#141412]">✓</span>
        <span>
          <b>{connected.name}</b> is connected. Exports and transcriptions now run on it automatically.
        </span>
      </div>
    );
  }

  const button = (
    <button
      onClick={() => void start()}
      disabled={phase === "preparing"}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-obsidian px-5 py-2.5 text-sm font-semibold text-major transition hover:bg-obsidian/85 active:scale-[0.98] disabled:opacity-60"
    >
      {phase === "preparing" ? "Preparing…" : phase === "waiting" ? (os === "windows" ? "Download again" : "Get a new command") : "Connect this computer"}
      <span aria-hidden>→</span>
    </button>
  );

  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      {phase !== "waiting" ? (
        <div className="flex flex-wrap items-center gap-3">
          {button}
          <span className="text-xs text-st-muted">Free · no admin rights · about 2 minutes</span>
        </div>
      ) : null}

      {phase === "waiting" && os === "windows" ? (
        <div className="rounded-xl border border-st-line bg-st-panel/80 p-3">
          <ol className="space-y-2 text-sm text-st-text">
            <li className="flex gap-2.5"><Step n={1} /> <span>Open <b>OpenCaption-Setup.cmd</b> from your downloads (bottom or top-right of your browser).</span></li>
            <li className="flex gap-2.5"><Step n={2} /> <span>If Windows asks, click <b>Run</b> (or <i>More info → Run anyway</i>).</span></li>
            <li className="flex gap-2.5"><Step n={3} /> <span>That&apos;s it. This page turns green by itself when your computer is connected.</span></li>
          </ol>
          <Waiting />
          <div className="mt-2">{button}</div>
        </div>
      ) : null}

      {phase === "waiting" && os !== "windows" && command ? (
        <div className="rounded-xl border border-st-line bg-st-panel/80 p-3">
          <ol className="space-y-2 text-sm text-st-text">
            <li className="flex gap-2.5"><Step n={1} /> <span>Open <b>Terminal</b> {os === "mac" ? "(press ⌘ + Space, type Terminal, press Enter)" : ""}.</span></li>
            <li className="flex gap-2.5"><Step n={2} /> <span>Paste this line and press Enter:</span></li>
          </ol>
          <div className="mt-2 flex items-stretch gap-2">
            <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap rounded-lg bg-[#0B0B0A] px-3 py-2 font-mono text-xs text-[#FFFFEB]">{command}</code>
            <button onClick={() => void copy()} className="shrink-0 rounded-lg bg-st-lav px-3 text-xs font-semibold text-obsidian">{copied ? "Copied" : "Copy"}</button>
          </div>
          <Waiting />
        </div>
      ) : null}

      {phase === "error" && error ? <p role="alert" className="text-sm text-st-text">{error}</p> : null}
    </div>
  );
}

const Step = ({ n }: { n: number }) => (
  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-st-lav text-[11px] font-bold text-obsidian">{n}</span>
);

const Waiting = () => (
  <p className="mt-3 flex items-center gap-2 text-xs text-st-muted">
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-st-em opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-st-em" />
    </span>
    Waiting for your computer…
  </p>
);
