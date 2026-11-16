import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import MinutesLaunchTable, { MINUTES_LAUNCH_PLANS } from "../MinutesLaunchTable";

/**
 * Minutes pricing preview on /pricing during the free launch window
 * (owner, 2026-11-15): what paid becomes from 1 Dec. TEMPORARY — the
 * minutes deploy replaces this table with the real pricing config.
 */
describe("MinutesLaunchTable", () => {
  it("during the window: all four minutes plans with disabled 'Available 1 Dec' CTAs", () => {
    render(<MinutesLaunchTable windowActive />);
    expect(screen.getByText("From 1 Dec — minutes pricing")).toBeInTheDocument();
    for (const entry of MINUTES_LAUNCH_PLANS) {
      expect(screen.getByText(entry.price)).toBeInTheDocument();
      expect(screen.getByText(entry.minutes)).toBeInTheDocument();
    }
    const buttons = screen.getAllByRole("button", { name: "Available 1 Dec" });
    expect(buttons).toHaveLength(4);
    for (const button of buttons) expect(button).toBeDisabled();
    expect(screen.getByText("Prices in Indian rupees.")).toBeInTheDocument();
  });

  it("after the window: renders nothing — /pricing returns to the old plans", () => {
    const { container } = render(<MinutesLaunchTable windowActive={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
