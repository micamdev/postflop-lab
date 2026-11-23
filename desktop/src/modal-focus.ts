// Keeps the keyboard inside a modal dialog: Tab and Shift+Tab wrap around its controls.

import { wrapTab } from "./keyboard-nav";

const FOCUSABLE =
  'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keydown handler for Tab on the dialog element `dialog`. */
export const trapTab = (event: KeyboardEvent, dialog: HTMLElement | null) => {
  if (event.key !== "Tab" || !dialog) return;
  const focusables = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const target = wrapTab(
    focusables,
    document.activeElement as HTMLElement | null,
    event.shiftKey
  );
  if (target) {
    event.preventDefault();
    target.focus();
  }
};
