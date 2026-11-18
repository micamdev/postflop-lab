<template>
  <div
    class="flex flex-col w-full bg-panel border-l border-line overflow-x-auto"
  >
    <slot name="top" />
    <div class="flex shrink-0 h-11 border-b border-line">
      <div
        class="flex h-full px-3 items-center text-[11px] font-bold tracking-wider text-muted"
      >
        SUMMARY
      </div>

      <div class="flex h-full ml-auto pr-3 items-center gap-3 snug">
        <div class="flex items-center gap-1.5">
          <div class="text-xs text-muted">Bars</div>
          <select
            v-model="displayOptions.barWidth"
            class="ui-input w-28 py-0 cursor-pointer"
            @change="updateDisplayOptions"
          >
            <option value="normalized">Normalized</option>
            <option v-if="tableMode !== 'chance'" value="absolute">
              Absolute
            </option>
            <option value="full">Full</option>
          </select>
        </div>

        <div v-if="tableMode !== 'chance'" class="flex items-center gap-1.5">
          <div class="text-xs text-muted">Show</div>
          <select
            v-model="(displayOptions as DisplayOptionsBasics).content"
            class="ui-input w-28 py-0 cursor-pointer"
            @change="updateDisplayOptions"
          >
            <option value="percentage">Action %</option>
            <option value="ev">Action EV</option>
          </select>
        </div>

        <Tippy content="Export summary to CSV file">
          <button
            :class="
              'flex w-8 h-8 items-center justify-center border border-line text-muted ' +
              'rounded-md transition-colors hover:text-ink hover:bg-panel2'
            "
            @click="exportSummary"
          >
            <ArrowTopRightOnSquareIcon class="w-5 h-5" />
          </button>
        </Tippy>
      </div>
    </div>

    <div
      ref="tableDiv"
      class="flex-grow overflow-y-scroll will-change-scroll"
      @scroll.passive="onTableScroll"
    >
      <table class="w-full h-full text-sm text-center align-middle">
        <thead class="sticky top-0 z-30 bg-panel2 shadow shadow-black/30">
          <tr style="height: calc(1.9rem + 1px)">
            <th
              v-for="column in columns"
              :key="column.label"
              scope="col"
              :class="
                'whitespace-nowrap select-none ' +
                (column.type === 'card'
                  ? 'sticky left-0 z-40 bg-panel2 '
                  : '') +
                (column.type !== 'bar' ? 'cursor-pointer ' : '') +
                (tableMode === 'chance' ? 'header-divider' : '')
              "
              :style="{
                'min-width':
                  (column.type === 'card'
                    ? '4'
                    : column.type === 'bar'
                      ? '6'
                      : '3.5') + 'rem',
              }"
              @click="column.type !== 'bar' && sortBy(columnIndex(column))"
            >
              <span
                v-if="sortKey.key === columnIndex(column)"
                class="inline-block text-xs pr-1"
              >
                {{ sortKey.order === "asc" ? "▲" : "▼" }}
              </span>
              <span>{{ column.label }}</span>
            </th>
          </tr>

          <tr v-if="tableMode !== 'chance'" style="height: calc(1.9rem + 1px)">
            <th
              v-for="column in columns"
              :key="column.label"
              scope="col"
              :class="
                'header-divider ' +
                (column.type === 'card'
                  ? 'sticky left-0 z-40 underline bg-panel2 '
                  : 'relative ') +
                (column.type === 'bar'
                  ? 'pt-[0.3125rem] pb-1 px-1'
                  : 'cursor-pointer')
              "
              :style="{
                height: column.type === 'bar' ? 'calc(1.9rem + 1px)' : 'auto',
              }"
              @click="column.type !== 'bar' && sortBy(columnIndex(column))"
            >
              <template v-if="column.type === 'card'">
                <span>{{ hoverContent?.name ?? "Total" }}</span>
              </template>

              <template v-else-if="column.type === 'bar'">
                <div
                  v-if="summary && column.label === 'Strategy'"
                  class="w-full h-full bg-cell bg-left bg-no-repeat"
                  :style="{
                    'background-image': strategyBarBgImage(summary),
                  }"
                ></div>
              </template>

              <template
                v-else-if="
                  summary == null || isNaN(summary[columnIndex(column)])
                "
              >
                <span>-</span>
              </template>

              <template v-else>
                <div class="inline-block w-12 text-right">
                  <span
                    v-if="column.type === 'weight'"
                    :data-set="
                      strTmp = toFixedAdaptive(summary[columnIndex(column)])
                    "
                  >
                    <span>{{ strTmp.slice(0, strTmp.indexOf(".") + 1) }}</span>
                    <span class="text-xs">{{
                      strTmp.slice(strTmp.indexOf(".") + 1)
                    }}</span>
                  </span>
                  <span
                    v-else-if="
                      column.type === 'percentage' || column.type === 'action'
                    "
                    :data-set="
                      strTmp = toFixed1(summary[columnIndex(column)] * 100)
                    "
                  >
                    <span>{{ strTmp.slice(0, -1) }}</span>
                    <span class="text-xs">{{ strTmp.slice(-1) }}%</span>
                  </span>
                  <span
                    v-else-if="column.type === 'action-ev'"
                    :data-set="
                      strTmp = toFixed1(summary[columnIndex(column) - 1] * 100)
                    "
                  >
                    <!-- Total row: how often the action is taken. -->
                    <span>{{ strTmp.slice(0, -1) }}</span>
                    <span class="text-xs">{{ strTmp.slice(-1) }}%</span>
                  </span>
                  <span
                    v-else-if="column.type === 'ev'"
                    :data-set="
                      strTmp = toFixed[evDigits - 1](
                        summary[columnIndex(column)]
                      )
                    "
                  >
                    <span>{{ strTmp.slice(0, -evDigits) }}</span>
                    <span class="text-xs">{{ strTmp.slice(-evDigits) }}</span>
                  </span>
                </div>
              </template>

              <div
                v-if="
                  summary &&
                  (column.type === 'action' || column.type === 'action-ev')
                "
                class="absolute w-12 h-1 bottom-0 inset-x-0 mx-auto"
                :style="{
                  background: actionBarBg(column.index, summary),
                }"
              ></div>
            </th>
          </tr>
        </thead>

        <tbody>
          <!-- Top empty row -->
          <tr
            v-if="emptyBufferTop > 0"
            :style="{
              '--num-rows': emptyBufferTop,
              height: 'calc(var(--num-rows) * (1.9rem + 1px))',
            }"
          >
            <td :colspan="columns.length"></td>
          </tr>

          <!-- Body -->
          <tr
            v-for="item in resultsRendered"
            :key="item[0]"
            :class="
              'relative ' +
              (item[0] === scrollTarget ? 'bg-scroll-target' : 'bg-panel')
            "
            style="height: calc(1.9rem + 1px)"
          >
            <td
              v-for="column in columns"
              :key="column.label"
              :class="
                'row-divider ' +
                (column.type === 'card'
                  ? 'sticky left-0 z-10 ' +
                    (item[0] === scrollTarget ? 'bg-scroll-target ' : 'bg-panel ')
                  : 'relative ') +
                (column.type === 'bar' ? 'pt-[0.3125rem] pb-1 px-1' : 'pt-0.5')
              "
              :style="{
                height: column.type === 'bar' ? 'calc(1.9rem + 1px)' : 'auto',
              }"
            >
              <template v-if="column.type === 'card'">
                <span
                  v-for="card in pairText(item[columnIndex(column)])"
                  :key="card.rank + card.suit"
                  :class="card.colorClass"
                >
                  {{ card.rank + card.suit }}
                </span>
              </template>

              <template v-else-if="column.type === 'bar'">
                <div
                  class="w-full h-full bg-cell bg-left bg-no-repeat"
                  :style="{
                    'background-image': strategyBarBgImage(item),
                    'background-size': strategyBarBgSize(item),
                  }"
                ></div>
              </template>

              <template v-else-if="isNaN(item[columnIndex(column)])">
                <span>-</span>
              </template>

              <template v-else>
                <div class="inline-block w-12 text-right">
                  <span
                    v-if="tableMode === 'chance' && column.type === 'weight'"
                    :data-set="
                      strTmp = toFixedAdaptive(item[columnIndex(column)])
                    "
                  >
                    <span>{{ strTmp.slice(0, strTmp.indexOf(".") + 1) }}</span>
                    <span class="text-xs">{{
                      strTmp.slice(strTmp.indexOf(".") + 1)
                    }}</span>
                  </span>
                  <span
                    v-else-if="
                      column.type === 'weight' ||
                      column.type === 'percentage' ||
                      column.type === 'action'
                    "
                    :data-set="
                      strTmp = toFixed1(item[columnIndex(column)] * 100)
                    "
                  >
                    <span>{{ strTmp.slice(0, -1) }}</span>
                    <span class="text-xs">{{ strTmp.slice(-1) }}%</span>
                  </span>
                  <span
                    v-else-if="
                      column.type === 'ev' || column.type === 'action-ev'
                    "
                    :data-set="
                      strTmp = toFixed[evDigits - 1](item[columnIndex(column)])
                    "
                  >
                    <span>{{ strTmp.slice(0, -evDigits) }}</span>
                    <span class="text-xs">{{ strTmp.slice(-evDigits) }}</span>
                  </span>
                </div>
              </template>

              <div
                v-if="column.type === 'action' || column.type === 'action-ev'"
                class="absolute w-12 h-1 bottom-0 inset-x-0 mx-auto"
                :style="{
                  background: actionBarBg(column.index, item),
                }"
              ></div>
            </td>
          </tr>

          <!-- No results -->
          <tr v-if="resultsRendered.length === 0">
            <td
              class="relative bg-panel row-divider"
              style="height: calc(1.9rem + 1px)"
              :colspan="columns.length"
            >
              {{
                tableMode === "chance"
                  ? `${capitalize(chanceType)} reports not available`
                  : "No results"
              }}
            </td>
          </tr>

          <!-- Bottom empty row -->
          <tr
            v-if="emptyBufferBottom > 0"
            :style="{
              '--num-rows': emptyBufferBottom,
              height: 'calc(var(--num-rows) * (1.9rem + 1px))',
            }"
          >
            <td :colspan="columns.length" class="relative row-divider"></td>
          </tr>

          <!-- Spacer -->
          <tr>
            <td :colspan="columns.length" class="relative row-divider"></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { themeColor } from "../theme";
import { stackedGradient } from "../action-colors";
import { computed, reactive, ref, toRefs, watch } from "vue";

import {
  cardText,
  suitTextClasses,
  evDigitsFor,
  toFixed1,
  toFixed,
  toFixedAdaptive,
  capitalize,
} from "../utils";

import {
  Results,
  ChanceReports,
  Spot,
  SpotPlayer,
  contentGraphsList,
  HoverContent,
  TableMode,
} from "../result-types";

import {
  INDEX,
  chanceRows,
  columnIndex,
  handRows,
  sortRows,
  summaryCsv,
  summaryOf,
  tableColumns,
} from "../result-table-data";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

import { Tippy } from "vue-tippy";
import { ArrowTopRightOnSquareIcon } from "@heroicons/vue/24/solid";

const barWidthListBasics = ["normalized", "absolute", "full"] as const;
const contentListBasics = ["percentage", "ev"] as const;
type DisplayOptionsBasics = {
  barWidth: (typeof barWidthListBasics)[number];
  content: (typeof contentListBasics)[number];
};

const barWidthListChance = ["normalized", "full"] as const;
type DisplayOptionsChance = {
  barWidth: (typeof barWidthListChance)[number];
};

const weightColor = themeColor("weight");
const emptyColor = themeColor("cell");

interface Props {
  tableMode: TableMode;
  graphType?: (typeof contentGraphsList)[number];
  chanceType?: "turn" | "river";
  cards?: number[][] | null;
  selectedSpot: Spot;
  results?: Results | null;
  chanceReports?: ChanceReports | null;
  displayPlayer: "oop" | "ip";
  hoverContent?: HoverContent | null;
  scrollTarget?: number | null;
}

const props = withDefaults(defineProps<Props>(), {
  graphType: "eq",
  chanceType: "turn",
  cards: null,
  results: null,
  chanceReports: null,
  hoverContent: null,
  scrollTarget: null,
});

const displayOptions =
  props.tableMode !== "chance"
    ? reactive<DisplayOptionsBasics>({
        barWidth: "normalized",
        content: "percentage",
      })
    : reactive<DisplayOptionsChance>({
        barWidth: "normalized",
      });

const optionsStorageKey = `display-options-table-${props.tableMode}`;
const savedDisplayOptions = localStorage.getItem(optionsStorageKey);

if (savedDisplayOptions) {
  if (props.tableMode !== "chance") {
    const saved = JSON.parse(savedDisplayOptions) as DisplayOptionsBasics;
    const options = displayOptions as DisplayOptionsBasics;
    if (barWidthListBasics.includes(saved.barWidth)) {
      options.barWidth = saved.barWidth;
    }
    if (contentListBasics.includes(saved.content)) {
      options.content = saved.content;
    }
  } else {
    const saved = JSON.parse(savedDisplayOptions) as DisplayOptionsChance;
    const options = displayOptions as DisplayOptionsChance;
    if (barWidthListChance.includes(saved.barWidth)) {
      options.barWidth = saved.barWidth;
    }
  }
}

const updateDisplayOptions = () => {
  localStorage.setItem(optionsStorageKey, JSON.stringify(displayOptions));
};

const tableDiv = ref<HTMLDivElement | null>(null);
const tableHeight = ref(0);

const assignTableHeight = () => {
  if (tableDiv.value) {
    tableHeight.value = tableDiv.value.clientHeight;
  }
};

watch(tableDiv, assignTableHeight);
window.addEventListener("resize", assignTableHeight);

/** Cards of a hand (or a dealt card), with suit colours readable on the dark table. */
const pairText = (pair: number) => {
  const card1 = pair & 0xff;
  const card2 = pair >>> 8;
  const text = (card: number) => ({
    ...cardText(card),
    colorClass: suitTextClasses[card & 3],
  });
  return card2 !== 0xff ? [text(card2), text(card1)] : [text(card1)];
};

const defaultSortKey = computed(() => {
  if (props.tableMode !== "graphs") return INDEX.CARD_PAIR;
  if (props.graphType === "eq") return INDEX.EQUITY;
  if (props.graphType === "ev") return INDEX.EV;
  return INDEX.EQR;
});

type Key = { key: number; order: "asc" | "desc" };
const sortKey = ref<Key>({ key: defaultSortKey.value, order: "desc" });

const sortStorageKey = `sort-key-table-${props.tableMode}`;
const savedSortKey = sessionStorage.getItem(sortStorageKey);

if (savedSortKey) {
  const saved = JSON.parse(savedSortKey) as Key;
  if (saved.key < INDEX.STRATEGY_BASE) {
    sortKey.value = saved;
  }
}

const sortBy = (key: number) => {
  const order =
    key === sortKey.value.key && sortKey.value.order === "desc"
      ? "asc"
      : "desc";
  sortKey.value = { key, order };
  sessionStorage.setItem(sortStorageKey, JSON.stringify(sortKey.value));
};

const resetSortKey = () => {
  if (sortKey.value.key >= INDEX.STRATEGY_BASE) {
    sortBy(defaultSortKey.value);
  }
};

const { selectedSpot, displayPlayer } = toRefs(props);
watch([selectedSpot, displayPlayer], resetSortKey);

if (props.tableMode !== "chance") {
  watch(() => (displayOptions as DisplayOptionsBasics).content, resetSortKey);
}

if (props.tableMode === "graphs") {
  watch(defaultSortKey, (newValue, oldValue) => {
    if (sortKey.value.key === oldValue) {
      const order = sortKey.value.order;
      sortKey.value = { key: newValue, order };
      sessionStorage.setItem(sortStorageKey, JSON.stringify(sortKey.value));
    }
  });
}

// Undefined EVs (NaN) are ignored: one of them must not force 3 decimals.
const evDigits = computed(() => {
  const playerIndex = props.displayPlayer === "oop" ? 0 : 1;
  if (props.tableMode !== "chance") {
    const results = props.results;
    if (!results || results.isEmpty) return 3;
    return evDigitsFor(results.ev[playerIndex]);
  }
  const reports = props.chanceReports;
  if (!reports || reports.status.every((s) => s <= 1)) return 3;
  return evDigitsFor(reports.ev[playerIndex]);
});

const numActions = computed(() => {
  let data: Results | ChanceReports | null;
  if (props.tableMode !== "chance") {
    data = props.results;
  } else {
    data = props.chanceReports;
  }

  const spot = props.selectedSpot;
  return (
    (spot.type === "player" &&
      spot.player === props.displayPlayer &&
      data &&
      data.numActions) ||
    0
  );
});

/** Actions of the player shown, when it acts here. */
const shownActions = computed(() =>
  numActions.value > 0 ? (props.selectedSpot as SpotPlayer).actions : []
);

const columns = computed(() =>
  tableColumns(
    props.tableMode,
    props.chanceType,
    shownActions.value,
    props.tableMode !== "chance"
      ? (displayOptions as DisplayOptionsBasics).content
      : "percentage"
  )
);

const resultsFiltered = computed(() => {
  const player = props.displayPlayer === "oop" ? 0 : 1;
  if (props.tableMode === "chance") {
    const reports = props.chanceReports;
    return reports ? chanceRows(reports, player, numActions.value) : [];
  }
  const results = props.results;
  if (!results) return [];
  const cards =
    props.cards?.[player] ?? Array.from({ length: 52 }, (_, i) => 0xff00 + i);
  return handRows(
    results,
    cards,
    player,
    numActions.value,
    props.hoverContent?.indices ?? null
  );
});

const resultsSorted = computed(() =>
  sortRows(resultsFiltered.value, sortKey.value.key, sortKey.value.order)
);

const rem = Number(
  getComputedStyle(document.documentElement).fontSize.slice(0, -2)
);
const rowHeight = 1.9 * rem + 1;

const bufferUnit = 10;
const numDisplayedRows = computed(() =>
  Math.ceil(tableHeight.value / rowHeight)
);

const emptyBufferTop = ref(-2 * bufferUnit);
const emptyBufferBottom = computed(
  () =>
    resultsFiltered.value.length -
    (emptyBufferTop.value + numDisplayedRows.value + 4 * bufferUnit)
);

watch(resultsSorted, () => {
  if (!tableDiv.value) return;
  tableDiv.value.scrollTop = 0;
  emptyBufferTop.value = -2 * bufferUnit;
});

let ticking = false;

const onTableScroll = async () => {
  if (ticking) return;
  ticking = true;

  requestAnimationFrame(() => {
    ticking = false;
    if (!tableDiv.value) return;

    const { scrollTop } = tableDiv.value;
    const topIndex = Math.max(scrollTop / rowHeight, 0);
    if (topIndex < emptyBufferTop.value + bufferUnit) {
      emptyBufferTop.value =
        (Math.floor(topIndex / bufferUnit) - 1) * bufferUnit;
    } else if (topIndex > emptyBufferTop.value + 3 * bufferUnit) {
      emptyBufferTop.value =
        (Math.floor(topIndex / bufferUnit) - 2) * bufferUnit;
    }
  });
};

const resultsRendered = computed(() => {
  return resultsSorted.value.slice(
    Math.max(emptyBufferTop.value, 0),
    emptyBufferTop.value + numDisplayedRows.value + 4 * bufferUnit
  );
});

const { scrollTarget } = toRefs(props);
watch(scrollTarget, () => {
  if (!tableDiv.value || !scrollTarget.value) return;
  const scrollIndex = resultsSorted.value.findIndex(
    (row) => row[0] === scrollTarget.value
  );
  if (scrollIndex === -1) return;
  const scrollTop =
    scrollIndex * rowHeight - (tableHeight.value - 3 * rowHeight) / 2;
  tableDiv.value.scrollTop = Math.max(scrollTop, 0);
});

const summary = computed(() => {
  if (!props.results) return null;
  const player = props.displayPlayer === "oop" ? 0 : 1;
  return summaryOf(resultsFiltered.value, props.results.eqrBase[player]);
});

const actionColors = computed(() => {
  if (numActions.value === 0) return [];
  const spot = props.selectedSpot as SpotPlayer;
  return spot.actions.map((a) => a.color).reverse();
});

const maxWeight = computed(() => {
  return Math.max(...resultsFiltered.value.map((r) => r[INDEX.WEIGHT]));
});

const strategyBarBgImage = (row: number[]) => {
  if (!row || row.length === INDEX.STRATEGY_BASE) {
    return `linear-gradient(${weightColor} 0% 100%)`;
  }

  const frequencies = Array.from(
    { length: numActions.value },
    (_, i) => row[INDEX.STRATEGY_BASE + i * 2]
  );
  return stackedGradient(frequencies, actionColors.value, "right");
};

const strategyBarBgSize = (row: number[]) => {
  const weight = row[INDEX.WEIGHT];
  if (weight === 0) {
    return "0% 100%";
  } else if (displayOptions.barWidth === "normalized") {
    return `${(weight / maxWeight.value) * 100}% 100%`;
  } else if (displayOptions.barWidth === "absolute") {
    return `${weight * 100}% 100%`;
  } else {
    return "100% 100%";
  }
};

const actionBarBg = (index: number, row: number[]) => {
  const color = actionColors.value[index];
  const value = row[INDEX.STRATEGY_BASE + index * 2];
  return `linear-gradient(to right, ${color} 0% ${
    value * 100
  }%, ${emptyColor} ${value * 100}% 100%)`;
};

const exportSummary = async () => {
  const isChance = props.tableMode === "chance";
  if (isChance ? !props.chanceReports : !props.results) return;
  const csv = summaryCsv(
    props.tableMode,
    columns.value[0].label,
    resultsSorted.value,
    shownActions.value,
    !isChance && Boolean(props.results?.isEmpty)
  );
  const filePath = await save({
    defaultPath: "summary.csv",
    filters: [{ name: "CSV Files", extensions: ["csv"] }],
  });
  if (filePath) await writeTextFile(filePath, csv);
};

/* eslint-disable prefer-const */
let strTmp = "";
</script>

<style scoped>
.header-divider::before {
  content: "";
  @apply absolute left-0 -bottom-px w-full border-b border-line;
}

.row-divider::before {
  content: "";
  @apply absolute left-0 top-0 w-full border-t border-line;
}
</style>
