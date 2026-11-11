import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { StockAudioSection } from "../panels/StockAudioSection";
import { PIXABAY_API_PAGE } from "../pixabay";

/**
 * StockAudioSection (A10): the honest states — with no Pixabay key the
 * surface must explain that the user needs their OWN free key (and that it
 * stays on-device), and the bundled pack must show licence lines with its
 * Add buttons disabled until a project is chosen.
 */
describe("StockAudioSection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("without a key: explains the user's-own-key deal, links Pixabay's API page, offers no search box", () => {
    render(<StockAudioSection projectId="p1" />);
    expect(screen.getByText(/Needs your own free Pixabay API key/)).toBeTruthy();
    expect(screen.getByText(/sent only to api\.pixabay\.com/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Pixabay's API page/ });
    expect(link.getAttribute("href")).toBe(PIXABAY_API_PAGE);
    expect(screen.getByLabelText("Your Pixabay API key")).toBeTruthy();
    expect(screen.queryByLabelText("Search Pixabay audio")).toBeNull();
  });

  it("the bundled pack lists every item with its CC0 licence line; Add is disabled with no project", () => {
    render(<StockAudioSection projectId={null} />);
    expect(screen.getByText(/Pick a project above first/)).toBeTruthy();
    const adds = screen.getAllByRole("button", { name: "Add to media bin" });
    expect(adds.length).toBeGreaterThanOrEqual(8);
    expect(adds.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    // every row carries its own CC0 licence line — Kenney for the starter
    // recordings, Open Caption for the synthesized meme sounds (2026-11-11)
    const kenneyLines = screen.getAllByText(/Kenney · CC0 1\.0/).length;
    const synthLines = screen.getAllByText(/Open Caption · CC0 1\.0/).length;
    expect(kenneyLines).toBe(12);
    expect(synthLines).toBe(9);
    expect(kenneyLines + synthLines).toBe(adds.length);
    expect(screen.getByText("Meme sounds")).toBeTruthy();
    expect(screen.getByText(/Original synthesized versions of the classic meme sounds/)).toBeTruthy();
  });

  it("with a saved key: the search surface appears and the key itself is never rendered", () => {
    localStorage.setItem("ce:pixabay-api-key", "secret-key-xyz");
    render(<StockAudioSection projectId="p1" />);
    expect(screen.getByLabelText("Search Pixabay audio")).toBeTruthy();
    expect(screen.getByText(/Remove the saved key from this device/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("secret-key-xyz");
    expect(screen.getByText(/no standalone redistribution/)).toBeTruthy();
  });
});
