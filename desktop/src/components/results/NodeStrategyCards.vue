<template>
  <div
    v-if="noHands || items"
    class="shrink-0 p-2 border-b border-line"
    aria-label="Strategy at this node"
  >
    <p v-if="noHands" class="px-1 text-xs text-muted">
      No hands for this player at this node.
    </p>
    <template v-else-if="items">
      <div class="flex flex-wrap gap-1.5">
        <div
          v-for="item in items"
          :key="item.name + item.amount"
          class="flex-1 min-w-[96px] px-2.5 py-1.5 rounded-md bg-panel2 border-l-[3px] tabular-nums"
          :style="{ borderLeftColor: item.color }"
        >
          <div class="text-xs text-muted truncate">{{ label(item) }}</div>
          <div class="text-lg font-semibold leading-tight">
            {{ (item.frequency * 100).toFixed(1) }}%
          </div>
          <div class="text-[11px] text-muted">
            {{ item.combos.toFixed(1) }} combos
          </div>
        </div>
      </div>
      <div class="flex h-1 w-full mt-2 rounded-full overflow-hidden">
        <div
          v-for="item in items"
          :key="item.name + item.amount"
          :style="{
            width: `${item.frequency * 100}%`,
            backgroundColor: item.color,
          }"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { StrategyItem } from "../../node-strategy";

defineProps<{ items: StrategyItem[] | null; noHands: boolean }>();

const label = (item: StrategyItem) =>
  item.amount === "0" ? item.name : `${item.name} ${item.amount}`;
</script>
