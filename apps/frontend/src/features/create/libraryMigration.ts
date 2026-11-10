/**
 * Draft → library migration planning + library-item text extraction (3.8).
 *
 * Pure module: no storage, no network. The page owns the side effects
 * (reading localStorage, calling createContentItem, rewriting the local
 * list with only the failures); everything here is the testable planning:
 * which content item a draft becomes, and what plain text a library item
 * stands for (used by the Repurpose "start from a saved item" picker and
 * by the library Copy button).
 */
import type { GeneratedItem, GeneratorKind } from "./model";
import { itemCopyText } from "./model";
import type { Draft } from "./drafts";
import type { ContentItem, ContentKind, CreateContentItemInput } from "./library";
import { scriptToText, type ScriptDoc, type ScriptBeat } from "./scripts";

/** Batch/draft kind (plural, generator vocabulary) → library kind (singular). */
export function generatorKindToContentKind(kind: GeneratorKind): ContentKind {
  switch (kind) {
    case "ideas":
      return "idea";
    case "hooks":
      return "hook";
    case "captions":
      return "caption";
    case "repurpose":
      return "repurpose";
  }
}

/** The content-library input one local draft migrates to. Title is capped at 200 chars, as the page's Save does. */
export function draftToContentInput(draft: Draft): CreateContentItemInput {
  return {
    kind: generatorKindToContentKind(draft.kind),
    title: (draft.item?.title ?? "").slice(0, 200),
    body: { item: draft.item } as unknown as Record<string, unknown>,
    source: draft.source,
  };
}

/** The full migration plan for a list of drafts, in the drafts' own order. */
export function planDraftMigration(drafts: Draft[]): CreateContentItemInput[] {
  return (drafts ?? []).map(draftToContentInput);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const asGeneratedItem = (value: unknown): GeneratedItem | null => {
  if (!isRecord(value) || typeof value.title !== "string") return null;
  return {
    title: value.title,
    ...(typeof value.detail === "string" ? { detail: value.detail } : {}),
    ...(Array.isArray(value.hashtags)
      ? { hashtags: value.hashtags.filter((t): t is string => typeof t === "string") }
      : {}),
    ...(typeof value.mechanism === "string" ? { mechanism: value.mechanism } : {}),
  };
};

/** True when a loose library body looks like a saved ScriptDoc (beats array + title). */
export function isScriptDocBody(body: unknown): boolean {
  return isRecord(body) && typeof body.title === "string" && Array.isArray(body.beats);
}

/**
 * Rebuild a ScriptDoc from an untrusted library body, filling safe defaults
 * for anything missing so scriptToText never crashes on a partial record.
 * Returns null when the body does not look like a script at all.
 */
export function scriptDocFromBody(body: unknown): ScriptDoc | null {
  if (!isScriptDocBody(body)) return null;
  const b = body as Record<string, unknown>;
  const rawBeats = Array.isArray(b.beats) ? b.beats : [];
  const beats: ScriptBeat[] = rawBeats.map((raw, i) => {
    const beat = isRecord(raw) ? raw : {};
    return {
      index: typeof beat.index === "number" ? beat.index : i,
      startSec: typeof beat.startSec === "number" ? beat.startSec : 0,
      endSec: typeof beat.endSec === "number" ? beat.endSec : 0,
      label: typeof beat.label === "string" ? beat.label : `Beat ${i + 1}`,
      dialogue: typeof beat.dialogue === "string" ? beat.dialogue : "",
      onScreenText: typeof beat.onScreenText === "string" ? beat.onScreenText : "",
      broll: typeof beat.broll === "string" ? beat.broll : "",
    };
  });
  if (!beats.length) return null;
  return {
    title: typeof b.title === "string" ? b.title : "",
    format: (typeof b.format === "string" ? b.format : "reel") as ScriptDoc["format"],
    durationSec: typeof b.durationSec === "number" ? b.durationSec : 0,
    tone: (typeof b.tone === "string" ? b.tone : "friendly") as ScriptDoc["tone"],
    beats,
    cta: typeof b.cta === "string" ? b.cta : "",
    caption: typeof b.caption === "string" ? b.caption : "",
    hashtags: Array.isArray(b.hashtags) ? b.hashtags.filter((t): t is string => typeof t === "string") : [],
  };
}

/** One-line summary for a script library item: "Script · <format> · <durationSec>s · <beats> beats". */
export function scriptSummary(item: ContentItem): string | null {
  const doc = scriptDocFromBody(item.body);
  if (!doc) return null;
  return `Script · ${doc.format} · ${doc.durationSec}s · ${doc.beats.length} beats`;
}

/**
 * The plain text a library item stands for:
 *   - bodies shaped { item: GeneratedItem } → itemCopyText of that item;
 *   - script bodies (a ScriptDoc, under kind "script" or recognisable as
 *     one) → scriptToText;
 *   - plain { title, detail } bodies → title and detail joined;
 *   - hashtag-group bodies → the tags joined;
 *   - anything else → the item's own title.
 */
export function extractItemText(item: ContentItem): string {
  const body: unknown = item?.body ?? {};
  if (isRecord(body)) {
    const inner = asGeneratedItem((body as Record<string, unknown>).item);
    if (inner) return itemCopyText(inner);
    if (item.kind === "script" || isScriptDocBody(body)) {
      const doc = scriptDocFromBody(body);
      if (doc) return scriptToText(doc);
    }
    const tags = (body as Record<string, unknown>).tags;
    if (Array.isArray(tags)) {
      const clean = tags.filter((t): t is string => typeof t === "string");
      if (clean.length) return clean.join(" ");
    }
    const title = typeof body.title === "string" ? body.title : "";
    const detail = typeof body.detail === "string" ? body.detail : "";
    const hashtags = Array.isArray(body.hashtags)
      ? body.hashtags.filter((t): t is string => typeof t === "string")
      : [];
    const parts = [title, detail, hashtags.length ? hashtags.join(" ") : ""].filter(Boolean);
    if (parts.length) return parts.join("\n");
  }
  return item?.title ?? "";
}
