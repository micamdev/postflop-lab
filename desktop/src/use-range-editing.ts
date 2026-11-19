// Editing one player's range (0 OOP, 1 IP, 2–5 bunching fold ranges): grid painting, text,
// weight, clear and invert, kept in sync with the engine and `store.ranges`.

import { effectScope, ref, watch } from "vue";
import { useStore } from "./store";
import * as invokes from "./invokes";
import { parseRangeText } from "./range-text";
import { weightPercent } from "./utils";

type PaintMode = "none" | "enabling" | "disabling";

const createRangeEditing = (player: number) => {
  const store = useStore();
  const text = ref("");
  const error = ref("");
  const weight = ref(100);
  const numCombos = ref(0);
  let paintMode: PaintMode = "none";

  /** The OOP or IP range no longer matches the saved one it came from. */
  const markModified = () => {
    const source = player < 2 ? store.rangeSources[player] : null;
    if (source) source.modified = true;
  };

  const refresh = async () => {
    text.value = await invokes.rangeToString(player);
    numCombos.value = await invokes.rangeNumCombos(player);
    error.value = "";
  };

  // A loaded solution replaced the ranges: refresh the text and the combo count.
  watch(() => store.solutionLoadCount, refresh);

  const setCell = async (row: number, col: number, cellWeight: number) => {
    await invokes.rangeUpdate(player, row, col, cellWeight / 100);
    store.ranges[player][13 * (row - 1) + col - 1] = cellWeight;
    markModified();
    await refresh();
  };

  /** Sets the range from `rangeText`; returns false (with `error`) if it cannot be read. */
  const setFromText = async (rangeText: string): Promise<boolean> => {
    const parsed = parseRangeText(rangeText);
    if (!parsed.ok) {
      error.value = parsed.error;
      return false;
    }
    const errorString = await invokes.rangeFromString(player, parsed.text);
    if (errorString) {
      error.value = errorString;
      return false;
    }
    const weights = await invokes.rangeGetWeights(player);
    for (let i = 0; i < 13 * 13; ++i) {
      store.ranges[player][i] = weightPercent(weights[i]);
    }
    await refresh();
    return true;
  };

  /** Applies the typed text. */
  const applyText = async () => {
    if (await setFromText(text.value)) markModified();
  };

  /** Loads a saved range; `source` is its explorer path (OOP and IP only). */
  const loadText = async (
    rangeText: string,
    source: string[] | null = null
  ): Promise<boolean> => {
    text.value = rangeText;
    if (!(await setFromText(rangeText))) return false;
    if (player < 2) {
      store.rangeSources[player] = source
        ? { path: source, modified: false }
        : null;
    }
    return true;
  };

  const startPaint = (row: number, col: number) => {
    if (store.ranges[player][13 * (row - 1) + col - 1] !== weight.value) {
      paintMode = "enabling";
      void setCell(row, col, weight.value);
    } else {
      paintMode = "disabling";
      void setCell(row, col, 0);
    }
  };

  const paintOver = (row: number, col: number) => {
    if (paintMode === "enabling") void setCell(row, col, weight.value);
    else if (paintMode === "disabling") void setCell(row, col, 0);
  };

  const endPaint = () => {
    paintMode = "none";
  };

  const clampWeight = () => {
    weight.value = Math.round(Math.max(0, Math.min(100, weight.value)));
  };

  const clear = async () => {
    await invokes.rangeClear(player);
    store.ranges[player].fill(0);
    text.value = "";
    error.value = "";
    weight.value = 100;
    numCombos.value = 0;
    markModified();
  };

  const invert = async () => {
    await invokes.rangeInvert(player);
    for (let i = 0; i < 13 * 13; ++i) {
      store.ranges[player][i] = 100 - store.ranges[player][i];
    }
    markModified();
    await refresh();
  };

  /** The range as it is (engine text, with weights) and its origin, to cancel an edit. */
  const snapshot = async () => ({
    /** A solution loaded since replaces the ranges: this snapshot no longer applies. */
    loadCount: store.solutionLoadCount,
    text: await invokes.rangeToString(player),
    source:
      player < 2 && store.rangeSources[player]
        ? { ...store.rangeSources[player]! }
        : null,
  });

  /**
   * Puts back a range taken by `snapshot` (Cancel of an edit). Refused (false) once a
   * solution was loaded since, or if the range cannot be set back.
   */
  const restore = async (
    saved: Awaited<ReturnType<typeof snapshot>>
  ): Promise<boolean> => {
    if (saved.loadCount !== store.solutionLoadCount) return false;
    if (saved.text === "") await clear();
    else if (!(await setFromText(saved.text))) return false;
    text.value = saved.text;
    // Last: an edit still being applied must not leave the origin "modified".
    if (player < 2) {
      store.rangeSources[player] = saved.source && { ...saved.source };
    }
    return true;
  };

  return {
    text,
    error,
    snapshot,
    restore,
    weight,
    numCombos,
    applyText,
    setCell,
    loadText,
    startPaint,
    paintOver,
    endPaint,
    clampWeight,
    clear,
    invert,
  };
};

type RangeEditing = ReturnType<typeof createRangeEditing>;

// One editing state per player and app store: the explorer, the Setup range panel and the
// bunching editor all edit the same range.
const editors = new WeakMap<object, Map<number, RangeEditing>>();

export const useRangeEditing = (player: number): RangeEditing => {
  const store = useStore();
  let byPlayer = editors.get(store);
  if (!byPlayer) {
    byPlayer = new Map();
    editors.set(store, byPlayer);
  }
  let editing = byPlayer.get(player);
  if (!editing) {
    // Detached: the shared state outlives the component that first asked for it.
    editing = effectScope(true).run(() => createRangeEditing(player))!;
    byPlayer.set(player, editing);
  }
  return editing;
};
