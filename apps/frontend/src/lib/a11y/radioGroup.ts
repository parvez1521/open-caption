import type { KeyboardEvent } from "react";

/**
 * MA-A5-005: radiogroups in this app are buttons with role="radio" (no native
 * <input type="radio">), so no arrow-key behaviour comes free. Attach this as
 * the container-level onKeyDown of any role="radiogroup" to give it the APG
 * radiogroup pattern: ArrowRight/ArrowDown move to the next option,
 * ArrowLeft/ArrowUp to the previous (wrapping), Home/End jump to the ends,
 * and the move also selects the option (activation follows focus, as in a
 * native radiogroup). Disabled options are skipped. Keys other than the six
 * navigation keys are left alone.
 */
export function radioGroupKeyDown(e: KeyboardEvent<HTMLElement>): void {
  const key = e.key;
  if (key !== "ArrowRight" && key !== "ArrowDown" && key !== "ArrowLeft" && key !== "ArrowUp" && key !== "Home" && key !== "End") {
    return;
  }
  const group = e.currentTarget;
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])'));
  if (radios.length < 2) return;
  const target = e.target as HTMLElement | null;
  const currentEl = target?.closest?.('[role="radio"]') as HTMLElement | null;
  const current = currentEl ? radios.indexOf(currentEl) : -1;
  if (current === -1) return;
  e.preventDefault();
  let next = current;
  if (key === "ArrowRight" || key === "ArrowDown") next = (current + 1) % radios.length;
  else if (key === "ArrowLeft" || key === "ArrowUp") next = (current - 1 + radios.length) % radios.length;
  else if (key === "Home") next = 0;
  else if (key === "End") next = radios.length - 1;
  const nextEl = radios[next];
  if (!nextEl) return;
  nextEl.focus();
  nextEl.click();
}
