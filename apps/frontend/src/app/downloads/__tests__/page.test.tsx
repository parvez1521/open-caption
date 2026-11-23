import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/** /downloads page (production-pages audit): the APK link shows the real
 * file size from disk, with install steps and no invented version or
 * checksum. */

vi.mock("@/components/home/Sections", () => ({
  Nav: () => <nav>nav</nav>,
  Footer: () => <footer>footer</footer>,
}));

import DownloadsPage from "../page";

describe("Downloads page", () => {
  it("links the real APK with its size from disk", () => {
    render(<DownloadsPage />);
    const link = screen.getByRole("link", { name: /Download the APK/ });
    expect(link).toHaveAttribute("href", "/downloads/captionit.apk");
    expect(screen.getByText(/Captionit APK/)).toHaveTextContent("1.1 MB");
  });

  it("gives install steps and no invented version or checksum", () => {
    const { container } = render(<DownloadsPage />);
    expect(screen.getByRole("heading", { name: "How to install" })).toBeTruthy();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/version \d/i);
    expect(text).not.toMatch(/checksum|sha-?256|md5/i);
  });
});
