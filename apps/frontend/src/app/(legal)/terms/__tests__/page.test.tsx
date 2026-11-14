import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import TermsPage from "../page";

/**
 * Terms §3 (Builder 6): paid plans are monthly subscriptions that
 * bill each month and renew until cancelled — the stale "one-time
 * 30-day passes" sentence is gone, and the old passes are named as
 * legacy only. The plan names are Starter, Creator and Pro (Plus is
 * the retired name).
 */
describe("terms §3 (subscriptions)", () => {
  it("says paid plans are monthly subscriptions that renew until cancelled", () => {
    render(<TermsPage />);
    expect(screen.getByText(/monthly subscriptions/)).toBeTruthy();
    expect(screen.getByText(/bills each month and renews until you cancel/)).toBeTruthy();
    expect(screen.getByText(/cancel anytime/)).toBeTruthy();
    expect(screen.getByText(/Starter, Creator and Pro/)).toBeTruthy();
  });

  it("no longer sells passes as one-time or never-renewing", () => {
    render(<TermsPage />);
    expect(screen.queryByText(/sold as one-time 30-day passes/)).toBeNull();
    expect(screen.queryByText(/never renews or charges you automatically/)).toBeNull();
    expect(screen.queryByText(/Starter, Plus and Pro/)).toBeNull();
  });

  it("names the old 30-day passes as legacy that run to expiry and do not renew", () => {
    render(<TermsPage />);
    expect(screen.getByText(/Older one-time 30-day passes/)).toBeTruthy();
    expect(screen.getByText(/run to their expiry date and do not renew/)).toBeTruthy();
  });
});
