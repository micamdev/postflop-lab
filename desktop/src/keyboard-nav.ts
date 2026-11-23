// Keyboard helpers: pure decisions, the components apply them.

/** What a key does on row `index` of a tree list of `count` rows (null: nothing). */
export const treeKey = (
  key: string,
  index: number,
  count: number,
  isFolder: boolean,
  isOpen: boolean
): { move: number } | { toggle: true } | { activate: true } | null => {
  switch (key) {
    case "ArrowDown":
      return { move: Math.min(index + 1, count - 1) };
    case "ArrowUp":
      return { move: Math.max(index - 1, 0) };
    case "Home":
      return { move: 0 };
    case "End":
      return { move: count - 1 };
    case "ArrowRight":
      return isFolder && !isOpen ? { toggle: true } : null;
    case "ArrowLeft":
      return isFolder && isOpen ? { toggle: true } : null;
    case "Enter":
    case " ":
      return { activate: true };
    default:
      return null;
  }
};

/**
 * Tab in a modal dialog: the element to focus to stay inside (`focusables` in order), or
 * null when the browser's own move stays inside.
 */
export const wrapTab = <T>(
  focusables: T[],
  active: T | null,
  shift: boolean
): T | null => {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const index = active === null ? -1 : focusables.indexOf(active);
  if (index === -1) return shift ? last : first;
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
};
