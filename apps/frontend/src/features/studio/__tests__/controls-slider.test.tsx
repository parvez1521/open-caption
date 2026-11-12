/**
 * Phase 2B pro precision: every studio Slider pairs its range with a typed
 * numeric input, so a pro can type the exact value instead of dragging to it.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Slider } from "../controls";

function setup(props: Partial<React.ComponentProps<typeof Slider>> = {}) {
  const onChange = vi.fn();
  render(<Slider label="Brightness" value={1} min={0.5} max={1.5} step={0.01} onChange={onChange} {...props} />);
  const number = screen.getByLabelText("Brightness (exact value)") as HTMLInputElement;
  const range = screen.getByRole("slider") as HTMLInputElement;
  return { onChange, number, range };
}

describe("Slider numeric input", () => {
  it("renders a number field next to the range, showing the live value", () => {
    const { number, range } = setup({ value: 1.25 });
    expect(number.type).toBe("number");
    expect(number.value).toBe("1.25");
    expect(range.type).toBe("range");
    expect(range.value).toBe("1.25");
  });

  it("typing a value and leaving the field calls onChange with it", () => {
    const { onChange, number } = setup();
    fireEvent.change(number, { target: { value: "1.25" } });
    fireEvent.blur(number);
    expect(onChange).toHaveBeenCalledWith(1.25);
  });

  it("clamps a typed value to [min, max]", () => {
    const { onChange, number } = setup();
    fireEvent.change(number, { target: { value: "9" } });
    fireEvent.blur(number);
    expect(onChange).toHaveBeenCalledWith(1.5);
    fireEvent.change(number, { target: { value: "0" } });
    fireEvent.blur(number);
    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it("snaps a typed value to the step grid", () => {
    const { onChange, number } = setup();
    fireEvent.change(number, { target: { value: "1.234" } });
    fireEvent.blur(number);
    expect(onChange).toHaveBeenCalledWith(1.23);
  });

  it("garbage input reverts without calling onChange", () => {
    const { onChange, number } = setup({ value: 1.25 });
    fireEvent.change(number, { target: { value: "abc" } });
    fireEvent.blur(number);
    expect(onChange).not.toHaveBeenCalled();
    expect(number.value).toBe("1.25");
  });

  it("Enter commits, Escape reverts", () => {
    const { onChange, number } = setup({ value: 1 });
    fireEvent.change(number, { target: { value: "1.4" } });
    fireEvent.keyDown(number, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(1.4);
    fireEvent.change(number, { target: { value: "0.6" } });
    fireEvent.keyDown(number, { key: "Escape" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(number.value).toBe("1");
  });

  it("dragging the range still calls onChange as before", () => {
    const { onChange, range } = setup();
    fireEvent.change(range, { target: { value: "1.3" } });
    expect(onChange).toHaveBeenCalledWith(1.3);
  });
});
