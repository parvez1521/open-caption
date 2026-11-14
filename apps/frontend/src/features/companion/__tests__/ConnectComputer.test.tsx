import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ConnectComputer companion availability (overnight QA follow-up, 2026-11-15):
 * the desktop helper is switched off server-side unless COMPANIONS_ENABLED=1,
 * and POST /device/setup 403s when it is off (proven live). The component asks
 * GET /device/status on mount and, when the helper is off, shows an honest
 * note instead of a dead "Connect this computer" button.
 */

const h = vi.hoisted(() => ({
  get: vi.fn(async () => ({ companionsEnabled: true })),
  post: vi.fn(async () => ({ pairCode: "ABC", appUrl: "https://app.example", expiresInSeconds: 600 })),
}));

vi.mock("@/services/api-client", () => ({ apiClient: { get: h.get, post: h.post } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

import { ConnectComputer } from "../ConnectComputer";

beforeEach(() => {
  h.get.mockClear();
  h.get.mockImplementation(async () => ({ companionsEnabled: true }));
  h.post.mockClear();
});

describe("ConnectComputer companion availability", () => {
  it("shows the connect button when the helper is on", async () => {
    render(<ConnectComputer />);
    expect(await screen.findByRole("button", { name: /Connect this computer/ })).toBeTruthy();
    expect(h.get).toHaveBeenCalledWith("/device/status");
  });

  it("shows an honest note instead of the button when the helper is off", async () => {
    h.get.mockImplementation(async () => ({ companionsEnabled: false }));
    render(<ConnectComputer />);
    expect(await screen.findByText(/desktop helper is turned off/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Connect this computer/ })).toBeNull();
  });

  it("falls back to the button when the status check itself fails", async () => {
    h.get.mockRejectedValue(new Error("network down"));
    render(<ConnectComputer />);
    expect(await screen.findByRole("button", { name: /Connect this computer/ })).toBeTruthy();
  });
});
