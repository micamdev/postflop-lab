<template>
  <div class="flex flex-col min-h-0 text-sm tabular-nums">
    <div class="flex shrink-0 items-center h-11 px-3 border-b border-line">
      <span class="text-[11px] font-bold tracking-wider text-muted">
        BREAKDOWN
      </span>
      <div class="flex-1" />
      <UiButton v-if="isFilterActive(filter)" size="sm" @click="emit('clear')">
        Clear
      </UiButton>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto">
      <table class="w-full">
        <thead class="sticky top-0 z-10 bg-panel2">
          <tr class="text-left text-xs text-muted">
            <th class="px-3 py-1.5 font-semibold">Category</th>
            <th v-if="actions" class="px-2 py-1.5 font-semibold">Strategy</th>
            <th class="px-2 py-1.5 font-semibold text-right">Range</th>
            <th class="px-2 py-1.5 font-semibold text-right">Combos</th>
            <th class="px-2 py-1.5 font-semibold text-right">EQ</th>
            <th class="px-3 py-1.5 font-semibold text-right">EV</th>
          </tr>
        </thead>
        <tbody v-for="group in shownGroups" :key="group.key">
          <tr>
            <td
              :colspan="actions ? 6 : 5"
              class="px-3 pt-3 pb-1 border-b border-line"
            >
              <div class="flex items-center gap-3">
                <span class="text-[11px] font-bold tracking-wider text-muted">
                  {{ group.label }}
                </span>
                <UiSegmented
                  v-if="group.key === 'equity'"
                  :model-value="advanced ? 'advanced' : 'simple'"
                  :options="[
                    { value: 'simple', label: 'Simple' },
                    { value: 'advanced', label: 'Advanced' },
                  ]"
                  @update:model-value="
                    (value) => emit('update:advanced', value === 'advanced')
                  "
                />
              </div>
            </td>
          </tr>
          <tr
            v-for="row in group.rows"
            :key="row.name"
            :class="[
              'cursor-pointer select-none border-b border-line/50',
              isSelected(row) ? 'bg-accent/15' : 'hover:bg-panel2',
            ]"
            :aria-selected="isSelected(row)"
            @click="emit('toggle', row.group, row.name)"
          >
            <td class="px-3 py-1 whitespace-nowrap">{{ row.name }}</td>
            <td v-if="actions" class="px-2 py-1 w-[30%]">
              <div
                v-if="row.strategy"
                class="flex h-2.5 w-full rounded-sm overflow-hidden"
              >
                <div
                  v-for="(frequency, i) in row.strategy"
                  :key="i"
                  :style="{
                    width: `${frequency * 100}%`,
                    backgroundColor: actions[i]?.color,
                  }"
                />
              </div>
            </td>
            <td class="px-2 py-1 text-right">
              {{ (row.rangeShare * 100).toFixed(1) }}%
            </td>
            <td class="px-2 py-1 text-right">{{ row.combos.toFixed(1) }}</td>
            <td class="px-2 py-1 text-right">
              {{
                Number.isNaN(row.equity)
                  ? "-"
                  : (row.equity * 100).toFixed(1) + "%"
              }}
            </td>
            <td class="px-3 py-1 text-right">
              {{ Number.isNaN(row.ev) ? "-" : row.ev.toFixed(2) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  BreakdownFilter,
  BreakdownGroup,
  BreakdownRow,
  isFilterActive,
} from "../../breakdown";
import UiButton from "../ui/UiButton.vue";
import UiSegmented from "../ui/UiSegmented.vue";

const props = defineProps<{
  rows: BreakdownRow[];
  /** Actions of the acting player (colours of the strategy bars), or null to hide them. */
  actions: { name: string; amount: string; color: string }[] | null;
  filter: BreakdownFilter;
  advanced: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle", group: BreakdownGroup, name: string): void;
  (e: "clear"): void;
  (e: "update:advanced", value: boolean): void;
}>();

const shownGroups = computed(() => {
  const of = (group: BreakdownGroup) =>
    props.rows.filter((row) => row.group === group);
  return [
    { key: "hands", label: "HANDS", rows: of("hands") },
    { key: "draws", label: "DRAWS", rows: of("draws") },
    {
      key: "equity",
      label: "EQ BUCKETS",
      rows: of(props.advanced ? "ranges" : "buckets"),
    },
  ].filter((group) => group.rows.length > 0);
});

const isSelected = (row: BreakdownRow) =>
  props.filter[row.group]?.includes(row.name) ?? false;
</script>
