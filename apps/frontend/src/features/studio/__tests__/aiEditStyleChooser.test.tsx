import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AI_EDIT_STYLES } from "../aiEditStyles";
import { AiEditStyleChooser } from "../panels/AiEditStyleChooser";

describe("AiEditStyleChooser", () => {
  it("renders a house-made preview per style (one SVG each, no copied art)", () => {
    const { container } = render(<AiEditStyleChooser value="cinematic" onChange={vi.fn()} />);
    expect(container.querySelectorAll("svg").length).toBe(AI_EDIT_STYLES.length);
    for (const style of AI_EDIT_STYLES) {
      expect(screen.getByText(style.label)).toBeTruthy();
      expect(screen.getByText(style.hint)).toBeTruthy();
    }
  });

  it("marks the chosen style and reports a new choice", () => {
    const onChange = vi.fn();
    render(<AiEditStyleChooser value="clean" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: /Clean/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: /Bold/ }));
    expect(onChange).toHaveBeenCalledWith("bold");
  });

  it("disables every style while there is no video", () => {
    render(<AiEditStyleChooser value="cinematic" onChange={vi.fn()} disabled />);
    for (const style of AI_EDIT_STYLES) {
      expect(screen.getByRole("radio", { name: new RegExp(style.label) }).hasAttribute("disabled")).toBe(true);
    }
  });
});
