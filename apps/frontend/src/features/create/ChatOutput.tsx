"use client";

import React, { useState } from "react";
import type { GeneratedItem } from "./model";
import { itemCopyText } from "./model";
import type { ContentKind } from "./library";
import { scriptToText, type ScriptDoc } from "./scripts";
import { CHAT_SAVE_KIND, type ChatPayload } from "./chat";

/**
 * Renders one structured chat payload (chat.ts ChatPayload). Payload-only:
 * the source badge and note belong to the message, and the page renders
 * those around this component. Every item gets a Copy button; when the page
 * passes `onSave`, each item (or the whole script) also gets a
 * "Save to library" button mapped through CHAT_SAVE_KIND.
 */

const ghostBtn =
  "rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-50 transition-colors cursor-pointer";
const cardCls = "rounded-xl border border-sand-200 bg-white p-5";

interface ChatOutputViewProps {
  payload: ChatPayload;
  /** resolves true only when the item actually landed in the library */
  onSave?: (item: GeneratedItem | ScriptDoc, kind: ContentKind) => Promise<boolean>;
}

export function ChatOutputView({ payload, onSave }: ChatOutputViewProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [failedKeys, setFailedKeys] = useState<Set<string>>(new Set());

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1600);
    } catch { /* clipboard unavailable: the text stays selectable on screen */ }
  };

  const save = async (key: string, item: GeneratedItem | ScriptDoc) => {
    if (!onSave) return;
    // "Saved" is only claimed after the save resolves — it used to be set unconditionally,
    // so a failed save still showed "Saved" (the page's error banner was the only tell)
    const ok = await onSave(item, CHAT_SAVE_KIND[payload.outputType]);
    if (ok) {
      setSavedKeys((prev) => new Set(prev).add(key));
      setFailedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      setFailedKeys((prev) => new Set(prev).add(key));
    }
  };

  const actions = (key: string, copyText: string, item: GeneratedItem | ScriptDoc) => (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button onClick={() => void copy(key, copyText)} className={ghostBtn}>
        {copiedKey === key ? "Copied" : "Copy"}
      </button>
      {onSave ? (
        <button onClick={() => void save(key, item)} disabled={savedKeys.has(key)} className={ghostBtn}>
          {savedKeys.has(key) ? "Saved" : "Save to library"}
        </button>
      ) : null}
      {failedKeys.has(key) && !savedKeys.has(key) ? (
        <span role="alert" className="text-[12px] font-medium text-obsidian">Couldn&apos;t save — try again.</span>
      ) : null}
    </div>
  );

  if (payload.outputType === "script" && payload.script) {
    const doc = payload.script;
    return (
      <div className="space-y-3">
        <article className={cardCls}>
          <p className="font-sora text-[13px] font-bold text-ink">{doc.title}</p>
          <p className="mt-1 text-[12px] text-sand-600">
            {doc.durationSec}s · {doc.beats.length} beats
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[13px] text-sand-800">
              <thead>
                <tr className="border-b border-sand-200 font-sora text-[11px] uppercase tracking-wide text-sand-500">
                  <th className="py-2 pr-3 font-semibold">Timing</th>
                  <th className="py-2 pr-3 font-semibold">Beat</th>
                  <th className="py-2 pr-3 font-semibold">Dialogue</th>
                  <th className="py-2 pr-3 font-semibold">On screen</th>
                  <th className="py-2 font-semibold">B-roll</th>
                </tr>
              </thead>
              <tbody>
                {doc.beats.map((beat) => (
                  <tr key={beat.index} className="border-b border-sand-100 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{beat.startSec}–{beat.endSec}s</td>
                    <td className="py-2 pr-3 font-medium text-ink">{beat.label}</td>
                    <td className="py-2 pr-3">{beat.dialogue}</td>
                    <td className="py-2 pr-3">{beat.onScreenText}</td>
                    <td className="py-2">{beat.broll}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[13px] text-sand-700">CTA: {doc.cta}</p>
          <p className="mt-1 text-[13px] text-sand-700 whitespace-pre-line">{doc.caption}</p>
          {doc.hashtags.length ? <p className="mt-1 text-[13px] text-sand-700">{doc.hashtags.join(" ")}</p> : null}
          {actions("script", scriptToText(doc), doc)}
        </article>
      </div>
    );
  }

  const items = payload.items ?? [];
  const itemCard = (item: GeneratedItem, i: number, extra?: React.ReactNode) => {
    const key = `${payload.outputType}-${i}`;
    return (
      <article key={key} className={cardCls}>
        {extra}
        <p className="text-[14px] font-medium text-ink whitespace-pre-line">{item.title}</p>
        {item.detail ? <p className="mt-1 text-[13px] text-sand-700">{item.detail}</p> : null}
        {item.mechanism ? <p className="mt-2 text-[12px] text-sand-600">{item.mechanism}</p> : null}
        {item.hashtags?.length ? <p className="mt-2 text-[13px] text-sand-700">{item.hashtags.join(" ")}</p> : null}
        {actions(key, itemCopyText(item), item)}
      </article>
    );
  };

  switch (payload.outputType) {
    case "ideas":
    case "captions":
      return <div className="grid gap-3 sm:grid-cols-2">{items.map((item, i) => itemCard(item, i))}</div>;
    case "carousel":
      return (
        <div className="space-y-3">
          {items.map((item, i) =>
            itemCard(
              item,
              i,
              <p className="mb-2 font-sora text-[11px] font-semibold uppercase tracking-wider text-sand-500">
                Slide {i + 1}
              </p>,
            ),
          )}
        </div>
      );
    default:
      // hooks (list), shot-list (rows), calendar (day rows) share the stacked layout
      return <div className="space-y-3">{items.map((item, i) => itemCard(item, i))}</div>;
  }
}
