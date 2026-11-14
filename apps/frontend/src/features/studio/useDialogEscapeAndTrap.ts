import { useEffect, useRef, type RefObject } from "react";

/** Focusable elements inside a dialog, in tab order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared dialog keyboard behaviour (overnight QA F-05): Escape closes, Tab is
 * trapped inside the dialog, and focus lands on the dialog itself when it
 * opens (so the dialog needs tabIndex={-1}) and returns to where it was on
 * close. The Escape listener copies the in-repo pattern from
 * MotionPicker.tsx (window keydown, Escape closes).
 *
 * Only the topmost dialog answers Escape: VideoReady stacks above
 * ExportModal, and one Escape must not close both.
 */
export function useDialogEscapeAndTrap(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const dialogs = Array.from(
          document.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
        );
        if (dialogs.length === 0 || dialogs[dialogs.length - 1] === dialog) {
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (e.key !== "Tab" || !dialog.contains(e.target as Node)) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      // Initial focus sits on the dialog container itself: Shift+Tab from there
      // wraps to the last control instead of escaping behind the modal.
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogRef]);
}
