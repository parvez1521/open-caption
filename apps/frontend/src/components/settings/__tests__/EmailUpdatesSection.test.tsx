import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * EmailUpdatesSection (owner order 2026-11-18): the Settings consent
 * toggle + the owner-only subscriber export. The toggle starts OFF and
 * saves through the preference API; the export block renders only when
 * the admin route answers (owner) — anyone else never sees it.
 */

const h = vi.hoisted(() => ({
  preference: { email: "user@example.com", marketingOptIn: false, marketingOptInAt: null as string | null },
  meta: null as { total: number } | null,
  patchCalls: [] as boolean[],
  downloadCalls: 0,
}));

vi.mock("@/services/marketing", () => ({
  getMarketingPreference: async () => h.preference,
  setMarketingPreference: async (v: boolean) => {
    h.patchCalls.push(v);
    return { ...h.preference, marketingOptIn: v };
  },
  getSubscriberListMeta: async () => h.meta,
  downloadSubscriberCsv: async () => {
    h.downloadCalls += 1;
  },
}));

import EmailUpdatesSection from "../EmailUpdatesSection";

beforeEach(() => {
  h.preference = { email: "user@example.com", marketingOptIn: false, marketingOptInAt: null };
  h.meta = null;
  h.patchCalls = [];
  h.downloadCalls = 0;
});

describe("EmailUpdatesSection", () => {
  it("renders the toggle unchecked when opted out, and saves on click", async () => {
    render(<EmailUpdatesSection />);
    const toggle = (await screen.findByRole("checkbox")) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    await waitFor(() => expect(h.patchCalls).toEqual([true]));
    await waitFor(() => expect(screen.getByText(/Saved/)).toBeTruthy());
    expect(screen.queryByText(/Download subscriber list/)).toBeNull();
  });

  it("renders the toggle checked when opted in", async () => {
    h.preference = { email: "user@example.com", marketingOptIn: true, marketingOptInAt: "2026-11-18T08:00:00Z" };
    render(<EmailUpdatesSection />);
    const toggle = (await screen.findByRole("checkbox")) as HTMLInputElement;
    await waitFor(() => expect(toggle.checked).toBe(true));
  });

  it("shows the owner export block with the count, and downloads on click", async () => {
    h.meta = { total: 3 };
    render(<EmailUpdatesSection />);
    const button = await screen.findByRole("button", { name: /Download subscriber list/ });
    expect(screen.getByText(/3 subscribers/)).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(h.downloadCalls).toBe(1));
  });
});
