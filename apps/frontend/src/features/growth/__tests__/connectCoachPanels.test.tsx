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
 *
 * REGRESSION (2026-11-11 production bug): these panels originally called
 * the API with raw fetch and NO Authorization header — the API accepts no
 * other auth, so in a real browser both panels could only ever render
 * their "couldn't load" state while every apiClient-backed section worked.
 * The fetch-stubbed tests of the day never modelled auth, so it shipped.
 * These tests therefore run the REAL apiClient with a mocked token source
 * and pin the wire contract: every request carries the session's Bearer
 * token. Remove the header (or bypass the client) and this file fails.
 */

vi.mock("@/services/auth", () => ({
  authService: { getToken: vi.fn(async () => "test-token") },
}));

const envelope = (data: unknown) => ({ success: true, data });

interface RecordedCall {
  url: string;
  init?: RequestInit;
  authorization: string | null;
}

const recorded: RecordedCall[] = [];

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  recorded.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      recorded.push({ url: String(url), init, authorization: headers.Authorization ?? null });
      return {
        ok: true,
        status: 200,
        json: async () => handler(String(url), init),
      };
    }),
  );
}

function expectEveryCallAuthed() {
  expect(recorded.length).toBeGreaterThan(0);
  for (const call of recorded) {
    expect(call.authorization, `request to ${call.url} carried no Bearer token`).toBe("Bearer test-token");
  }
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
    expectEveryCallAuthed();
  });

  it("configured + not connected: Connect buttons that fetch the OAuth URL (authed) and navigate to it", async () => {
    stubFetch((url) => {
      if (url.includes("/growth/connect/youtube/start")) {
        return envelope({ url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x" });
      }
      return envelope({
        setupPending: false,
        platforms: [
          { platform: "youtube", configured: true, connected: false, accountName: null, lastSyncAt: null },
          { platform: "instagram", configured: true, connected: false, accountName: null, lastSyncAt: null },
        ],
      });
    });

    let navigatedTo = "";
    const realLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        search: "",
        get href() {
          return navigatedTo;
        },
        set href(v: string) {
          navigatedTo = v;
        },
      },
    });
    try {
      render(<ConnectAccounts onSynced={() => {}} />);
      const yt = await screen.findByRole("button", { name: "Connect YouTube" });
      expect(screen.getByRole("button", { name: "Connect Instagram" })).toBeTruthy();
      expect(screen.getByText(/once Meta approves the app's insights permission/)).toBeTruthy();
      fireEvent.click(yt);
      await waitFor(() => expect(navigatedTo).toBe("https://accounts.google.com/o/oauth2/v2/auth?client_id=x"));
      const startCall = recorded.find((c) => c.url.includes("/growth/connect/youtube/start"));
      expect(startCall).toBeTruthy();
      expectEveryCallAuthed();
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: realLocation });
    }
  });

  it("connected: name + last sync + synced-post count + Sync now; disconnect is two-step and says posts stay", async () => {
    stubFetch(() =>
      envelope({
        setupPending: false,
        platforms: [
          { platform: "youtube", configured: true, connected: true, accountName: "My Channel", lastSyncAt: "2026-11-10T09:00:00.000Z", postCount: 137 },
          { platform: "instagram", configured: false, connected: false, accountName: null, lastSyncAt: null },
        ],
      }),
    );
    render(<ConnectAccounts onSynced={() => {}} />);
    expect(await screen.findByText(/Connected as/)).toBeTruthy();
    expect(screen.getByText("My Channel")).toBeTruthy();
    expect(screen.getByText(/Synced 137 posts/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(await screen.findByText(/Synced posts stay in your list/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes, disconnect" })).toBeTruthy();
    expectEveryCallAuthed();
  });

  it("sync now: the note reconciles the list's total against the channel total YouTube reports", async () => {
    stubFetch((url, init) => {
      if (url.includes("/growth/connect/youtube/sync") && init?.method === "POST") {
        return envelope({ synced: 40, fetched: 137, stored: 137, channelTotal: 137 });
      }
      return envelope({
        setupPending: false,
        platforms: [
          { platform: "youtube", configured: true, connected: true, accountName: "My Channel", lastSyncAt: "2026-11-10T09:00:00.000Z", postCount: 97 },
          { platform: "instagram", configured: false, connected: false, accountName: null, lastSyncAt: null },
        ],
      });
    });
    render(<ConnectAccounts onSynced={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    expect(await screen.findByText(/Synced 137 posts in your list\./)).toBeTruthy();
    expect(screen.getByText(/YouTube reports 137 uploads in total\./)).toBeTruthy();
    expectEveryCallAuthed();
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
    expect(screen.queryByRole("button", { name: "Connect YouTube" })).toBeNull();
    expectEveryCallAuthed();
  });
});

describe("GrowthCoach", () => {
  it("unconfigured free AI: the off state, with no input offered", async () => {
    stubFetch(() => envelope({ configured: false, provider: "Groq", model: "openai/gpt-oss-120b", modelName: "GPT-OSS 120B" }));
    render(<GrowthCoach starters={["Why did reach drop last week?"]} />);
    expect(await screen.findByText(/the coach is off/)).toBeTruthy();
    expect(screen.queryByLabelText("Ask about your analytics")).toBeNull();
    expect(screen.queryByRole("button", { name: "Why did reach drop last week?" })).toBeNull();
    expectEveryCallAuthed();
  });

  it("markdown answers render formatted (no raw markers); the user's own message stays literal", async () => {
    stubFetch((url, init) => {
      if (init?.method === "POST") {
        return envelope({
          configured: true,
          answer:
            "You have no posts tracked yet.\n\n**How to bring in past posts**\n\n- Import a CSV from the section below\n- Or add each post by hand",
        });
      }
      return envelope({ configured: true, provider: "Groq", model: "openai/gpt-oss-120b", modelName: "GPT-OSS 120B" });
    });
    render(<GrowthCoach starters={[]} />);
    const input = await screen.findByLabelText("Ask about your analytics");
    fireEvent.change(input, { target: { value: "why did **reach** drop?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    const heading = await screen.findByText("How to bring in past posts");
    expect(heading.tagName).toBe("STRONG");
    expect(screen.getByText("Import a CSV from the section below")).toBeTruthy();
    expect(document.body.textContent).not.toContain("**How to bring");
    // The user's own words are theirs: asterisks they typed stay literal.
    expect(screen.getByText("why did **reach** drop?")).toBeTruthy();
    expectEveryCallAuthed();
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
    expectEveryCallAuthed();
  });
});
