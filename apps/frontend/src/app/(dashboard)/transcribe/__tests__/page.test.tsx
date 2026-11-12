import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Standalone Transcribe page: renders the upload flow for guests (no auth
 * calls on this page at all), lists all 14 shipped languages, and offers no
 * link/URL input — files come from the device only (G6 verdict).
 */

vi.mock("@/components/studio/StudioShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import TranscribePage from "../page";

describe("transcribe page", () => {
  it("renders the upload flow with all 14 languages and no URL input", () => {
    render(<TranscribePage />);
    expect(screen.getByRole("heading", { name: "Transcribe" })).toBeTruthy();
    expect(screen.getByText(/Upload a video or audio file/)).toBeTruthy();
    const select = screen.getByLabelText(/What's spoken in the file?/);
    expect(select.tagName).toBe("SELECT");
    expect(select.querySelectorAll("option")).toHaveLength(14);
    expect(screen.getByRole("button", { name: "Transcribe" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Transcribe" })).toHaveProperty("disabled", true);
    // upload-only: no URL/link field anywhere on the page
    expect(document.querySelector('input[type="url"]')).toBeNull();
    expect(screen.queryByText(/paste a link/i)).toBeNull();
    expect(screen.queryByText(/YouTube/i)).toBeNull();
  });
});
