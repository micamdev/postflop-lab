<template>
  <div
    :class="
      'px-1 pt-0.5 pb-1 text-[11px] font-bold tracking-wider text-muted ' +
      (isSelectedChance ? '' : isInactive ? 'opacity-70' : dimmed)
    "
  >
    {{ spot.player.toUpperCase() }}
  </div>
  <div
    class="flex flex-col flex-grow px-3 items-center justify-evenly font-semibold"
  >
    <div class="relative">
      <span
        v-for="card of cards"
        :key="card.rank + card.suit"
        :class="
          'inline-flex items-center justify-center w-6 h-8 mx-px rounded text-sm font-bold ' +
          card.chipClass
        "
      >
        {{ card.rank }}
      </span>
      <div
        v-if="spot.type === 'chance' && spot.isBeyondDepth"
        class="text-xs font-normal text-center text-muted whitespace-normal"
      >
        {{ spot.cards.some((c) => !c.isDead) ? "Pick a river" : "Not saved" }}
      </div>
      <div
        v-if="spot.type === 'chance' && spot.isResolved"
        class="text-xs font-normal text-center text-muted"
        title="Re-solved on demand from the ranges at this node: close to, not exactly, the full solution"
      >
        re-solved ≈
      </div>
      <template
        v-if="
          spot.type === 'chance' &&
          spot.selectedIndex !== -1 &&
          !spot.isResolved
        "
      >
        <button
          v-for="arrow in ARROWS"
          :key="arrow.key"
          :class="[
            'absolute w-6 h-6',
            arrow.position,
            nextLiveCard(spot, arrow.rankDir, arrow.suitDir) !== -1
              ? 'text-muted hover:text-ink'
              : 'text-muted/25',
          ]"
          @click.stop="emit('deal-arrow', spot, arrow.rankDir, arrow.suitDir)"
        >
          <component :is="arrow.icon" class="w-full h-full" />
        </button>
      </template>
    </div>
    <div :class="isSelectedChance ? '' : isInactive ? 'opacity-70' : dimmed">
      <div class="text-xs text-muted tabular-nums">
        Pot {{ bbText(spot.pot) }}bb · {{ bbText(spot.stack) }}bb
      </div>
    </div>
  </div>

  <button
    v-if="isSelectedChance && spot.selectedIndex !== -1 && !isDealing"
    class="absolute top-1 right-1 text-muted hover:text-ink"
    @click="emit('deal', spot.selectedIndex)"
  >
    <XMarkIcon class="w-5 h-5" />
  </button>
</template>

<script setup lang="ts">
import { bbText } from "../../units";
import { computed } from "vue";
import {
  XMarkIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "@heroicons/vue/20/solid";
import { cardText, suitBgClasses } from "../../utils";
import { nextLiveCard } from "../../nav-spots";
import type { SpotChance, SpotRoot } from "../../result-types";

// The board of the root, or the card of a chance spot (turn, river).

const props = defineProps<{
  spot: SpotRoot | SpotChance;
  /** The chance spot whose card is being chosen. */
  isSelectedChance: boolean;
  /** After a skipped card: shown, not clickable. */
  isInactive: boolean;
  isDealing: boolean;
}>();

const emit = defineEmits<{
  (event: "deal", card: number): void;
  (
    event: "deal-arrow",
    spot: SpotChance,
    rankDir: number,
    suitDir: number
  ): void;
}>();

const dimmed = "group-hover:opacity-100 opacity-70";

// The four arrows around a dealt card.
const ARROWS = [
  {
    key: "up",
    rankDir: 0,
    suitDir: 1,
    icon: ChevronUpIcon,
    position: "-top-[1.375rem] left-1/2 -ml-3",
  },
  {
    key: "left",
    rankDir: 1,
    suitDir: 0,
    icon: ChevronLeftIcon,
    position: "-left-[1.375rem] top-1/2 -mt-3",
  },
  {
    key: "right",
    rankDir: -1,
    suitDir: 0,
    icon: ChevronRightIcon,
    position: "-right-[1.375rem] top-1/2 -mt-3",
  },
  {
    key: "down",
    rankDir: 0,
    suitDir: -1,
    icon: ChevronDownIcon,
    position: "-bottom-[1.375rem] left-1/2 -ml-3",
  },
];

const chip = (card: number) => ({
  rank: cardText(card).rank,
  suit: cardText(card).suit,
  chipClass: "text-white " + suitBgClasses[card & 3],
});

const cards = computed(() => {
  const spot = props.spot;
  if (spot.type === "root") return spot.board.map(chip);
  if (spot.selectedIndex !== -1) return [chip(spot.selectedIndex)];
  return [
    {
      rank: "?",
      suit: "",
      chipClass: "border border-dashed border-line text-muted",
    },
  ];
});
</script>
