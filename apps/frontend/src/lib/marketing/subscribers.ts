/**
 * Marketing subscribers — pure helpers shared by the capture / preference /
 * admin-export routes. No I/O here; the routes own the database calls.
 */

export type SubscriberSource = "email" | "google";

/** Supabase's app_metadata.provider is 'google' for Google sign-ins and
 * 'email' for email/password accounts; anything else (phone, future
 * providers) files under 'email' — the column only ever holds these two. */
export function toSubscriberSource(provider: string | null | undefined): SubscriberSource {
  return provider === "google" ? "google" : "email";
}

export interface SubscriberRow {
  email: string;
  marketing_opt_in: boolean;
  marketing_opt_in_at: string | null;
  source: string;
  created_at: string;
}

export const SUBSCRIBER_CSV_HEADER = "email,marketing_opt_in,marketing_opt_in_at,source,created_at";

/** One CSV field: quote only when the value needs it (comma, quote, newline). */
export function csvField(value: string | null): string {
  const v = value ?? "";
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** The owner export: every row, newest first, with the opt-in flag so the
 * owner can filter to opted-in addresses before sending promo mail. */
export function toSubscriberCsv(rows: SubscriberRow[]): string {
  const lines = rows.map((r) =>
    [
      csvField(r.email),
      r.marketing_opt_in ? "true" : "false",
      csvField(r.marketing_opt_in_at),
      csvField(r.source),
      csvField(r.created_at),
    ].join(","),
  );
  return [SUBSCRIBER_CSV_HEADER, ...lines].join("\n") + "\n";
}

/**
 * The owner allowlist: OWNER_EMAILS, comma-separated, in Vercel env.
 * No allowlist exists in code (nothing hardcodes the owner's addresses) —
 * set it to the owner's sign-in email(s), e.g.
 * OWNER_EMAILS=work.techhacksai@gmail.com,parvezsiddiqui018@gmail.com
 * Until it is set, the admin export answers 403 to everyone (fail closed).
 */
export function ownerEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Case-insensitive membership; a missing/blank email is never the owner. */
export function isOwnerEmail(email: string | null | undefined, allowlist: string[] = ownerEmails()): boolean {
  if (!email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}
