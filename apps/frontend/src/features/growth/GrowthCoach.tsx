"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/services/api-client";
import { MarkdownText } from "./markdown";

/**
 * Growth Coach (P2, 2026-11-11; chat redesign, owner order 2026-11-11):
 * ask questions about your OWN numbers, in a ChatGPT-style chat surface.
 *
 * The panel sends only the question + the last few turns; the server
 * assembles the dataset from the caller's stored posts (never from anything
 * the client claims) and the model answers from that dataset alone — see
 * features/growth/coach.ts for the no-invention contract. History is
 * session-local: reload the page and the thread is gone; the data it was
 * about is not.
 *
 * LAYOUT (the owner asked for a chat interface, not a panel): a header
 * strip shows what is connected — YouTube / Instagram chips read from the
 * SAME /growth/connections status route the "Connect your accounts"
 * section uses, fetched through the authed apiClient, plus the honest
 * free-AI label. Below it a scrolling message thread (your messages as
 * right-aligned bubbles, coach answers full-width rich markdown), and a
 * composer pinned to the bottom of the card: the card has a real height
 * and the thread scrolls inside it. No fake streaming — the route
 * answers in one response, so a typing indicator covers the wait.
 *
 * When the free AI service is not switched on for the site, the thread
 * says so and there is no composer — there are no canned answers.
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

type Platform = "youtube" | "instagram";

interface PlatformStatus {
  platform: Platform;
  configured: boolean;
  connected: boolean;
  accountName: string | null;
  lastSyncAt: string | null;
  /** Stored posts this connection's syncs have brought in; null = the count couldn't be read. */
  postCount?: number | null;
}

interface ConnectionsStatus {
  setupPending: boolean;
  platforms: PlatformStatus[];
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const primaryBtn =
  "inline-flex items-center justify-center rounded-full bg-sand-900 px-5 py-2.5 font-sora text-[13px] font-semibold text-sand-50 transition hover:bg-sand-800 disabled:opacity-50";
const chipCls =
  "rounded-full border border-sand-300 bg-sand-100 px-3 py-1.5 text-left font-sora text-[12px] font-semibold text-obsidian transition hover:bg-sand-200 disabled:opacity-50";
const statusChipCls =
  "inline-flex items-center gap-1.5 rounded-full border border-sand-300 bg-sand-100 px-2.5 py-1 font-sora text-[11px] font-semibold text-sand-800";

const PLATFORM_NAMES: Record<Platform, string> = { youtube: "YouTube", instagram: "Instagram" };

/**
 * One header chip's text, derived ONLY from fields the status route
 * actually returns — a connected platform adds its account name and the
 * synced-post count only when the payload carries them, never a guess.
 */
function connectionChipText(row: PlatformStatus, setupPending: boolean): string {
  const name = PLATFORM_NAMES[row.platform];
  if (row.connected) {
    let text = `${name} · Connected`;
    if (row.accountName) text += ` · ${row.accountName}`;
    if (typeof row.postCount === "number") text += ` · ${row.postCount} post${row.postCount === 1 ? "" : "s"} synced`;
    return text;
  }
  if (!row.configured) return `${name} · Not switched on`;
  if (setupPending) return `${name} · Setup pending`;
  return `${name} · Not connected`;
}

export function GrowthCoach({ starters }: { starters: string[] }) {
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [connections, setConnections] = useState<ConnectionsStatus | null>(null);
  const [connectionsFailed, setConnectionsFailed] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Header connection chips: the same status route (and payload) the
  // Connect section above renders from. A payload that doesn't carry the
  // platforms list is treated as "couldn't load" rather than guessed at.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.get<ConnectionsStatus>("/growth/connections");
        if (cancelled) return;
        if (!data || !Array.isArray(data.platforms)) throw new Error("unexpected connections payload");
        setConnections(data);
      } catch {
        if (!cancelled) setConnectionsFailed(true);
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

  const configured = status?.configured ?? false;

  return (
    <section className="pt-10" aria-label="Growth Coach">
      <h2 className="font-sora text-[19px] font-bold tracking-[-0.01em] text-obsidian">Growth Coach</h2>

      <div className="mt-4 flex h-[min(620px,82dvh)] flex-col overflow-hidden rounded-2xl border border-sand-200 bg-sand-50 shadow-[0_2px_16px_rgba(16,15,10,0.06)]">
        {/* Header strip: what is connected, read live from the status route. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-sand-200 px-4 py-3 sm:px-5">
          {connections ? (
            connections.platforms.map((row) => (
              <span key={row.platform} className={statusChipCls}>
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${row.connected ? "bg-emerald-accent" : "bg-sand-300"}`} />
                {connectionChipText(row, connections.setupPending)}
              </span>
            ))
          ) : (
            <span className="text-[12px] text-sand-600">
              {connectionsFailed ? "Connection status couldn't load" : "Checking connections…"}
            </span>
          )}
          {status?.configured ? (
            <span className={`${statusChipCls} ml-auto`}>
              Free AI · {status.modelName} ({status.provider})
            </span>
          ) : null}
        </div>

        {/* Message thread: scrolls inside the card. */}
        <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {statusFailed ? (
            <p className="text-[13px] text-sand-700">
              The coach&apos;s status couldn&apos;t load just now — your data and reports below work as usual.
            </p>
          ) : status === null ? (
            <p className="text-[13px] text-sand-600">Loading…</p>
          ) : !configured ? (
            <p className="max-w-[68ch] text-[13px] leading-relaxed text-sand-700">
              The free AI service isn&apos;t switched on for this site yet, so the coach is off. Your posts, reports
              and weekly plan work as usual.
            </p>
          ) : (
            <div className="space-y-4">
              {turns.length === 0 ? (
                <div>
                  <p className="max-w-[68ch] text-[13px] leading-relaxed text-sand-700">
                    Ask about your own numbers — answers use only your tracked posts, and say so when the data
                    isn&apos;t there.
                  </p>
                  {starters.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {starters.map((q) => (
                        <button key={q} type="button" className={chipCls} disabled={sending} onClick={() => void ask(q)}>
                          {q}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

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
                  Thinking over your numbers…
                </p>
              ) : null}

              {error ? (
                <p role="alert" className="text-[13px] font-medium text-red-700">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* Composer: pinned to the bottom of the card. */}
        {configured ? (
          <form
            className="flex gap-2 border-t border-sand-200 px-4 py-3 sm:px-5"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <label className="sr-only" htmlFor="growth-coach-input">
              Ask about your analytics
            </label>
            <input
              id="growth-coach-input"
              className="min-w-0 flex-1 rounded-full border border-sand-300 bg-white/70 px-4 py-2.5 text-[13.5px] text-obsidian outline-none focus:border-sand-500"
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
        ) : null}
      </div>
    </section>
  );
}
