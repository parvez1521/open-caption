import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import MinutesLaunchTable, { MINUTES_LAUNCH_PLANS } from "../MinutesLaunchTable";

/**
 * Minutes pricing preview on /pricing during the 5-day free launch window
 * (owner, 2026-11-15): what paid becomes from 21 Nov. TEMPORARY — the
 * minutes deploy replaces this table with the real pricing config.
 */
describe("MinutesLaunchTable", () => {
  it("during the window: all four minutes plans with disabled 'Available 21 Nov' CTAs", () => {
    render(<MinutesLaunchTable windowActive />);
    expect(screen.getByText("From 21 Nov — minutes pricing")).toBeInTheDocument();
    for (const entry of MINUTES_LAUNCH_PLANS) {
      expect(screen.getByText(entry.price)).toBeInTheDocument();
      expect(screen.getByText(entry.minutes)).toBeInTheDocument();
    }
    const buttons = screen.getAllByRole("button", { name: "Available 21 Nov" });
    expect(buttons).toHaveLength(4);
    for (const button of buttons) expect(button).toBeDisabled();
    expect(screen.getByText("Prices in Indian rupees.")).toBeInTheDocument();
  });

  it("after the window: renders nothing — /pricing returns to the old plans", () => {
    const { container } = render(<MinutesLaunchTable windowActive={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
