"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/services/api-client";
import { MarkdownText } from "./markdown";

/**
 * Growth Coach panel (P2, 2026-11-11): ask questions about your OWN numbers.
 *
 * The panel sends only the question + the last few turns; the server
 * assembles the dataset from the caller's stored posts (never from anything
 * the client claims) and the model answers from that dataset alone — see
 * features/growth/coach.ts for the no-invention contract. History is
 * session-local: reload the page and the thread is gone; the data it was
 * about is not.
 *
 * When the free AI service is not switched on for the site, the panel says
 * so and offers no input — there are no canned answers behind it.
 *
 * Calls go through the shared apiClient (Bearer token attached): the API
 * accepts no other auth, and raw fetch here is what left this panel stuck
 * on its "couldn't load" state in real browsers (bugfix 2026-11-11).
 *
 * Rendering: assistant replies go through the markdown-subset renderer in
 * ./markdown (the model answers in markdown; rendered as plain text the
 * markers showed raw — bugfix 2026-11-11). The renderer builds React
 * nodes only, so model output can never become live markup. The user's
 * own messages stay plain text — they are short typed questions, and
 * markdown would mangle things like "2 * 3".
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

const cardCls = "rounded-2xl border border-sand-200 bg-sand-50 p-5 shadow-[0_2px_16px_rgba(16,15,10,0.06)]";
const primaryBtn =
  "inline-flex items-center justify-center rounded-full bg-sand-900 px-5 py-2.5 font-sora text-[13px] font-semibold text-sand-50 transition hover:bg-sand-800 disabled:opacity-50";
const chipCls =
  "rounded-full border border-sand-300 bg-sand-100 px-3 py-1.5 text-left font-sora text-[12px] font-semibold text-obsidian transition hover:bg-sand-200 disabled:opacity-50";

export function GrowthCoach({ starters }: { starters: string[] }) {
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="pt-10" aria-label="Growth Coach">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-sora text-[19px] font-bold tracking-[-0.01em] text-obsidian">Growth Coach</h2>
        {status?.configured ? (
          <span className="rounded-full border border-sand-300 bg-sand-100 px-2.5 py-1 font-sora text-[11px] font-semibold text-sand-800">
            Free AI · {status.modelName} ({status.provider})
          </span>
        ) : null}
      </div>
      <div className={`${cardCls} mt-4`}>
        <p className="max-w-[68ch] text-[13px] leading-relaxed text-sand-700">
          Ask about your own numbers. Answers use only the posts tracked in this studio — when the data isn&apos;t
          there, the coach says so instead of guessing.
        </p>

        {statusFailed ? (
          <p className="mt-3 text-[13px] text-sand-700">The coach&apos;s status couldn&apos;t load just now — your data and reports below work as usual.</p>
        ) : status === null ? (
          <p className="mt-3 text-[13px] text-sand-600">Loading…</p>
        ) : !status.configured ? (
          <p className="mt-3 text-[13px] leading-relaxed text-sand-700">
            The free AI service isn&apos;t switched on for this site yet, so the coach is off. Your posts, reports and
            weekly plan work as usual.
          </p>
        ) : (
          <>
            {turns.length === 0 && starters.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {starters.map((q) => (
                  <button key={q} type="button" className={chipCls} disabled={sending} onClick={() => void ask(q)}>
                    {q}
                  </button>
                ))}
              </div>
            ) : null}

            {turns.length > 0 ? (
              <div className="mt-4 space-y-3">
                {turns.map((turn, i) => (
                  <div
                    key={i}
                    className={
                      turn.role === "user"
                        ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-sand-900 px-4 py-2.5 text-[13.5px] leading-relaxed text-sand-50"
                        : "w-fit max-w-[92%] rounded-2xl rounded-bl-md border border-sand-200 bg-white/70 px-4 py-2.5 text-[13.5px] leading-relaxed text-obsidian"
                    }
                  >
                    {turn.role === "user" ? (
                      <p className="whitespace-pre-wrap">{turn.content}</p>
                    ) : (
                      <MarkdownText text={turn.content} />
                    )}
                  </div>
                ))}
                {sending ? <p className="text-[12.5px] text-sand-600">Thinking over your numbers…</p> : null}
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="mt-3 text-[13px] font-medium text-red-700">
                {error}
              </p>
            ) : null}

            <form
              className="mt-4 flex gap-2"
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
          </>
        )}
      </div>
    </section>
  );
}
