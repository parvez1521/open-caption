import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as icons from "../icons";

/**
 * House icons (ban list, owner 2026-11-07: NO Lucide icons on any site).
 * Every icon in the shared module must render a 24x24 stroke SVG, and the
 * module must not contain a sparkle icon (also banned) or re-export anything
 * from lucide-react. If a studio file needs a new icon, add it here — do not
 * reach for lucide-react.
 */
describe("house icons", () => {
  it("exports no Sparkles icon", () => {
    expect("Sparkles" in icons).toBe(false);
  });

  it("every icon renders a 24x24 svg", () => {
    const names = Object.keys(icons);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const Icon = (icons as Record<string, React.ComponentType<{ className?: string }>>)[name]!;
      const { container } = render(<Icon className="h-4 w-4" />);
      const svg = container.querySelector("svg");
      expect(svg, name).not.toBeNull();
      expect(svg!.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg!.getAttribute("class")).toContain("h-4 w-4");
    }
  });

  it("Play/Pause render filled (not stroked) shapes", () => {
    const { container: play } = render(<icons.Play />);
    expect(play.querySelector("svg path")!.getAttribute("fill")).toBe("currentColor");
    const { container: pause } = render(<icons.Pause />);
    expect(pause.querySelectorAll("svg rect").length).toBe(2);
  });
});
