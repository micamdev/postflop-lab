<template>
  <div
    :class="
      'px-1 pt-0.5 pb-1 text-[11px] font-bold tracking-wider text-muted group-hover:opacity-100 ' +
      (isSelected ? '' : 'opacity-70')
    "
  >
    {{ spot.player.toUpperCase() }}
  </div>
  <div class="flex-grow overflow-y-auto">
    <button
      v-for="action of spot.actions"
      :key="action.index"
      :class="
        'flex items-center w-full gap-1.5 px-1.5 py-px rounded-md text-sm transition-colors hover:bg-panel2 ' +
        (action.isSelected ? 'bg-panel2 ' : '')
      "
      @click.stop="emit('play', action.index)"
    >
      <span
        class="shrink-0 w-2 h-2 rounded-full"
        :style="{ backgroundColor: action.color }"
      ></span>
      <span
        :class="
          'pr-0.5 font-medium group-hover:opacity-100 ' +
          (action.isSelected || isSelected ? '' : 'opacity-70')
        "
      >
        {{ action.name }}
        {{ action.amount === "0" ? "" : action.amount }}
      </span>
      <span
        v-if="isSelected && rates != null"
        class="ml-auto pl-2 text-xs text-muted tabular-nums group-hover:opacity-100"
      >
        {{ (rates[action.index] * 100).toFixed(1) }}%
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { SpotPlayer } from "../../result-types";

// The actions of a player spot, with their frequencies once selected.

defineProps<{
  spot: SpotPlayer;
  isSelected: boolean;
  /** Frequency of each action, shown on the selected spot. */
  rates: number[] | null;
}>();

const emit = defineEmits<{ (event: "play", actionIndex: number): void }>();
</script>
