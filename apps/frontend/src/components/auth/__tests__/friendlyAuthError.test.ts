import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { friendlyAuthError } from "../AuthShell";

// Persona QA regression (2026-11-10): Google sign-in is NOT enabled on the Captionit
// Supabase project, so clicking "Continue with Google" surfaces Supabase's raw
// "Unsupported provider" string. That raw string must never reach the user.
describe("friendlyAuthError — disabled provider (Persona QA)", () => {
  it("maps the Supabase unsupported-provider error to a plain, actionable message", () => {
    const msg = friendlyAuthError("Unsupported provider: provider is not enabled");
    expect(msg).not.toContain("Unsupported provider");
    expect(msg).toContain("Google sign-in isn't available");
    expect(msg).toContain("email");
  });

  it("maps the provider-not-enabled variant too", () => {
    expect(friendlyAuthError("provider is not enabled")).toContain("Google sign-in isn't available");
  });

  it("keeps the existing mappings intact", () => {
    expect(friendlyAuthError("Invalid login credentials")).toContain("don't match");
    expect(friendlyAuthError("Email not confirmed")).toContain("isn't verified");
  });

  it("passes unknown errors through unchanged", () => {
    expect(friendlyAuthError("some other failure")).toBe("some other failure");
  });
});

// Persona QA regression: keyboard focus must be visible on buttons/links app-wide.
describe("globals.css — focus visibility (Persona QA)", () => {
  it("defines a :focus-visible outline for buttons and links", () => {
    const css = readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8");
    expect(css).toContain("button:focus-visible");
    expect(css).toContain("a:focus-visible");
    expect(css).toContain("outline: 2px solid var(--color-emerald-accent)");
  });

  // MA-A5-002: the same emerald outline must cover inputs/selects/textareas —
  // ~20 of them carried outline-none with no focus utility, so keyboard focus
  // was invisible on Analyzer, Exports filters, Library/Projects search,
  // Growth chat, Motion fields and several Studio panels.
  it("defines the same :focus-visible outline for inputs, selects and textareas", () => {
    const css = readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8");
    expect(css).toContain("input:focus-visible");
    expect(css).toContain("select:focus-visible");
    expect(css).toContain("textarea:focus-visible");
  });
});
