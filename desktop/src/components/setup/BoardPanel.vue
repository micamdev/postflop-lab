<template>
  <UiPanel title="Board">
    <template #actions>
      <UiButton size="sm" @click="randomFlop">Random flop</UiButton>
      <UiButton size="sm" :disabled="config.board.length === 0" @click="clear">
        Clear
      </UiButton>
    </template>

    <PopoverRoot v-model:open="isPickerOpen">
      <PopoverTrigger as-child>
        <button
          type="button"
          class="flex gap-1.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Pick the board"
        >
          <span
            v-for="slot in 5"
            :key="slot"
            :class="[
              'flex items-center justify-center w-9 h-12 rounded-md text-lg font-bold',
              config.board[slot - 1] === undefined
                ? 'border border-dashed border-line text-muted text-base'
                : 'text-white ' + suitBgClasses[config.board[slot - 1] & 3],
            ]"
          >
            {{
              config.board[slot - 1] === undefined
                ? "+"
                : cardText(config.board[slot - 1]).rank
            }}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          side="left"
          :side-offset="8"
          class="z-50 rounded-lg border border-line bg-panel2 p-2 shadow-2xl shadow-black/50"
        >
          <div v-for="suit in 4" :key="suit" class="flex">
            <BoardSelectorCard
              v-for="rank in 13"
              :key="rank"
              class="m-0.5"
              :card-id="56 - 4 * rank - suit"
              :is-selected="config.board.includes(56 - 4 * rank - suit)"
              @click="toggleCard(56 - 4 * rank - suit)"
            />
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>

    <input
      v-model="boardText"
      type="text"
      class="ui-input w-full mt-2"
      placeholder="Ah Kd Qc"
      @focus="($event.target as HTMLInputElement).select()"
      @change="onBoardTextChange"
    />
    <p v-if="boardWarning" class="mt-1.5 text-xs text-ip">
      {{ boardWarning }}
    </p>
  </UiPanel>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from "reka-ui";
import { useConfigStore, useStore } from "../../store";
import { cardText, parseCardString, suitBgClasses } from "../../utils";
import BoardSelectorCard from "../BoardSelectorCard.vue";
import UiButton from "../ui/UiButton.vue";
import UiPanel from "../ui/UiPanel.vue";

const config = useConfigStore();
const store = useStore();
const isPickerOpen = ref(false);
const boardText = ref("");

const setTextFromBoard = () => {
  boardText.value = config.board
    .map(cardText)
    .map(({ rank, suitLetter }) => rank + suitLetter)
    .join(" ");
};

/** Adds or removes a card; the flop stays sorted (high card first). */
const toggleCard = (cardId: number, updateText = true) => {
  if (config.board.includes(cardId)) {
    config.board = config.board.filter((card) => card !== cardId);
  } else if (config.board.length < 5) {
    config.board.push(cardId);
    if (config.board.length <= 3) config.board.sort((a, b) => b - a);
  }
  if (updateText) setTextFromBoard();
};

// Board replaced elsewhere (solution loaded, explorer): refresh the text.
watch(() => store.solutionLoadCount, setTextFromBoard);
watch(() => [...config.board], setTextFromBoard, { immediate: true });

const onBoardTextChange = () => {
  config.board = [];
  const cardIds = boardText.value
    // Allow pasting things like [Ah Kd Qc]
    .trim()
    .replace(/[^A-Za-z0-9\s,]/g, "")
    .replace(/\s+/g, ",")
    .split(",")
    .map(parseCardString)
    .filter((cardId): cardId is number => cardId !== null);
  new Set(cardIds).forEach((cardId) => toggleCard(cardId, false));
  setTextFromBoard();
};

const clear = () => {
  config.board = [];
};

const randomFlop = () => {
  const board: number[] = [];
  while (board.length < 3) {
    const card = Math.floor(Math.random() * 52);
    if (!board.includes(card)) board.push(card);
  }
  config.board = board.sort((a, b) => b - a);
};

const boardWarning = computed(() =>
  config.board.length >= 3 &&
  config.expectedBoardLength > 0 &&
  config.board.length !== config.expectedBoardLength
    ? `The edited tree assumes a ${config.expectedBoardLength}-card board.`
    : ""
);
</script>
