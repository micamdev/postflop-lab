<template>
  <div class="flex flex-col w-full h-full px-2 py-1 gap-2.5">
    <div class="flex text-lg font-semibold">
      <div class="flex items-center">
        <span>OOP</span>
        <StarIcon
          v-if="player === 'oop'"
          class="inline-block ml-0.5 w-5 h-5 text-yellow-500"
        />
      </div>
      <div class="flex-grow"></div>
      <div class="flex items-center">
        <StarIcon
          v-if="player === 'ip'"
          class="inline-block mr-0.5 w-5 h-5 text-yellow-500"
        />
        <span>IP</span>
      </div>
    </div>

    <div class="flex flex-col gap-0.5">
      <div class="flex">
        <Adaptive
          :value="combos[0]"
          :class="{
            'w-14': true,
            'font-semibold': combos[0] && combos[0] >= (1 - EPS) * combos[1],
          }"
        />
        <div class="flex-grow text-center underline">Combos</div>
        <Adaptive
          :value="combos[1]"
          :class="{
            'w-14': true,
            'text-right': true,
            'font-semibold': combos[1] && (1 - EPS) * combos[0] <= combos[1],
          }"
        />
      </div>
      <BarChart :values="combos" />
    </div>

    <div class="flex flex-col gap-0.5">
      <div class="flex">
        <Percentage
          :value="equity[0]"
          :class="{
            'w-14': true,
            'font-semibold':
              !isNaN(equity[0]) && equity[0] >= (1 - EPS) * equity[1],
          }"
        />
        <div class="flex-grow text-center underline">Equity</div>
        <Percentage
          :value="equity[1]"
          :class="{
            'w-14': true,
            'text-right': true,
            'font-semibold':
              !isNaN(equity[1]) && (1 - EPS) * equity[0] <= equity[1],
          }"
        />
      </div>
      <BarChart :values="equity" />
    </div>

    <div class="flex flex-col gap-0.5">
      <div class="flex">
        <Ev
          :value="ev[0]"
          :digits="evDigits"
          :class="{
            'w-14': true,
            'font-semibold': !isNaN(ev[0]) && ev[0] >= (1 - EPS) * ev[1],
          }"
        />
        <div class="flex-grow text-center underline">EV</div>
        <Ev
          :value="ev[1]"
          :digits="evDigits"
          :class="{
            'w-14': true,
            'text-right': true,
            'font-semibold': !isNaN(ev[1]) && (1 - EPS) * ev[0] <= ev[1],
          }"
        />
      </div>
      <BarChart :values="ev" />
    </div>

    <div class="flex flex-col gap-0.5">
      <div class="flex">
        <Percentage
          :value="eqr[0]"
          :class="{
            'w-14': true,
            'font-semibold': !isNaN(eqr[0]) && eqr[0] >= (1 - EPS) * eqr[1],
          }"
        />
        <div class="flex-grow text-center underline">EQR</div>
        <Percentage
          :value="eqr[1]"
          :class="{
            'w-14': true,
            'text-right': true,
            'font-semibold': !isNaN(eqr[1]) && (1 - EPS) * eqr[0] <= eqr[1],
          }"
        />
      </div>
      <BarChart :values="eqr" />
    </div>

    <!-- Nut advantage: share of each range in each equity tranche -->
    <div class="mt-2 text-center font-semibold underline">
      Equity distribution
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
              !isNaN(buckets[0][i]) &&
              buckets[0][i] >= (1 - EPS) * buckets[1][i],
          }"
        />
        <div class="flex-grow text-center">{{ label }}</div>
        <Percentage
          :value="buckets[1][i]"
          :class="{
            'w-14': true,
            'text-right': true,
            'font-semibold':
              !isNaN(buckets[1][i]) &&
              (1 - EPS) * buckets[0][i] <= buckets[1][i],
          }"
        />
      </div>
      <BarChart :values="[buckets[0][i], buckets[1][i]]" />
    </div>
    <div class="text-center">
      Nut advantage: <span class="font-semibold">{{ nutAdvantageText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h } from "vue";
import {
  average,
  equityBuckets,
  toFixed1,
  toFixed,
  toFixedAdaptive,
} from "../utils";
import { Results, Spot, SpotChance } from "../result-types";

import { StarIcon } from "@heroicons/vue/24/solid";

const EPS = 2e-6;
const sky500 = "#0ea5e9";
const lime500 = "#84cc16";

const Adaptive = (props: { value: number; class: object }) => {
  const split = computed(() => toFixedAdaptive(props.value).split("."));
  if (isNaN(props.value)) return h("div", { class: "px-1" }, "-");
  return h("div", { class: props.class }, [
    h("span", {}, split.value[0] + "."),
    h("span", { class: "text-sm" }, split.value[1]),
  ]);
};

const Percentage = (props: { value: number; class: object }) => {
  const str = computed(() => toFixed1(props.value * 100));
  if (isNaN(props.value)) return h("div", { class: "px-1" }, "-");
  return h("div", { class: props.class }, [
    h("span", {}, str.value.slice(0, -1)),
    h("span", { class: "text-sm" }, str.value.slice(-1) + "%"),
  ]);
};

const Ev = (props: { value: number; digits: number; class: object }) => {
  const str = computed(() => toFixed[props.digits - 1](props.value));
  if (isNaN(props.value)) return h("div", { class: "px-1" }, "-");
  return h("span", { class: props.class }, [
    h("span", {}, str.value.slice(0, -props.digits)),
    h("span", { class: "text-xs" }, str.value.slice(-props.digits)),
  ]);
};

const BarChart = (props: { values: number[] }) => {
  if (
    (props.values[0] === 0 && props.values[1] === 0) ||
    isNaN(props.values[0]) ||
    isNaN(props.values[1])
  ) {
    return h("div", { class: "h-4 rounded-lg bg-neutral-400" });
  }
  const total = props.values[0] + props.values[1];
  const sep = `${(props.values[0] * 100) / total}%`;
  const bg = `linear-gradient(to right, ${sky500} ${sep}, ${lime500} ${sep})`;
  return h("div", { class: "h-4 rounded-lg", style: `background: ${bg}` });
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
  const ret = [
    ev.value[0] / (results.eqrBase[0] * equity.value[0]),
    ev.value[1] / (results.eqrBase[1] * equity.value[1]),
  ];
  if (!isFinite(ret[0])) ret[0] = Number.NaN;
  if (!isFinite(ret[1])) ret[1] = Number.NaN;
  return ret;
});

const BUCKET_LABELS = ["Equity ≥ 90%", "75-90%", "50-75%", "< 50%"];

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

// Who holds the larger share of their range at 90%+ equity (1 point margin).
const nutAdvantageText = computed(() => {
  const [oop, ip] = [buckets.value[0][0], buckets.value[1][0]];
  if (isNaN(oop) || isNaN(ip) || Math.abs(oop - ip) < 0.01) return "—";
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  return oop > ip
    ? `OOP (${pct(oop)} vs ${pct(ip)} at 90%+)`
    : `IP (${pct(ip)} vs ${pct(oop)} at 90%+)`;
});

const evDigits = computed(() => {
  const results = props.results;
  if (results.isEmpty) return 3;
  const maxEv = Math.max(...ev.value.map((x) => Math.abs(x)));
  return maxEv < 9.9995 ? 3 : maxEv < 99.995 ? 2 : 1;
});
</script>
