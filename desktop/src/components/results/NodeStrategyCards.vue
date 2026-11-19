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
          :class="[
            'flex-1 min-w-[96px] px-2.5 py-1.5 rounded-md tabular-nums',
            isPlayed(item) ? 'text-white' : 'text-white/60',
          ]"
          :style="{ backgroundColor: cardColor(item) }"
        >
          <div class="text-xs truncate opacity-90" :title="label(item)">
            {{ label(item) }}
          </div>
          <div class="text-lg font-semibold leading-tight">
            {{ (item.frequency * 100).toFixed(1) }}%
          </div>
          <div
            v-if="item.combos !== undefined"
            class="text-[11px] whitespace-nowrap truncate opacity-75"
          >
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
import { actionText } from "../../nav-spots";

defineProps<{ items: StrategyItem[] | null; noHands: boolean }>();

/** Actions taken at least once in 1000 get a filled card; the others stay discreet. */
const isPlayed = (item: StrategyItem) => item.frequency >= 0.0005;

/** Filled in the action colour; a pale fill for actions not taken (0%). */
const cardColor = (item: StrategyItem) =>
  isPlayed(item)
    ? `color-mix(in srgb, ${item.color} 82%, black)`
    : `color-mix(in srgb, ${item.color} 22%, rgb(var(--panel2)))`;

const label = actionText;
</script>
