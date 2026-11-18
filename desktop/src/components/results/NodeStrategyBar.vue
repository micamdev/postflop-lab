<template>
  <div
    v-if="items"
    class="flex shrink-0 h-[22px] mx-3 my-2 rounded-md overflow-hidden"
    aria-label="Strategy at this node"
  >
    <div
      v-for="item in items"
      :key="item.name + item.amount"
      class="flex items-center min-w-0 overflow-hidden whitespace-nowrap text-[11px] font-semibold text-white"
      :style="{
        width: `${item.frequency * 100}%`,
        backgroundColor: item.color,
      }"
      :title="`${label(item)} ${(item.frequency * 100).toFixed(1)}%`"
    >
      <span v-if="item.frequency >= 0.08" class="px-2 truncate">
        {{ label(item) }} {{ (item.frequency * 100).toFixed(1) }}%
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StrategyItem } from "../../node-strategy";

defineProps<{ items: StrategyItem[] | null }>();

const label = (item: StrategyItem) =>
  item.amount === "0" ? item.name : `${item.name} ${item.amount}`;
</script>
