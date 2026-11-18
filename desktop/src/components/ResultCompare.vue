<template>
  <div
    class="flex flex-col h-full px-3 py-2 gap-2.5 overflow-y-auto text-sm bg-panel tabular-nums"
  >
    <div class="flex text-[11px] font-bold tracking-wider">
      <div class="flex items-center">
        <span class="text-oop">OOP</span>
        <StarIcon
          v-if="player === 'oop'"
          class="inline-block ml-0.5 w-3.5 h-3.5 text-yellow-400"
        />
      </div>
      <div class="flex-grow"></div>
      <div class="flex items-center">
        <StarIcon
          v-if="player === 'ip'"
          class="inline-block mr-0.5 w-3.5 h-3.5 text-yellow-400"
        />
        <span class="text-ip">IP</span>
      </div>
    </div>

    <div v-for="row in statRows" :key="row.label" class="flex flex-col gap-0.5">
      <div class="flex">
        <component
          :is="row.cell"
          :value="row.values[0]"
          :digits="evDigits"
          :class="{ 'w-14': true, 'font-semibold': isAhead(row, 0) }"
        />
        <div class="flex-grow text-center text-xs text-muted">
          {{ row.label }}
        </div>
        <component
          :is="row.cell"
          :value="row.values[1]"
          :digits="evDigits"
          :class="{
            'w-14': true,
            'text-right': true,
            'font-semibold': isAhead(row, 1),
          }"
        />
      </div>
      <BarChart :values="row.values" />
    </div>

    <!-- Nut advantage: share of each range in each equity tranche -->
    <div
      class="mt-2 pt-2.5 border-t border-line text-[11px] font-bold tracking-wider text-muted"
    >
      EQUITY DISTRIBUTION
    </div>
    <div
      v-for="(label, i) in BUCKET_LABELS"
      :key="label"
      class="flex flex-col gap-0.5"
    >
      <div class="flex">
        <Percentage
          :value="buckets[0][i]"
          :class="{
            'w-14': true,
            'font-semibold':
              i < WEAK_BUCKET &&
              !isNaN(buckets[0][i]) &&
              buckets[0][i] >= (1 - EPS) * buckets[1][i],
          }"
        />
        <div class="flex-grow text-center text-xs text-muted">{{ label }}</div>
        <Percentage
          :value="buckets[1][i]"
          :class="{
            'w-14': true,
            'text-right': true,
            'font-semibold':
              i < WEAK_BUCKET &&
              !isNaN(buckets[1][i]) &&
              (1 - EPS) * buckets[0][i] <= buckets[1][i],
          }"
        />
      </div>
      <BarChart :values="[buckets[0][i], buckets[1][i]]" />
    </div>
    <div class="mt-1 text-xs text-muted">
      Nut advantage:
      <span class="font-semibold text-ink">{{ nutAdvantageText }}</span>
    </div>
    <div class="text-xs text-muted">
      Best hands advantage:
      <span class="font-semibold text-ink">{{ bestHandsAdvantageText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h } from "vue";
import {
  average,
  eqrOf,
  equityBuckets,
  evDigitsFor,
  nutAdvantageText as nutAdvantage,
  toFixed1,
  toFixed,
  toFixedAdaptive,
} from "../utils";
import { Results, Spot, SpotChance } from "../result-types";

import { StarIcon } from "@heroicons/vue/24/solid";

const EPS = 2e-6;
// Player colours (Graphite theme): OOP blue, IP orange.
const oopColor = "#5b8def";
const ipColor = "#e0a03c";

const Adaptive = (props: { value: number; class: object }) => {
  if (isNaN(props.value)) return h("div", { class: "px-1" }, "-");
  const split = toFixedAdaptive(props.value).split(".");
  return h("div", { class: props.class }, [
    h("span", {}, split[0] + "."),
    h("span", { class: "text-sm" }, split[1]),
  ]);
};

const Percentage = (props: { value: number; class: object }) => {
  if (isNaN(props.value)) return h("div", { class: "px-1" }, "-");
  const str = toFixed1(props.value * 100);
  return h("div", { class: props.class }, [
    h("span", {}, str.slice(0, -1)),
    h("span", { class: "text-sm" }, str.slice(-1) + "%"),
  ]);
};

const Ev = (props: { value: number; digits: number; class: object }) => {
  if (isNaN(props.value)) return h("div", { class: "px-1" }, "-");
  const str = toFixed[props.digits - 1](props.value);
  return h("span", { class: props.class }, [
    h("span", {}, str.slice(0, -props.digits)),
    h("span", { class: "text-xs" }, str.slice(-props.digits)),
  ]);
};

const BarChart = (props: { values: number[] }) => {
  if (
    (props.values[0] === 0 && props.values[1] === 0) ||
    isNaN(props.values[0]) ||
    isNaN(props.values[1])
  ) {
    return h("div", { class: "h-1.5 rounded-full bg-cell" });
  }
  const total = props.values[0] + props.values[1];
  const sep = `${(props.values[0] * 100) / total}%`;
  const bg = `linear-gradient(to right, ${oopColor} ${sep}, ${ipColor} ${sep})`;
  return h("div", { class: "h-1.5 rounded-full", style: `background: ${bg}` });
};

const props = defineProps<{
  selectedSpot: Spot;
  selectedChance: SpotChance | null;
  results: Results;
}>();

const player = computed(() => {
  if (props.selectedChance) return "chance";
  return props.selectedSpot.player;
});

const combos = computed(() => {
  const results = props.results;

  const ret: number[] = [];
  for (let i = 0; i < 2; ++i) {
    let sum = 0;
    const n = results.weights[i].length;
    for (let j = 0; j < n; ++j) {
      const weight = results.weights[i][j];
      const normalizer = results.normalizer[i][j];
      sum += normalizer && weight;
    }
    ret.push(sum);
  }

  return ret;
});

const equity = computed(() => {
  const results = props.results;
  if (results.isEmpty) return [Number.NaN, Number.NaN];
  return [
    average(results.equity[0], results.normalizer[0]),
    average(results.equity[1], results.normalizer[1]),
  ];
});

const ev = computed(() => {
  const results = props.results;
  if (results.isEmpty) return [Number.NaN, Number.NaN];
  return [
    average(results.ev[0], results.normalizer[0]),
    average(results.ev[1], results.normalizer[1]),
  ];
});

const eqr = computed(() => {
  const results = props.results;
  if (results.isEmpty) return [Number.NaN, Number.NaN];
  return [0, 1].map((p) =>
    eqrOf(ev.value[p], equity.value[p], results.eqrBase[p])
  );
});

const BUCKET_LABELS = ["Equity ≥ 90%", "75-90%", "50-75%", "< 50%"];
// Bold marks an advantage: more weak hands (the "< 50%" row) is not one.
const WEAK_BUCKET = 3;

// Share of each range in each equity tranche (OOP, IP).
const buckets = computed(() => {
  const results = props.results;
  if (results.isEmpty) {
    const none = BUCKET_LABELS.map(() => Number.NaN);
    return [none, none];
  }
  return [
    equityBuckets(results.equity[0], results.normalizer[0]),
    equityBuckets(results.equity[1], results.normalizer[1]),
  ];
});

// Who holds more nutted hands (90%+ equity), or "None".
const nutAdvantageText = computed(() =>
  nutAdvantage(buckets.value[0], buckets.value[1])
);
// The same with the 75%+ hands (GTO Wizard's "Best hands").
const bestHandsAdvantageText = computed(() =>
  nutAdvantage(buckets.value[0], buckets.value[1], 2)
);

const evDigits = computed(() => {
  const results = props.results;
  if (results.isEmpty) return 3;
  return evDigitsFor(ev.value);
});

type StatRow = {
  label: string;
  values: number[];
  cell: typeof Adaptive | typeof Percentage | typeof Ev;
  /** Bold needs a positive value (no "ahead" with 0 combos each). */
  positiveOnly?: boolean;
};

const statRows = computed((): StatRow[] => [
  { label: "Combos", values: combos.value, cell: Adaptive, positiveOnly: true },
  { label: "Equity", values: equity.value, cell: Percentage },
  { label: "EV", values: ev.value, cell: Ev },
  { label: "EQR", values: eqr.value, cell: Percentage },
]);

/** Bold marks the side ahead (or equal, within EPS). */
const isAhead = (row: StatRow, side: 0 | 1) => {
  const [mine, theirs] = [row.values[side], row.values[1 - side]];
  if (isNaN(mine) || (row.positiveOnly && !mine)) return false;
  return mine >= (1 - EPS) * theirs;
};
</script>
