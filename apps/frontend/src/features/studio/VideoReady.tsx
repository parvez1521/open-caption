"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CANONICAL_APP } from "@/lib/authReturn";
import { FEEDBACK_MAILTO, LEGAL } from "@/lib/legal";
import { Button } from "./controls";

const SITE = CANONICAL_APP.replace(/^https?:\/\//, "");
export const SHARE_TEXT = `I made this video using Open Caption ✨ Add animated captions to your videos for free: ${CANONICAL_APP}`;

type ShareNavigator = Navigator & { canShare?: (d: ShareData) => boolean };

/** Can this browser hand the video file itself to other apps (WhatsApp, Instagram …)? Phones mostly can. */
function canShareFile(file: File) {
  const n = navigator as ShareNavigator;
  try {
    return typeof n.share === "function" && !!n.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

/** Text-only share links, for browsers that can't pass the file on (they attach the downloaded video themselves). */
const LINKS = [
  { name: "WhatsApp", href: (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}`, cls: "bg-st-em text-[#141412]" },
  { name: "Telegram", href: () => `https://t.me/share/url?url=${encodeURIComponent(CANONICAL_APP)}&text=${encodeURIComponent("I made this video using Open Caption ✨")}`, cls: "bg-st-lav text-obsidian" },
  { name: "X", href: (t: string) => `https://x.com/intent/post?text=${encodeURIComponent(t)}`, cls: "bg-obsidian text-major" },
  { name: "Facebook", href: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(CANONICAL_APP)}`, cls: "bg-st-or text-[#141412]" },
];

interface Props {
  blob: Blob;
  filename: string;
  detail?: string | null;
  onDownload: () => void;
  onClose: () => void;
}

/** "Your video is ready": shown after an MP4 export, with the video, a share button and a download button. */
export const VideoReady: React.FC<Props> = ({ blob, filename, detail, onDownload, onClose }) => {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const file = useMemo(() => new File([blob], filename, { type: blob.type || "video/mp4" }), [blob, filename]);
  // only ever rendered in the browser, after an export
  const [fileShare, setFileShare] = useState(() => canShareFile(file));
  const [note, setNote] = useState<string | null>(null);

  const share = async () => {
    setNote(null);
    try {
      await navigator.share({ files: [file], text: SHARE_TEXT, title: "Made with Open Caption" });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // they closed the share sheet
      // some apps refuse files from the web: fall back to the link-only share
      setFileShare(false);
      setNote("This browser couldn't pass the video on. Use the buttons below and attach the video you downloaded.");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_TEXT);
      setNote("Message copied. Paste it with your video.");
    } catch {
      setNote(SHARE_TEXT);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label="Your video is ready" onClick={(e) => e.stopPropagation()} className="flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-st-line bg-st-panel pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-lg font-semibold">Your video is ready 🎉</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 grid h-10 w-10 place-items-center rounded-full text-st-muted hover:bg-st-raised hover:text-st-text">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {detail ? <p className="text-xs text-st-muted">{detail}</p> : null}
          <video src={url} controls autoPlay muted loop playsInline className="mx-auto mt-3 max-h-[42dvh] w-auto max-w-full rounded-xl bg-[#0B0B0A]" />

          <div className="mt-4 grid gap-2">
            {fileShare ? (
              <Button tone="primary" className="!py-3 text-base" onClick={() => void share()}>Share video</Button>
            ) : null}
            <Button className="!py-2.5" onClick={onDownload}>Download again</Button>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs text-st-muted">{fileShare ? "Or send the link with a message:" : "Share it: attach the video you just downloaded."}</p>
            <div className="grid grid-cols-4 gap-2">
              {LINKS.map((l) => (
                <a key={l.name} href={l.href(SHARE_TEXT)} target="_blank" rel="noopener noreferrer" className={`grid min-h-11 place-items-center rounded-xl px-1 text-xs font-semibold ${l.cls}`}>
                  {l.name}
                </a>
              ))}
            </div>
            <button onClick={() => void copy()} className="mt-2 w-full rounded-xl border border-st-line bg-st-raised/60 px-3 py-2.5 text-left text-xs text-st-text/80 hover:bg-st-lav/30">
              <span className="block font-medium text-st-text">Copy message</span>
              <span className="mt-0.5 block text-st-muted">&ldquo;I made this video using Open Caption ✨ … {SITE}&rdquo;</span>
            </button>
          </div>
          {note ? <p role="status" className="mt-3 rounded-lg bg-st-raised px-3 py-2 text-xs text-st-text">{note}</p> : null}
          <p className="mt-4 text-center text-xs text-st-muted">
            How did it go? <a href={FEEDBACK_MAILTO} className="font-semibold text-st-text underline">Send feedback</a> to {LEGAL.email}
          </p>
        </div>
      </div>
    </div>
  );
};
