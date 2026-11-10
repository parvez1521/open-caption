/**
 * Bug 2 regression guard (selection must feel instant): a selection change in the Templates panel
 * must re-render ONLY the two affected cards (the one losing "In use" and the one gaining it), not
 * all 141 cards. The preview component is replaced with a render-counting stub: before cards were
 * memoized, a selection re-rendered every card in the panel.
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOOKS, type LookDefinition } from "@capseasy/templates";
import { resolveStyle } from "@capseasy/templates";
import { ProjectSettingsSchema } from "@capseasy/shared";

export const renderCounts = new Map<string, number>();

vi.mock("../panels/AnimatedTemplatePreview", () => ({
  AnimatedTemplatePreview: ({ look }: { look: LookDefinition }) => {
    renderCounts.set(look.id, (renderCounts.get(look.id) ?? 0) + 1);
    return <div data-preview={look.id} />;
  },
}));
vi.mock("@/services/studio", () => ({
  studioService: { listLooks: async () => [], saveLook: async () => ({}), deleteLook: async () => ({}) },
}));

import { LooksPanel } from "../panels/LooksPanel";

describe("LooksPanel selection re-render scope", () => {
  beforeEach(() => renderCounts.clear());

  it("changing the selection re-renders only the affected cards", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const style = resolveStyle(LOOKS[0]!.style);
    const settings = ProjectSettingsSchema.parse({});
    const onChoose = vi.fn();
    const wrap = (currentLookId: string | null) => (
      <QueryClientProvider client={qc}>
        <LooksPanel currentLookId={currentLookId} onChoose={onChoose} currentStyle={style} currentSettings={settings} />
      </QueryClientProvider>
    );
    const view = render(wrap(LOOKS[0]!.id));
    const totalBefore = [...renderCounts.values()].reduce((a, b) => a + b, 0);
    expect(totalBefore).toBe(LOOKS.length); // every card rendered once initially

    renderCounts.clear();
    view.rerender(wrap(LOOKS[5]!.id));
    const reRendered = [...renderCounts.entries()].filter(([, n]) => n > 0);
    // only the previously-selected and newly-selected cards may re-render
    expect(reRendered.map(([id]) => id).sort()).toEqual([LOOKS[0]!.id, LOOKS[5]!.id].sort());
    view.unmount();
  });

  it("clicking a card calls onChoose with that look (selection stays a local, synchronous apply)", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const style = resolveStyle(LOOKS[0]!.style);
    const settings = ProjectSettingsSchema.parse({});
    const onChoose = vi.fn();
    const view = render(
      <QueryClientProvider client={qc}>
        <LooksPanel currentLookId={null} onChoose={onChoose} currentStyle={style} currentSettings={settings} />
      </QueryClientProvider>,
    );
    const target = LOOKS[3]!;
    // cards are divs with role="button" (a real <button> cannot contain the delete button)
    const btn = [...view.container.querySelectorAll('[role="button"]')].find((b) => b.textContent?.includes(target.name));
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose.mock.calls[0]![0].id).toBe(target.id);
    view.unmount();
  });
});
