/**
 * Growth Studio — CSV import parsing (Phase 6 slice 6.2), pure.
 *
 * The creator downloads a metrics export (or keeps a spreadsheet) and drops
 * the CSV here; this module turns it into validated GrowthPostInput rows via
 * the shared validator in model.ts. Nothing is fetched and nothing is
 * scraped — the file the user hands over is the only input.
 *
 * Format contract (also printed in growthCsvTemplate):
 * - First row is the header; column names are matched case-insensitively
 *   through the alias table below, unknown columns are ignored.
 * - Dates: ISO 8601, YYYY-MM-DD, "YYYY-MM-DD HH:mm[:ss]" (read as UTC), and
 *   slash dates. A slash date is disambiguated by value — a part over 12
 *   must be the day — and when both parts are ≤ 12 it is read DAY-FIRST
 *   (05/06/2026 = 5 June), the owner's locale convention.
 * - Per-row failures never block the file: the bad row is reported with its
 *   real line number (header = line 1) and the valid rows still import.
 * - At most 500 data rows are read.
 */
import { validatePostRow, type GrowthPostInput } from "./model";

export interface GrowthCsvError {
  line: number;
  message: string;
}

export interface GrowthCsvResult {
  rows: GrowthPostInput[];
  errors: GrowthCsvError[];
}

export const MAX_CSV_ROWS = 500;

// ---------------------------------------------------------------------------
// CSV tokenizer — quoted fields, embedded commas / quotes / newlines, CRLF.
// Each record remembers the physical line it STARTED on (header = line 1),
// which is the line number row errors are reported against.
// ---------------------------------------------------------------------------

interface CsvRecord {
  line: number;
  fields: string[];
}

function tokenizeCsv(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  // True once the current field has seen any character (quote or data), so a
  // trailing empty line at EOF does not become a phantom record.
  let fieldStarted = false;

  const endField = () => {
    fields.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRecord = () => {
    endField();
    records.push({ line: recordLine, fields });
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += ch;
      fieldStarted = true;
    }
  }
  // Final record without a trailing newline.
  if (fieldStarted || field !== "" || fields.length > 0) endRecord();
  return records;
}

// ---------------------------------------------------------------------------
// Header aliases. Headers are canonicalised (lowercase, underscores →
// spaces, whitespace collapsed) before lookup, so "post_url", "Post URL"
// and "post url" all land on the same alias.
// ---------------------------------------------------------------------------

type CsvField = "platform" | "title" | "postedAt" | "postUrl" | "views" | "reach" | "likes" | "comments" | "shares" | "saves";

const HEADER_ALIASES: Record<string, CsvField> = {
  platform: "platform",
  title: "title",
  caption: "title",
  name: "title",
  post: "title",
  "posted at": "postedAt",
  date: "postedAt",
  time: "postedAt",
  published: "postedAt",
  "publish time": "postedAt",
  views: "views",
  plays: "views",
  "view count": "views",
  reach: "reach",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  shared: "shares",
  saves: "saves",
  saved: "saves",
  bookmarks: "saves",
  url: "postUrl",
  link: "postUrl",
  "post url": "postUrl",
};

const canonicalHeader = (raw: string): string =>
  raw.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");

// ---------------------------------------------------------------------------
// Date handling. Everything is normalised to a UTC ISO string before the
// shared validator sees it, so a slash date means the same thing on every
// machine. Returns null when the text matches no accepted format — the
// caller then hands the raw text to the validator, which rejects it.
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

function utcIso(year: number, month: number, day: number, hh = 0, mm = 0, ss = 0): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hh > 23 || mm > 59 || ss > 59) return null;
  const d = new Date(Date.UTC(year, month - 1, day, hh, mm, ss));
  // Date.UTC rolls overflows over (Feb 31 → Mar 3); reject those instead.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString();
}

function parseCsvDate(raw: string): string | null {
  const text = raw.trim();
  if (text === "") return null;

  // Slash dates first: Date.parse would read them month-first (US), which
  // is exactly the ambiguity the day-first rule below exists to settle.
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3]);
    // Disambiguate by value (>12 can only be a day); both ≤ 12 → DAY-FIRST.
    const [day, month] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b];
    return utcIso(year, month, day, Number(slash[4] ?? 0), Number(slash[5] ?? 0), Number(slash[6] ?? 0));
  }

  // YYYY-MM-DD with an optional naive time — read as UTC for determinism.
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (isoDay) {
    return utcIso(
      Number(isoDay[1]),
      Number(isoDay[2]),
      Number(isoDay[3]),
      Number(isoDay[4] ?? 0),
      Number(isoDay[5] ?? 0),
      Number(isoDay[6] ?? 0),
    );
  }

  // Full ISO 8601 (with offset / Z) and anything else Date.parse knows.
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseGrowthCsv(text: string): GrowthCsvResult {
  if (text.trim() === "") {
    return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };
  }

  const records = tokenizeCsv(text).filter(
    (r) => !(r.fields.length === 1 && r.fields[0]!.trim() === ""),
  );
  if (records.length === 0) {
    return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };
  }

  const header = records[0]!;
  const columns = new Map<number, CsvField>();
  header.fields.forEach((name, idx) => {
    const field = HEADER_ALIASES[canonicalHeader(name)];
    if (field && ![...columns.values()].includes(field)) columns.set(idx, field);
  });
  const present = new Set(columns.values());
  const missing = [
    ...(!present.has("platform") ? ["platform"] : []),
    ...(!present.has("postedAt") ? ["posted_at"] : []),
  ];
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ line: 1, message: `Missing required column(s): ${missing.join(", ")}` }],
    };
  }

  const rows: GrowthPostInput[] = [];
  const errors: GrowthCsvError[] = [];
  const dataRecords = records.slice(1);
  const read = dataRecords.slice(0, MAX_CSV_ROWS);
  if (dataRecords.length > MAX_CSV_ROWS) {
    errors.push({
      line: dataRecords[MAX_CSV_ROWS]!.line,
      message: `File truncated — only the first ${MAX_CSV_ROWS} rows were read, the rest were ignored.`,
    });
  }

  for (const record of read) {
    const raw: Record<string, unknown> = {};
    for (const [idx, field] of columns) {
      const cell = (record.fields[idx] ?? "").trim();
      if (field === "postedAt") {
        raw.postedAt = parseCsvDate(cell) ?? cell;
      } else {
        raw[field] = cell;
      }
    }
    const res = validatePostRow(raw);
    if (res.ok) {
      rows.push(res.value);
    } else {
      errors.push({ line: record.line, message: res.errors.join("; ") });
    }
  }
  return { rows, errors };
}

/**
 * The downloadable starter template: the canonical header, two clearly
 * labelled example rows (delete them before importing real data) and the
 * date-format note carried inside an example title, since CSV has no
 * comments. Parsing this template yields exactly the two example rows.
 */
export function growthCsvTemplate(): string {
  const lines = [
    "platform,title,posted_at,views,reach,likes,comments,shares,saves,url",
    'instagram,"Example row — delete me (dates: ISO or DD/MM/YYYY)",2026-01-05,1200,900,80,12,5,20,https://instagram.com/reel/example',
    'youtube,"Example row — delete me",05/01/2026,3400,3000,150,30,10,45,https://youtube.com/shorts/example',
  ];
  return `${lines.join("\n")}\n`;
}
