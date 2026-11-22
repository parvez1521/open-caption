import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOOKS, LOOK_SECTIONS, type LookDefinition } from "@capseasy/templates";

/**
 * /looks gallery (owner order 2026-11-22): the dedicated page behind
 * "Browse the looks" shows every look in the registry, grouped by section
 * in registry order, and tapping a look starts a project with it.
 */
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/features/studio/panels/AnimatedTemplatePreview", () => ({
  // the module under test imports TemplateCard from the Studio panel, whose
  // live animated layer is mocked here (same as the favourite-looks tests):
  // the gallery test proves the cards, not the motion.
  AnimatedTemplatePreview: ({ look }: { look: LookDefinition }) => <div data-preview={look.id} />,
}));
// clicking a card warms the look's fonts; in jsdom there is no font loader
vi.mock("@capseasy/templates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@capseasy/templates")>()),
  loadFontFamily: () => Promise.resolve(),
}));

import LooksGallery from "../LooksGallery";

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});

describe("LooksGallery", () => {
  it("renders every look in the registry exactly once", () => {
    const { container } = render(<LooksGallery />);
    const previews = container.querySelectorAll("[data-preview]");
    expect(previews.length).toBe(LOOKS.length);
    expect(new Set(Array.from(previews).map((el) => el.getAttribute("data-preview"))).size).toBe(LOOKS.length);
    expect(screen.getByText(new RegExp(`^${LOOKS.length} looks\\.`))).toBeTruthy();
  });

  it("groups looks by section in registry order, with the un-sectioned Classic tail last", () => {
    render(<LooksGallery />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.replace(/\s*\d+\s*$/, "") ?? "");
    expect(headings).toEqual([...LOOK_SECTIONS.map((s) => s.label), "Classic"]);
    // the section counts add up to the registry total
    const counts = screen.getAllByRole("heading", { level: 2 }).map((h) => Number((h.textContent?.match(/(\d+)\s*$/) ?? [])[1]));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(LOOKS.length);
  });

  it("search filters by name and by #number", () => {
    const { container } = render(<LooksGallery />);
    const input = screen.getByLabelText("Find a look");
    // hormozi_box displays as "Jumping Box": search matches the name, not the id
    fireEvent.change(input, { target: { value: "jumping box" } });
    expect(container.querySelectorAll("[data-preview]").length).toBe(1);
    expect(container.querySelector("[data-preview='hormozi_box']")).not.toBeNull();
    fireEvent.change(input, { target: { value: "#12" } });
    const numbered = LOOKS.find((l) => l.number === 12)!;
    expect(container.querySelectorAll("[data-preview]").length).toBe(1);
    expect(container.querySelector(`[data-preview='${numbered.id}']`)).not.toBeNull();
  });

  it("clicking a look navigates to /start with the look id", () => {
    const { container } = render(<LooksGallery />);
    const card = container.querySelector("[data-preview='hormozi_box']")!.closest("[role='button']")!;
    fireEvent.click(card);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/start?look=hormozi_box");
  });

  it("section jump links point at the section anchors", () => {
    render(<LooksGallery />);
    const link = screen.getByRole("link", { name: new RegExp(`^${LOOK_SECTIONS[0]!.label} ·`) });
    expect(link.getAttribute("href")).toBe(`#section-${LOOK_SECTIONS[0]!.id}`);
  });
});
