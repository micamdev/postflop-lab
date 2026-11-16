<template>
  <div class="px-4 py-3 border-b">
    <div class="font-semibold">
      This solution was saved up to the turn: pick a river to re-solve it on
      demand.
    </div>
    <div class="text-sm text-gray-600">
      The card-by-card river report is not available: each river needs its own
      re-solve.
    </div>
    <div class="flex flex-col gap-1 mt-2">
      <div v-for="suit in [3, 2, 1, 0]" :key="suit" class="flex gap-1">
        <button
          v-for="rank in [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]"
          :key="rank"
          :class="
            'w-9 h-7 rounded border font-semibold ' +
            (cardAt(rank, suit).isDead
              ? 'opacity-25 cursor-default'
              : 'hover:bg-blue-100 ' + cardText(4 * rank + suit).colorClass)
          "
          :disabled="cardAt(rank, suit).isDead"
          @click="emit('pick', 4 * rank + suit)"
        >
          {{ cardText(4 * rank + suit).rank + cardText(4 * rank + suit).suit }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SpotChance } from "../result-types";
import { cardText } from "../utils";

const props = defineProps<{ spot: SpotChance }>();
const emit = defineEmits<{ (e: "pick", card: number): void }>();

const cardAt = (rank: number, suit: number) =>
  props.spot.cards[4 * rank + suit];
</script>
