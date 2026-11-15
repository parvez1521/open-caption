import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ComparisonTable from "../ComparisonTable";

/**
 * A-10: the /pricing comparison table renders all four live plans from the
 * plan config, with quota/duration/projects/retention, and never mentions
 * upload sizes or Clipper.
 */
describe("ComparisonTable", () => {
  // getByRole name matching walks the a11y tree; generous timeout for the
  // loaded shared runner (other batch worktrees run vitest at the same time).
  it("renders all four plans with quota, duration, projects and retention", () => {
    const { container } = render(<ComparisonTable currency="INR" />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    for (const name of ["Free", "Starter", "Plus", "Pro"]) {
      expect(screen.getByRole("columnheader", { name: new RegExp(name) })).toBeInTheDocument();
    }
    const text = container.textContent ?? "";
    expect(text).toContain("Videos per month");
    expect(text).toContain("Longest video");
    expect(text).toContain("Projects");
    expect(text).toContain("Exports kept");
    expect(text).toContain("₹299");
    expect(text).toContain("₹799");
    expect(text).toContain("1,000");
    expect(text).toContain("3 hours");
    expect(text).toContain("All 150");
    expect(text).toContain("MP4");
  }, 30000);

  it("shows Editor and Creator Studio included, and never Clipper or an upload size", () => {
    const { container } = render(<ComparisonTable currency="USD" />);
    const text = container.textContent ?? "";
    expect(text).toContain("Editor and Creator Studio included");
    expect(text).not.toMatch(/clipper/i);
    expect(text).not.toMatch(/\b\d+\s*(MB|GB)\b/i);
    expect(text).not.toMatch(/upload/i);
    expect(text).not.toMatch(/minute/i);
  });

  it("uses the house Check icon and no banned treatments", () => {
    const { container } = render(<ComparisonTable currency="INR" />);
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
    const html = container.innerHTML;
    for (const banned of ["backdrop-blur", "hover:scale", "hover:translate", "purple", "gradient"]) {
      expect(html).not.toContain(banned);
    }
  });
});
