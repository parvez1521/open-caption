import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatOutputView } from "../ChatOutput";
import { templateChatPayload } from "../chat";

describe("ChatOutputView", () => {
  it("renders an ideas payload as cards with copy and save actions", () => {
    const onSave = vi.fn();
    const payload = templateChatPayload("ideas", "home workouts");
    render(<ChatOutputView payload={payload} onSave={onSave} />);
    expect(screen.getByText(payload.items![0]!.title)).toBeTruthy();
    const saveButtons = screen.getAllByText("Save to library");
    expect(saveButtons).toHaveLength(payload.items!.length);
    fireEvent.click(saveButtons[0]!);
    expect(onSave).toHaveBeenCalledWith(payload.items![0], "idea");
    expect(screen.getAllByText("Saved").length).toBeGreaterThanOrEqual(1);
  });

  it("renders a script payload as a beat table and saves as a script", () => {
    const onSave = vi.fn();
    const payload = templateChatPayload("script", "morning routines");
    render(<ChatOutputView payload={payload} onSave={onSave} />);
    expect(screen.getByText(payload.script!.title)).toBeTruthy();
    expect(screen.getByText(payload.script!.beats[0]!.dialogue)).toBeTruthy();
    fireEvent.click(screen.getByText("Save to library"));
    expect(onSave).toHaveBeenCalledWith(payload.script, "script");
  });

  it("shows no save buttons when onSave is not provided", () => {
    render(<ChatOutputView payload={templateChatPayload("hooks", "mornings")} />);
    expect(screen.queryByText("Save to library")).toBeNull();
    expect(screen.getAllByText("Copy").length).toBeGreaterThanOrEqual(1);
  });
});
