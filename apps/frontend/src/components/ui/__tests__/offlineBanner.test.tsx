import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { OfflineBanner } from "../OfflineBanner";

/**
 * Offline banner (production-pages audit): silent while online, visible
 * while the browser reports offline, gone again on reconnect.
 */

afterEach(() => {
  act(() => window.dispatchEvent(new Event("online")));
});

describe("OfflineBanner", () => {
  it("renders nothing while online", () => {
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("appears on the offline event and disappears on the online event", () => {
    render(<OfflineBanner />);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("status")).toHaveTextContent("You are offline.");
    act(() => window.dispatchEvent(new Event("online")));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
