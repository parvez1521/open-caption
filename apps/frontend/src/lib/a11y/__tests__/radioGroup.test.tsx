// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { radioGroupKeyDown } from "../radioGroup";

/** MA-A5-005: radiogroups are role="radio" buttons, so arrow keys must be wired by hand. */
function Group() {
  const [value, setValue] = useState("a");
  return (
    <div role="radiogroup" aria-label="Pick one" onKeyDown={radioGroupKeyDown}>
      {(["a", "b", "c"] as const).map((v) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => setValue(v)}>
          Option {v.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

describe("radioGroupKeyDown (MA-A5-005)", () => {
  it("ArrowRight moves focus and selection to the next option, wrapping at the end", () => {
    render(<Group />);
    const a = screen.getByRole("radio", { name: "Option A" });
    const c = screen.getByRole("radio", { name: "Option C" });
    c.focus();
    fireEvent.keyDown(c, { key: "ArrowRight" });
    expect(document.activeElement).toBe(a);
    expect(a).toHaveAttribute("aria-checked", "true");
  });

  it("ArrowLeft moves to the previous option and Home/End jump to the ends", () => {
    render(<Group />);
    const a = screen.getByRole("radio", { name: "Option A" });
    const b = screen.getByRole("radio", { name: "Option B" });
    const c = screen.getByRole("radio", { name: "Option C" });
    b.focus();
    fireEvent.keyDown(b, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(a);
    expect(a).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(a, { key: "End" });
    expect(document.activeElement).toBe(c);
    expect(c).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(c, { key: "Home" });
    expect(document.activeElement).toBe(a);
  });

  it("ignores keys other than the six navigation keys", () => {
    render(<Group />);
    const a = screen.getByRole("radio", { name: "Option A" });
    a.focus();
    fireEvent.keyDown(a, { key: "Enter" });
    expect(document.activeElement).toBe(a);
    expect(a).toHaveAttribute("aria-checked", "true");
  });
});
