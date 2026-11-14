/**
 * Premium-look picker gating (Builder 4): premium cards show a star plus
 * a PREMIUM label, the animated preview still renders for free users, a
 * free click shows a short upgrade prompt instead of applying, and a paid
 * click applies. The preview is a stub here (as in looksPanelPerf): the
 * assertion is that the card still mounts it for a premium look.
 */
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLook, resolveStyle, type LookDefinition } from "@capseasy/templates";
import { ProjectSettingsSchema } from "@capseasy/shared";

const state = vi.hoisted(() => ({ plan: "free" as string }));

vi.mock("../panels/AnimatedTemplatePreview", () => ({
  AnimatedTemplatePreview: ({ look }: { look: LookDefinition }) => <div data-preview={look.id} />,
}));
vi.mock("@/services/studio", () => ({
  studioService: {
    listLooks: async () => [],
    saveLook: async () => ({}),
    deleteLook: async () => ({}),
    billingPlan: async () => ({ plan: state.plan }),
  },
}));

import { LooksPanel } from "../panels/LooksPanel";

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const style = resolveStyle(getLook("netflix_sub")!.style);
const settings = ProjectSettingsSchema.parse({});

const cardFor = (view: ReturnType<typeof render>, name: string) => {
  const btn = [...view.container.querySelectorAll('[role="button"]')].find((b) => b.textContent?.includes(name));
  expect(btn, `card for ${name}`).toBeTruthy();
  return btn!;
};

const waitForPlan = async (client: QueryClient) => {
  await waitFor(() => expect(client.getQueryState(["billing-plan"])?.status).toBe("success"));
};

describe("LooksPanel premium gating", () => {
  beforeEach(() => {
    state.plan = "free";
  });

  it("free user: premium cards show a star + PREMIUM, free cards show neither, preview still renders", async () => {
    const client = qc();
    const onChoose = vi.fn();
    const view = render(
      <QueryClientProvider client={client}>
        <LooksPanel currentLookId={null} onChoose={onChoose} currentStyle={style} currentSettings={settings} />
      </QueryClientProvider>,
    );
    await waitForPlan(client);

    const premium = cardFor(view, "Metal Slam + Script");
    expect(premium.textContent).toContain("Premium");
    expect(premium.querySelector("svg")).toBeTruthy(); // the house star icon
    expect(view.container.querySelector('[data-preview="metal_script"]')).toBeTruthy();

    const free = cardFor(view, "Classic Subtitle");
    expect(free.textContent).not.toContain("Premium");
    expect(free.querySelector("svg")).toBeNull();
    expect(view.container.querySelector('[data-preview="netflix_sub"]')).toBeTruthy();
    view.unmount();
  });

  it("free user: clicking a premium look shows the upgrade prompt and does not apply", async () => {
    const client = qc();
    const onChoose = vi.fn();
    const view = render(
      <QueryClientProvider client={client}>
        <LooksPanel currentLookId={null} onChoose={onChoose} currentStyle={style} currentSettings={settings} />
      </QueryClientProvider>,
    );
    await waitForPlan(client);

    fireEvent.click(cardFor(view, "Metal Slam + Script"));
    expect(onChoose).not.toHaveBeenCalled();
    expect(view.getByText("This look is Premium.")).toBeTruthy();
    expect(view.getByText("Free includes 25 looks. Upgrade to use all 150 looks.")).toBeTruthy();
    const link = view.getByText("View plans");
    expect(link.closest("a")?.getAttribute("href")).toBe("/pricing");
    // the prompt carries no price and no urgency
    expect(view.getByText("Free includes 25 looks. Upgrade to use all 150 looks.").textContent).not.toMatch(/₹|\$/);

    fireEvent.click(view.getByText("Dismiss"));
    expect(view.queryByText("This look is Premium.")).toBeNull();
    view.unmount();
  });

  it("free user: clicking a free look applies it as today", async () => {
    const client = qc();
    const onChoose = vi.fn();
    const view = render(
      <QueryClientProvider client={client}>
        <LooksPanel currentLookId={null} onChoose={onChoose} currentStyle={style} currentSettings={settings} />
      </QueryClientProvider>,
    );
    await waitForPlan(client);

    fireEvent.click(cardFor(view, "Classic Subtitle"));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose.mock.calls[0]![0].id).toBe("netflix_sub");
    expect(view.queryByText("This look is Premium.")).toBeNull();
    view.unmount();
  });

  it("paid user: clicking a premium look applies it, badge still shown", async () => {
    state.plan = "starter";
    const client = qc();
    const onChoose = vi.fn();
    const view = render(
      <QueryClientProvider client={client}>
        <LooksPanel currentLookId={null} onChoose={onChoose} currentStyle={style} currentSettings={settings} />
      </QueryClientProvider>,
    );
    await waitForPlan(client);

    const premium = cardFor(view, "Metal Slam + Script");
    expect(premium.textContent).toContain("Premium");
    fireEvent.click(premium);
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose.mock.calls[0]![0].id).toBe("metal_script");
    expect(view.queryByText("This look is Premium.")).toBeNull();
    view.unmount();
  });
});
