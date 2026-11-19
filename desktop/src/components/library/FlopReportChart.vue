<template>
  <div
    class="flex flex-1 min-h-0 gap-px overflow-x-auto rounded-lg border border-line bg-panel p-3"
  >
    <button
      v-for="row in rows"
      :key="row.name"
      type="button"
      class="flex flex-col flex-1 min-w-[10px] max-w-[28px] group disabled:cursor-default"
      :title="tooltip(row)"
      :aria-label="tooltip(row)"
      :disabled="store.isLibraryBusy"
      @click="emit('open', row.name)"
    >
      <!-- The bar, over 25% grid lines -->
      <div
        class="relative flex flex-col justify-end flex-1 min-h-0 w-full"
        :style="GRID"
      >
        <div
          v-if="metric === 'strategy' && row.strategy"
          class="flex flex-col w-full h-full group-enabled:group-hover:opacity-80"
        >
          <div
            v-for="action in actions"
            :key="action"
            :style="{
              height: `${(row.strategy[action] ?? 0) * 100}%`,
              backgroundColor: colors[action],
            }"
          ></div>
        </div>
        <template v-else-if="metric !== 'strategy'">
          <!-- From the zero line: up for a positive value, down for a negative one. -->
          <div
            class="absolute inset-x-0 group-enabled:group-hover:opacity-80"
            :style="{
              bottom: `${bar(row).bottom * 100}%`,
              height: `${bar(row).height * 100}%`,
              backgroundColor: themeColor(player === 0 ? 'oop' : 'ip'),
              opacity: valueOf(row) < 0 ? 0.55 : 1,
            }"
          ></div>
          <div
            v-if="zero !== null"
            class="absolute inset-x-0 h-px bg-muted"
            :style="{ bottom: `${zero * 100}%` }"
          ></div>
        </template>
      </div>
      <!-- The flop, one card per line -->
      <div
        class="flex flex-col items-center w-full mt-1 text-[10px] font-bold leading-tight"
      >
        <span
          v-for="card in sortedBoard(row.board)"
          :key="card"
          :class="suitTextClasses[card & 3]"
        >
          {{ cardText(card).rank }}
        </span>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "../../store";
import { cardText, suitTextClasses, toFixed1, toFixed2 } from "../../utils";
import { themeColor } from "../../theme";
import {
  ChartMetric,
  ReportRow,
  actionLabel,
  boardText,
  chartBar,
  chartZero,
} from "../../flop-report";

// The report as a chart: one bar per flop (in the table's order), its strategy stacked or one
// player's equity, EV or EQR. A click opens the flop.

const props = defineProps<{
  rows: ReportRow[];
  actions: string[];
  colors: Record<string, string>;
  metric: ChartMetric;
  /** 0 = OOP, 1 = IP (equity, EV, EQR). */
  player: number;
}>();

const emit = defineEmits<{ (event: "open", name: string): void }>();

const store = useStore();

const GRID = {
  backgroundImage:
    "linear-gradient(to top, rgb(var(--line)) 1px, transparent 1px)",
  backgroundSize: "100% 25%",
};

const valueOf = (row: ReportRow) =>
  props.metric === "eq"
    ? row.equity[props.player]
    : props.metric === "ev"
      ? row.ev[props.player]
      : row.eqr[props.player];

const values = computed(() =>
  props.metric === "strategy" ? [] : props.rows.map(valueOf)
);
const bar = (row: ReportRow) =>
  chartBar(props.metric, valueOf(row), values.value);
/** The zero line, drawn when some value is negative. */
const zero = computed(() => chartZero(props.metric, values.value));

const sortedBoard = (board: number[]) => [...board].sort((a, b) => b - a);

const tooltip = (row: ReportRow) => {
  const who = props.player === 0 ? "OOP" : "IP";
  const value = valueOf(row);
  const detail =
    props.metric === "strategy"
      ? row.strategy
        ? props.actions
            .map(
              (a) =>
                `${actionLabel(a)} ${toFixed1((row.strategy![a] ?? 0) * 100)}%`
            )
            .join(", ")
        : "no strategy saved"
      : props.metric === "ev"
        ? `EV ${who} ${toFixed2(value)}`
        : `${props.metric === "eq" ? "EQ" : "EQR"} ${who} ${toFixed1(value * 100)}%`;
  return `${boardText(row.board)}: ${detail}`;
};
</script>
