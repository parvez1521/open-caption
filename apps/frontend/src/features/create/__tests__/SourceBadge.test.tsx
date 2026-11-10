import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceBadge } from "../SourceBadge";
import { CLOUD_AI, LOCAL_MODEL } from "../model";

describe("SourceBadge", () => {
  it("labels a template batch as the template engine, with no AI or model wording", () => {
    render(<SourceBadge source="template" />);
    const el = screen.getByText("Template engine");
    expect(el).toBeTruthy();
    expect(el.textContent!.toLowerCase()).not.toContain("ai");
    expect(el.getAttribute("data-source")).toBe("template");
  });

  it("labels a model batch with the model name and the on-device wording", () => {
    render(<SourceBadge source="model" />);
    const el = screen.getByText(`Local model · ${LOCAL_MODEL.name} · runs on your device`);
    expect(el).toBeTruthy();
    expect(el.getAttribute("data-source")).toBe("model");
  });

  it("labels a cloud batch as free AI with the model name and provider", () => {
    render(<SourceBadge source="cloud" />);
    const el = screen.getByText(`Free AI · ${CLOUD_AI.modelName} (${CLOUD_AI.provider})`);
    expect(el).toBeTruthy();
    expect(el.getAttribute("data-source")).toBe("cloud");
  });
});
