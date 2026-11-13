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
});
