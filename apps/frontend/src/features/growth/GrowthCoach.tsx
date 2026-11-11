"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/services/api-client";
import { MarkdownText } from "./markdown";

/**
 * Growth Coach — the Growth page IS this chat (chat-first rebuild, owner
 * order 2026-11-11: vidIQ-style interface, accounts bar on top, nothing
 * else below). The panel sends only the question + the last few turns;
 * the server assembles the dataset from the caller's stored posts (never
 * from anything the client claims) and the model answers from that
 * dataset alone — see features/growth/coach.ts for the no-invention
 * contract. History is session-local: reload the page and the thread is
 * gone; the data it was about is not.
 *
 * Two layouts, one composer:
 *  - Empty thread: the vidIQ/ChatGPT welcome pattern — a centred
 *    headline, the composer big and central, and the starter questions
 *    as chips underneath it.
 *  - Chatting: the thread scrolls (your messages as right-aligned
 *    bubbles, coach answers full-width rich markdown), each coach answer
 *    carries a Copy action, the starter questions return as follow-up
 *    chips under the latest answer, and the composer pins to the bottom.
 * No fake streaming and no fake tool steps: the route answers in one
 * response, so a single honest working label covers the wait.
 *
 * Connection state no longer lives here — the accounts bar at the top of
 * the page owns it (the chips this panel carried for an hour were the
 * owner's "top shows what's connected" ask in the wrong place).
 *
 * When the free AI service is not switched on for the site, the chat says
 * so and there is no composer — there are no canned answers.
 *
 * Calls go through the shared apiClient (Bearer token attached): the API
 * accepts no other auth, and raw fetch here is what left this panel stuck
 * on its "couldn't load" state in real browsers (bugfix 2026-11-11).
 *
 * Rendering: assistant replies go through the markdown-subset renderer in
 * ./markdown (the model answers in markdown — tables included — rendered
 * as inert React nodes, so model output can never become live markup. The
 * user's own messages stay plain text — they are short typed questions,
 * and markdown would mangle things like "2 * 3".
 */

interface ChatStatus {
  configured: boolean;
  provider: string;
  modelName: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const primaryBtn =
  "inline-flex items-center justify-center rounded-full bg-sand-900 px-5 py-2.5 font-sora text-[13px] font-semibold text-sand-50 transition hover:bg-sand-800 disabled:opacity-50";
const chipCls =
  "rounded-full border border-sand-300 bg-sand-100 px-3 py-1.5 text-left font-sora text-[12px] font-semibold text-obsidian transition hover:bg-sand-200 disabled:opacity-50";
const copyBtnCls =
  "mt-2 font-sora text-[11.5px] font-semibold text-sand-600 underline decoration-sand-300 underline-offset-2 transition hover:text-obsidian";

export function GrowthCoach({ starters }: { starters: string[] }) {
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.get<ChatStatus>("/growth/chat");
        if (cancelled) return;
        setStatus(data);
      } catch {
        if (!cancelled) setStatusFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the newest message in view, ChatGPT-style.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, sending]);

  const ask = async (raw: string) => {
    const question = raw.trim();
    if (!question || sending) return;
    setSending(true);
    setError(null);
    setInput("");
    const history = turns.slice(-6);
    setTurns((prev) => [...prev, { role: "user", content: question }]);
    try {
      const data = await apiClient.post<{ configured: boolean; answer?: string }>("/growth/chat", {
        json: { question, history },
      });
      if (!data.configured) {
        setStatus((s) => (s ? { ...s, configured: false } : s));
        return;
      }
      setTurns((prev) => [...prev, { role: "assistant", content: data.answer ?? "" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The coach didn't answer — try again.");
    } finally {
      setSending(false);
    }
  };

  const copyAnswer = async (idx: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 2000);
    } catch {
      // Clipboard unavailable (permissions, insecure context): the answer
      // stays on screen to select by hand — no fake "copied" claim.
    }
  };

  const configured = status?.configured ?? false;
  const chatting = turns.length > 0;
  const lastTurn = turns[turns.length - 1];

  const composer = (variant: "welcome" | "bar") => (
    <form
      className={
        variant === "welcome"
          ? "flex w-full max-w-2xl gap-2 rounded-[28px] border border-sand-300 bg-white/70 p-2 shadow-[0_2px_16px_rgba(16,15,10,0.06)]"
          : "flex gap-2"
      }
      onSubmit={(e) => {
        e.preventDefault();
        void ask(input);
      }}
    >
      <label className="sr-only" htmlFor={variant === "welcome" ? "growth-coach-input-welcome" : "growth-coach-input"}>
        Ask about your analytics
      </label>
      <input
        id={variant === "welcome" ? "growth-coach-input-welcome" : "growth-coach-input"}
        className={
          variant === "welcome"
            ? "min-w-0 flex-1 rounded-full bg-transparent px-4 py-2.5 text-[14.5px] text-obsidian outline-none placeholder:text-sand-500"
            : "min-w-0 flex-1 rounded-full border border-sand-300 bg-white/70 px-4 py-2.5 text-[13.5px] text-obsidian outline-none focus:border-sand-500"
        }
        placeholder="Ask about your posts…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        maxLength={500}
        disabled={sending}
      />
      <button type="submit" className={primaryBtn} disabled={sending || !input.trim()}>
        Ask
      </button>
    </form>
  );

  const starterChips = (align: "center" | "start") =>
    starters.length > 0 ? (
      <div className={`flex flex-wrap gap-2 ${align === "center" ? "justify-center" : ""}`}>
        {starters.map((q) => (
          <button key={q} type="button" className={chipCls} disabled={sending} onClick={() => void ask(q)}>
            {q}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <section className="flex min-h-0 flex-1 flex-col pt-5" aria-label="Growth Coach">
      <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-sand-200 bg-sand-50 shadow-[0_2px_16px_rgba(16,15,10,0.06)]">
        {statusFailed ? (
          <div className="flex flex-1 items-center justify-center px-5 py-10">
            <p className="max-w-[68ch] text-center text-[13.5px] leading-relaxed text-sand-700">
              The coach&apos;s status couldn&apos;t load just now — try again in a moment.
            </p>
          </div>
        ) : status === null ? (
          <div className="flex flex-1 items-center justify-center px-5 py-10">
            <p className="text-[13px] text-sand-600">Loading…</p>
          </div>
        ) : !configured ? (
          <div className="flex flex-1 items-center justify-center px-5 py-10">
            <p className="max-w-[68ch] text-center text-[13.5px] leading-relaxed text-sand-700">
              The free AI service isn&apos;t switched on for this site yet, so the coach is off.
            </p>
          </div>
        ) : !chatting ? (
          /* Welcome state: headline, central composer, starter chips. */
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
            <h1 className="text-center font-serif text-3xl font-semibold tracking-[-0.015em] text-ink sm:text-4xl">
              Ask about your <em className="italic text-sand-600">channel.</em>
            </h1>
            <p className="mt-3 max-w-[52ch] text-center text-[13.5px] leading-relaxed text-sand-700">
              Answers come only from your own posts — connect an account above and sync, then ask.
            </p>
            {status?.configured ? (
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-sand-300 bg-sand-100 px-2.5 py-1 font-sora text-[11px] font-semibold text-sand-800">
                Free AI · {status.modelName} ({status.provider})
              </span>
            ) : null}
            <div className="mt-8 flex w-full justify-center">{composer("welcome")}</div>
            <div className="mt-5">{starterChips("center")}</div>
            {error ? (
              <p role="alert" className="mt-4 text-[13px] font-medium text-red-700">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {/* Message thread: scrolls inside the card. */}
            <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              <div className="mx-auto max-w-3xl space-y-5">
                {turns.map((turn, i) =>
                  turn.role === "user" ? (
                    <div
                      key={i}
                      className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-sand-900 px-4 py-2.5 text-[13.5px] leading-relaxed text-sand-50"
                    >
                      <p className="whitespace-pre-wrap">{turn.content}</p>
                    </div>
                  ) : (
                    <div key={i} className="w-full text-[13.5px] leading-relaxed text-obsidian">
                      <MarkdownText text={turn.content} />
                      <button
                        type="button"
                        className={copyBtnCls}
                        onClick={() => void copyAnswer(i, turn.content)}
                      >
                        {copiedIdx === i ? "Copied" : "Copy"}
                      </button>
                    </div>
                  ),
                )}

                {sending ? (
                  <p className="flex items-center gap-2 text-[12.5px] text-sand-600" role="status">
                    <span aria-hidden className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sand-500" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sand-500 [animation-delay:200ms]" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sand-500 [animation-delay:400ms]" />
                    </span>
                    Looking at your posts…
                  </p>
                ) : null}

                {!sending && lastTurn?.role === "assistant" ? starterChips("start") : null}

                {error ? (
                  <p role="alert" className="text-[13px] font-medium text-red-700">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Composer: pinned to the bottom of the card. */}
            <div className="border-t border-sand-200 px-4 py-3 sm:px-6">
              <div className="mx-auto max-w-3xl">{composer("bar")}</div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
