/**
 * Studio Toggle (overnight QA F-04): the switch button carries its own
 * accessible name — the wrapping <label> cannot name a <button>.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toggle } from "../controls";

describe("Toggle", () => {
  it("the switch is named by its label", () => {
    render(<Toggle label="Flip horizontal" checked={false} onChange={vi.fn()} />);
    expect(screen.getByRole("switch", { name: "Flip horizontal" })).toBeTruthy();
  });

  it("clicking toggles and reports the new value", () => {
    const onChange = vi.fn();
    render(<Toggle label="Flip vertical" checked={false} onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "Flip vertical" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reflects the checked state", () => {
    render(<Toggle label="Flip horizontal" checked onChange={vi.fn()} />);
    expect(screen.getByRole("switch", { name: "Flip horizontal" }).getAttribute("aria-checked")).toBe("true");
  });
});
