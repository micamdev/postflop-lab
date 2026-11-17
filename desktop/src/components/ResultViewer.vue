<template>
  <div
    v-if="!store.isSolverFinished"
    class="flex flex-col items-center justify-center h-full gap-2 text-center"
  >
    <template v-if="store.isSolverRunning || store.isFinalizing">
      <span class="spinner inline-block"></span>
      <p class="text-muted">
        {{ store.isSolverRunning ? "Solving…" : "Finalizing…" }} The results
        open when the solve ends.
      </p>
    </template>
    <template v-else-if="store.isSolverPaused">
      <p class="text-lg font-semibold">Solve paused</p>
      <p class="text-muted">Resume or stop it from the top bar.</p>
    </template>
    <template v-else-if="store.isSolverError">
      <p class="text-lg font-semibold">The solve failed</p>
      <p class="text-muted">See the message under the top bar.</p>
    </template>
    <template v-else>
      <p class="text-lg font-semibold">No solution yet</p>
      <p class="text-muted">
        Set up a spot and press Solve, or open one from the Library.
      </p>
    </template>
  </div>

  <div v-else class="flex flex-col h-full">
    <ResultNav
      :is-handler-updated="isHandlerUpdated"
      :is-locked="isLocked"
      :cards="cards"
      :dealt-card="dealtCard"
      :resolve-request="resolveRequest"
      @update:is-handler-updated="(value) => (isHandlerUpdated = value)"
      @update:is-locked="(value) => (isLocked = value)"
      @trigger-update="onUpdateSpot"
    />

    <RiverPicker
      v-if="
        selectedSpot?.type === 'chance' &&
        selectedSpot.isBeyondDepth &&
        selectedSpot.cards.some((c) => !c.isDead)
      "
      :spot="selectedSpot"
      @pick="pickRiver"
    />

    <ResultsToolbar
      :display-mode="displayMode"
      :chance-mode="chanceMode"
      :auto-player-basics="autoPlayerBasics"
      :auto-player-chance="autoPlayerChance"
      @update:display-mode="updateDisplayMode"
      @update:display-options="updateDisplayOptions"
    >
      <template #actions>
        <UiTooltip
          :text="
            unlockableReason || 'Lock the strategy of this node and re-solve'
          "
        >
          <span>
            <UiButton
              size="sm"
              :disabled="
                !selectedSpot ||
                !results ||
                isLockEditorOpen ||
                store.isLibraryBusy ||
                !!unlockableReason
              "
              @click="isLockEditorOpen = true"
            >
              🔒 Lock node
              <span
                v-if="store.locks.length > 0"
                class="ml-1 px-1.5 rounded-full bg-accent/20 text-accent text-[11px]"
              >
                {{ store.locks.length }}
              </span>
            </UiButton>
          </span>
        </UiTooltip>
      </template>
    </ResultsToolbar>

    <NodeStrategyBar
      v-if="!isLockEditorOpen && displayMode !== 'chance'"
      :items="strategyItems"
    />

    <NodeLockEditor
      v-if="isLockEditorOpen && selectedSpot && results"
      :key="line.history.join(',') + '/' + selectedSpot.index"
      :spot="selectedSpot.type === 'player' ? selectedSpot : null"
      :unlockable-reason="unlockableReason"
      :line="line"
      :results="results"
      :cards="cards"
      @close="isLockEditorOpen = false"
    />

    <div
      v-else-if="store.navView === 'results' && selectedSpot && results"
      class="flex flex-grow min-h-0"
    >
      <template v-if="displayMode === 'basics'">
        <ResultBasics
          style="flex: 4"
          :cards="cards"
          :selected-spot="selectedSpot"
          :selected-chance="selectedChance"
          :current-board="currentBoard"
          :total-bet-amount="totalBetAmount"
          :results="results"
          :display-options="displayOptions"
          :display-player="displayPlayerBasics"
          :is-compare-mode="false"
          @update-hover-content="onUpdateHoverContent"
        />

        <ResultTable
          style="flex: 3"
          table-mode="basics"
          :cards="cards"
          :selected-spot="selectedSpot"
          :results="results"
          :display-player="displayPlayerBasics"
          :hover-content="basicsHoverContent"
        />
      </template>

      <template v-else-if="displayMode === 'graphs'">
        <ResultGraphs
          :cards="cards"
          :selected-spot="selectedSpot"
          :selected-chance="selectedChance"
          :results="results"
          :chance-reports="chanceReports"
          :display-options="displayOptions"
          :display-player="displayPlayerBasics"
        />
      </template>

      <template v-else-if="displayMode === 'compare'">
        <ResultBasics
          style="flex: 1"
          :cards="cards"
          :selected-spot="selectedSpot"
          :selected-chance="selectedChance"
          :current-board="currentBoard"
          :total-bet-amount="totalBetAmount"
          :results="results"
          :display-options="displayOptions"
          display-player="oop"
          :is-compare-mode="true"
        />

        <ResultBasics
          style="flex: 1"
          :cards="cards"
          :selected-spot="selectedSpot"
          :selected-chance="selectedChance"
          :current-board="currentBoard"
          :total-bet-amount="totalBetAmount"
          :results="results"
          :display-options="displayOptions"
          display-player="ip"
          :is-compare-mode="true"
        />

        <ResultCompare
          class="w-[280px] shrink-0"
          :selected-spot="selectedSpot"
          :selected-chance="selectedChance"
          :results="results"
        />
      </template>

      <template v-else-if="displayMode === 'chance' && selectedChance">
        <ResultChance
          :selected-spot="selectedSpot"
          :selected-chance="selectedChance"
          :chance-reports="chanceReports"
          :display-options="displayOptions"
          :display-player="displayPlayerChance"
          @deal-card="onDealCard"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore } from "../store";
import * as invokes from "../invokes";

import {
  Results,
  ChanceReports,
  Spot,
  SpotChance,
  SpotPlayer,
  DisplayMode,
  DisplayOptions,
  HoverContent,
} from "../result-types";

import ResultNav from "./ResultNav.vue";
import RiverPicker from "./RiverPicker.vue";
import ResultsToolbar from "./results/ResultsToolbar.vue";
import NodeStrategyBar from "./results/NodeStrategyBar.vue";
import UiButton from "./ui/UiButton.vue";
import UiTooltip from "./ui/UiTooltip.vue";
import { nodeStrategy } from "../node-strategy";
import ResultBasics from "./ResultBasics.vue";
import ResultTable from "./ResultTable.vue";
import ResultCompare from "./ResultCompare.vue";
import ResultGraphs from "./ResultGraphs.vue";
import ResultChance from "./ResultChance.vue";
import NodeLockEditor from "./NodeLockEditor.vue";

const store = useStore();

/* Navigation */

const isHandlerUpdated = ref(false);
const isLocked = ref(false);

const cards = ref<number[][]>([[], []]);
const dealtCard = ref(-1);
// Asks ResultNav to re-solve and deal a river past the saved depth.
const resolveRequest = ref<{ card: number; id: number } | null>(null);
let resolveRequestId = 0;
const pickRiver = (card: number) => {
  resolveRequest.value = { card, id: ++resolveRequestId };
};

const selectedSpot = ref<Spot | null>(null);
const selectedChance = ref<SpotChance | null>(null);
const currentBoard = ref<number[]>([]);
const results = ref<Results | null>(null);
const chanceReports = ref<ChanceReports | null>(null);
const totalBetAmount = ref([0, 0]);
const line = ref<{ history: number[]; label: string }>({
  history: [],
  label: "",
});

/* Node lock */

const isLockEditorOpen = ref(false);

/** Why the displayed node cannot be locked, or "" if it can. */
/** Overall strategy of the acting player at the selected node (null at a card or without hands). */
const strategyItems = computed(() => {
  const spot = selectedSpot.value;
  if (
    !spot ||
    spot.type !== "player" ||
    selectedChance.value ||
    !results.value
  ) {
    return null;
  }
  const player = spot.player === "oop" ? 0 : 1;
  if (results.value.isEmpty & (1 << player)) return null;
  return nodeStrategy(
    results.value.strategy,
    results.value.normalizer[player],
    spot.actions
  );
});

const unlockableReason = computed(() => {
  const spot = selectedSpot.value;
  if (store.isBunchingEnabled && store.bunchingFlop.length > 0) {
    return "Locks are not available with the bunching effect.";
  }
  if (selectedChance.value || !spot || spot.type !== "player") {
    return "Select a player's decision in the line above to lock it.";
  }
  if (line.value.history.includes(-1)) {
    return "Pick the board cards of this line first.";
  }
  const player = spot.player === "oop" ? 0 : 1;
  if (!results.value || results.value.isEmpty & (1 << player)) {
    return "This player has no hand at this node.";
  }
  return "";
});

const isSolverFinished = ref(false);
store.$subscribe(async (_, store) => {
  if (isSolverFinished.value !== store.isSolverFinished) {
    if ((isSolverFinished.value = store.isSolverFinished)) {
      await init();
    } else {
      clear();
    }
  }
});

const init = async () => {
  cards.value = await invokes.gamePrivateCards();
  isHandlerUpdated.value = true;
};

const clear = () => {
  isLockEditorOpen.value = false;
  cards.value = [[], []];
  selectedSpot.value = null;
  selectedChance.value = null;
  results.value = null;
  chanceReports.value = null;
};

const onUpdateSpot = (
  newSelectedSpot: Spot | null,
  newSelectedChance: SpotChance | null,
  newCurrentBoard: number[],
  newResults: Results,
  newChanceReports: ChanceReports | null,
  newTotalBetAmount: number[],
  newLine: { history: number[]; label: string }
) => {
  line.value = newLine;
  store.currentLine = newLine;
  dealtCard.value = -1;
  selectedSpot.value = newSelectedSpot;
  selectedChance.value = newSelectedChance;
  currentBoard.value = newCurrentBoard;
  results.value = newResults;
  chanceReports.value = newChanceReports;
  totalBetAmount.value = newTotalBetAmount;
  isLocked.value = false;

  chanceMode.value = newSelectedChance?.player ?? "";
};

/* Middle Bar */

const displayMode = ref<DisplayMode>("basics");
const chanceMode = ref("");

const displayOptions = ref<DisplayOptions>({
  playerBasics: "auto",
  playerChance: "auto",
  barHeight: "normalized",
  suit: "grouped",
  strategy: "show",
  contentBasics: "default",
  contentGraphs: "eq",
  chartChance: "strategy-combos",
});

const updateDisplayMode = (mode: DisplayMode) => {
  displayMode.value = mode;
};

const updateDisplayOptions = (options: DisplayOptions) => {
  displayOptions.value = options;
};

/* Computed */

const autoPlayerBasics = computed(() => {
  const spot = selectedSpot.value;
  const chance = selectedChance.value;
  if (!spot) return "oop";

  if (chance) {
    return chance.prevPlayer;
  } else if (spot.type === "terminal") {
    return spot.prevPlayer;
  } else {
    return (spot as SpotPlayer).player;
  }
});

const autoPlayerChance = computed(() => {
  const spot = selectedSpot.value;
  if (!spot) return "oop";
  if (spot.type === "terminal") {
    return spot.prevPlayer;
  } else {
    return (spot as SpotPlayer).player;
  }
});

const displayPlayerBasics = computed(() => {
  const optionPlayer = displayOptions.value.playerBasics;
  if (optionPlayer === "auto") {
    return autoPlayerBasics.value;
  } else {
    return optionPlayer;
  }
});

const displayPlayerChance = computed(() => {
  const optionPlayer = displayOptions.value.playerChance;
  if (optionPlayer === "auto") {
    return autoPlayerChance.value;
  } else {
    return optionPlayer;
  }
});

/* Results */

const basicsHoverContent = ref<HoverContent | null>(null);

const onUpdateHoverContent = (content: HoverContent | null) => {
  basicsHoverContent.value = content;
};

const onDealCard = (card: number) => {
  dealtCard.value = card;
};
</script>
