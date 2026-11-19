<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center gap-3 mb-3">
      <button
        class="text-sm text-muted hover:text-ink disabled:opacity-40"
        :disabled="isUpdating"
        @click="emit('back')"
      >
        ← Library
      </button>
      <h2 class="text-sm font-semibold">
        Report · same spot as “{{ source.name }}” · {{ rows.length }}
        {{ rows.length === 1 ? "flop" : "flops" }}
        <span v-if="missingCount > 0" class="font-normal text-muted">
          ({{ missingCount }} without report data)
        </span>
        <span
          v-if="report.duplicates > 0"
          class="font-normal text-muted"
          title="The same flop (up to the suits) solved more than once: one is shown: from the subset of the average if any, else from a batch, else the most recent"
        >
          ({{ report.duplicates }} duplicate{{
            report.duplicates === 1 ? "" : "s"
          }}
          hidden)
        </span>
      </h2>
      <div class="flex-1" />
      <UiButton
        v-if="missingCount > 0"
        :disabled="store.isLibraryBusy"
        title="Reload the older saves one at a time to add what the report needs"
        @click="updateOlder"
      >
        Update older saves
      </UiButton>
      <UiButton :disabled="shown.length === 0" @click="exportCsv">
        Export CSV
      </UiButton>
    </div>

    <div class="flex flex-wrap items-center gap-4 mb-3 text-xs text-muted">
      <UiSegmented
        :model-value="view"
        :options="[
          { value: 'table', label: 'Table' },
          { value: 'chart', label: 'Chart' },
        ]"
        @update:model-value="view = $event as 'table' | 'chart'"
      />
      <span class="flex items-center gap-2">
        C-bet by
        <UiSegmented
          :model-value="cbetBy"
          :options="[
            { value: 'ip', label: 'IP after check' },
            { value: 'oop', label: 'OOP first' },
          ]"
          @update:model-value="cbetBy = $event as CbetBy"
        />
      </span>
      <span class="flex items-center gap-2">
        Texture
        <UiSegmented
          :model-value="texture"
          :options="TEXTURES"
          @update:model-value="texture = $event as TextureFilter"
        />
      </span>
    </div>

    <div v-if="errorText" class="mb-3 text-sm text-red-400">
      {{ errorText }}
    </div>
    <div
      v-if="busyText || loadingText"
      class="flex items-center gap-3 mb-3 text-sm text-muted"
    >
      <span class="spinner inline-block"></span>
      {{ busyText || loadingText }}
    </div>

    <div
      v-if="averageItems"
      class="mb-3 rounded-lg border border-line bg-panel"
      title="Average strategy at the c-bet node over the flops shown, weighted by frequency"
    >
      <NodeStrategyCards :items="averageItems" :no-hands="false" />
    </div>

    <div
      v-if="view === 'chart' && shown.length > 0"
      class="flex flex-wrap items-center gap-4 mb-3 text-xs text-muted"
    >
      <span class="flex items-center gap-2">
        Show
        <UiSegmented
          :model-value="metric"
          :options="[
            { value: 'strategy', label: 'Strategy' },
            { value: 'eq', label: 'EQ' },
            { value: 'ev', label: 'EV' },
            { value: 'eqr', label: 'EQR' },
          ]"
          @update:model-value="metric = $event as ChartMetric"
        />
      </span>
      <UiSegmented
        v-if="metric !== 'strategy'"
        :model-value="String(chartPlayer)"
        :options="[
          { value: '0', label: 'OOP' },
          { value: '1', label: 'IP' },
        ]"
        @update:model-value="chartPlayer = Number($event)"
      />
      <span class="flex items-center gap-2">
        Sort by
        <select
          :value="sortKey"
          class="ui-input h-7 py-0 text-xs"
          aria-label="Sort by"
          @change="sortBy(($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="column in sortColumns"
            :key="column.key"
            :value="column.key"
          >
            {{ column.label }}
          </option>
        </select>
        <button
          type="button"
          class="w-6 h-6 rounded hover:bg-panel2 hover:text-ink"
          :title="descending ? 'Descending' : 'Ascending'"
          :aria-label="descending ? 'Descending' : 'Ascending'"
          @click="descending = !descending"
        >
          {{ descending ? "▼" : "▲" }}
        </button>
      </span>
    </div>

    <p v-if="shown.length === 0" class="mt-6 text-muted">
      No flop of this spot matches.
    </p>

    <FlopReportChart
      v-else-if="view === 'chart'"
      :rows="shown"
      :actions="actions"
      :colors="colors"
      :metric="metric"
      :player="chartPlayer"
      @open="emit('open', $event)"
    />
    <div
      v-else
      class="flex-1 min-h-0 overflow-auto rounded-lg border border-line bg-panel"
    >
      <table class="w-full text-sm tabular-nums">
        <thead class="sticky top-0 z-10 bg-panel2">
          <tr class="text-left text-xs text-muted">
            <th
              v-for="column in columns"
              :key="column.key"
              :class="[
                'px-3 py-2 font-semibold whitespace-nowrap select-none',
                column.key === 'strategy'
                  ? ''
                  : 'cursor-pointer hover:text-ink',
                column.numeric ? 'text-right' : '',
              ]"
              :title="column.title"
              @click="column.key !== 'strategy' && sortBy(column.key)"
            >
              {{ column.label }}
              <span v-if="sortKey === column.key">{{
                descending ? "▼" : "▲"
              }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr class="border-t border-line bg-panel2/60 font-semibold">
            <td class="px-3 py-2">Average</td>
            <td class="px-3 py-2 text-muted font-normal">
              <template v-if="subset">
                {{ subset.size }}-flop subset, weighted
                <span
                  v-if="subset.solved < subset.size"
                  class="text-red-400"
                  title="Solve the rest of the subset (same size, same spot) for an average that stands for all flops"
                  >({{ subset.solved }}/{{ subset.size }} solved)</span
                >
              </template>
              <template v-else>weighted by frequency</template>
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              {{ advantageText(average.buckets, 1) }}
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              {{ advantageText(average.buckets, 2) }}
            </td>
            <td class="px-3 py-2">
              <div
                v-if="average.strategy"
                class="w-40 h-3 rounded-sm"
                :style="{ backgroundImage: bar(average.strategy) }"
              ></div>
            </td>
            <td
              v-for="cell in valueCells(average)"
              :key="cell.key"
              :class="[
                'px-3 py-2 whitespace-nowrap',
                cell.numeric ? 'text-right' : '',
              ]"
              :style="cellStyle(cell)"
            >
              {{ cell.text }}
            </td>
          </tr>
          <tr
            v-for="row of shown"
            :key="row.name"
            :class="[
              'border-t border-line',
              store.isLibraryBusy
                ? 'cursor-default'
                : 'cursor-pointer hover:bg-panel2',
            ]"
            :title="store.isLibraryBusy ? '' : `Open “${row.name}”`"
            @click="emit('open', row.name)"
          >
            <td class="px-3 py-2 whitespace-nowrap">
              <span class="inline-flex gap-0.5">
                <span
                  v-for="card of sortedBoard(row.board)"
                  :key="card"
                  :class="[
                    'flex items-center justify-center w-5 h-6 rounded text-xs font-bold text-white',
                    suitBgClasses[card & 3],
                  ]"
                >
                  {{ cardText(card).rank }}
                </span>
              </span>
            </td>
            <td class="px-3 py-2 text-muted whitespace-nowrap">
              {{ row.texture }}
              <span
                v-if="!row.inAverage"
                class="ml-1 text-xs"
                title="Not in the subset the average uses (solved by hand or in another subset)"
                >· not in average</span
              >
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              {{ advantageText(row.buckets, 1) }}
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              {{ advantageText(row.buckets, 2) }}
            </td>
            <td class="px-3 py-2">
              <div
                v-if="row.strategy"
                class="w-40 h-3 rounded-sm"
                :style="{ backgroundImage: bar(row.strategy) }"
              ></div>
              <span v-else class="text-muted">—</span>
            </td>
            <td
              v-for="cell in valueCells(row)"
              :key="cell.key"
              :class="[
                'px-3 py-2 whitespace-nowrap',
                cell.numeric ? 'text-right' : '',
              ]"
              :style="cellStyle(cell)"
            >
              {{ cell.text }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useStore } from "../../store";
import * as invokes from "../../invokes";
import { cardText, suitBgClasses, toFixed1, toFixed2 } from "../../utils";
import { stackedGradient } from "../../action-colors";
import { themeColor } from "../../theme";
import { toSpotActions } from "../../nav-spots";
import { matchesTexture, TextureFilter } from "../../flop-texture";
import {
  CbetBy,
  actionLabel,
  advantageText,
  averageRow,
  buildReport,
  ChartMetric,
  configKey,
  defaultCbetBy,
  reportActions,
  reportCsv,
  sortReportRows,
} from "../../flop-report";
import UiButton from "../ui/UiButton.vue";
import UiSegmented from "../ui/UiSegmented.vue";
import NodeStrategyCards from "../results/NodeStrategyCards.vue";
import FlopReportChart from "./FlopReportChart.vue";

// The flop report of the spot of `source`: every library solution with the same
// configuration, one row per flop (see flop-report.ts).

const props = defineProps<{
  entries: invokes.LibraryEntry[];
  source: invokes.LibraryEntry & { meta: invokes.SolutionMeta };
  /** Progress of a solution being opened from the report (by the Library page). */
  loadingText: string;
}>();

const emit = defineEmits<{
  (event: "back"): void;
  (event: "open", name: string): void;
  (event: "refresh"): void;
}>();

const store = useStore();

const TEXTURES: { value: TextureFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "rainbow", label: "Rainbow" },
  { value: "two-tone", label: "Two-tone" },
  { value: "monotone", label: "Monotone" },
  { value: "paired", label: "Paired" },
  { value: "high", label: "High" },
  { value: "middle", label: "Middle" },
  { value: "low", label: "Low" },
  { value: "connected", label: "Connected" },
];

const key = configKey(props.source.meta);
const cbetBy = ref<CbetBy>(defaultCbetBy(props.source.meta));
const texture = ref<TextureFilter>("all");
const sortKey = ref("flop");
const descending = ref(true);
const errorText = ref("");
const busyText = ref("");

const report = computed(() => buildReport(props.entries, key, cbetBy.value));
const rows = computed(() => report.value.rows);
const subset = computed(() => report.value.subset);
// Another node has other action columns: back to the flop order.
watch(cbetBy, () => {
  sortKey.value = "flop";
  descending.value = true;
});
const isUpdating = ref(false);
const view = ref<"table" | "chart">("table");
const metric = ref<ChartMetric>("strategy");
const chartPlayer = ref(cbetBy.value === "ip" ? 1 : 0);
const filtered = computed(() =>
  rows.value.filter((r) => matchesTexture(r.board, texture.value))
);
const shown = computed(() =>
  sortReportRows(filtered.value, sortKey.value, descending.value)
);
const actions = computed(() => reportActions(rows.value));
// The average of the rows shown (texture filter applied).
const average = computed(() => averageRow(filtered.value));
/** Rows of older saves, without the strategy or the equity tranches. */
const missingCount = computed(
  () => rows.value.filter((r) => r.isOlderSave).length
);

type Column = { key: string; label: string; numeric?: boolean; title?: string };
const columns = computed<Column[]>(() => [
  { key: "flop", label: "Flop" },
  { key: "texture", label: "Texture" },
  {
    key: "nut",
    label: "Nut adv.",
    title: "Who holds more of the hands with 90%+ equity, by how many points",
  },
  {
    key: "best",
    label: "Best hands",
    title: "Who holds more of the hands with 75%+ equity, by how many points",
  },
  { key: "strategy", label: "Strategy" },
  ...actions.value.map((a) => ({
    key: a,
    label: actionLabel(a),
    numeric: true,
  })),
  ...(["EV", "EQ", "EQR"] as const).flatMap((name) =>
    (["OOP", "IP"] as const).map((who, p) => ({
      key: `${name.toLowerCase()}${p}`,
      label: `${name} ${who}`,
      numeric: true,
      title: `${who}'s ${name === "EQ" ? "equity" : name} at the root`,
    }))
  ),
]);

type Values = Pick<
  ReturnType<typeof averageRow>,
  "strategy" | "equity" | "ev" | "eqr" | "buckets"
>;
type Cell = {
  key: string;
  text: string;
  numeric?: boolean;
  /** A bar filling `ratio` of the cell, in `color`. */
  fill?: { ratio: number; color: string };
};

/** The cells after the strategy bar: actions, then EV, EQ, EQR (OOP then IP). */
const valueCells = (v: Values): Cell[] => {
  const playerColor = (p: number) => themeColor(p === 0 ? "oop" : "ip");
  return [
    ...actions.value.map((a) => {
      const frequency = v.strategy ? (v.strategy[a] ?? 0) : null;
      return {
        key: a,
        text: frequency === null ? "—" : percent(frequency),
        numeric: true,
        fill:
          frequency === null
            ? undefined
            : { ratio: frequency, color: colors.value[a] },
      };
    }),
    ...[0, 1].map((p) => ({
      key: `ev${p}`,
      text: evText(v.ev[p]),
      numeric: true,
    })),
    ...[0, 1].map((p) => ({
      key: `eq${p}`,
      text: percent(v.equity[p]),
      numeric: true,
      fill: { ratio: v.equity[p], color: playerColor(p) },
    })),
    ...[0, 1].map((p) => ({
      key: `eqr${p}`,
      text: percent(v.eqr[p]),
      numeric: true,
      // 200% fills the cell.
      fill: { ratio: v.eqr[p] / 2, color: playerColor(p) },
    })),
  ];
};

/** The average strategy as the action cards of the results. */
const averageItems = computed(() => {
  const strategy = average.value.strategy;
  if (!strategy || shown.value.length === 0) return null;
  return actions.value.map((a) => {
    const [name, amount] = a.split(":");
    return {
      name,
      amount: amount ?? "0",
      color: colors.value[a],
      frequency: strategy[a] ?? 0,
    };
  });
});

const cellStyle = (cell: Cell) => {
  if (!cell.fill || !isFinite(cell.fill.ratio)) return {};
  const width = Math.min(Math.max(cell.fill.ratio, 0), 1) * 100;
  const color = cell.fill.color;
  // A thin line under the value, its length the value.
  return {
    backgroundImage: `linear-gradient(${color}, ${color})`,
    // The bar spans the text area (the cell less its 0.75rem side paddings).
    backgroundSize: `calc((100% - 1.5rem) * ${width / 100}) 3px`,
    backgroundPosition: "right 0.75rem bottom 4px",
    backgroundRepeat: "no-repeat",
  };
};

/** The columns the chart can be sorted by (all sortable ones). */
const sortColumns = computed(() =>
  columns.value.filter((c) => c.key !== "strategy")
);

/** Same column: reverse; new column: descending, except flop and texture. */
const sortBy = (column: string) => {
  if (sortKey.value === column) {
    descending.value = !descending.value;
  } else {
    sortKey.value = column;
    descending.value = column !== "texture";
  }
};

// Colors of the actions, as in the results (fold, check and call first, bets by amount).
const colors = computed(() =>
  Object.fromEntries(
    toSpotActions(actions.value).map((a, i) => [actions.value[i], a.color])
  )
);
const bar = (strategy: Record<string, number>) =>
  stackedGradient(
    actions.value.map((a) => strategy[a] ?? 0),
    actions.value.map((a) => colors.value[a]),
    "right"
  );

const percent = (value: number | undefined) =>
  value === undefined || isNaN(value) ? "—" : toFixed1(value * 100) + "%";
const evText = (value: number) => (isNaN(value) ? "—" : toFixed2(value));
const sortedBoard = (board: number[]) => [...board].sort((a, b) => b - a);

const exportCsv = async () => {
  const path = await save({
    defaultPath: "flop report.csv",
    filters: [{ name: "CSV Files", extensions: ["csv"] }],
  });
  if (!path) return;
  try {
    await writeTextFile(path, reportCsv(shown.value, actions.value));
  } catch (e) {
    errorText.value = `Export failed: ${e}`;
  }
};

/**
 * Reloads the older saves one at a time to add what the report needs. The library is busy
 * meanwhile: no other operation rewrites a file being updated.
 */
const updateOlder = async () => {
  if (store.isLibraryBusy) return;
  const names = rows.value.filter((r) => r.isOlderSave).map((r) => r.name);
  store.isLibraryBusy = true;
  isUpdating.value = true;
  errorText.value = "";
  const failed: string[] = [];
  try {
    for (const [i, name] of names.entries()) {
      busyText.value = `Updating “${name}” (${i + 1}/${names.length})…`;
      try {
        await invokes.libraryRefreshSummary(name);
      } catch (e) {
        failed.push(`${name}: ${e}`);
      }
    }
  } finally {
    store.isLibraryBusy = false;
    isUpdating.value = false;
    busyText.value = "";
    emit("refresh");
  }
  if (failed.length > 0) {
    errorText.value = `Not updated: ${failed.join("; ")}`;
  }
};
</script>
