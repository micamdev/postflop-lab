<template>
  <div
    class="flex-1 min-h-0 overflow-auto rounded-lg border border-line bg-panel"
  >
    <table class="w-full text-sm tabular-nums">
      <thead class="sticky top-0 z-10 bg-panel2">
        <tr class="text-left text-xs text-muted">
          <th
            v-for="column in columns"
            :key="column.key"
            scope="col"
            :aria-sort="
              sortKey === column.key
                ? descending
                  ? 'descending'
                  : 'ascending'
                : undefined
            "
            :class="[
              'px-3 py-2 font-semibold whitespace-nowrap select-none',
              column.numeric ? 'text-right' : '',
            ]"
            :title="column.title"
          >
            <span v-if="column.key === 'strategy'">{{ column.label }}</span>
            <!-- A button: sortable with the keyboard too. -->
            <button
              v-else
              type="button"
              class="font-semibold rounded-sm hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              @click="emit('sort', column.key)"
            >
              {{ column.label }}
              <span v-if="sortKey === column.key" aria-hidden="true">{{
                descending ? "▼" : "▲"
              }}</span>
            </button>
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
            v-for="cell in cells(average)"
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
          v-for="row of rows"
          :key="row.name"
          :class="[
            'border-t border-line',
            store.isLibraryBusy
              ? 'cursor-default'
              : 'cursor-pointer hover:bg-panel2',
          ]"
          :title="store.isLibraryBusy ? '' : `Open “${row.name}”`"
          :tabindex="store.isLibraryBusy ? -1 : 0"
          class="focus-visible:outline-none focus-visible:bg-panel2 focus-visible:shadow-[inset_2px_0_0_rgb(var(--accent))]"
          @click="emit('open', row.name)"
          @keydown.enter="emit('open', row.name)"
        >
          <td class="px-3 py-2 whitespace-nowrap">
            <BoardChips :board="row.board" sorted />
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
            v-for="cell in cells(row)"
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
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "../../store";
import { stackedGradient } from "../../action-colors";
import { themeColor } from "../../theme";
import { advantageText, type ReportRow } from "../../flop-report";
import {
  type Cell,
  type Values,
  reportColumns,
  valueCells,
} from "../../flop-report-columns";
import BoardChips from "../ui/BoardChips.vue";

// The flop report's table: the average, then one row per flop (click or Enter opens it).

const props = defineProps<{
  rows: ReportRow[];
  average: Values;
  subset: { size: number; solved: number } | null;
  actions: string[];
  colors: Record<string, string>;
  sortKey: string;
  descending: boolean;
}>();

const emit = defineEmits<{
  (event: "sort", column: string): void;
  (event: "open", name: string): void;
}>();

const store = useStore();

const columns = computed(() => reportColumns(props.actions));

const cells = (v: Values) =>
  valueCells(v, props.actions, props.colors, [
    themeColor("oop"),
    themeColor("ip"),
  ]);

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

const bar = (strategy: Record<string, number>) =>
  stackedGradient(
    props.actions.map((a) => strategy[a] ?? 0),
    props.actions.map((a) => props.colors[a]),
    "right"
  );
</script>
