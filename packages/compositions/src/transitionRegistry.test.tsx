import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SegmentTransitionSchema, TRANSITION_REGISTRY_IDS, type SegmentTransition } from "@capseasy/shared";

vi.mock("remotion", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual };
});

import {
  TRANSITION_CATEGORIES,
  TRANSITION_REGISTRY,
  presentationForTransition,
  transitionsInCategory,
} from "./transitionRegistry";

const renderPresentation = (transition: SegmentTransition, direction: "entering" | "exiting", progress: number) => {
  const presentation = presentationForTransition(transition);
  const Comp = presentation.component;
  return renderToStaticMarkup(
    <Comp
      presentationDirection={direction}
      presentationProgress={progress}
      presentationDurationInFrames={9}
      passedProps={presentation.props}
      onElementImage={() => {}}
      onUnmount={() => {}}
      bothEnteringAndExiting={false}
    >
      <div data-scene="true" />
    </Comp>,
  );
};

describe("TRANSITION_REGISTRY (100 premium transitions)", () => {
  it("has exactly 100 entries", () => {
    expect(TRANSITION_REGISTRY).toHaveLength(100);
  });

  it("has unique ids, and the id set is exactly the shared schema's registry ids", () => {
    const ids = TRANSITION_REGISTRY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(100);
    expect([...ids].sort()).toEqual([...TRANSITION_REGISTRY_IDS].sort());
  });

  it("has 10 categories with 10 entries each, in registry order", () => {
    expect(TRANSITION_CATEGORIES).toHaveLength(10);
    for (const category of TRANSITION_CATEGORIES) {
      expect(transitionsInCategory(category.id)).toHaveLength(10);
    }
    const seen = TRANSITION_REGISTRY.map((entry) => entry.category);
    expect(seen).toEqual(TRANSITION_CATEGORIES.flatMap((c) => Array(10).fill(c.id)));
  });

  it("every entry stores through SegmentTransitionSchema with its default duration in bounds", () => {
    for (const entry of TRANSITION_REGISTRY) {
      expect(entry.defaultDurationMs).toBeGreaterThanOrEqual(100);
      expect(entry.defaultDurationMs).toBeLessThanOrEqual(2000);
      expect(Number.isInteger(entry.defaultDurationMs)).toBe(true);
      const parsed = SegmentTransitionSchema.safeParse({ type: entry.id, durationMs: entry.defaultDurationMs });
      expect(parsed.success).toBe(true);
    }
  });

  it("the 5 legacy types still parse and still resolve", () => {
    for (const type of ["fade", "wipe", "slide", "zoom", "blur"] as const) {
      expect(SegmentTransitionSchema.safeParse({ type, durationMs: 300 }).success).toBe(true);
      const presentation = presentationForTransition({ type, durationMs: 300 });
      expect(presentation.component).toBeDefined();
      expect(presentation.props).toBeDefined();
    }
  });
});

describe("transition render smoke (every presentation at p=0.5)", () => {
  it("every registry entry renders static markup entering and exiting without crashing", () => {
    for (const entry of TRANSITION_REGISTRY) {
      const transition: SegmentTransition = { type: entry.id, durationMs: entry.defaultDurationMs };
      for (const direction of ["entering", "exiting"] as const) {
        const html = renderPresentation(transition, direction, 0.5);
        expect(html).toContain('data-scene="true"');
      }
    }
  });

  it("entries in a category render visibly differently (entering + exiting markup pairwise distinct)", () => {
    for (const category of TRANSITION_CATEGORIES) {
      const markups = transitionsInCategory(category.id).map((entry) => {
        const transition: SegmentTransition = { type: entry.id, durationMs: entry.defaultDurationMs };
        return renderPresentation(transition, "entering", 0.5) + renderPresentation(transition, "exiting", 0.5);
      });
      expect(new Set(markups).size).toBe(10);
    }
  });

  it("spot-checks: the stored params reach the rendered style", () => {
    const at = (id: string, direction: "entering" | "exiting" = "entering") =>
      renderPresentation({ type: id as SegmentTransition["type"], durationMs: 400 }, direction, 0.5);
    expect(at("dissolve-black")).toContain("#000000");
    expect(at("dissolve-ember")).toContain("#FFA946");
    expect(at("light-orange")).toContain("#FFA946");
    expect(at("iris-circle")).toContain("circle(");
    expect(at("iris-diamond")).toContain("polygon(");
    expect(at("flip-horizontal")).toContain("rotateY(");
    expect(at("spin-180")).toContain("rotate(");
    expect(at("glitch-hard")).toContain("translateX(");
    expect(at("wipe-left")).toContain("inset(");
    expect(at("stinger-triple")).toContain("#ffffff");
    // Zoom depth is a real scale difference, not a relabel: hard zooms further than soft.
    expect(at("zoom-in-hard")).toContain("scale(0.85)");
    expect(at("zoom-in-soft")).toContain("scale(0.96)");
    // The legacy zoom still renders its pinned 0.925 scale at p=0.5.
    expect(at("zoom")).toContain("scale(0.925)");
  });
});
