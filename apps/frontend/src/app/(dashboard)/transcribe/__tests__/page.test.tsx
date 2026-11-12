import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Standalone Transcribe page: renders the upload flow for guests (no auth
 * calls on this page at all), lists all 14 shipped languages by name only.
 * Upload-only: there is no link mode on this page.
 */

vi.mock("@/components/studio/StudioShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import TranscribePage from "../page";

describe("transcribe page", () => {
  it("renders the upload flow with all 14 languages by name only", () => {
    render(<TranscribePage />);
    expect(screen.getByRole("heading", { name: "Transcribe" })).toBeTruthy();
    expect(screen.getByText(/Upload a file\. Get its transcript\./)).toBeTruthy();
    const select = screen.getByLabelText(/What's spoken in the file?/);
    expect(select.tagName).toBe("SELECT");
    const options = [...select.querySelectorAll("option")];
    expect(options).toHaveLength(14);
    expect(options.map((o) => o.textContent)).toContain("Tamil (தமிழ்)");
    // the picker shows language names, never the model labels
    expect(options.map((o) => o.textContent).join(" ")).not.toContain("whisper-base");
    expect(screen.getByRole("button", { name: "Transcribe" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Transcribe" })).toHaveProperty("disabled", true);
  });

  it("is upload-only: no link tab, no link input, no fetch button", () => {
    render(<TranscribePage />);
    expect(screen.queryByRole("tab", { name: "Paste a link" })).toBeNull();
    expect(document.querySelector('input[type="url"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Fetch link" })).toBeNull();
    expect(screen.getByText(/Drop a video or audio file here/)).toBeTruthy();
  });
});
