import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * Standalone Transcribe page: renders the upload flow for guests (no auth
 * calls on this page at all), lists all 14 shipped languages by name only,
 * and offers a direct-link mode beside upload (YouTube/Instagram links
 * plainly don't work — those sites don't share the file).
 */

vi.mock("@/components/studio/StudioShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import TranscribePage from "../page";

describe("transcribe page", () => {
  it("renders the upload flow with all 14 languages by name only", () => {
    render(<TranscribePage />);
    expect(screen.getByRole("heading", { name: "Transcribe" })).toBeTruthy();
    expect(screen.getByText(/Upload a file or paste a link/)).toBeTruthy();
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

  it("offers a direct-link mode with the plain YouTube/Instagram line", () => {
    render(<TranscribePage />);
    fireEvent.click(screen.getByRole("tab", { name: "Paste a link" }));
    expect(document.querySelector('input[type="url"]')).not.toBeNull();
    expect(screen.getByText(/YouTube and Instagram links don't/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fetch link" })).toBeTruthy();
  });
});
