import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VideoSyncStatus } from "../VideoSyncStatus";
import type { VideoSyncStatus as SyncStatus } from "../../upload/videoSync";

/** The header sync indicator: one short line per state, and the two states that act are buttons. */
describe("VideoSyncStatus", () => {
  const cases: Array<{ status: SyncStatus; text: string; button: boolean }> = [
    { status: "unsynced", text: "Sync video", button: true },
    { status: "syncing", text: "Syncing video…", button: false },
    { status: "synced", text: "Video synced", button: false },
    { status: "too-large", text: "Too large to sync", button: false },
    { status: "failed", text: "Retry sync", button: true },
  ];

  for (const { status, text, button } of cases) {
    it(`${status} shows "${text}"${button ? " as a button" : ""}`, () => {
      render(<VideoSyncStatus status={status} onSync={vi.fn()} />);
      if (button) {
        expect(screen.getByRole("button", { name: text })).toBeInTheDocument();
      } else {
        expect(screen.getByText(text)).toBeInTheDocument();
        expect(screen.queryByRole("button")).toBeNull();
      }
    });
  }

  it("the unsynced button calls onSync", () => {
    const onSync = vi.fn();
    render(<VideoSyncStatus status="unsynced" onSync={onSync} />);
    fireEvent.click(screen.getByRole("button", { name: "Sync video" }));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("the failed button retries through onSync", () => {
    const onSync = vi.fn();
    render(<VideoSyncStatus status="failed" onSync={onSync} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry sync" }));
    expect(onSync).toHaveBeenCalledTimes(1);
  });
});
