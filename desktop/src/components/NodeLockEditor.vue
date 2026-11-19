<template>
  <div class="flex flex-grow min-h-0 gap-6 px-4 py-3 overflow-y-auto">
    <!-- Node editor -->
    <div class="flex-grow min-w-0">
      <div class="flex items-center gap-3">
        <div class="text-lg font-semibold">Node lock</div>
        <UiButton variant="ghost" size="sm" @click="emit('close')">
          Back to results
        </UiButton>
      </div>

      <div v-if="unlockableReason" class="mt-3 text-muted">
        {{ unlockableReason }}
      </div>
      <div v-else-if="captureError" class="mt-3 text-red-400">
        {{ captureError }}
      </div>

      <template v-else-if="baseLock && playerIndex !== -1">
        <div class="mt-2">
          <span class="font-semibold">{{ baseLock.player.toUpperCase() }}</span>
          at {{ line.label }}
          <span v-if="mirrorText" class="ml-2 text-sm text-muted">
            ({{ mirrorText }})
          </span>
        </div>
        <div class="mt-1 text-sm text-muted">
          The whole node is locked: edited hands at the frequencies you set, the
          others at their current strategy.
        </div>

        <div class="flex gap-6 mt-3">
          <!-- 13x13 grid -->
          <table class="shrink-0 border-collapse select-none">
            <tr v-for="row in 13" :key="row">
              <td
                v-for="col in 13"
                :key="col"
                :class="
                  'relative w-10 h-8 p-0 border text-xs ' +
                  (cells[row - 1][col - 1].combos.length > 0
                    ? 'cursor-pointer '
                    : 'bg-cell text-muted/50 ') +
                  (isCellSelected(row - 1, col - 1)
                    ? 'border-2 border-accent '
                    : 'border-line ')
                "
                @click="toggleCell(row - 1, col - 1)"
              >
                <div
                  v-if="cells[row - 1][col - 1].combos.length > 0"
                  class="absolute inset-0 flex"
                >
                  <div
                    v-for="(freq, i) in cellStrategy(row - 1, col - 1)"
                    :key="i"
                    :style="{
                      width: freq * 100 + '%',
                      backgroundColor: spot.actions[i]?.color,
                    }"
                  ></div>
                </div>
                <div
                  :class="
                    'relative text-center leading-8 ' +
                    (cellEdited(row - 1, col - 1) ? 'font-bold underline' : '')
                  "
                >
                  {{ cells[row - 1][col - 1].label }}
                </div>
              </td>
            </tr>
          </table>

          <div class="min-w-[16rem]">
            <!-- Combos of the focused class -->
            <div v-if="focusedCombos.length > 0">
              <div class="font-semibold">
                {{ cells[focused[0]][focused[1]].label }} combos
              </div>
              <label
                v-for="combo in focusedCombos"
                :key="combo"
                class="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  class="rounded border-line bg-panel2 text-accent"
                  :checked="selected.has(combo)"
                  @change="toggleCombo(combo)"
                />
                <span :class="'w-12 ' + (edits[combo] ? 'font-bold' : '')">
                  {{ comboLabel(combo) }}
                </span>
                <span class="text-muted">
                  {{
                    strategyOf(combo)
                      .map((f) => (f * 100).toFixed(0) + "%")
                      .join(" / ")
                  }}
                </span>
              </label>
            </div>
            <div v-else class="text-sm text-muted">
              Click a hand class to select its combos.
            </div>

            <!-- Frequencies -->
            <div class="mt-4 font-semibold">
              Frequencies ({{ selected.size }} combo{{
                selected.size === 1 ? "" : "s"
              }}
              selected)
            </div>
            <div
              v-for="(action, i) in spot.actions"
              :key="i"
              class="flex items-center gap-2 mt-1"
            >
              <span
                class="inline-block w-3 h-3 rounded-sm"
                :style="{ backgroundColor: action.color }"
              ></span>
              <span class="w-28 text-sm">
                {{ action.name }}
                {{ action.amount === "0" ? "" : action.amount }}
              </span>
              <input
                type="number"
                class="ui-input w-20 text-center"
                min="0"
                max="100"
                step="1"
                :value="freqInputs[i]"
                :disabled="selected.size === 0"
                @change="
                  onFreqInput(i, ($event.target as HTMLInputElement).value)
                "
              />
              %
            </div>
            <div
              v-if="selected.size > 0 && !isSumValid"
              class="mt-1 text-sm text-red-400"
            >
              The frequencies must add up to 100% (now
              {{ freqSum.toFixed(1) }}%).
            </div>
            <div class="flex gap-2 mt-3">
              <UiButton
                variant="ghost"
                size="sm"
                :disabled="selected.size === 0 || !isSumValid || busy"
                @click="applyToSelected"
              >
                Apply to selected hands
              </UiButton>
              <UiButton
                variant="danger"
                size="sm"
                :disabled="!hasEditedSelected || busy"
                @click="resetSelected"
              >
                Reset
              </UiButton>
            </div>
            <div class="flex gap-2 mt-2">
              <UiButton
                variant="ghost"
                size="sm"
                :disabled="selected.size === 0"
                @click="clearSelection"
              >
                Clear selection
              </UiButton>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Lock list -->
    <div class="w-[22rem] shrink-0">
      <div class="text-lg font-semibold">Locks</div>
      <div v-if="store.locks.length === 0" class="mt-2 text-sm text-muted">
        No lock.
      </div>
      <div
        v-for="lock in store.locks"
        :key="lock.key.join(',')"
        class="flex items-start gap-2 mt-2 text-sm"
      >
        <div class="flex-grow min-w-0">
          <div>
            <span class="font-semibold">{{ lock.player.toUpperCase() }}</span>
            at {{ lock.label || lock.history.join("-") }}
          </div>
          <div class="text-muted">
            {{ editedSummary(lock) }}
            · {{ isInSolution(lock) ? "in this solution" : "pending" }}
          </div>
        </div>
        <UiButton
          variant="danger"
          size="sm"
          :disabled="busy"
          @click="removeLock(lock)"
        >
          Delete
        </UiButton>
      </div>
      <div v-if="removedCount > 0" class="mt-2 text-sm text-muted">
        {{ removedCount }} lock{{ removedCount === 1 ? "" : "s" }} of this
        solution removed (pending).
      </div>

      <UiButton
        class="mt-4"
        variant="ghost"
        size="sm"
        :disabled="!hasPendingChanges || busy || !!lockResolve.disabledReason"
        @click="resolveWithLocks"
      >
        Re-solve with locks
      </UiButton>
      <div v-if="lockResolve.disabledReason" class="mt-1 text-sm text-muted">
        {{ lockResolve.disabledReason }}
      </div>
      <div v-else-if="busy" class="mt-1 text-sm text-muted">
        Preparing the tree…
      </div>
      <div v-if="lockResolve.error" class="mt-1 text-sm text-red-400">
        {{ lockResolve.error }}
      </div>
      <div class="mt-2 text-xs text-muted">
        The tree is rebuilt from this solution's configuration and solved with
        the solve settings (Setup › Solve: threads, target, iterations).
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useStore } from "../store";
import * as invokes from "../invokes";
import { NodeLock } from "../invokes";
import { Results, SpotPlayer } from "../result-types";
import { cardText, cardPairCellIndex, ranks, suitLetters } from "../utils";
import { useLockResolve } from "../lock-resolve";
import UiButton from "./ui/UiButton.vue";
import { hasPendingLocks, mirrorEdits, sameKey } from "../lock-utils";

const props = defineProps<{
  spot: SpotPlayer | null;
  /** Why the displayed node cannot be locked, or "" if it can. */
  unlockableReason: string;
  line: { history: number[]; label: string };
  results: Results;
  cards: number[][];
}>();

const emit = defineEmits<{ (e: "close"): void }>();

const store = useStore();

// The template only reads `spot` when the node is lockable (spot non-null).
const spot = computed(() => props.spot as SpotPlayer);
const playerIndex = computed(() =>
  props.spot ? (props.spot.player === "oop" ? 0 : 1) : -1
);

/** Engine combo string of a hole-card pair (higher card first), e.g. "9s6s". */
const comboString = (pair: number) => {
  let hi = pair & 0xff;
  let lo = pair >>> 8;
  if (lo > hi) [hi, lo] = [lo, hi];
  const text = (c: number) => ranks[c >>> 2] + suitLetters[c & 3];
  return text(hi) + text(lo);
};

const comboLabel = (combo: string) => {
  const card = (s: string) =>
    cardText(4 * ranks.indexOf(s[0]) + suitLetters.indexOf(s[1]));
  const a = card(combo.slice(0, 2));
  const b = card(combo.slice(2, 4));
  return a.rank + a.suit + b.rank + b.suit;
};

/* Hands of the node */

const combos = computed(() =>
  playerIndex.value === -1
    ? []
    : props.cards[playerIndex.value].map(comboString)
);

/** Reference strategy (current solution) of each combo at the node. */
const reference = computed(() => {
  const map = new Map<string, number[]>();
  const n = combos.value.length;
  const numActions = props.spot?.actions.length ?? 0;
  combos.value.forEach((combo, j) => {
    map.set(
      combo,
      Array.from(
        { length: numActions },
        (_, i) => props.results.strategy[i * n + j]
      )
    );
  });
  return map;
});

/** Combos present at the node (weight > 0), per grid cell. */
const cells = computed(() => {
  const grid = Array.from({ length: 13 }, (_, row) =>
    Array.from({ length: 13 }, (_, col) => {
      const hi = ranks[12 - Math.min(row, col)];
      const lo = ranks[12 - Math.max(row, col)];
      const label = row === col ? hi + lo : hi + lo + (col > row ? "s" : "o");
      return { label, combos: [] as string[] };
    })
  );
  if (playerIndex.value === -1) return grid;
  const weights = props.results.weights[playerIndex.value];
  props.cards[playerIndex.value].forEach((pair, j) => {
    if (!(weights[j] > 0)) return;
    const { row, col } = cardPairCellIndex(pair & 0xff, pair >>> 8);
    grid[row][col].combos.push(combos.value[j]);
  });
  return grid;
});

/* Edits and lock of the node */

/** Frequencies set by the user for this node (combo → frequencies, sum 1). */
const edits = ref<Record<string, number[]>>({});
/** Lock of the node as captured (gives its key). */
const baseLock = ref<NodeLock | null>(null);
const captureError = ref("");
const isBusy = ref(false);
const lockResolve = useLockResolve();
/** Capturing a lock or preparing the re-solve. */
const busy = computed(() => isBusy.value || lockResolve.isBusy);

const existingLock = (key: number[]) =>
  store.locks.find((lock) => sameKey(lock.key, key));

onMounted(async () => {
  if (props.unlockableReason) return;
  try {
    const lock = await invokes.gameCaptureLock(props.line.history, {});
    const existing = existingLock(lock.key);
    if (existing) {
      // A lock opened from the mirror turn names the same hands with swapped suits.
      edits.value = mirrorEdits(
        Object.fromEntries(
          existing.edited.map((combo) => [combo, existing.hands[combo]])
        ),
        existing.history,
        props.line.history
      );
    }
    baseLock.value = lock;
  } catch (e) {
    captureError.value = String(e);
  }
});

const strategyOf = (combo: string): number[] =>
  edits.value[combo] ?? reference.value.get(combo) ?? [];

const cellStrategy = (row: number, col: number) => {
  const cellCombos = cells.value[row][col].combos;
  const numActions = props.spot?.actions.length ?? 0;
  const sum = Array.from({ length: numActions }, () => 0);
  for (const combo of cellCombos) {
    strategyOf(combo).forEach((f, i) => (sum[i] += f));
  }
  return sum.map((s) => s / Math.max(cellCombos.length, 1));
};

const cellEdited = (row: number, col: number) =>
  cells.value[row][col].combos.some((combo) => edits.value[combo]);

const mirrorText = computed(() => {
  const lock = baseLock.value;
  if (!lock) return "";
  // Dealt cards (turn, river) that differ from the stored line's: a mirror line.
  const cards = lock.key
    .filter((v, k) => v !== lock.history[k])
    .map((v) => cardText(v).rank + cardText(v).suit);
  if (cards.length === 0) return "";
  return `same spot as the line with ${cards.join(" and ")}: one lock for both`;
});

/* Selection */

const selected = ref(new Set<string>());
const focused = ref<[number, number]>([-1, -1]);

const focusedCombos = computed(() =>
  focused.value[0] === -1
    ? []
    : cells.value[focused.value[0]][focused.value[1]].combos
);

const isCellSelected = (row: number, col: number) => {
  const cellCombos = cells.value[row][col].combos;
  return (
    cellCombos.length > 0 && cellCombos.every((c) => selected.value.has(c))
  );
};

const toggleCell = (row: number, col: number) => {
  const cellCombos = cells.value[row][col].combos;
  if (cellCombos.length === 0) return;
  const next = new Set(selected.value);
  if (isCellSelected(row, col)) {
    cellCombos.forEach((c) => next.delete(c));
  } else {
    cellCombos.forEach((c) => next.add(c));
  }
  focused.value = [row, col];
  setSelection(next);
};

const toggleCombo = (combo: string) => {
  const next = new Set(selected.value);
  if (next.has(combo)) next.delete(combo);
  else next.add(combo);
  setSelection(next);
};

const clearSelection = () => {
  focused.value = [-1, -1];
  setSelection(new Set());
};

/* Frequency inputs (percent) */

const freqInputs = ref<number[]>([]);
/** Actions in the order the user edited them (most recent last). */
let editOrder: number[] = [];

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Selects `next` and fills the inputs with the average strategy of the selection. */
const setSelection = (next: Set<string>) => {
  selected.value = next;
  editOrder = [];
  const numActions = props.spot?.actions.length ?? 0;
  const sum = Array.from({ length: numActions }, () => 0);
  for (const combo of next) {
    strategyOf(combo).forEach((f, i) => (sum[i] += f));
  }
  const inputs = sum.map((s) => round1((s / Math.max(next.size, 1)) * 100));
  // Rounding: put the remainder on the largest action so the inputs add up to 100.
  if (next.size > 0 && inputs.length > 0) {
    const largest = inputs.indexOf(Math.max(...inputs));
    inputs[largest] = round1(
      inputs[largest] + 100 - inputs.reduce((a, b) => a + b, 0)
    );
  }
  freqInputs.value = inputs;
};

const freqSum = computed(() => freqInputs.value.reduce((a, b) => a + b, 0));
const isSumValid = computed(() => Math.abs(freqSum.value - 100) < 0.05);

/**
 * Sets action `i` and keeps the total at 100%: the rest goes to the actions not set yet for
 * this selection, in proportion to their current values; actions already set keep their
 * values unless the rest cannot cover them.
 */
const onFreqInput = (i: number, text: string) => {
  const value = Math.min(100, Math.max(0, round1(Number(text) || 0)));
  const inputs = [...freqInputs.value];
  inputs[i] = value;
  editOrder = editOrder.filter((k) => k !== i);
  const others = inputs.map((_, k) => k).filter((k) => k !== i);
  const pinned = others.filter((k) => editOrder.includes(k));
  const free = others.filter((k) => !editOrder.includes(k));
  const pinnedSum = pinned.reduce((a, k) => a + inputs[k], 0);
  const rest = 100 - value;
  const [targets, amount] =
    free.length > 0 && pinnedSum <= rest
      ? [free, rest - pinnedSum]
      : [others, rest];
  const current = targets.reduce((a, k) => a + inputs[k], 0);
  for (const k of targets) {
    inputs[k] = round1(
      current > 0 ? (inputs[k] / current) * amount : amount / targets.length
    );
  }
  // Rounding: put the remainder on the largest adjusted action.
  if (targets.length > 0) {
    const largest = targets.reduce((a, k) => (inputs[k] > inputs[a] ? k : a));
    inputs[largest] = round1(
      Math.max(0, inputs[largest] + 100 - inputs.reduce((a, b) => a + b, 0))
    );
  }
  editOrder.push(i);
  freqInputs.value = inputs;
};

const hasEditedSelected = computed(() =>
  [...selected.value].some((combo) => edits.value[combo])
);

/** Captures the node's lock with the current edits and stores it in the lock list. */
const captureAndStore = async (nextEdits: Record<string, number[]>) => {
  isBusy.value = true;
  lockResolve.isCapturing = true;
  try {
    const lock = await invokes.gameCaptureLock(props.line.history, nextEdits);
    lock.label = props.line.label;
    edits.value = nextEdits;
    const others = store.locks.filter((l) => !sameKey(l.key, lock.key));
    store.locks = [...others, lock];
    captureError.value = "";
  } catch (e) {
    captureError.value = String(e);
  } finally {
    isBusy.value = false;
    lockResolve.isCapturing = false;
  }
};

const applyToSelected = async () => {
  const freqs = freqInputs.value.map((v) => v / 100);
  const nextEdits = { ...edits.value };
  for (const combo of selected.value) nextEdits[combo] = [...freqs];
  await captureAndStore(nextEdits);
};

const resetSelected = async () => {
  const nextEdits = { ...edits.value };
  for (const combo of selected.value) delete nextEdits[combo];
  await captureAndStore(nextEdits);
  setSelection(selected.value);
};

/* Lock list */

/** Same rule as the top bar: a lock is in the solution when nothing of it changed. */
const isInSolution = (lock: NodeLock) =>
  store.solutionLocks.some((l) => !hasPendingLocks([lock], [l]));

const removedCount = computed(
  () =>
    store.solutionLocks.filter(
      (l) => !store.locks.some((lock) => sameKey(lock.key, l.key))
    ).length
);

const hasPendingChanges = computed(() =>
  hasPendingLocks(store.locks, store.solutionLocks)
);

const editedSummary = (lock: NodeLock) => {
  const n = lock.edited.length;
  return n === 0 ? "no hand edited" : `${n} combo${n === 1 ? "" : "s"} edited`;
};

const removeLock = (lock: NodeLock) => {
  store.locks = store.locks.filter((l) => l !== lock);
  if (baseLock.value && sameKey(lock.key, baseLock.value.key)) {
    edits.value = {};
    setSelection(selected.value);
  }
};

/* Re-solve */

const resolveWithLocks = async () => {
  await lockResolve.start(props.line);
  // Started (not cancelled, nor waiting for the save dialog): the results are being replaced.
  if (store.isSolverRunning) emit("close");
};
</script>
