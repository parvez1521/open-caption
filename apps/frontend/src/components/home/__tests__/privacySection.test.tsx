import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Privacy } from "../Sections";

/**
 * MA-A2-001 (CAP-S01 follow-up): the homepage privacy section must not
 * headline "Your video never leaves this tab" next to the BrowserCard that
 * discloses the automatic ≤50 MB cloud backup — the two claims contradicted
 * each other in the same viewport. The heading now says the video is edited
 * in the tab, and the backup is named in the same block.
 */
describe("homepage Privacy section (MA-A2-001)", () => {
  it("does not claim the video never leaves the tab", () => {
    const { container } = render(<Privacy />);
    expect(container.textContent).not.toMatch(/never leaves/i);
    expect(container.textContent).not.toMatch(/stays on your device/i);
  });

  it("names the 50 MB cloud backup in the same block as the editing claim", () => {
    render(<Privacy />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/edited/i);
    expect(screen.getByText(/backed up to the cloud up to 50 MB/i)).toBeTruthy();
  });
});
