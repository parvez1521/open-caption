/**
 * Is any modal dialog mounted right now?
 *
 * Deep-audit finding B3 (2026-11-11): the Studio's global keyboard shortcuts
 * must never fire while a modal is up. An explicit open-state ref in
 * StudioPage covered only four dialogs (export, signup gate, shortcuts,
 * save-conflict) — the Motion picker, the first-visit tutorial tour and the
 * "video ready" dialog were missed, so Delete / Space / S / B / M acted on
 * the project BEHIND those modals.
 *
 * Every dialog surface in this app is conditionally mounted while open and
 * carries role="dialog" (or "alertdialog" for confirms), so presence in the
 * DOM is the open state. Checking the DOM covers all current dialogs and any
 * future one automatically — no per-dialog wiring to forget again.
 */
export const anyModalOpen = (root: ParentNode = document): boolean =>
  root.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
