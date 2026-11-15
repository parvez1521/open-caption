import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StartDoors from "../StartDoors";

/**
 * Dashboard tool doors: Transcribe / Editor / Captions, each linking at its
 * survey goal destination. Exactly the door matching the stored survey goal
 * is highlighted ("Recommended for you"); with no stored answers no door is
 * highlighted and everything still renders.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("StartDoors", () => {
  it("renders all three doors with the survey goal destinations", () => {
    render(<StartDoors recommendedGoal={null} />);
    expect(screen.getByRole("link", { name: "Transcribe" })).toHaveAttribute("href", "/transcribe");
    expect(screen.getByRole("link", { name: "Editor" })).toHaveAttribute("href", "/editor");
    expect(screen.getByRole("link", { name: "Captions" })).toHaveAttribute("href", "/captions");
    expect(screen.getByText("Transcribe a video or audio")).toBeTruthy();
    expect(screen.getByText("Edit a video")).toBeTruthy();
    expect(screen.getByText("Add captions to a video")).toBeTruthy();
  });

  it("highlights only the door matching the stored goal", () => {
    render(<StartDoors recommendedGoal="transcribe" />);
    expect(screen.getAllByText("Recommended for you")).toHaveLength(1);
    const link = screen.getByRole("link", { name: "Transcribe, recommended for you" });
    expect(link).toHaveAttribute("data-recommended", "true");
    expect(screen.getByRole("link", { name: "Editor" })).not.toHaveAttribute("data-recommended");
    expect(screen.getByRole("link", { name: "Captions" })).not.toHaveAttribute("data-recommended");
  });

  it("each goal highlights its own door", () => {
    const { unmount } = render(<StartDoors recommendedGoal="edit" />);
    expect(screen.getByRole("link", { name: "Editor, recommended for you" })).toBeTruthy();
    unmount();
    render(<StartDoors recommendedGoal="captions" />);
    expect(screen.getByRole("link", { name: "Captions, recommended for you" })).toBeTruthy();
  });

  it("no stored goal means no highlight and no crash", () => {
    render(<StartDoors recommendedGoal={null} />);
    expect(screen.queryByText("Recommended for you")).toBeNull();
    expect(document.querySelectorAll("[data-recommended]")).toHaveLength(0);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
