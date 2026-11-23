// Keeps the keyboard inside a modal dialog: Tab and Shift+Tab wrap around its controls.

import { wrapTab } from "./keyboard-nav";

const CANDIDATES =
  "input, button, select, textarea, a[href], [tabindex]:not([tabindex='-1'])";

/** The elements Tab stops on in `dialog`, in order: enabled, shown, not taken out of the
 * Tab order (a segmented control is one stop: its group, not each of its buttons). */
export const tabStops = (dialog: HTMLElement): HTMLElement[] =>
  [...dialog.querySelectorAll<HTMLElement>(CANDIDATES)].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !(el as HTMLInputElement).disabled &&
      el.getClientRects().length > 0 &&
      el.closest("[inert]") === null
  );

/** Keydown handler for Tab on the dialog element `dialog`. */
export const trapTab = (event: KeyboardEvent, dialog: HTMLElement | null) => {
  if (event.key !== "Tab" || !dialog) return;
  const stops = tabStops(dialog);
  const active = document.activeElement as HTMLElement | null;
  // Inside a group (a segmented control's button): the group's stop.
  const current =
    stops.find((el) => el === active) ??
    stops.find((el) => active !== null && el.contains(active)) ??
    null;
  const target = wrapTab(stops, current, event.shiftKey);
  if (target) {
    event.preventDefault();
    target.focus();
  }
};
