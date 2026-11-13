"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import StudioShell from "@/components/studio/StudioShell";
import { sourceNote, type GeneratedItem, type Source } from "@/features/create/model";
import { fetchCloudAiStatus, runCloudModel, type CloudAiStatus } from "@/features/create/cloudAi";
import { getModelState, onModelState, runLocalModel, type ModelState } from "@/features/create/localModel";
import { fetchBrandProfiles, type BrandProfile } from "@/features/create/brandProfile";
import {
  appendChatMessage,
  createChatThread,
  createContentItem,
  deleteChatThread,
  fetchChatThread,
  fetchChatThreads,
  fetchContentItems,
  renameChatThread,
  type ChatMessage,
  type ChatThread,
  type ContentItem,
  type ContentKind,
} from "@/features/create/library";
import {
  assistantMessageContent,
  contextTextForItem,
  readAssistantPayload,
  readUserText,
  runChatTurn,
  setThreadContext,
  userMessageContent,
  CHAT_OUTPUT_TYPES,
  type ChatOutputType,
} from "@/features/create/chat";
import { ChatOutputView } from "@/features/create/ChatOutput";
import { SourceBadge } from "@/features/create/SourceBadge";
import type { ScriptDoc } from "@/features/create/scripts";

const inputCls =
  "w-full rounded-lg border border-sand-300 bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-sand-600";
const labelCls = "block font-sora text-[12px] font-semibold text-sand-800";
const primaryBtn =
  "rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer";
const ghostBtn =
  "rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-50 transition-colors cursor-pointer";

const isSource = (value: string | null): value is Source =>
  value === "template" || value === "model" || value === "cloud";

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function StudioChatPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  /** null = still loading; false = the library database update is not applied yet. */
  const [libraryReady, setLibraryReady] = useState<boolean | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [attachPick, setAttachPick] = useState("");
  const [outputType, setOutputType] = useState<ChatOutputType>("ideas");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busyThread, setBusyThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [cloud, setCloud] = useState<CloudAiStatus | null>(null);
  const [modelState, setModelState] = useState<ModelState>(() => getModelState());
  const [profile, setProfile] = useState<BrandProfile | null>(null);

  const selectedThread = threads.find((t) => t.id === selectedId) ?? null;
  const attachedItem = selectedThread?.contextItemId
    ? (items.find((i) => i.id === selectedThread.contextItemId) ?? null)
    : null;

  const openThread = useCallback(async (id: string) => {
    setSelectedId(id);
    setRenameValue(null);
    setError(null);
    try {
      const detail = await fetchChatThread(id);
      if (detail.thread) {
        setThreads((prev) => prev.map((t) => (t.id === id ? detail.thread! : t)));
      }
      setMessages(detail.messages);
    } catch {
      setMessages([]);
      setError("That chat could not be loaded. Try again.");
    }
  }, []);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
    void fetchCloudAiStatus().then(setCloud);
    void fetchBrandProfiles()
      .then((res) => {
        if (!res.voiceReady) return;
        const active =
          res.profiles.find((p) => p.id === res.activeId) ?? res.profiles.find((p) => p.isActive) ?? null;
        setProfile(active);
      })
      .catch(() => { /* no usable profile: generators run without one, as on /create */ });
    void (async () => {
      try {
        const list = await fetchChatThreads();
        setLibraryReady(list.ready);
        if (!list.ready) return;
        setThreads(list.threads);
        const content = await fetchContentItems().catch(() => null);
        if (content?.ready) setItems(content.items);
        if (list.threads.length) await openThread(list.threads[0]!.id);
      } catch {
        setLibraryReady(false);
      }
    })();
  }, [router, openThread]);

  useEffect(() => onModelState(setModelState), []);
  const cloudOn = !!cloud?.configured;
  const modelReady = modelState.status === "ready";

  const newChat = async () => {
    setBusyThread(true);
    setError(null);
    try {
      const thread = await createChatThread();
      setThreads((prev) => [thread, ...prev]);
      setSelectedId(thread.id);
      setMessages([]);
      setRenameValue(null);
    } catch {
      setError("A new chat could not be created. Try again.");
    } finally {
      setBusyThread(false);
    }
  };

  const rename = async () => {
    if (!selectedThread || renameValue === null) return;
    const title = renameValue.trim();
    if (!title) { setRenameValue(null); return; }
    try {
      const updated = await renameChatThread(selectedThread.id, title);
      setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setRenameValue(null);
    } catch {
      setError("The chat could not be renamed. Try again.");
    }
  };

  const removeThread = async () => {
    if (!selectedThread) return;
    const id = selectedThread.id;
    try {
      await deleteChatThread(id);
      const rest = threads.filter((t) => t.id !== id);
      setThreads(rest);
      if (rest.length) await openThread(rest[0]!.id);
      else { setSelectedId(null); setMessages([]); }
    } catch {
      setError("The chat could not be deleted. Try again.");
    }
  };

  const attach = async () => {
    if (!selectedThread || !attachPick) return;
    try {
      const updated = await setThreadContext(selectedThread.id, attachPick);
      setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setAttachPick("");
    } catch {
      setError("That item could not be attached. Try again.");
    }
  };

  const detach = async () => {
    if (!selectedThread) return;
    try {
      const updated = await setThreadContext(selectedThread.id, null);
      setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      setError("The attached item could not be removed. Try again.");
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!selectedThread || !text || sending) return;
    setSending(true);
    setError(null);
    try {
      const userMsg = await appendChatMessage(selectedThread.id, {
        role: "user",
        content: userMessageContent(text),
      });
      setMessages((prev) => [...prev, userMsg]);
      setDraft("");
      const result = await runChatTurn(
        outputType,
        text,
        {
          contextText: attachedItem ? contextTextForItem(attachedItem) : undefined,
          profile,
        },
        {
          runCloud: cloudOn ? runCloudModel : undefined,
          modelEnabled: modelReady,
          runModel: runLocalModel,
          profile,
        },
      );
      const assistantMsg = await appendChatMessage(selectedThread.id, {
        role: "assistant",
        content: assistantMessageContent(result),
        source: result.source,
      });
      setMessages((prev) => [...prev, assistantMsg]);
      // The thread's updated stamp moved; keep the list honest without a refetch of messages.
      setThreads((prev) =>
        prev.map((t) => (t.id === selectedThread.id ? { ...t, updatedAt: assistantMsg.createdAt || t.updatedAt } : t)),
      );
    } catch {
      setError("That message could not be sent. Your text is still in the box below. Try again.");
      setDraft((d) => d || text);
    } finally {
      setSending(false);
    }
  };

  const saveItem = async (source: Source, item: GeneratedItem | ScriptDoc, kind: ContentKind): Promise<boolean> => {
    const isScript = kind === "script";
    try {
      await createContentItem({
        kind,
        title: item.title,
        body: isScript
          ? (item as unknown as Record<string, unknown>)
          : ({ item } as Record<string, unknown>),
        source,
      });
      return true;
    } catch {
      setError("That item could not be saved to your library. Try again.");
      return false;
    }
  };

  // The source note (what wrote this, and for cloud: that the topic text was sent to the
  // provider) is shown once, under the first assistant answer — the badge on every later
  // answer carries the same fact without repeating the paragraph down the thread.
  const firstAssistantId = messages.find((m) => m.role === "assistant")?.id;

  if (!signedIn || libraryReady === null) {
    return (
      <StudioShell>
        <div className="px-4 sm:px-10 py-10 max-w-5xl mx-auto">
          <div className="h-40 rounded-xl bg-sand-100 animate-pulse" />
        </div>
      </StudioShell>
    );
  }

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <Link href="/create" className="font-sora text-[12px] font-semibold text-sand-700 hover:text-ink">
          ← Creator Studio
        </Link>
        <div className="mt-3 pb-8 border-b border-sand-200">
          <p className="font-sora text-[11px] font-semibold uppercase tracking-wider text-sand-500">Creator Studio</p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            AI Studio <em className="italic text-sand-600">Chat</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800 max-w-2xl">
            Ask in plain words. Get a structured answer: ideas, hooks, a script, a shot list, a calendar, a carousel or captions. Never a wall of prose. Every answer shows which source wrote it. Chats save to your library, so you can pick them up later.
          </p>
          {profile ? (
            <p className="mt-3 inline-flex rounded-full border border-sand-300 bg-sand-100 px-3 py-1 font-sora text-[11px] font-semibold text-sand-800">
              Using profile: {profile.name}
            </p>
          ) : null}
        </div>

        {!libraryReady ? (
          <section className="mt-8 rounded-xl border border-sand-200 bg-white p-6">
            <h2 className="font-sora text-[15px] font-bold text-ink">Chat is not set up yet</h2>
            <p className="mt-1 text-[13px] text-sand-700 max-w-xl">
              Studio Chat saves your conversations in your content library. The library needs a database update on the server first. Your generators on the Creator Studio page keep working as normal.
            </p>
            <Link href="/create" className={`${ghostBtn} mt-4 inline-block`}>Back to Creator Studio</Link>
          </section>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-[260px_1fr]">
            {/* Threads */}
            <aside className="space-y-3">
              <button onClick={() => void newChat()} disabled={busyThread} className={`${primaryBtn} w-full`}>
                New chat
              </button>
              {threads.length ? (
                <ul className="space-y-2">
                  {threads.map((thread) => (
                    <li key={thread.id}>
                      <button
                        onClick={() => void openThread(thread.id)}
                        className={`w-full rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                          thread.id === selectedId
                            ? "border-ink bg-white"
                            : "border-sand-200 bg-white hover:border-sand-400"
                        }`}
                      >
                        <span className="block truncate text-[13px] font-medium text-ink">{thread.title}</span>
                        <span className="mt-0.5 block text-[11px] text-sand-500">{formatDate(thread.updatedAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-sand-600">No chats yet. Start one with the button above.</p>
              )}
              {selectedThread ? (
                <div className="rounded-xl border border-sand-200 bg-white p-3 space-y-2">
                  {renameValue !== null ? (
                    <>
                      <label className={labelCls} htmlFor="chat-rename">Chat title</label>
                      <input
                        id="chat-rename"
                        className={inputCls}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void rename(); }}
                      />
                      <div className="flex gap-2">
                        <button onClick={() => void rename()} className={ghostBtn}>Save title</button>
                        <button onClick={() => setRenameValue(null)} className={ghostBtn}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setRenameValue(selectedThread.title)} className={ghostBtn}>Rename</button>
                      <button onClick={() => void removeThread()} className={ghostBtn}>Delete chat</button>
                    </div>
                  )}
                </div>
              ) : null}
            </aside>

            {/* Conversation */}
            <section className="min-w-0">
              {!selectedThread ? (
                <div className="rounded-xl border border-sand-200 bg-white p-6">
                  <p className="text-[13px] text-sand-700">
                    Create a chat to start. Each answer comes back structured and ready to save to your library.
                  </p>
                </div>
              ) : (
                <>
                  {/* Attached context */}
                  <div className="rounded-xl border border-sand-200 bg-white p-4">
                    {attachedItem ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-2 rounded-full border border-sand-300 bg-sand-100 px-3 py-1.5 text-[12px] text-sand-800">
                          Context: <span className="font-semibold text-ink">{attachedItem.title || attachedItem.kind}</span>
                        </span>
                        <button onClick={() => void detach()} className={ghostBtn}>Remove</button>
                      </div>
                    ) : selectedThread.contextItemId ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[12px] text-sand-600">A library item is attached as context.</span>
                        <button onClick={() => void detach()} className={ghostBtn}>Remove</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-56 flex-1">
                          <label className={labelCls} htmlFor="chat-attach">Attach library item as context</label>
                          <select
                            id="chat-attach"
                            className={inputCls}
                            value={attachPick}
                            onChange={(e) => setAttachPick(e.target.value)}
                          >
                            <option value="">Choose an item…</option>
                            {items.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.kind} — {item.title || "Untitled"}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button onClick={() => void attach()} disabled={!attachPick} className={ghostBtn}>
                          Attach
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Messages */}
                  <div className="mt-4 space-y-4" aria-live="polite">
                    {messages.length === 0 ? (
                      <p className="rounded-xl border border-sand-200 bg-white p-5 text-[13px] text-sand-700">
                        No messages yet. Ask for hook ideas about your next video. Or a week of content planned out. Or a script for the idea you keep putting off.
                      </p>
                    ) : (
                      messages.map((message) => {
                        if (message.role === "user") {
                          const text = readUserText(message.content);
                          return (
                            <div key={message.id} className="rounded-xl bg-sand-100 p-4">
                              <p className="font-sora text-[11px] font-semibold uppercase tracking-wider text-sand-500">You</p>
                              <p className="mt-1 text-[14px] text-ink whitespace-pre-line">{text}</p>
                            </div>
                          );
                        }
                        const stored = readAssistantPayload(message.content);
                        if (!stored) {
                          return (
                            <p key={message.id} className="rounded-xl border border-sand-200 bg-white p-4 text-[13px] text-sand-600">
                              This message could not be displayed.
                            </p>
                          );
                        }
                        const source = isSource(message.source) ? message.source : stored.source;
                        return (
                          <div key={message.id} className="space-y-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <SourceBadge source={source} />
                              {message.id === firstAssistantId ? (
                                <p className="text-[12px] text-sand-600">{sourceNote(source)}</p>
                              ) : null}
                            </div>
                            {stored.note ? (
                              <p className="rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-3 py-2 text-[12px] text-obsidian">
                                {stored.note}
                              </p>
                            ) : null}
                            <ChatOutputView
                              payload={stored.payload}
                              onSave={(item, kind) => saveItem(source, item, kind)}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>

                  {error ? (
                    <p className="mt-4 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-3 py-2 text-[12px] text-obsidian">
                      {error}
                    </p>
                  ) : null}

                  {/* Composer */}
                  <div className="mt-4 rounded-xl border border-sand-200 bg-white p-4 space-y-3">
                    <div className="max-w-56">
                      <label className={labelCls} htmlFor="chat-type">Answer as</label>
                      <select
                        id="chat-type"
                        className={inputCls}
                        value={outputType}
                        onChange={(e) => setOutputType(e.target.value as ChatOutputType)}
                      >
                        {CHAT_OUTPUT_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="chat-input">Your message</label>
                      <textarea
                        id="chat-input"
                        className={inputCls}
                        rows={3}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="e.g. morning routines for busy parents"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button onClick={() => void send()} disabled={sending || !draft.trim()} className={primaryBtn}>
                        {sending ? "Working…" : "Send"}
                      </button>
                      <span className="text-[12px] text-sand-600">
                        The badge on each answer says which source wrote it.
                      </span>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </StudioShell>
  );
}
