import { describe, expect, it } from "vitest";
import { growthCsvTemplate, parseGrowthCsv } from "./csv";

/**
 * Growth CSV importer: the parser contract (quoting, aliases, the date
 * rules, per-row errors with real line numbers, the 500-row cap) is pinned
 * here because the import route trusts whatever this returns.
 */

const HEADER = "platform,title,posted_at,views,reach,likes,comments,shares,saves,url";

describe("parseGrowthCsv — basics", () => {
  it("parses a simple file into validated rows", () => {
    const { rows, errors } = parseGrowthCsv(
      `${HEADER}\ninstagram,Launch reel,2026-02-13,1200,900,80,12,5,20,https://instagram.com/reel/abc\n`,
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        platform: "instagram",
        title: "Launch reel",
        postUrl: "https://instagram.com/reel/abc",
        postedAt: "2026-02-13T00:00:00.000Z",
        views: 1200,
        reach: 900,
        likes: 80,
        comments: 12,
        shares: 5,
        saves: 20,
      },
    ]);
  });

  it("leaves unentered metric cells null — missing data, not zero", () => {
    const { rows, errors } = parseGrowthCsv(`${HEADER}\nyoutube,Clip,2026-02-13,, ,,,,,\n`);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ views: null, reach: null, likes: null, saves: null, postUrl: null });
  });

  it("handles CRLF line endings", () => {
    const { rows, errors } = parseGrowthCsv(`${HEADER}\r\ninstagram,A,2026-02-13,1,,,,,,\r\nyoutube,B,2026-02-14,2,,,,,,\r\n`);
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.platform)).toEqual(["instagram", "youtube"]);
  });

  it("reports an empty / whitespace-only file as one file-level error", () => {
    for (const text of ["", "   \n  \n"]) {
      const { rows, errors } = parseGrowthCsv(text);
      expect(rows).toEqual([]);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.line).toBe(1);
    }
  });
});

describe("parseGrowthCsv — quoting", () => {
  it("keeps embedded commas and doubled quotes inside quoted fields", () => {
    const { rows, errors } = parseGrowthCsv(
      `${HEADER}\ninstagram,"Hello, ""world""",2026-02-13,10,,,,,,https://example.com/a\n`,
    );
    expect(errors).toEqual([]);
    expect(rows[0]!.title).toBe('Hello, "world"');
  });

  it("keeps an embedded newline inside a quoted field as one row", () => {
    const { rows, errors } = parseGrowthCsv(
      `${HEADER}\ninstagram,"line one\nline two",2026-02-13,10,,,,,,\nyoutube,Next,2026-02-14,20,,,,,,\n`,
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.title).toBe("line one\nline two");
    expect(rows[1]!.platform).toBe("youtube");
  });
});

describe("parseGrowthCsv — header aliases", () => {
  it("accepts alias headers, case-insensitively, and ignores unknown columns", () => {
    const text = [
      "Platform,Caption,Publish Time,Plays,Likes,Shared,Bookmarks,Link,Some Other Tool Column",
      "linkedin,My post,2026-03-01 09:30,500,40,3,7,https://linkedin.com/posts/x,ignored",
    ].join("\n");
    const { rows, errors } = parseGrowthCsv(text);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      platform: "linkedin",
      title: "My post",
      postedAt: "2026-03-01T09:30:00.000Z",
      views: 500,
      likes: 40,
      shares: 3,
      saves: 7,
      postUrl: "https://linkedin.com/posts/x",
    });
  });

  it("fails at file level (line 1, no rows) when the platform column is missing", () => {
    const { rows, errors } = parseGrowthCsv("title,posted_at\nHello,2026-02-13\n");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 1 });
    expect(errors[0]!.message).toContain("platform");
  });

  it("fails at file level when the date column is missing", () => {
    const { rows, errors } = parseGrowthCsv("platform,title\ninstagram,Hello\n");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("posted_at");
  });
});

describe("parseGrowthCsv — per-row errors", () => {
  it("reports a bad date with its real line number and still imports sibling rows", () => {
    const text = [
      HEADER,
      "instagram,Good one,2026-02-13,10,,,,,,",
      "instagram,Bad date,not-a-date,10,,,,,,",
      "youtube,Also good,2026-02-15,20,,,,,,",
    ].join("\n");
    const { rows, errors } = parseGrowthCsv(text);
    expect(rows.map((r) => r.title)).toEqual(["Good one", "Also good"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.line).toBe(3);
    expect(errors[0]!.message).toContain("postedAt");
  });

  it("rejects a negative metric row and a non-numeric metric row, per row", () => {
    const text = [
      HEADER,
      "instagram,Neg,2026-02-13,-5,,,,,,",
      "instagram,Words,2026-02-13,lots,,,,,,",
      "instagram,Fine,2026-02-13,5,,,,,,",
    ].join("\n");
    const { rows, errors } = parseGrowthCsv(text);
    expect(rows.map((r) => r.title)).toEqual(["Fine"]);
    expect(errors.map((e) => e.line)).toEqual([2, 3]);
    expect(errors[0]!.message).toContain("views");
    expect(errors[1]!.message).toContain("views");
  });

  it("rejects a row with no platform but keeps the others", () => {
    const text = [HEADER, ",No platform,2026-02-13,5,,,,,,", "instagram,Ok,2026-02-13,5,,,,,,"].join("\n");
    const { rows, errors } = parseGrowthCsv(text);
    expect(rows).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 2 });
  });
});

describe("parseGrowthCsv — slash dates (disambiguated by value, day-first when ambiguous)", () => {
  const one = (date: string) => parseGrowthCsv(`${HEADER}\ninstagram,T,${date},1,,,,,,\n`);

  it("13/02/2026 reads as 13 Feb (first part > 12 must be the day)", () => {
    expect(one("13/02/2026").rows[0]!.postedAt).toBe("2026-02-13T00:00:00.000Z");
  });

  it("02/13/2026 reads as Feb 13 (second part > 12 must be the day)", () => {
    expect(one("02/13/2026").rows[0]!.postedAt).toBe("2026-02-13T00:00:00.000Z");
  });

  it("05/06/2026 reads DAY-FIRST as 5 June when both parts are ≤ 12", () => {
    expect(one("05/06/2026").rows[0]!.postedAt).toBe("2026-06-05T00:00:00.000Z");
  });

  it("accepts ISO datetimes and YYYY-MM-DD HH:mm as UTC", () => {
    expect(one("2026-02-13T10:30:00Z").rows[0]!.postedAt).toBe("2026-02-13T10:30:00.000Z");
    expect(one('"2026-02-13 10:30"').rows[0]!.postedAt).toBe("2026-02-13T10:30:00.000Z");
  });

  it("rejects an impossible slash date (31/02) as a row error", () => {
    const { rows, errors } = one("31/02/2026");
    expect(rows).toEqual([]);
    expect(errors[0]!.message).toContain("postedAt");
  });
});

describe("parseGrowthCsv — the 500-row cap", () => {
  it("reads at most 500 data rows and reports the truncation once", () => {
    const lines = [HEADER];
    for (let i = 0; i < 505; i++) lines.push(`instagram,Post ${i},2026-02-13,${i},,,,,,`);
    const { rows, errors } = parseGrowthCsv(lines.join("\n"));
    expect(rows).toHaveLength(500);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("only the first 500 rows were read");
  });
});

describe("growthCsvTemplate", () => {
  it("parses back to exactly the two labelled example rows, with no errors", () => {
    const { rows, errors } = parseGrowthCsv(growthCsvTemplate());
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.title).toContain("Example row — delete me");
    expect(rows[0]!.title).toContain("DD/MM/YYYY");
    expect(rows[1]!.postedAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("starts with the canonical header row", () => {
    expect(growthCsvTemplate().split("\n")[0]).toBe(
      "platform,title,posted_at,views,reach,likes,comments,shares,saves,url",
    );
  });
});
