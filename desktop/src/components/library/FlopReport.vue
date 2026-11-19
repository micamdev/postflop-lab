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
    <FlopReportTable
      v-else
      :rows="shown"
      :average="average"
      :subset="subset"
      :actions="actions"
      :colors="colors"
      :sort-key="sortKey"
      :descending="descending"
      @sort="sortBy"
      @open="emit('open', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useStore } from "../../store";
import * as invokes from "../../invokes";
import { potPercent, toSpotActions } from "../../nav-spots";
import { matchesTexture, TextureFilter } from "../../flop-texture";
import {
  CbetBy,
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
import FlopReportTable from "./FlopReportTable.vue";
import { reportColumns } from "../../flop-report-columns";

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

/** The average strategy as the action cards of the results. */
const averageItems = computed(() => {
  const strategy = average.value.strategy;
  if (!strategy || shown.value.length === 0) return null;
  return actions.value.map((a) => {
    const [name, amount] = a.split(":");
    return {
      name,
      amount: amount ?? "0",
      // The c-bet node: the spot's starting pot, no bet yet.
      percent: potPercent(name, amount ?? "0", {
        pot: Number(props.source.meta.tree_config.startingPot) || 0,
        bet: 0,
      }),
      color: colors.value[a],
      frequency: strategy[a] ?? 0,
    };
  });
});

/** The columns the chart can be sorted by (all sortable ones). */
const sortColumns = computed(() =>
  reportColumns(actions.value).filter((c) => c.key !== "strategy")
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
