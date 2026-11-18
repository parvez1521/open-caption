import { describe, expect, it } from "vitest";
import {
  csvField,
  isOwnerEmail,
  ownerEmails,
  toSubscriberCsv,
  toSubscriberSource,
} from "../subscribers";

describe("toSubscriberSource", () => {
  it("maps google to google and everything else to email", () => {
    expect(toSubscriberSource("google")).toBe("google");
    expect(toSubscriberSource("email")).toBe("email");
    expect(toSubscriberSource("phone")).toBe("email");
    expect(toSubscriberSource(null)).toBe("email");
    expect(toSubscriberSource(undefined)).toBe("email");
  });
});

describe("csvField / toSubscriberCsv", () => {
  it("leaves plain values bare and quotes commas, quotes and newlines", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
    expect(csvField(null)).toBe("");
  });

  it("writes the header and one line per row, opt-in as true/false", () => {
    const csv = toSubscriberCsv([
      { email: "a@example.com", marketing_opt_in: true, marketing_opt_in_at: "2026-11-18T10:00:00Z", source: "google", created_at: "2026-11-18T09:00:00Z" },
      { email: "b@example.com", marketing_opt_in: false, marketing_opt_in_at: null, source: "email", created_at: "2026-11-18T09:30:00Z" },
    ]);
    expect(csv).toBe(
      "email,marketing_opt_in,marketing_opt_in_at,source,created_at\n" +
        "a@example.com,true,2026-11-18T10:00:00Z,google,2026-11-18T09:00:00Z\n" +
        "b@example.com,false,,email,2026-11-18T09:30:00Z\n",
    );
  });

  it("an empty list is just the header", () => {
    expect(toSubscriberCsv([])).toBe("email,marketing_opt_in,marketing_opt_in_at,source,created_at\n");
  });
});

describe("ownerEmails / isOwnerEmail", () => {
  it("parses a comma-separated allowlist, trimming and lowercasing", () => {
    expect(ownerEmails({ OWNER_EMAILS: "Owner@Example.com, second@example.com " })).toEqual([
      "owner@example.com",
      "second@example.com",
    ]);
    expect(ownerEmails({})).toEqual([]);
    expect(ownerEmails({ OWNER_EMAILS: " , " })).toEqual([]);
  });

  it("matches case-insensitively and never matches a missing email", () => {
    const allow = ["owner@example.com"];
    expect(isOwnerEmail("Owner@Example.COM", allow)).toBe(true);
    expect(isOwnerEmail("other@example.com", allow)).toBe(false);
    expect(isOwnerEmail(null, allow)).toBe(false);
    expect(isOwnerEmail(undefined, allow)).toBe(false);
    expect(isOwnerEmail("owner@example.com", [])).toBe(false);
  });
});
