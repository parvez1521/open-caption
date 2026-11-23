import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/** Security page (production-pages audit): the measures already stated in
 * Privacy §10, plus a responsible-disclosure contact reusing the support
 * inbox. No compliance claim of any kind is made on the page. */

import SecurityPage from "../page";

describe("Security page", () => {
  it("states the measures from Privacy §10 and the disclosure contact", () => {
    render(<SecurityPage />);
    expect(screen.getByRole("heading", { name: /Sec/i })).toBeTruthy();
    expect(screen.getByText(/encrypted in transit \(HTTPS\) and at rest/)).toBeTruthy();
    expect(screen.getByText(/row-level security/)).toBeTruthy();
    expect(screen.getByText(/short-lived signed links/)).toBeTruthy();
    expect(screen.getByText(/hashed and revocable|stored only as a secure hash/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Report a vulnerability" })).toBeTruthy();
    expect(screen.getAllByText(/work\.techhacksai@gmail\.com/).length).toBeGreaterThan(0);
    expect(screen.getByText(/no bug bounty programme/)).toBeTruthy();
  });

  it("claims no certification or compliance standard", () => {
    const { container } = render(<SecurityPage />);
    const text = container.textContent ?? "";
    for (const claim of ["SOC 2", "SOC2", "ISO 27001", "PCI-DSS", "PCI DSS", "GDPR compliant", "CCPA compliant", "WCAG"]) {
      expect(text).not.toContain(claim);
    }
  });
});
