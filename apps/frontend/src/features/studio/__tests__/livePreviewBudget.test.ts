/**
 * Decline-drain guard for the live-preview budget (frozen-preview fix): a grant offered to
 * a card that already scrolled away must NOT consume the slot — the drain offers it to the
 * next waiter instead. A throwing grant is a decline too, so one broken waiter can never
 * wedge the drain. (Module state is shared across tests in this file; the afterEach drains
 * both kinds back to empty so tests stay independent, and every test still asserts the
 * budget is empty at the end, so a leak is caught by the test itself.)
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireLivePreviewSlot,
  cancelLivePreviewWait,
  livePreviewCount,
  livePreviewWaiterCount,
  releaseLivePreviewSlot,
  type LivePreviewKind,
} from "../panels/livePreviewBudget";

afterEach(() => {
  for (const kind of ["template", "social"] as const) {
    // Each release either frees a held slot or consumes a queued waiter (a decline is
    // skipped by the drain), so this always terminates with both counters at zero.
    while (livePreviewCount(kind) > 0 || livePreviewWaiterCount(kind) > 0) releaseLivePreviewSlot(kind);
  }
});

describe("livePreviewBudget grant decline", () => {
  it("a declined grant does not consume the slot — the next waiter gets it", () => {
    const accepted: string[] = [];
    // The component protocol: on the immediate-acquire path the caller invokes the grant
    // itself; the budget only invokes grants it queued. Mirror that here.
    const take = (kind: LivePreviewKind, id: string) => {
      const g = () => {
        accepted.push(id);
        return true;
      };
      if (acquireLivePreviewSlot(kind, g)) g();
    };
    const decline = () => false;
    take("template", "a");
    take("template", "b");
    take("template", "c");
    expect(livePreviewCount("template")).toBe(3);
    expect(accepted).toEqual(["a", "b", "c"]);
    // Queue: decline, accept, decline, accept.
    expect(acquireLivePreviewSlot("template", decline)).toBe(false);
    expect(acquireLivePreviewSlot("template", () => { accepted.push("d"); return true; })).toBe(false);
    expect(acquireLivePreviewSlot("template", decline)).toBe(false);
    expect(acquireLivePreviewSlot("template", () => { accepted.push("e"); return true; })).toBe(false);
    expect(livePreviewWaiterCount("template")).toBe(4);
    // One release: the drain must skip the declined grant and offer the slot to "d".
    releaseLivePreviewSlot("template");
    expect(accepted).toEqual(["a", "b", "c", "d"]);
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(2);
    // Another release: skip the second decline, offer to "e".
    releaseLivePreviewSlot("template");
    expect(accepted).toEqual(["a", "b", "c", "d", "e"]);
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(0);
    // Clean up: release the 3 held slots.
    releaseLivePreviewSlot("template");
    releaseLivePreviewSlot("template");
    releaseLivePreviewSlot("template");
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  });

  it("a throwing grant is treated as a decline, not a wedged drain", () => {
    const accepted: string[] = [];
    const take = (kind: LivePreviewKind, id: string) => {
      const g = () => {
        accepted.push(id);
        return true;
      };
      if (acquireLivePreviewSlot(kind, g)) g();
    };
    const throwing = () => {
      throw new Error("boom");
    };
    take("social", "a");
    take("social", "b");
    take("social", "c");
    expect(acquireLivePreviewSlot("social", throwing)).toBe(false);
    expect(acquireLivePreviewSlot("social", () => { accepted.push("d"); return true; })).toBe(false);
    expect(() => releaseLivePreviewSlot("social")).not.toThrow();
    expect(accepted).toEqual(["a", "b", "c", "d"]);
    expect(livePreviewCount("social")).toBe(3);
    expect(livePreviewWaiterCount("social")).toBe(0);
    releaseLivePreviewSlot("social");
    releaseLivePreviewSlot("social");
    releaseLivePreviewSlot("social");
    expect(livePreviewCount("social")).toBe(0);
  });

  it("cancel still removes a queued waiter; releasing an empty kind is a no-op", () => {
    // Fill all 3 slots first, so the next acquire actually queues.
    [() => true, () => true, () => true].forEach((g) => expect(acquireLivePreviewSlot("template", g)).toBe(true));
    expect(livePreviewCount("template")).toBe(3);
    const queued = () => true;
    expect(acquireLivePreviewSlot("template", queued)).toBe(false);
    expect(livePreviewWaiterCount("template")).toBe(1);
    cancelLivePreviewWait("template", queued);
    expect(livePreviewWaiterCount("template")).toBe(0);
    releaseLivePreviewSlot("template");
    releaseLivePreviewSlot("template");
    releaseLivePreviewSlot("template");
    expect(livePreviewCount("template")).toBe(0);
    expect(() => releaseLivePreviewSlot("template")).not.toThrow();
    expect(livePreviewCount("template")).toBe(0);
  });
});
