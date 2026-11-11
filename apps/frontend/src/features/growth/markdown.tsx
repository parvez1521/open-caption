import React from "react";

/**
 * A tiny markdown-subset renderer for the Growth Coach's replies.
 *
 * The coach's answers come from a model — UNTRUSTED text. The old panel
 * rendered them as plain text, so the model's `**bold**`, `#` headings and
 * `-` list markers showed literally (owner screenshot, 2026-11-11). There
 * is no markdown library anywhere in this codebase (the other AI surfaces
 * render structured data, never free markdown), so this subset is
 * hand-rolled here, in the house style.
 *
 * SAFETY IS THE DESIGN: this module builds React nodes ONLY. Every
 * character of model output becomes a React text child, which React
 * escapes — there is no HTML string, no parser, and no
 * dangerouslySetInnerHTML anywhere in the path, so markup in the output
 * (`<script>`, `<img onerror=…>`) renders as inert visible text. The one
 * attribute ever set from model text is a link href, whitelisted to
 * http/https/mailto; anything else degrades to its label text.
 *
 * Supported subset (what the coach actually emits): paragraphs, ATX
 * headings (#–######), bold (**…** / __…__), italic (*…*), inline code
 * (`…`), bullet lists (-, *, +), numbered lists (1. / 1)), links
 * ([label](https://…)), horizontal rules, GitHub-style pipe tables, and
 * `>` quote lines (rendered as plain paragraphs). An unclosed marker is
 * shown literally rather than swallowed.
 *
 * TABLES (owner order 2026-11-11): the model loves pipe tables, and
 * before this they printed as a wall of raw `|` characters. A table is
 * recognised strictly — a header line containing `|`, IMMEDIATELY
 * followed by a separator row of dashes/colons with the same cell
 * count. Anything looser (no separator, mismatched counts) is NOT a
 * table and falls back to the ordinary paragraph path, pipes and all —
 * malformed input degrades to readable text, never to garbage markup.
 * Cells run through the same inline parser as every other block, so
 * the safety contract above (React nodes only, whitelisted hrefs)
 * holds inside tables too. Wide tables scroll horizontally inside
 * their wrapper instead of stretching the chat.
 */

let keySeq = 0;
const key = (): string => `md-${keySeq++}`;

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

/** Inline spans within one block of text. Recursive for bold/italic nesting. */
function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  while (rest.length > 0) {
    // Earliest position of any inline marker.
    let at = -1;
    for (const marker of ["**", "__", "`", "*", "["]) {
      const idx = rest.indexOf(marker);
      if (idx !== -1 && (at === -1 || idx < at)) at = idx;
    }
    if (at === -1) {
      nodes.push(rest);
      break;
    }
    if (at > 0) nodes.push(rest.slice(0, at));
    rest = rest.slice(at);

    if (rest.startsWith("**") || rest.startsWith("__")) {
      const marker = rest.slice(0, 2);
      const close = rest.indexOf(marker, 2);
      if (close > 2) {
        nodes.push(<strong key={key()}>{parseInline(rest.slice(2, close))}</strong>);
        rest = rest.slice(close + 2);
        continue;
      }
      nodes.push(marker);
      rest = rest.slice(2);
      continue;
    }
    if (rest.startsWith("`")) {
      const close = rest.indexOf("`", 1);
      if (close > 1) {
        nodes.push(
          <code key={key()} className="rounded bg-sand-200/70 px-1 py-0.5 font-mono text-[12.5px]">
            {rest.slice(1, close)}
          </code>,
        );
        rest = rest.slice(close + 1);
        continue;
      }
      nodes.push("`");
      rest = rest.slice(1);
      continue;
    }
    if (rest.startsWith("*")) {
      const close = rest.indexOf("*", 1);
      if (close > 1) {
        nodes.push(<em key={key()}>{parseInline(rest.slice(1, close))}</em>);
        rest = rest.slice(close + 1);
        continue;
      }
      nodes.push("*");
      rest = rest.slice(1);
      continue;
    }
    // rest starts with "["
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      const [, label, href] = link as unknown as [string, string, string];
      if (SAFE_HREF.test(href)) {
        nodes.push(
          <a
            key={key()}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline decoration-sand-400 underline-offset-2"
          >
            {parseInline(label)}
          </a>,
        );
      } else {
        nodes.push(...parseInline(label));
      }
      rest = rest.slice(link[0].length);
      continue;
    }
    nodes.push("[");
    rest = rest.slice(1);
  }
  return nodes;
}

const HEADING = /^(#{1,6})\s+(.+)$/;
const BULLET = /^\s*[-*+]\s+(.+)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.+)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

type Align = "left" | "center" | "right";

/** Split one pipe-table line into trimmed cells, outer pipes optional. */
function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((cell) => cell.trim());
}

const SEPARATOR_CELL = /^:?-+:?$/;

/**
 * If `line` is a separator row (every cell dashes with optional
 * alignment colons), return the per-column alignments; otherwise null.
 */
function separatorAlignments(line: string): Align[] | null {
  if (!line.includes("|")) return null;
  const cells = splitCells(line);
  if (cells.length === 0 || cells.some((cell) => !SEPARATOR_CELL.test(cell))) return null;
  return cells.map((cell) =>
    cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left",
  );
}

const alignCls = (align: Align): string =>
  align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

/** Render one recognised table as React nodes (cells via parseInline). */
function renderTable(header: string[], alignments: Align[], rows: string[][]): React.ReactNode {
  return (
    <div key={key()} className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px] leading-relaxed">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={key()}
                className={`border border-sand-300 bg-sand-100 px-2.5 py-1.5 font-sora font-semibold text-obsidian ${alignCls(alignments[i] ?? "left")}`}
              >
                {parseInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={key()}>
              {header.map((_, i) => (
                <td
                  key={key()}
                  className={`border border-sand-200 px-2.5 py-1.5 align-top ${alignCls(alignments[i] ?? "left")}`}
                >
                  {parseInline(row[i] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Block structure: headings, lists, rules, tables, paragraphs. */
function parseBlocks(text: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={key()} className="whitespace-pre-wrap">
        {parseInline(paragraph.join("\n"))}
      </p>,
    );
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item) => <li key={key()}>{parseInline(item)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={key()} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={key()} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  const lines = text.split("\n");
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]!.replace(/^>\s?/, "");
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    // Pipe table: this line is the header, the NEXT line the separator.
    // Recognised before every other block type so a header row never
    // leaks into a paragraph; a failed check leaves both lines to the
    // ordinary paths below (plain-text fallback).
    if (line.includes("|") && idx + 1 < lines.length) {
      const alignments = separatorAlignments(lines[idx + 1]!.replace(/^>\s?/, ""));
      const header = alignments ? splitCells(line) : null;
      if (alignments && header && header.length === alignments.length) {
        flushParagraph();
        flushList();
        const rows: string[][] = [];
        let j = idx + 2;
        for (; j < lines.length; j++) {
          const rowLine = lines[j]!.replace(/^>\s?/, "");
          if (rowLine.trim() === "" || !rowLine.includes("|")) break;
          const cells = splitCells(rowLine);
          // A stray "|" line (the model emits them) is an all-empty row: skip it.
          if (cells.every((cell) => cell === "")) continue;
          rows.push(cells.slice(0, header.length));
        }
        blocks.push(renderTable(header, alignments, rows));
        idx = j - 1;
        continue;
      }
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const [, hashes, content] = heading as unknown as [string, string, string];
      blocks.push(
        hashes.length <= 2 ? (
          <h3 key={key()} className="font-sora text-[14.5px] font-bold text-obsidian">
            {parseInline(content)}
          </h3>
        ) : (
          <h4 key={key()} className="font-sora text-[13.5px] font-bold text-obsidian">
            {parseInline(content)}
          </h4>
        ),
      );
      continue;
    }
    if (RULE.test(line)) {
      flushParagraph();
      flushList();
      blocks.push(<hr key={key()} className="border-sand-200" />);
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = numbered !== null;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]!);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Render one coach reply (model output) as formatted, inert React nodes. */
export function MarkdownText({ text }: { text: string }) {
  return <div className="space-y-2">{parseBlocks(text)}</div>;
}
