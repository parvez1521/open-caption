import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CaptionedVideoInput } from "@capseasy/compositions";

/**
 * Phase 9 W2, quirk (c): after a window resize the studio preview said "Unable to play media"
 * and only a reload recovered it. Mechanism, verified in the installed libraries: the
 * composition's preview video element gets no onError prop, so remotion's VideoForPreview
 * THROWS a MediaPlaybackError on a media 'error' event; @remotion/player's ErrorBoundary
 * stores that error with NO reset path — the fallback latches until the Player remounts.
 * A resize crossing the studio's 1024px layout breakpoint remounts the Player mid-load,
 * exactly when a browser can abort a blob-URL load. Fix pinned here: StudioPlayer passes an
 * errorFallback whose Try again button remounts the Player (key bump), resetting the boundary.
 */

const mounts = { count: 0 };
vi.mock("@remotion/player", () => ({
  Player: React.forwardRef(function MockPlayer(props: { errorFallback?: (p: { error: Error }) => React.ReactNode }, _ref: unknown) {
    React.useEffect(() => { mounts.count += 1; }, []);
    // simulate the latched error state: the boundary renders ONLY the fallback
    return <div data-testid="mock-player">{props.errorFallback?.({ error: new Error("media error") })}</div>;
  }),
}));
vi.mock("@capseasy/compositions", () => ({ CaptionedVideo: () => null }));

import { StudioPlayer } from "../StudioPlayer";

const input = { src: "blob:clip", media: { width: 1080, height: 1920, fps: 30, durationMs: 5000, rotation: 0 }, settings: {} } as unknown as CaptionedVideoInput;

describe("StudioPlayer media-error recovery (quirk c)", () => {
  it("the error fallback offers Try again, and clicking it remounts the Player", () => {
    mounts.count = 0;
    render(
      <StudioPlayer
        input={input}
        width={1080}
        height={1920}
        fps={30}
        durationMs={5000}
        position={{ x: 0.5, y: 0.8 }}
        onMovePosition={() => undefined}
        onTime={() => undefined}
      />,
    );
    expect(screen.getByText(/Unable to play this video in the preview/)).toBeTruthy();
    expect(mounts.count).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    // a remount is the ONLY thing that resets @remotion/player's ErrorBoundary
    expect(mounts.count).toBe(2);
  });
});
