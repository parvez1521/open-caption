import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * /ai-generator route: renders the public page shell (heading, honest
 * disclosure, no login wall) around the client generator.
 */

vi.mock("@/components/home/Sections", () => ({
  Nav: () => <nav>Nav</nav>,
  Footer: () => <footer>Footer</footer>,
}));

vi.mock("@/features/ai-generator/AiGenerator", () => ({
  default: () => <div>AI Generator widget</div>,
}));

import AiGeneratorPage from "../page";

describe("ai-generator page", () => {
  it("renders the heading, the generator and the honest disclosure", () => {
    render(<AiGeneratorPage />);
    expect(screen.getByRole("heading", { name: "AI generator" })).toBeTruthy();
    expect(screen.getByText("AI Generator widget")).toBeTruthy();
    expect(screen.getByText(/Captionit charges nothing for this page and stores nothing/)).toBeTruthy();
    expect(screen.getByText(/your prompts go to\s*Puter, a third party/i)).toBeTruthy();
    expect(screen.getByText(/Video uses much more of your allowance/)).toBeTruthy();
    expect(document.body.textContent?.toLowerCase()).not.toContain("unlimited");
  });
});
