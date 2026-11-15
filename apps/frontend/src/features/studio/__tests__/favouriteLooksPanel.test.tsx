import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOOKS, type LookDefinition } from "@capseasy/templates";
import { resolveStyle } from "@capseasy/templates";
import { ProjectSettingsSchema } from "@capseasy/shared";
import { FAVOURITE_LOOKS_KEY } from "@/lib/favouriteLooks";

/**
 * Favourite looks (owner 2026-11-15): a heart on every template card, a
 * Favourites filter chip, localStorage persistence. The heart must never
 * select the look, and toggling it must not reorder the grid.
 */
vi.mock("../panels/AnimatedTemplatePreview", () => ({
  AnimatedTemplatePreview: ({ look }: { look: LookDefinition }) => <div data-preview={look.id} />,
}));
vi.mock("@/services/studio", () => ({
  studioService: { listLooks: async () => [], saveLook: async () => ({}), deleteLook: async () => ({}) },
}));

import { LooksPanel } from "../panels/LooksPanel";

const KINETIC = LOOKS.find((l) => l.id === "kinetic_mix")!;
const HORMOZI = LOOKS.find((l) => l.id === "hormozi_box")!;
const BEAST = LOOKS.find((l) => l.id === "beast_bounce")!;

function renderPanel(onChoose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const style = resolveStyle(LOOKS[0]!.style);
  const settings = ProjectSettingsSchema.parse({});
  const view = render(
    <QueryClientProvider client={qc}>
      <LooksPanel currentLookId={null} onChoose={onChoose} currentStyle={style} currentSettings={settings} />
    </QueryClientProvider>,
  );
  return { view, onChoose };
}

describe("favourite looks", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // jsdom has no scrollIntoView; the chip click calls it on the chip.
    Element.prototype.scrollIntoView = () => {};
  });

  it("every card has a heart button, unpressed by default", () => {
    const { view } = renderPanel();
    const btn = view.getByRole("button", { name: `Favourite ${HORMOZI.name}` });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.querySelector("svg")).not.toBeNull();
    view.unmount();
  });

  it("clicking a heart toggles it, persists, and never selects the look", () => {
    const { view, onChoose } = renderPanel();
    const btn = view.getByRole("button", { name: `Favourite ${HORMOZI.name}` });
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(onChoose).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(FAVOURITE_LOOKS_KEY)!)).toEqual(["hormozi_box"]);
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(JSON.parse(window.localStorage.getItem(FAVOURITE_LOOKS_KEY)!)).toEqual([]);
    view.unmount();
  });

  it("Enter on a focused heart does not choose the look", () => {
    const { view, onChoose } = renderPanel();
    const btn = view.getByRole("button", { name: `Favourite ${HORMOZI.name}` });
    (btn as HTMLElement).focus();
    fireEvent.keyDown(btn, { key: "Enter" });
    expect(onChoose).not.toHaveBeenCalled();
    view.unmount();
  });

  it("a favourited card keeps a filled orange heart in the All list", () => {
    const { view } = renderPanel();
    fireEvent.click(view.getByRole("button", { name: `Favourite ${BEAST.name}` }));
    const btn = view.getByRole("button", { name: `Favourite ${BEAST.name}` });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.querySelector("svg")!.getAttribute("fill")).toBe("currentColor");
    expect(btn.querySelector("svg")!.getAttribute("class")).toContain("text-[#FFA946]");
    view.unmount();
  });

  it("toggling a heart does not reorder the grid", () => {
    const { view } = renderPanel();
    const orderBefore = [...view.container.querySelectorAll("span.truncate")].map((s) => s.textContent);
    fireEvent.click(view.getByRole("button", { name: `Favourite ${KINETIC.name}` }));
    const orderAfter = [...view.container.querySelectorAll("span.truncate")].map((s) => s.textContent);
    expect(orderAfter).toEqual(orderBefore);
    view.unmount();
  });

  it("the Favourites chip filters to favourited looks only, with a count", () => {
    const { view } = renderPanel();
    expect(view.getByRole("button", { name: "Favourites (0)" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: `Favourite ${HORMOZI.name}` }));
    fireEvent.click(view.getByRole("button", { name: `Favourite ${BEAST.name}` }));
    const chip = view.getByRole("button", { name: "Favourites (2)" });
    fireEvent.click(chip);
    expect(view.getByRole("status").textContent).toMatch(/2 of 150 looks in Favourites/);
    expect(view.container.textContent).toContain(HORMOZI.name);
    expect(view.container.textContent).toContain(BEAST.name);
    expect(view.container.textContent).not.toContain(KINETIC.name);
    view.unmount();
  });

  it("the Favourites filter is empty until the user favourites something", () => {
    const { view } = renderPanel();
    fireEvent.click(view.getByRole("button", { name: "Favourites (0)" }));
    expect(view.container.textContent).toContain("No favourites yet — tap the heart on any look.");
    view.unmount();
  });

  it("search filters within favourites, like it does within a category", () => {
    const { view } = renderPanel();
    fireEvent.click(view.getByRole("button", { name: `Favourite ${HORMOZI.name}` }));
    fireEvent.click(view.getByRole("button", { name: `Favourite ${BEAST.name}` }));
    fireEvent.click(view.getByRole("button", { name: "Favourites (2)" }));
    // Display names are gallery names, not ids: hormozi_box shows as
    // "Jumping Box", so search its first display word.
    fireEvent.change(view.getByLabelText("Find a template"), { target: { value: HORMOZI.name.split(" ")[0] } });
    expect(view.getByRole("status").textContent).toMatch(/1 of 150 looks in Favourites/);
    expect(view.container.textContent).toContain(HORMOZI.name);
    expect(view.container.textContent).not.toContain(BEAST.name);
    view.unmount();
  });

  it("favourites survive a remount", () => {
    const first = renderPanel();
    fireEvent.click(first.view.getByRole("button", { name: `Favourite ${KINETIC.name}` }));
    first.view.unmount();
    const second = renderPanel();
    expect(second.view.getByRole("button", { name: `Favourite ${KINETIC.name}` }).getAttribute("aria-pressed")).toBe("true");
    expect(second.view.getByRole("button", { name: "Favourites (1)" })).toBeTruthy();
    second.view.unmount();
  });
});
