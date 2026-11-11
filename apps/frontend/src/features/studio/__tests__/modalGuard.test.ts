// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { anyModalOpen } from "../modalGuard";

/**
 * Deep-audit B3 regression: Studio keyboard shortcuts must stay inert while
 * ANY modal is mounted — including dialogs StudioPage doesn't own state for
 * (Motion picker, tutorial tour, "video ready"). All dialog surfaces in the
 * app are conditionally mounted with role="dialog"/"alertdialog".
 */
describe("anyModalOpen (deep-audit B3)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is false on a plain editor surface", () => {
    document.body.innerHTML = `<div><button>Play</button><div role="tablist"></div></div>`;
    expect(anyModalOpen()).toBe(false);
  });

  it("is true while a role=dialog surface is mounted (Motion picker / tour shape)", () => {
    document.body.innerHTML = `<div role="dialog" aria-label="Motion templates"></div>`;
    expect(anyModalOpen()).toBe(true);
  });

  it("is true while a role=alertdialog confirm is mounted", () => {
    document.body.innerHTML = `<div role="alertdialog" aria-modal="true"></div>`;
    expect(anyModalOpen()).toBe(true);
  });

  it("turns false again once the dialog unmounts", () => {
    document.body.innerHTML = `<div role="dialog"></div>`;
    expect(anyModalOpen()).toBe(true);
    document.body.querySelector('[role="dialog"]')?.remove();
    expect(anyModalOpen()).toBe(false);
  });
});
