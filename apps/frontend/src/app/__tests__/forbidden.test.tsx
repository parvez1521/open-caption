import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import ForbiddenPage from "../forbidden";

/** 403 page renders the shared forbidden state with sign-in and guest exits. */

describe("forbidden page", () => {
  it("renders the 403 state", () => {
    render(<ForbiddenPage />);
    expect(screen.getByText("403")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "You don't have access to this" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
});
