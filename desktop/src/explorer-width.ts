/** The saved ranges and trees explorer's width, set by dragging its edge (in px). */
export const EXPLORER_WIDTH = { min: 220, default: 250, max: 560 };

const STORAGE_KEY = "postflop-lab.explorer-width";

/** A width within the limits; a window under 1400 px caps it at 40% of the window. */
export const clampExplorerWidth = (width: number, windowWidth: number) => {
  const max = Math.min(EXPLORER_WIDTH.max, Math.round(windowWidth * 0.4));
  return Math.round(Math.max(EXPLORER_WIDTH.min, Math.min(max, width)));
};

/** The width saved by the last session, or the default. */
export const loadExplorerWidth = (storage: Pick<Storage, "getItem">) => {
  const saved = Number(storage.getItem(STORAGE_KEY) || NaN);
  if (!Number.isFinite(saved)) return EXPLORER_WIDTH.default;
  return clampExplorerWidth(saved, Infinity);
};

export const saveExplorerWidth = (
  storage: Pick<Storage, "setItem">,
  width: number
) => storage.setItem(STORAGE_KEY, String(width));
