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
          title="The same flop (up to the suits) solved more than once: one is shown, from a batch if any, else the most recent"
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

    <p v-if="shown.length === 0" class="mt-6 text-muted">
      No flop of this spot matches.
    </p>

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
              {{
                hasBatch
                  ? "batch flops, weighted by frequency"
                  : "weighted by frequency"
              }}
            </td>
            <td class="px-3 py-2">
              <div
                v-if="average.strategy"
                class="w-40 h-3 rounded-sm"
                :style="{ backgroundImage: bar(average.strategy) }"
              ></div>
            </td>
            <td
              v-for="action in actions"
              :key="action"
              class="px-3 py-2 text-right"
            >
              {{ percent(average.strategy?.[action]) }}
            </td>
            <td class="px-3 py-2 text-right">{{ percent(average.equity) }}</td>
            <td class="px-3 py-2 text-right">{{ evText(average.ev) }}</td>
            <td class="px-3 py-2">{{ advantageText(average.buckets, 1) }}</td>
            <td class="px-3 py-2">{{ advantageText(average.buckets, 2) }}</td>
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
                title="Solved by hand: the average uses the batch flops, whose weights stand for all flops"
                >· not in average</span
              >
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
              v-for="action in actions"
              :key="action"
              class="px-3 py-2 text-right"
            >
              {{ row.strategy ? percent(row.strategy[action] ?? 0) : "—" }}
            </td>
            <td class="px-3 py-2 text-right">{{ percent(row.equity) }}</td>
            <td class="px-3 py-2 text-right">{{ evText(row.ev) }}</td>
            <td class="px-3 py-2">{{ advantageText(row.buckets, 1) }}</td>
            <td class="px-3 py-2">{{ advantageText(row.buckets, 2) }}</td>
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
import { cardText, suitBgClasses } from "../../utils";
import { stackedGradient } from "../../action-colors";
import { toSpotActions } from "../../nav-spots";
import { matchesTexture, TextureFilter } from "../../flop-texture";
import {
  CbetBy,
  actionLabel,
  advantageText,
  averageRow,
  buildReport,
  configKey,
  defaultCbetBy,
  reportActions,
  reportCsv,
  sortReportRows,
} from "../../flop-report";
import UiButton from "../ui/UiButton.vue";
import UiSegmented from "../ui/UiSegmented.vue";

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
const hasBatch = computed(() => rows.value.some((r) => r.isBatch));
// Another node has other action columns: back to the flop order.
watch(cbetBy, () => {
  sortKey.value = "flop";
  descending.value = true;
});
const isUpdating = ref(false);
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

const player = computed(() => (cbetBy.value === "ip" ? "IP" : "OOP"));
type Column = { key: string; label: string; numeric?: boolean; title?: string };
const columns = computed<Column[]>(() => [
  { key: "flop", label: "Flop" },
  { key: "texture", label: "Texture" },
  { key: "strategy", label: "Strategy" },
  ...actions.value.map((a) => ({
    key: a,
    label: actionLabel(a),
    numeric: true,
  })),
  {
    key: "equity",
    label: `EQ ${player.value}`,
    numeric: true,
    title: "Equity of the c-bettor at the root",
  },
  {
    key: "ev",
    label: `EV ${player.value}`,
    numeric: true,
    title: "EV of the c-bettor at the root",
  },
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
]);

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
  value === undefined || isNaN(value) ? "—" : (value * 100).toFixed(1) + "%";
const evText = (value: number) => (isNaN(value) ? "—" : value.toFixed(2));
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
      busyText.value = `Updating “${name}” (${i + 1}/${names.length})...`;
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
