import { describe, expect, it } from "vitest";
import { TEMPLATES } from "./templates";
import { entrancesFor, exitsFor } from "./controls";

/**
 * Regression guard for the Package-2 root fix (2026-11-11): 67 of 105 looks
 * once exposed NO real entrance (the picker's list was just ["none"], so the
 * Motion In control offered nothing). Every look must offer at least one real
 * entrance and one real exit — "none" alone does not count.
 */
describe("entrance/exit coverage across the whole registry", () => {
  it("every look offers at least one real entrance and one real exit", () => {
    const noRealEntrance = TEMPLATES.filter((t) => !entrancesFor(t).some((e) => e !== "none")).map((t) => t.id);
    const noRealExit = TEMPLATES.filter((t) => !exitsFor(t).some((e) => e !== "none")).map((t) => t.id);
    expect(noRealEntrance).toEqual([]);
    expect(noRealExit).toEqual([]);
  });
});
