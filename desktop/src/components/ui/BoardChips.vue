<template>
  <span
    class="inline-flex gap-0.5"
    role="img"
    :title="title"
    :aria-label="title"
  >
    <span
      v-for="card in cards"
      :key="card"
      :class="[
        'flex items-center justify-center rounded font-bold text-white',
        size === 'md' ? 'w-[22px] h-7 text-[13px]' : 'w-5 h-6 text-xs',
        suitBgClasses[card & 3],
      ]"
    >
      {{ cardText(card).rank }}
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { cardText, suitBgClasses } from "../../utils";

// A board as coloured cards (rank on the suit's colour), as in the library, the report and
// the top bar. `sorted`: highest card first.

const props = withDefaults(
  defineProps<{ board: number[]; size?: "sm" | "md"; sorted?: boolean }>(),
  { size: "sm", sorted: false }
);

const cards = computed(() =>
  props.sorted ? [...props.board].sort((a, b) => b - a) : props.board
);

/** The board with suits, in the order shown, for a tooltip and screen readers ("Kd 8s 3c"). */
const title = computed(() =>
  cards.value
    .map((c) => {
      const text = cardText(c);
      return text.rank + text.suitLetter;
    })
    .join(" ")
);
</script>
