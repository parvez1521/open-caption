import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectAccounts } from "../ConnectAccounts";
import { GrowthCoach } from "../GrowthCoach";

/**
 * Panel honesty pins (P1/P2): the connect section renders exactly the state
 * the server reports — a platform that is not switched on shows NO connect
 * affordance at all; a connected platform shows name + sync + a two-step
 * disconnect that states synced posts stay. The coach shows its
 * not-switched-on state (and no input) when the free AI is unconfigured.
 */

const envelope = (data: unknown) => ({ success: true, data });

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => ({
      json: async () => handler(String(url), init),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ConnectAccounts", () => {
  it("not switched on: the plain fact, and NO connect button/link for either platform", async () => {
    stubFetch(() =>
      envelope({
        setupPending: false,
        platforms: [
          { platform: "youtube", configured: false, connected: false, accountName: null, lastSyncAt: null },
          { platform: "instagram", configured: false, connected: false, accountName: null, lastSyncAt: null },
        ],
      }),
    );
    render(<ConnectAccounts onSynced={() => {}} />);
    expect(await screen.findByText("Connect your accounts")).toBeTruthy();
    expect(screen.getAllByText(/isn't switched on for Open Caption yet/)).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /Connect/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Connect/ })).toBeNull();
  });

  it("configured + not connected: a real connect link into the OAuth start route", async () => {
    stubFetch(() =>
      envelope({
        setupPending: false,
        platforms: [
          { platform: "youtube", configured: true, connected: false, accountName: null, lastSyncAt: null },
          { platform: "instagram", configured: true, connected: false, accountName: null, lastSyncAt: null },
        ],
      }),
    );
    render(<ConnectAccounts onSynced={() => {}} />);
    const yt = await screen.findByRole("link", { name: "Connect YouTube" });
    expect(yt.getAttribute("href")).toBe("/api/v1/growth/connect/youtube/start");
    const ig = screen.getByRole("link", { name: "Connect Instagram" });
    expect(ig.getAttribute("href")).toBe("/api/v1/growth/connect/instagram/start");
    expect(screen.getByText(/once Meta approves the app's insights permission/)).toBeTruthy();
  });

  it("connected: name + last sync + Sync now; disconnect is two-step and says posts stay", async () => {
    stubFetch(() =>
      envelope({
        setupPending: false,
        platforms: [
          { platform: "youtube", configured: true, connected: true, accountName: "My Channel", lastSyncAt: "2026-11-10T09:00:00.000Z" },
          { platform: "instagram", configured: false, connected: false, accountName: null, lastSyncAt: null },
        ],
      }),
    );
    render(<ConnectAccounts onSynced={() => {}} />);
    expect(await screen.findByText(/Connected as/)).toBeTruthy();
    expect(screen.getByText("My Channel")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(await screen.findByText(/Synced posts stay in your list/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, disconnect" })).toBeTruthy();
  });

  it("setup pending: configured but the database update has not landed", async () => {
    stubFetch(() =>
      envelope({
        setupPending: true,
        platforms: [
          { platform: "youtube", configured: true, connected: false, accountName: null, lastSyncAt: null },
          { platform: "instagram", configured: false, connected: false, accountName: null, lastSyncAt: null },
        ],
      }),
    );
    render(<ConnectAccounts onSynced={() => {}} />);
    expect(await screen.findByText(/One server setup step is still pending/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Connect YouTube" })).toBeNull();
  });
});

describe("GrowthCoach", () => {
  it("unconfigured free AI: the off state, with no input offered", async () => {
    stubFetch(() => envelope({ configured: false, provider: "Groq", model: "openai/gpt-oss-120b", modelName: "GPT-OSS 120B" }));
    render(<GrowthCoach starters={["Why did reach drop last week?"]} />);
    expect(await screen.findByText(/the coach is off/)).toBeTruthy();
    expect(screen.queryByLabelText("Ask about your analytics")).toBeNull();
    expect(screen.queryByRole("button", { name: "Why did reach drop last week?" })).toBeNull();
  });

  it("configured: provider badge (honest label), starter chips, and an answer round-trip", async () => {
    stubFetch((url, init) => {
      if (init?.method === "POST") return envelope({ configured: true, answer: "Reach fell because your top post aged out." });
      return envelope({ configured: true, provider: "Groq", model: "openai/gpt-oss-120b", modelName: "GPT-OSS 120B" });
    });
    render(<GrowthCoach starters={["Why did reach drop last week?"]} />);
    expect(await screen.findByText("Free AI · GPT-OSS 120B (Groq)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Why did reach drop last week?" }));
    await waitFor(() => expect(screen.getByText("Reach fell because your top post aged out.")).toBeTruthy());
    expect(screen.getByText("Why did reach drop last week?")).toBeTruthy();
  });
});
