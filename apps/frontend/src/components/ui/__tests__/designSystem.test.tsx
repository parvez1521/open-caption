import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import Button from "../Button";
import Card from "../Card";
import Input from "../Input";

/**
 * Phase 3 design system pins (2026-11-12): the shared controls sit on the
 * workbench tokens — solid emerald primary, sand surfaces, emerald focus —
 * and carry none of the banned treatments: no indigo/purple, no glass
 * (backdrop-blur), no hover scale/translate. If a future restyle reintroduces
 * one, this test fails on purpose.
 */
const BANNED = ["indigo", "purple", "violet", "backdrop-blur", "hover:scale", "hover:translate", "active:scale"];

describe("workbench design system", () => {
  it("Button primary is solid emerald on near-black, md hits 44px", () => {
    const { getByRole } = render(<Button>Go</Button>);
    const cls = getByRole("button").className;
    expect(cls).toContain("bg-emerald-accent");
    expect(cls).toContain("text-[#141412]");
    expect(cls).toContain("min-h-11");
    expect(cls).toContain("rounded-full");
    for (const b of BANNED) expect(cls).not.toContain(b);
  });

  it("Button secondary/ghost/danger stay on sand/red tokens", () => {
    for (const variant of ["secondary", "ghost", "danger"] as const) {
      const { getByRole, unmount } = render(<Button variant={variant}>Go</Button>);
      const cls = getByRole("button").className;
      expect(cls).not.toContain("indigo");
      for (const b of BANNED) expect(cls).not.toContain(b);
      unmount();
    }
    const { getByRole } = render(<Button variant="danger">Delete</Button>);
    expect(getByRole("button").className).toContain("bg-[#E5484D]");
  });

  it("Card is a solid sand panel, no glass, hover only darkens the border", () => {
    const { container } = render(<Card hoverable>Hi</Card>);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("bg-sand-100");
    expect(cls).toContain("border-sand-200");
    expect(cls).toContain("rounded-wb-panel");
    expect(cls).toContain("hover:border-sand-300");
    for (const b of BANNED) expect(cls).not.toContain(b);
    expect(cls).not.toContain("shadow");
  });

  it("Input focuses emerald, never indigo", () => {
    const { container } = render(<Input label="Name" id="n" />);
    const input = container.querySelector("input")!;
    expect(input.className).toContain("focus:border-emerald-accent");
    expect(input.className).toContain("bg-sand-50");
    for (const b of BANNED) expect(input.className).not.toContain(b);
  });
});

/**
 * MA-A2-006 (2026-11-19): headings are the most visible place for the
 * banned em dash — the three that had one ("Totals", "Growth trend",
 * "Hook") now use a colon. This pins headings only, on purpose: the
 * remaining ~535 user-visible em dashes in body copy need a per-sentence
 * call (comma vs colon vs period vs reword), so no mechanical sweep and
 * no repo-wide ban is asserted here; a future pass can extend this guard
 * surface by surface as each one is hand-checked.
 */
function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__" && entry !== "node_modules") walkTsx(full, out);
    } else if (full.endsWith(".tsx") && !full.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("headings carry no em dash (MA-A2-006)", () => {
  it("no <h1>-<h6> line in non-test source contains an em dash", () => {
    const offenders: string[] = [];
    for (const file of walkTsx(join(process.cwd(), "src"))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (/<h[1-6][ >]/.test(line) && (line.includes("—") || line.includes("&mdash;"))) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
