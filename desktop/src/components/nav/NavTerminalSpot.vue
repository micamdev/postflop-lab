<template>
  <div
    :class="
      'px-1 pt-0.5 pb-1 text-[11px] font-bold tracking-wider text-muted group-hover:opacity-100 ' +
      (isSelected ? '' : 'opacity-70')
    "
  >
    {{ spot.player.toUpperCase() }}
  </div>
  <div
    :class="
      'flex flex-col flex-grow items-center justify-evenly text-sm group-hover:opacity-100 ' +
      (isSelected ? '' : 'opacity-70')
    "
  >
    <div v-if="spot.equityOop === 0 || spot.equityOop === 1" class="px-3">
      {{ ["IP", "OOP"][spot.equityOop] }} Wins
    </div>
    <div v-else-if="spot.equityOop !== -1" class="px-1.5">
      <div class="mb-0.5">Equity</div>
      <div class="flex w-full px-1.5">
        <span>OOP</span>
        <span class="ml-auto pl-2">
          {{ (spot.equityOop * 100).toFixed(1) }}%
        </span>
      </div>
      <div class="flex w-full px-1.5">
        <span>IP</span>
        <span class="ml-auto pl-2">
          {{ ((1 - spot.equityOop) * 100).toFixed(1) }}%
        </span>
      </div>
    </div>
    <div class="px-3">Pot {{ spot.pot }}</div>
  </div>
</template>

<script setup lang="ts">
import type { SpotTerminal } from "../../result-types";

// The end of a line: who wins, or the equity at showdown, and the pot.

defineProps<{ spot: SpotTerminal; isSelected: boolean }>();
</script>
