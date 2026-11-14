import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Paired computers (A-04 + A-05): the section renders the ConnectComputer
 * pairing flow and the paired list with a two-step Remove wired to
 * deleteWorker — the revoke control the privacy policy promises.
 */

const h = vi.hoisted(() => ({
  workers: [
    { id: "w-1", name: "Parvez's MacBook", status: "online", lastSeenAt: "2026-11-14T10:00:00.000Z", lastError: null },
    { id: "w-2", name: "Old Windows PC", status: "offline", lastSeenAt: null, lastError: "Unreachable since Nov 10" },
  ] as Array<{ id: string; name: string; status: string; lastSeenAt: string | null; lastError: string | null }>,
  deleteWorker: vi.fn(async () => {}),
  getMyWorkersError: null as Error | null,
}));

vi.mock("@/services/workers", () => ({
  workersService: {
    getMyWorkers: async () => {
      if (h.getMyWorkersError) throw h.getMyWorkersError;
      return h.workers;
    },
    deleteWorker: h.deleteWorker,
  },
}));
vi.mock("@/services/api-client", () => ({
  apiClient: { post: vi.fn(async () => ({ pairCode: "ABC-123", appUrl: "https://app.example", expiresInSeconds: 600 })) },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { PairedComputers } from "../PairedComputers";

beforeEach(() => {
  h.getMyWorkersError = null;
  h.deleteWorker.mockClear();
  h.workers = [
    { id: "w-1", name: "Parvez's MacBook", status: "online", lastSeenAt: "2026-11-14T10:00:00.000Z", lastError: null },
    { id: "w-2", name: "Old Windows PC", status: "offline", lastSeenAt: null, lastError: "Unreachable since Nov 10" },
  ];
});

describe("PairedComputers", () => {
  it("mounts the ConnectComputer pairing flow and lists the paired computers", async () => {
    render(<PairedComputers />);
    expect(screen.getByRole("button", { name: /Connect this computer/ })).toBeTruthy();
    expect(await screen.findByText("Parvez's MacBook")).toBeTruthy();
    expect(screen.getByText("Old Windows PC")).toBeTruthy();
    expect(screen.getByText(/Online · last seen/)).toBeTruthy();
    expect(screen.getByText("Offline · never seen")).toBeTruthy();
    expect(screen.getByText("Unreachable since Nov 10")).toBeTruthy();
  });

  it("Remove is two-step: the first click arms, the second calls deleteWorker and drops the row", async () => {
    render(<PairedComputers />);
    await screen.findByText("Parvez's MacBook");
    const removes = screen.getAllByRole("button", { name: "Remove" });
    fireEvent.click(removes[0]!);
    expect(h.deleteWorker).not.toHaveBeenCalled();
    expect(screen.getByText("Remove Parvez's MacBook?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(h.deleteWorker).toHaveBeenCalledWith("w-1"));
    await waitFor(() => expect(screen.queryByText("Parvez's MacBook")).toBeNull());
    expect(screen.getByText(/Removed Parvez's MacBook/)).toBeTruthy();
    expect(screen.getByText("Old Windows PC")).toBeTruthy();
  });

  it("an empty list says so plainly instead of rendering nothing", async () => {
    h.workers = [];
    render(<PairedComputers />);
    expect(await screen.findByText("No computers paired yet.")).toBeTruthy();
  });

  it("a failed list load shows the error with a Retry", async () => {
    h.getMyWorkersError = new Error("Backend is down");
    render(<PairedComputers />);
    expect(await screen.findByText("Backend is down")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
