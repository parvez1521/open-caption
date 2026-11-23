import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { EmptyState, ErrorState, ForbiddenState, SuccessState } from "../StateMessages";

/**
 * Shared state components (production-pages audit): one empty / error /
 * success / forbidden pattern, reused by the projects list, billing
 * history and exports instead of ad-hoc copies.
 */

describe("EmptyState", () => {
  it("renders the title and description with status semantics", () => {
    render(<EmptyState title="No payments yet." description="Buy a plan and it shows up here." />);
    expect(screen.getByRole("status")).toHaveTextContent("No payments yet.");
    expect(screen.getByText("Buy a plan and it shows up here.")).toBeTruthy();
  });

  it("renders an action when given one", () => {
    render(<EmptyState title="Nothing here." action={<button type="button">Clear search</button>} />);
    expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy();
  });
});

describe("ErrorState", () => {
  it("renders the title and calls onRetry from its retry button", () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Couldn't load your projects." description="Check your connection." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your projects.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders no retry button without onRetry", () => {
    render(<ErrorState title="That payment didn't go through." />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("SuccessState", () => {
  it("renders the title and description with status semantics", () => {
    render(<SuccessState title="Payment confirmed." description="Starter · ₹149 · covers you until 5 Dec." />);
    expect(screen.getByRole("status")).toHaveTextContent("Payment confirmed.");
    expect(screen.getByText(/Starter · ₹149/)).toBeTruthy();
  });
});

describe("ForbiddenState", () => {
  it("says what is restricted and where to go, without naming protected data", () => {
    render(<ForbiddenState />);
    expect(screen.getByText("403")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "You don't have access to this" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Continue as guest" })).toHaveAttribute("href", "/start");
  });
});
