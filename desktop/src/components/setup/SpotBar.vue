<template>
  <!-- The spot the Setup comes from: its line, so the sizes the ranges assume stay in view. -->
  <div
    v-if="shown"
    class="flex items-center gap-3 min-w-0 px-3 py-2 rounded-lg bg-panel border border-line text-sm"
  >
    <span class="shrink-0 text-xs font-bold text-muted">SPOT</span>
    <span class="truncate font-semibold text-ink" :title="shown.name">
      {{ shown.name }}
    </span>
    <span class="truncate text-muted" :title="shown.line">{{
      shown.line
    }}</span>
    <span class="shrink-0 text-xs text-muted">
      OOP {{ shown.positions[0] }} · IP {{ shown.positions[1] }}
    </span>
    <span v-if="numbers" class="shrink-0 text-xs text-muted">
      Pot {{ numbers.pot }} · Stack {{ numbers.stack }}
    </span>
    <span v-if="shown.modified" class="shrink-0 text-xs text-ip"
      >(modified)</span
    >
    <div class="flex-1" />
    <button
      v-if="store.spot"
      type="button"
      class="shrink-0 w-6 h-6 rounded text-muted hover:text-ink hover:bg-panel2"
      title="Forget the spot (the ranges and numbers stay)"
      aria-label="Forget the spot"
      @click="store.spot = null"
    >
      ×
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useConfigStore, useStore } from "../../store";
import { isSpotModified, toBigBlinds } from "../../spot";

const store = useStore();
const config = useConfigStore();

/** The loaded spot, or else the spot of the solution loaded from the library. */
const shown = computed(() => {
  const spot = store.spot;
  if (spot) {
    return {
      name: spot.name,
      line: spot.value.line,
      positions: spot.value.positions,
      modified: isSpotModified(spot, config),
    };
  }
  return store.solutionInfo?.loaded ? store.solvedSpot : null;
});

/** Pot and stack of the loaded spot (a solution's are in its Setup already). */
const numbers = computed(() =>
  store.spot
    ? {
        pot: toBigBlinds(store.spot.value.startingPot),
        stack: toBigBlinds(store.spot.value.effectiveStack),
      }
    : null
);
</script>
